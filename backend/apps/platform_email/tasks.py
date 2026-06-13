import logging

from celery import shared_task
from django.utils import timezone
from requests import HTTPError

from apps.core.email import send_email
from apps.email_campaigns import emailcraft_client

logger = logging.getLogger(__name__)

PLATFORM_BRAND = "Contentor"


def _build_recipient_summary(recipient_filter: dict) -> str:
    filter_type = recipient_filter.get("type", "")
    if filter_type == "all_coaches":
        return "All coaches"
    if filter_type == "plan":
        return f"{len(recipient_filter.get('plan_ids') or [])} plan(s)"
    if filter_type == "tenant":
        return f"{len(recipient_filter.get('tenant_ids') or [])} workspace(s)"
    if filter_type == "individual":
        return f"{len(recipient_filter.get('user_ids') or [])} selected coach(es)"
    return ""


@shared_task(bind=True, max_retries=0)
def send_platform_campaign_emails(_self, campaign_id: int):
    """Render + send a platform campaign in the public schema (no tenant context)."""
    from .models import (
        CampaignStatus,
        PlatformCampaignRecipient,
        PlatformEmailCampaign,
        PlatformEmailConfig,
        RecipientStatus,
    )
    from .recipients import resolve_recipients

    campaign = PlatformEmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
    if not campaign:
        logger.error("Platform campaign %s not found", campaign_id)
        return

    config = PlatformEmailConfig.load()
    if not config.emailcraft_api_key:
        campaign.status = CampaignStatus.FAILED
        campaign.sent_at = timezone.now()
        campaign.save(update_fields=["status", "sent_at"])
        logger.error("No platform EmailCraft API key for campaign %s", campaign_id)
        return

    api_key = config.emailcraft_api_key
    from_name = PLATFORM_BRAND

    recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
    campaign.recipient_count = len(recipients)
    campaign.recipient_summary = _build_recipient_summary(campaign.recipient_filter)
    campaign.save(update_fields=["recipient_count", "recipient_summary"])

    success = 0
    failure = 0

    try:
        for idx, recipient in enumerate(recipients):
            try:
                variables = {"Name": (recipient["name"] or recipient["email"] or "there")}
                rendered = emailcraft_client.render_template(api_key, campaign.template_id, variables)
                html = rendered.get("html", "")

                if idx == 0 and html and not campaign.rendered_html:
                    campaign.rendered_html = html
                    campaign.save(update_fields=["rendered_html"])

                sent = send_email(
                    to=recipient["email"],
                    subject=campaign.subject,
                    html=html,
                    from_name=from_name,
                )
                if sent:
                    success += 1
                    PlatformCampaignRecipient.objects.create(
                        campaign=campaign,
                        user_id=recipient["id"],
                        user_name=recipient["name"] or "",
                        user_email=recipient["email"] or "",
                        status=RecipientStatus.SENT,
                        sent_at=timezone.now(),
                    )
                else:
                    failure += 1
                    PlatformCampaignRecipient.objects.create(
                        campaign=campaign,
                        user_id=recipient["id"],
                        user_name=recipient["name"] or "",
                        user_email=recipient["email"] or "",
                        status=RecipientStatus.FAILED,
                        error_message="Send returned false",
                    )
            except HTTPError as exc:
                response_text = ""
                if exc.response is not None:
                    response_text = (exc.response.text or "")[:2000]
                logger.exception(
                    "EmailCraft render/send HTTP error for %s campaign %s: %s",
                    recipient.get("email"),
                    campaign_id,
                    response_text,
                )
                failure += 1
                PlatformCampaignRecipient.objects.create(
                    campaign=campaign,
                    user_id=recipient["id"],
                    user_name=recipient["name"] or "",
                    user_email=recipient["email"] or "",
                    status=RecipientStatus.FAILED,
                    error_message=response_text[:500] or "HTTP error during render/send",
                )
            except Exception as exc:
                logger.exception(
                    "Failed to send platform email to %s for campaign %s",
                    recipient.get("email"),
                    campaign_id,
                )
                failure += 1
                PlatformCampaignRecipient.objects.create(
                    campaign=campaign,
                    user_id=recipient["id"],
                    user_name=recipient["name"] or "",
                    user_email=recipient["email"] or "",
                    status=RecipientStatus.FAILED,
                    error_message=str(exc)[:500],
                )

        campaign.success_count = success
        campaign.failure_count = failure
        campaign.sent_at = timezone.now()
        if success == 0:
            campaign.status = CampaignStatus.FAILED
        elif failure == 0:
            campaign.status = CampaignStatus.SENT
        else:
            campaign.status = CampaignStatus.PARTIAL
        campaign.save(update_fields=["success_count", "failure_count", "status", "sent_at"])
        logger.info("Platform campaign %s complete: %d sent, %d failed", campaign_id, success, failure)
    except Exception:
        logger.exception("Unexpected error while sending platform campaign %s", campaign_id)
        campaign.status = CampaignStatus.FAILED
        campaign.sent_at = timezone.now()
        campaign.save(update_fields=["status", "sent_at"])
