import json
import re

from django.conf import settings as django_settings
from django.db import IntegrityError, connection
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.domains.cloudflare import get_cloudflare
from apps.domains.models import (
    RESERVED_MAILBOX_LOCAL_PARTS,
    CustomDomain,
    PlatformMailboxAddress,
)

from . import attachments as attachments_mod
from . import services
from .identity import resolve_platform_recipient, sending_identity
from .inbound import receive_inbound
from .models import Conversation, MessageAttachment
from .serializers import (
    ComposeSerializer,
    ConversationDetailSerializer,
    ConversationSerializer,
    MessageAttachmentSerializer,
    ReplySerializer,
)
from .signing import verify_inbound_signature

_LOCAL_PART_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def conversation_list(request):
    qs = Conversation.objects.all()
    return Response(ConversationSerializer(qs, many=True).data)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def conversation_detail(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        conv.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == "PATCH":
        changed = []
        for field in ("is_archived", "is_spam"):
            if field in request.data:
                setattr(conv, field, bool(request.data[field]))
                changed.append(field)
        if changed:
            conv.save(update_fields=changed)
        return Response(ConversationSerializer(conv).data)

    # GET: mark inbound read + zero unread (existing behavior)
    conv.messages.filter(direction="inbound", is_read=False).update(is_read=True)
    if conv.unread_count:
        conv.unread_count = 0
        conv.save(update_fields=["unread_count"])
    return Response(ConversationDetailSerializer(conv).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def compose(request):
    serializer = ComposeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    conv = services.get_or_create_conversation(counterparty_email=data["to"], subject=data["subject"])
    try:
        msg = services.send_message(
            conversation=conv,
            text=data["text"],
            html=data.get("html", ""),
            subject=data["subject"],
            attachment_ids=data.get("attachment_ids") or [],
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        {"conversation_id": conv.id, "message_id": msg.id},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def reply(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    serializer = ReplySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        msg = services.send_message(
            conversation=conv,
            text=data["text"],
            html=data.get("html", ""),
            attachment_ids=data.get("attachment_ids") or [],
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"message_id": msg.id}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@parser_classes([MultiPartParser])
def upload_attachment(request):
    f = request.FILES.get("file")
    if f is None:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    err = attachments_mod.validate_attachment(f.name, f.content_type or "", f.size)
    if err:
        return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
    key = attachments_mod.store_attachment(f.read(), f.name, f.content_type or "")
    att = MessageAttachment.objects.create(
        filename=f.name, content_type=f.content_type or "", size=f.size, storage_key=key
    )
    return Response(MessageAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def inbound(request):
    if not verify_inbound_signature(request.body, request.META.get("HTTP_X_MAILBOX_SIGNATURE", "")):
        return Response(status=status.HTTP_401_UNAUTHORIZED)

    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return Response(status=status.HTTP_400_BAD_REQUEST)

    to_email = (payload.get("to") or "").strip().lower()
    domain = to_email.rsplit("@", 1)[-1] if "@" in to_email else ""
    # This webhook is always hit at the apex host (→ public schema), so
    # CustomDomain is queryable here.  tenant_context(cd.tenant) then switches
    # into the resolved per-tenant schema before storing the message.
    # Correctness depends on the Cloudflare Worker posting to the apex URL, NOT
    # a tenant subdomain — if it posted to a tenant host, the public-schema
    # CustomDomain table would be unreachable and every lookup would return None.
    cd = CustomDomain.objects.filter(
        domain=domain, mailbox_enabled=True, provisioning_status="live"
    ).first()
    # Second tier when no live custom domain matches: a paid coach's chosen
    # `<x>@PLATFORM_MAIL_DOMAIN` address.
    recipient_tenant = cd.tenant if cd else resolve_platform_recipient(to_email)
    if recipient_tenant is None:
        # Unknown / disabled / not-live recipient — drop without leaking.
        return Response(status=status.HTTP_200_OK)

    with tenant_context(recipient_tenant):
        receive_inbound(
            from_email=(payload.get("from") or "").strip(),
            to_email=to_email,
            subject=payload.get("subject") or "",
            text=payload.get("text") or "",
            html=payload.get("html") or "",
            message_id=payload.get("message_id") or "",
            in_reply_to=payload.get("in_reply_to") or "",
            references=payload.get("references") or "",
        )
    return Response(status=status.HTTP_200_OK)


def _live_domain(tenant):
    return (
        CustomDomain.objects.filter(tenant=tenant, provisioning_status="live")
        .order_by("-is_primary", "id")
        .first()
    )


def _settings_payload(tenant):
    from_email, can_receive = sending_identity(tenant)
    cd = _live_domain(tenant)
    pa = PlatformMailboxAddress.objects.filter(tenant=tenant).first()
    return {
        "has_custom_domain": cd is not None,
        "domain": cd.domain if cd else "",
        "local_part": cd.mailbox_local_part if cd else "info",
        "enabled": cd.mailbox_enabled if cd else False,
        "can_receive": can_receive,
        "from_email": from_email,
        "platform_domain": django_settings.PLATFORM_MAIL_DOMAIN,
        "platform_local_part": pa.local_part if pa else "",
        "platform_eligible": bool(django_settings.PLATFORM_MAIL_DOMAIN)
        and tenant.has_paid_platform_plan,
    }


def _claim_platform_address(tenant, raw_local_part):
    """Claim or change the tenant's `<x>@PLATFORM_MAIL_DOMAIN` address.

    Returns an error Response, or None on success. Changing releases the old
    local part (it becomes claimable by others — acceptable pre-launch).
    """
    if not django_settings.PLATFORM_MAIL_DOMAIN:
        return Response({"detail": "feature_unavailable"}, status=status.HTTP_400_BAD_REQUEST)
    if not tenant.has_paid_platform_plan:
        return Response({"detail": "upgrade_required"}, status=status.HTTP_400_BAD_REQUEST)
    local_part = (raw_local_part or "").strip().lower()
    if not _LOCAL_PART_RE.match(local_part):
        return Response({"detail": "invalid_local_part"}, status=status.HTTP_400_BAD_REQUEST)
    if local_part in RESERVED_MAILBOX_LOCAL_PARTS:
        return Response({"detail": "reserved_local_part"}, status=status.HTTP_400_BAD_REQUEST)
    if (
        PlatformMailboxAddress.objects.filter(local_part=local_part)
        .exclude(tenant=tenant)
        .exists()
    ):
        return Response({"detail": "taken"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        PlatformMailboxAddress.objects.update_or_create(
            tenant=tenant, defaults={"local_part": local_part}
        )
    except IntegrityError:
        # Concurrent claim won the unique race.
        return Response({"detail": "taken"}, status=status.HTTP_400_BAD_REQUEST)
    return None


@api_view(["GET", "PUT"])
@permission_classes([IsCoachOrOwner])
def mailbox_settings(request):
    tenant = connection.tenant
    if request.method == "GET":
        return Response(_settings_payload(tenant))

    if "platform_local_part" in request.data:
        error = _claim_platform_address(tenant, request.data.get("platform_local_part"))
        if error is not None:
            return error
        return Response(_settings_payload(tenant))

    local_part = (request.data.get("local_part") or "").strip()
    enabled = bool(request.data.get("enabled"))
    if not _LOCAL_PART_RE.match(local_part):
        return Response(
            {"detail": "invalid_local_part"}, status=status.HTTP_400_BAD_REQUEST
        )
    cd = _live_domain(tenant)
    if enabled and cd is None:
        return Response(
            {"detail": "custom_domain_required"}, status=status.HTTP_400_BAD_REQUEST
        )
    if cd is not None:
        cd.mailbox_local_part = local_part
        cd.mailbox_enabled = enabled
        cd.save(update_fields=["mailbox_local_part", "mailbox_enabled", "updated_at"])
        # Binding the catch-all to the inbound Worker intentionally REPLACES any
        # existing forward-to-Gmail rule on the zone (see provisioning._step_email_auth):
        # the in-app mailbox is now the destination for this domain's mail.
        # NOTE: inbound only works when CLOUDFLARE_EMAIL_WORKER_NAME is set (see
        # .env.prod.example) and the domain has a cloudflare_zone_id. If either is
        # missing, mailbox_enabled is still persisted but no routing is bound — the
        # coach will not receive mail until routing is configured.
        if enabled and django_settings.CLOUDFLARE_EMAIL_WORKER_NAME and cd.cloudflare_zone_id:
            get_cloudflare().enable_email_routing(
                zone_id=cd.cloudflare_zone_id,
                worker_name=django_settings.CLOUDFLARE_EMAIL_WORKER_NAME,
            )
    return Response(_settings_payload(tenant))
