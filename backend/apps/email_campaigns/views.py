import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError

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
        api_key_data = result.get("api_key")
        api_key = api_key_data.get("raw", "") if isinstance(api_key_data, dict) else ""
        if not api_key:
            # Org already existed and no new key was created.
            # Another request may have saved the key — re-read from DB.
            config.refresh_from_db()
            if config.emailcraft_api_key:
                return config.emailcraft_api_key, None
            logger.error("EmailCraft provisioning returned no api_key and none stored")
            return None, "Failed to provision email service."

        # Atomically save only if still empty
        updated = TenantConfig.objects.filter(
            pk=config.pk,
            emailcraft_api_key="",
        ).update(emailcraft_api_key=api_key)

        if not updated:
            config.refresh_from_db()
            return config.emailcraft_api_key, None

        org_id = result.get("organization", {}).get("id", "")
        if org_id:
            try:
                emailcraft_client.configure_variables(org_id, emailcraft_client.DEFAULT_VARIABLES)
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
        return Response(
            {"detail": error or "Failed to initialize email service."}, status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

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

    quota = tenant.plan and tenant.plan.max_campaign_emails
    if quota and usage.emails_sent + recipient_count > quota:
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


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
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

    source_name = source.get("name", "Untitled")
    source_json = source.get("json_data", {})
    source_category = source.get("category", "")

    try:
        result = emailcraft_client.create_template(
            api_key,
            name=f"Copy of {source_name}",
            json_data=source_json,
            category=source_category,
        )
        return Response(
            {"id": result.get("id", ""), "name": result.get("name", "")},
            status=status.HTTP_201_CREATED,
        )
    except Exception:
        logger.exception("Failed to create template copy")
        return Response({"detail": "Failed to copy template."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
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


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_recipients(request, pk: int):
    from .models import CampaignRecipient
    from .serializers import CampaignRecipientSerializer

    campaign = EmailCampaign.objects.filter(pk=pk).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    recipients = CampaignRecipient.objects.filter(campaign=campaign)
    return Response({"results": CampaignRecipientSerializer(recipients, many=True).data})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def campaign_detail(_request, pk: int):
    campaign = EmailCampaign.objects.select_related("sender").filter(pk=pk).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(EmailCampaignSerializer(campaign).data)
