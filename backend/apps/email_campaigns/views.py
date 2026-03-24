import logging

from django.conf import settings as django_settings
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.models import Domain, TenantUsage
from apps.core.permissions import IsCoachOrOwner
from apps.tenant_config.models import TenantConfig

from . import emailcraft_client
from .models import CampaignStatus, EmailCampaign
from .recipients import get_recipient_count
from .serializers import EmailCampaignSerializer, SendEmailSerializer

logger = logging.getLogger(__name__)


def _get_api_key() -> tuple[str | None, str | None]:
    """Get tenant EmailCraft API key, lazily provisioning tenant org when missing."""
    config = TenantConfig.objects.first()
    if not config:
        return None, "Tenant config not found."

    if config.emailcraft_api_key:
        return config.emailcraft_api_key, None

    brand_name = config.brand_name or connection.tenant.name

    try:
        result = emailcraft_client.provision_organization(brand_name)
        api_key = result.get("api_key", {}).get("raw", "")
        if not api_key:
            logger.error("EmailCraft provisioning response missing api_key.raw")
            return None, "Failed to provision email service."

        config.emailcraft_api_key = api_key
        config.save(update_fields=["emailcraft_api_key"])

        try:
            emailcraft_client.configure_variables(api_key, emailcraft_client.DEFAULT_VARIABLES)
        except Exception:
            logger.warning("Failed to configure EmailCraft variables", exc_info=True)

        return api_key, None
    except Exception:
        logger.exception("Failed to provision EmailCraft org for tenant %s", connection.tenant.schema_name)
        return None, "Failed to provision email service."


def _get_tenant_origin() -> str:
    tenant = connection.tenant
    domain = Domain.objects.filter(tenant=tenant, is_primary=True).first()
    if domain:
        return f"https://{domain.domain}"
    return f"https://{tenant.subdomain}.{django_settings.CONTENTOR_DOMAIN}"


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def setup_email(_request):
    """
    Ensure tenant EmailCraft organization is provisioned.
    Called by the email dashboard to bootstrap setup early.
    """
    config = TenantConfig.objects.first()
    had_api_key = bool(config and config.emailcraft_api_key)

    api_key, error = _get_api_key()
    if error or not api_key:
        return Response({"detail": error or "Failed to initialize email service."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return Response({"ready": True, "provisioned": not had_api_key})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def create_session(_request):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        origin = _get_tenant_origin()
        result = emailcraft_client.create_session(api_key, origin)
        return Response(
            {
                "session_token": result.get("token", ""),
                "expires_at": result.get("expires_at"),
            }
        )
    except Exception:
        logger.exception("Failed to create EmailCraft session")
        return Response(
            {"detail": "Email builder temporarily unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def template_list(_request):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        data = emailcraft_client.list_templates(api_key)
        return Response(data)
    except Exception:
        logger.exception("Failed to list templates")
        return Response({"detail": "Failed to load templates."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET", "DELETE"])
@permission_classes([IsCoachOrOwner])
def template_detail(request, template_id: str):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        if request.method == "GET":
            data = emailcraft_client.get_template(api_key, template_id)
            return Response(data)

        emailcraft_client.delete_template(api_key, template_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except Exception:
        logger.exception("Failed to access template %s", template_id)
        return Response({"detail": "Failed to access template."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def gallery_list(request):
    api_key, error = _get_api_key()
    if error:
        return Response({"detail": error}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        category = request.query_params.get("category")
        data = emailcraft_client.list_gallery(api_key, category=category)
        return Response(data)
    except Exception:
        logger.exception("Failed to list gallery templates")
        return Response({"detail": "Failed to load gallery."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def send_campaign(request):
    _api_key, error = _get_api_key()
    if error or not _api_key:
        return Response({"detail": error or "Email service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    serializer = SendEmailSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    recipient_count = get_recipient_count(data["recipient_filter"])

    tenant = connection.tenant
    month_start = timezone.now().date().replace(day=1)
    usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)

    if tenant.plan and tenant.plan.max_campaign_emails:
        if usage.emails_sent + recipient_count > tenant.plan.max_campaign_emails:
            return Response(
                {"detail": "Email quota exceeded for this month."},
                status=status.HTTP_403_FORBIDDEN,
            )

    existing = EmailCampaign.objects.filter(
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

    campaign = EmailCampaign.objects.create(
        subject=data["subject"],
        template_id=data["template_id"],
        template_name=data.get("template_name", ""),
        sender=request.user,
        recipient_filter=data["recipient_filter"],
        recipient_count=recipient_count,
        status=CampaignStatus.SENDING,
    )

    from .tasks import send_campaign_emails

    send_campaign_emails.delay(campaign.id, connection.tenant.schema_name)

    return Response(EmailCampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_list(request):
    campaigns = EmailCampaign.objects.select_related("sender").all()

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

    return Response({"count": total, "results": EmailCampaignSerializer(page, many=True).data})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_detail(_request, pk: int):
    campaign = EmailCampaign.objects.select_related("sender").filter(pk=pk).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(EmailCampaignSerializer(campaign).data)
