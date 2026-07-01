import json
import re

from django.conf import settings as django_settings
from django.db import connection
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.domains.cloudflare import get_cloudflare
from apps.domains.models import CustomDomain

from . import services
from .identity import sending_identity
from .inbound import receive_inbound
from .models import Conversation
from .serializers import (
    ComposeSerializer,
    ConversationDetailSerializer,
    ConversationSerializer,
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
    msg = services.send_message(conversation=conv, text=data["text"], subject=data["subject"])
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
    msg = services.send_message(conversation=conv, text=serializer.validated_data["text"])
    return Response({"message_id": msg.id}, status=status.HTTP_201_CREATED)


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
    if not cd:
        # Unknown / disabled / not-live recipient — drop without leaking.
        return Response(status=status.HTTP_200_OK)

    with tenant_context(cd.tenant):
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
    return {
        "has_custom_domain": cd is not None,
        "domain": cd.domain if cd else "",
        "local_part": cd.mailbox_local_part if cd else "info",
        "enabled": cd.mailbox_enabled if cd else False,
        "can_receive": can_receive,
        "from_email": from_email,
    }


@api_view(["GET", "PUT"])
@permission_classes([IsCoachOrOwner])
def mailbox_settings(request):
    tenant = connection.tenant
    if request.method == "GET":
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
        if enabled and django_settings.CLOUDFLARE_EMAIL_WORKER_NAME and cd.cloudflare_zone_id:
            get_cloudflare().enable_email_routing(
                zone_id=cd.cloudflare_zone_id,
                worker_name=django_settings.CLOUDFLARE_EMAIL_WORKER_NAME,
            )
    return Response(_settings_payload(tenant))
