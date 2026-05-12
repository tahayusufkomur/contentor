import logging

from celery import shared_task
from django.db.models import F
from django.utils import timezone
from django_tenants.utils import tenant_context
from requests import HTTPError

from apps.core.email import send_email

logger = logging.getLogger(__name__)


def _build_recipient_summary(recipient_filter: dict) -> str:
    filter_type = recipient_filter.get("type", "")
    if filter_type == "all":
        return "All students"
    if filter_type == "course":
        course_ids = recipient_filter.get("course_ids") or []
        if not course_ids:
            return "No courses selected"
        try:
            from apps.courses.models import Course

            names = list(Course.objects.filter(pk__in=course_ids).values_list("title", flat=True))
            return ", ".join(names) if names else f"{len(course_ids)} course(s)"
        except Exception:
            return f"{len(course_ids)} course(s)"
    if filter_type == "individual":
        user_ids = recipient_filter.get("user_ids") or []
        return f"{len(user_ids)} selected student(s)"
    return ""


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
            coach_name = (campaign.sender.name or campaign.sender.email) if campaign.sender else "Coach"
            from_name = f"{coach_name} via {brand_name}"

            recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
            recipient_count = len(recipients)

            summary = _build_recipient_summary(campaign.recipient_filter)
            campaign.recipient_summary = summary
            campaign.save(update_fields=["recipient_summary"])

        today = timezone.now().date()
        month_start = today.replace(day=1)
        usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)

        remaining_quota = None
        if tenant.plan and tenant.plan.max_campaign_emails:
            remaining_quota = max(tenant.plan.max_campaign_emails - usage.emails_sent, 0)

        with tenant_context(tenant):
            from apps.email_campaigns import emailcraft_client
            from apps.email_campaigns.models import CampaignRecipient, CampaignStatus, EmailCampaign, RecipientStatus

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found during send phase", campaign_id)
                return

            campaign.recipient_count = recipient_count

            for idx, recipient in enumerate(recipients):
                if remaining_quota is not None and success >= remaining_quota:
                    remaining = recipients[idx:]
                    CampaignRecipient.objects.bulk_create(
                        [
                            CampaignRecipient(
                                campaign=campaign,
                                user_id=r["id"],
                                user_name=r["name"] or "",
                                user_email=r["email"] or "",
                                status=RecipientStatus.FAILED,
                                error_message="Email quota exceeded",
                            )
                            for r in remaining
                        ]
                    )
                    failure += len(remaining)
                    logger.warning("Quota reached mid-batch for campaign %s", campaign_id)
                    break

                try:
                    variables = {
                        "Name": (recipient["name"] or recipient["email"] or "Student"),
                    }
                    rendered = emailcraft_client.render_template(api_key, campaign.template_id, variables)
                    html = rendered.get("html", "")

                    # Store first recipient's rendered HTML as campaign preview
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
                        CampaignRecipient.objects.create(
                            campaign=campaign,
                            user_id=recipient["id"],
                            user_name=recipient["name"] or "",
                            user_email=recipient["email"] or "",
                            status=RecipientStatus.SENT,
                            sent_at=timezone.now(),
                        )
                    else:
                        failure += 1
                        CampaignRecipient.objects.create(
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
                    CampaignRecipient.objects.create(
                        campaign=campaign,
                        user_id=recipient["id"],
                        user_name=recipient["name"] or "",
                        user_email=recipient["email"] or "",
                        status=RecipientStatus.FAILED,
                        error_message=response_text[:500] or "HTTP error during render/send",
                    )
                except Exception as exc:
                    logger.exception(
                        "Failed to send email to %s for campaign %s",
                        recipient.get("email"),
                        campaign_id,
                    )
                    failure += 1
                    CampaignRecipient.objects.create(
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
