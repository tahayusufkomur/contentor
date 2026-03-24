import logging

from celery import shared_task
from django.db.models import F
from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.core.email import send_email

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def send_campaign_emails(_self, campaign_id: int, schema_name: str):
    """
    Render + send a campaign inside the tenant schema.
    TenantUsage is updated in the public schema after completion.
    """
    from apps.core.models import Tenant, TenantUsage

    try:
        tenant = Tenant.objects.select_related("plan").get(schema_name=schema_name)
    except Tenant.DoesNotExist:
        logger.error("Tenant %s not found for campaign %s", schema_name, campaign_id)
        return

    success = 0
    failure = 0

    try:
        with tenant_context(tenant):
            from apps.courses.models import Course
            from apps.email_campaigns.models import CampaignStatus, EmailCampaign
            from apps.email_campaigns.recipients import resolve_recipients
            from apps.tenant_config.models import TenantConfig

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found", campaign_id)
                return

            config = TenantConfig.objects.first()
            if not config or not config.emailcraft_api_key:
                campaign.status = CampaignStatus.FAILED
                campaign.sent_at = timezone.now()
                campaign.save(update_fields=["status", "sent_at"])
                logger.error("No EmailCraft API key for campaign %s", campaign_id)
                return

            api_key = config.emailcraft_api_key
            brand_name = config.brand_name
            coach_name = campaign.sender.name or campaign.sender.email
            from_name = f"{coach_name} via {brand_name}"

            recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
            recipient_count = len(recipients)

            course_name = ""
            recipient_filter = campaign.recipient_filter
            if recipient_filter.get("type") == "course":
                course_ids = recipient_filter.get("course_ids") or []
                if len(course_ids) == 1:
                    course = Course.objects.filter(pk=course_ids[0]).first()
                    if course:
                        course_name = course.title

        today = timezone.now().date()
        month_start = today.replace(day=1)
        usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)

        remaining_quota = None
        if tenant.plan and tenant.plan.max_campaign_emails:
            remaining_quota = max(tenant.plan.max_campaign_emails - usage.emails_sent, 0)

        with tenant_context(tenant):
            from apps.email_campaigns import emailcraft_client
            from apps.email_campaigns.models import CampaignStatus, EmailCampaign

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found during send phase", campaign_id)
                return

            campaign.recipient_count = recipient_count

            for idx, recipient in enumerate(recipients):
                if remaining_quota is not None and success >= remaining_quota:
                    failure += len(recipients) - idx
                    logger.warning("Quota reached mid-batch for campaign %s", campaign_id)
                    break

                try:
                    variables = {
                        "student_name": recipient["name"] or recipient["email"],
                        "student_email": recipient["email"],
                        "course_name": course_name,
                        "coach_name": coach_name,
                        "brand_name": brand_name,
                    }
                    rendered = emailcraft_client.render_template(api_key, campaign.template_id, variables)
                    html = rendered.get("html", "")

                    sent = send_email(
                        to=recipient["email"],
                        subject=campaign.subject,
                        html=html,
                        from_name=from_name,
                    )
                    if sent:
                        success += 1
                    else:
                        failure += 1
                except Exception:
                    logger.exception(
                        "Failed to send email to %s for campaign %s",
                        recipient.get("email"),
                        campaign_id,
                    )
                    failure += 1

            campaign.success_count = success
            campaign.failure_count = failure
            campaign.sent_at = timezone.now()

            if success == 0:
                campaign.status = CampaignStatus.FAILED
            elif failure == 0:
                campaign.status = CampaignStatus.SENT
            else:
                campaign.status = CampaignStatus.PARTIAL

            campaign.save(
                update_fields=[
                    "recipient_count",
                    "success_count",
                    "failure_count",
                    "status",
                    "sent_at",
                ]
            )

        if success > 0:
            TenantUsage.objects.filter(tenant=tenant, month=month_start).update(emails_sent=F("emails_sent") + success)

        logger.info("Campaign %s complete: %d sent, %d failed", campaign_id, success, failure)

    except Exception:
        logger.exception("Unexpected error while sending campaign %s", campaign_id)
        with tenant_context(tenant):
            from apps.email_campaigns.models import CampaignStatus, EmailCampaign

            campaign = EmailCampaign.objects.filter(pk=campaign_id).first()
            if campaign:
                campaign.status = CampaignStatus.FAILED
                campaign.sent_at = timezone.now()
                campaign.save(update_fields=["status", "sent_at"])
