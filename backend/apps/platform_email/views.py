"""Platform email endpoints (superadmin only, public schema).

Mirrors `apps.email_campaigns.views`, but the MailCraft org/key is platform-wide
(stored on the `PlatformEmailConfig` singleton) and recipients are coaches rather
than students. The MailCraft client and Resend sender are reused verbatim.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError

from django.conf import settings as django_settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsSuperUser
from apps.email_campaigns import emailcraft_client

from .models import CampaignStatus, PlatformEmailCampaign, PlatformEmailConfig
from .recipients import get_recipient_count
from .serializers import PlatformEmailCampaignSerializer, SendEmailSerializer

logger = logging.getLogger(__name__)

PLATFORM_BRAND = "Contentor"


def _get_api_key() -> tuple[str | None, str | None]:
    """Get the platform EmailCraft API key, lazily provisioning the org when missing."""
    config = PlatformEmailConfig.load()
    if config.emailcraft_api_key:
        return config.emailcraft_api_key, None

    try:
        result = emailcraft_client.provision_organization(PLATFORM_BRAND)
        api_key_data = result.get("api_key")
        api_key = api_key_data.get("raw", "") if isinstance(api_key_data, dict) else ""
        if not api_key:
            # Org already existed and no new key was created — re-read.
            config.refresh_from_db()
            if config.emailcraft_api_key:
                return config.emailcraft_api_key, None
            logger.error("Platform EmailCraft provisioning returned no api_key and none stored")
            return None, "Failed to provision email service."

        org_id = result.get("organization", {}).get("id", "")
        # Atomically save only if still empty.
        updated = PlatformEmailConfig.objects.filter(pk=config.pk, emailcraft_api_key="").update(
            emailcraft_api_key=api_key, emailcraft_org_id=org_id
        )
        if not updated:
            config.refresh_from_db()
            return config.emailcraft_api_key, None

        if org_id:
            try:
                emailcraft_client.configure_variables(org_id, emailcraft_client.DEFAULT_VARIABLES)
            except Exception:
                logger.warning("Failed to configure platform EmailCraft variables", exc_info=True)

        return api_key, None
    except Exception:
        logger.exception("Failed to provision platform EmailCraft org")
        return None, "Failed to provision email service."


def _get_origin() -> str:
    return f"https://{django_settings.CONTENTOR_DOMAIN}"


@api_view(["POST"])
@permission_classes([IsSuperUser])
def setup_email(_request):
    """Ensure the platform EmailCraft organization is provisioned."""
    config = PlatformEmailConfig.load()
    had_api_key = bool(config.emailcraft_api_key)

    api_key, error = _get_api_key()
    if error or not api_key:
        return Response(
            {"detail": error or "Failed to initialize email service."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"ready": True, "provisioned": not had_api_key})


@api_view(["POST"])
@permission_classes([IsSuperUser])
def create_session(_request):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        result = emailcraft_client.create_session(api_key, _get_origin())
        return Response(
            {
                "session_token": result.get("token", ""),
                "expires_at": result.get("expires_at"),
            }
        )
    except Exception:
        logger.exception("Failed to create platform EmailCraft session")
        return Response(
            {"detail": "Email builder temporarily unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@api_view(["GET"])
@permission_classes([IsSuperUser])
def template_list(_request):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        return Response(emailcraft_client.list_templates(api_key))
    except Exception:
        logger.exception("Failed to list platform templates")
        return Response({"detail": "Failed to load templates."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET", "DELETE"])
@permission_classes([IsSuperUser])
def template_detail(request, template_id: str):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        if request.method == "GET":
            return Response(emailcraft_client.get_template(api_key, template_id))
        emailcraft_client.delete_template(api_key, template_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except Exception:
        logger.exception("Failed to access platform template %s", template_id)
        return Response({"detail": "Failed to access template."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def gallery_list(request):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        category = request.query_params.get("category")
        return Response(emailcraft_client.list_gallery(api_key, category=category))
    except Exception:
        logger.exception("Failed to list platform gallery templates")
        return Response({"detail": "Failed to load gallery."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@permission_classes([IsSuperUser])
def copy_template(request):
    from .serializers import CopyTemplateSerializer

    serializer = CopyTemplateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    api_key, error = _get_api_key()
    if error or not api_key:
        return Response({"detail": error or "Email service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    source_id = serializer.validated_data["source_template_id"]
    try:
        source = emailcraft_client.get_template(api_key, source_id)
    except Exception:
        logger.exception("Failed to fetch source template %s", source_id)
        return Response({"detail": "Source template not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        result = emailcraft_client.create_template(
            api_key,
            name=f"Copy of {source.get('name', 'Untitled')}",
            json_data=source.get("json_data", {}),
            category=source.get("category", ""),
        )
        return Response(
            {"id": result.get("id", ""), "name": result.get("name", "")},
            status=status.HTTP_201_CREATED,
        )
    except Exception:
        logger.exception("Failed to create platform template copy")
        return Response({"detail": "Failed to copy template."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@permission_classes([IsSuperUser])
def template_preview_batch(request):
    from .serializers import PreviewTemplateSerializer

    serializer = PreviewTemplateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    api_key, error = _get_api_key()
    if error or not api_key:
        return Response({"detail": error or "Email service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    template_ids = serializer.validated_data["template_ids"]
    previews: dict[str, str] = {}
    errors: dict[str, str] = {}

    def render_one(tid: str) -> tuple[str, str | None, str | None]:
        try:
            result = emailcraft_client.get_template_preview(api_key, tid)
            return tid, result.get("html", ""), None
        except Exception as exc:
            return tid, None, str(exc)[:200]

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(render_one, tid): tid for tid in template_ids}
        for future in futures:
            try:
                tid, html, err = future.result(timeout=10)
                if html:
                    previews[tid] = html
                elif err:
                    errors[tid] = err
            except FuturesTimeoutError:
                errors[futures[future]] = "Render timed out"
            except Exception as exc:
                errors[futures[future]] = str(exc)[:200]

    return Response({"previews": previews, "errors": errors})


@api_view(["POST"])
@permission_classes([IsSuperUser])
def send_campaign(request):
    _api_key, error = _get_api_key()
    if error or not _api_key:
        return Response({"detail": error or "Email service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    serializer = SendEmailSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    recipient_count = get_recipient_count(data["recipient_filter"])

    existing = PlatformEmailCampaign.objects.filter(
        sender=request.user,
        template_id=data["template_id"],
        subject=data["subject"],
        status=CampaignStatus.SENDING,
    ).exists()
    if existing:
        return Response(
            {"detail": "A campaign with this template and subject is already being sent."},
            status=status.HTTP_409_CONFLICT,
        )

    campaign = PlatformEmailCampaign.objects.create(
        subject=data["subject"],
        template_id=data["template_id"],
        template_name=data.get("template_name", ""),
        sender=request.user,
        recipient_filter=data["recipient_filter"],
        recipient_count=recipient_count,
        status=CampaignStatus.SENDING,
    )

    from .tasks import send_platform_campaign_emails

    send_platform_campaign_emails.delay(campaign.id)

    return Response(PlatformEmailCampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def recipient_options(_request):
    """Everything the recipient selector needs: coaches, plans, and workspaces."""
    from apps.accounts.models import User
    from apps.core.models import PlatformPlan, Tenant

    coaches = list(
        User.objects.filter(role="coach", is_active=True).order_by("name", "email").values("id", "name", "email")
    )
    plans = list(PlatformPlan.objects.filter(is_active=True).order_by("price_monthly").values("id", "name"))
    tenants = list(Tenant.objects.exclude(schema_name="public").order_by("name").values("id", "name", "owner_email"))
    return Response({"coaches": coaches, "plans": plans, "tenants": tenants})


@api_view(["GET"])
@permission_classes([IsSuperUser])
def campaign_list(request):
    campaigns = PlatformEmailCampaign.objects.select_related("sender").all()

    try:
        limit = max(1, min(int(request.query_params.get("limit", 20)), 100))
    except ValueError:
        limit = 20
    try:
        offset = max(0, int(request.query_params.get("offset", 0)))
    except ValueError:
        offset = 0

    total = campaigns.count()
    page = campaigns[offset : offset + limit]
    return Response({"count": total, "results": PlatformEmailCampaignSerializer(page, many=True).data})


@api_view(["GET"])
@permission_classes([IsSuperUser])
def campaign_detail(_request, pk: int):
    campaign = PlatformEmailCampaign.objects.select_related("sender").filter(pk=pk).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(PlatformEmailCampaignSerializer(campaign).data)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def campaign_recipients(_request, pk: int):
    from .models import PlatformCampaignRecipient
    from .serializers import PlatformCampaignRecipientSerializer

    campaign = PlatformEmailCampaign.objects.filter(pk=pk).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    recipients = PlatformCampaignRecipient.objects.filter(campaign=campaign)
    return Response({"results": PlatformCampaignRecipientSerializer(recipients, many=True).data})
