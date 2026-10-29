import logging

from celery import shared_task
from django.utils import timezone

from apps.core.email import send_email

logger = logging.getLogger(__name__)

PLATFORM_BRAND = "Contentor"


def _build_recipient_summary(recipient_filter: dict) -> str:
    filter_type = recipient_filter.get("type", "")
    if filter_type == "all_coaches":
        return "All creators"
    if filter_type == "plan":
        return f"{len(recipient_filter.get('plan_ids') or [])} plan(s)"
    if filter_type == "tenant":
        return f"{len(recipient_filter.get('tenant_ids') or [])} workspace(s)"
    if filter_type == "individual":
        return f"{len(recipient_filter.get('user_ids') or [])} selected creator(s)"
    return ""


def send_one(campaign, *, to, name="", subject="", html=None, text=None) -> bool:
    """One platform email, personal ({{FirstName}}); platform emails carry no unsubscribe link."""
    from apps.email_campaigns.render import personalize
    from apps.email_campaigns.tasks import first_name

    from .views import build

    if html is None:
        html, text = build(
            campaign.design, campaign.subject, campaign.preheader, campaign.recipient_filter.get("language")
        )
    values = {"FirstName": first_name(name), "Name": name or "there"}
    return send_email(
        to=to,
        subject=personalize(subject or campaign.subject, values, escape=False),
        html=personalize(html, values),
        text=personalize(text or "", values, escape=False),
        from_name=PLATFORM_BRAND,
    )


@shared_task(bind=True, max_retries=0)
def send_platform_campaign_emails(_self, campaign_id: int):
    """Render once, then send each coach their own copy, in the public schema (no tenant context)."""
    from .models import CampaignStatus, PlatformCampaignRecipient, PlatformEmailCampaign, RecipientStatus
    from .recipients import resolve_recipients
    from .views import build

    campaign = PlatformEmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
    if not campaign:
        logger.error("Platform campaign %s not found", campaign_id)
        return

    recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
    campaign.recipient_count = len(recipients)
    campaign.recipient_summary = _build_recipient_summary(campaign.recipient_filter)
    campaign.save(update_fields=["recipient_count", "recipient_summary"])

    success = failure = 0
    try:
        html, text = build(
            campaign.design, campaign.subject, campaign.preheader, campaign.recipient_filter.get("language")
        )
        for idx, recipient in enumerate(recipients):
            name = recipient["name"] or ""
            try:
                if idx == 0 and not campaign.rendered_html:
                    from apps.email_campaigns.render import personalize

                    campaign.rendered_html = personalize(html, {"FirstName": name.split(" ")[0] or "there"})
                    campaign.save(update_fields=["rendered_html"])
                sent = send_one(campaign, to=recipient["email"], name=name, html=html, text=text)
                error = "" if sent else "Send returned false"
            except Exception as exc:
                logger.exception(
                    "Failed to send platform email to %s for campaign %s", recipient.get("email"), campaign_id
                )
                sent, error = False, str(exc)[:500]
            success, failure = (success + 1, failure) if sent else (success, failure + 1)
            PlatformCampaignRecipient.objects.create(
                campaign=campaign,
                user_id=recipient["id"],
                user_name=name,
                user_email=recipient["email"] or "",
                status=RecipientStatus.SENT if sent else RecipientStatus.FAILED,
                error_message=error,
                sent_at=timezone.now() if sent else None,
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
