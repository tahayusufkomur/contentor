import logging

from celery import shared_task
from django.db.models import F
from django.utils import timezone
from django.utils.translation import gettext as _
from django.utils.translation import override
from django_tenants.utils import get_tenant_model, tenant_context

from apps.core.email import send_email
from apps.core.languages import site_language

logger = logging.getLogger(__name__)


@shared_task
def dispatch_due_email_campaigns():
    """Beat sweep: hand every due scheduled campaign to the send worker.

    Mirrors apps.blog.tasks.dispatch_due_blog_autopilot — only ready tenants
    have provisioned schemas, so skipping the rest avoids UndefinedTable errors
    on half-provisioned tenants.
    """
    for tenant in get_tenant_model().objects.exclude(schema_name="public").filter(provisioning_status="ready"):
        with tenant_context(tenant):
            try:
                _dispatch_email_for_current_tenant(tenant.schema_name)
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("email campaign dispatch failed for %s", tenant.schema_name)


def _dispatch_email_for_current_tenant(schema_name):
    """Claim each due SCHEDULED campaign exactly once, then spawn the sender."""
    from .models import CampaignStatus, EmailCampaign

    now = timezone.now()
    due = EmailCampaign.objects.filter(status=CampaignStatus.SCHEDULED, scheduled_at__lte=now)
    for campaign in due:
        # Exactly-once claim: only the worker that flips SCHEDULED→SENDING spawns.
        claimed = EmailCampaign.objects.filter(pk=campaign.pk, status=CampaignStatus.SCHEDULED).update(
            status=CampaignStatus.SENDING
        )
        if claimed:
            send_campaign_emails.delay(campaign.id, schema_name)


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


def _with_unsubscribe(html: str, link: str, brand: str) -> str:
    """The email with a one-line unsubscribe footer before </body>, unless its design already has the link
    (her brand footer does)."""
    from django.utils.html import escape

    if link in html:
        return html
    footer = (
        '<p style="margin:24px auto;max-width:600px;text-align:center;font-family:Arial,Helvetica,sans-serif;'
        f'font-size:12px;line-height:18px;color:#8a8a8a">{escape(brand)} · '
        f'<a href="{escape(link)}" style="color:#8a8a8a;text-decoration:underline">{escape(_("Unsubscribe"))}</a></p>'
    )
    head, body_end, tail = html.rpartition("</body>")
    return f"{head}{footer}{body_end}{tail}" if body_end else html + footer


def first_name(name: str, email: str = "") -> str:
    """What {{FirstName}} reads: the first word of her student's name, else a warm stand-in."""
    words = (name or "").split()
    return words[0] if words else _("there")


def campaign_html(campaign, tenant) -> tuple[str, str]:
    """(html, text) of the campaign, rendered once; merge variables stay for personalize."""
    from .brand import build

    html, text, _warnings = build(campaign.design, tenant, subject=campaign.subject, preheader=campaign.preheader)
    return html, text


def _from(campaign, tenant) -> tuple[str, str]:
    """(from_name, from_email): "<coach> via <brand>", from her mailbox when she has one."""
    from apps.mailbox.identity import sending_identity
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first()
    brand_name = (cfg.brand_name if cfg else "") or tenant.name
    coach = (campaign.sender.name or campaign.sender.email) if campaign.sender else ""
    return (
        _("%(coach)s via %(brand)s") % {"coach": coach, "brand": brand_name} if coach else brand_name
    ), sending_identity(tenant)[0]


def send_one(campaign, tenant, *, to, name="", subject="", unsubscribe="", html=None, text=None, sender=None) -> bool:
    """Send the campaign to one person. Without an unsubscribe link (her own test) the footer's link
    points at her site, so the test looks like the real thing."""
    from .catalog import site_of
    from .render import personalize

    if html is None:
        html, text = campaign_html(campaign, tenant)
    values = {
        "FirstName": first_name(name, to),
        "Name": name or _("there"),
        "UnsubscribeUrl": unsubscribe or site_of(tenant),
    }
    from_name, from_email = sender or _from(campaign, tenant)
    headers = (
        {"List-Unsubscribe": f"<{unsubscribe}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
        if unsubscribe
        else None
    )
    body = personalize(html, values)
    if unsubscribe:
        body = _with_unsubscribe(body, unsubscribe, from_name)
    return send_email(
        to=to,
        subject=personalize(subject or campaign.subject, values, escape=False),
        html=body,
        text=personalize(text or "", values, escape=False),
        from_name=from_name,
        from_email=from_email,
        headers=headers,
    )


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
            from apps.email_campaigns.models import EmailCampaign
            from apps.email_campaigns.recipients import resolve_recipients

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found", campaign_id)
                return
            recipients = list(resolve_recipients(campaign.recipient_filter).values("id", "name", "email"))
            recipient_count = len(recipients)
            campaign.recipient_summary = _build_recipient_summary(campaign.recipient_filter)
            campaign.save(update_fields=["recipient_summary"])

        today = timezone.now().date()
        month_start = today.replace(day=1)
        usage, _ = TenantUsage.objects.get_or_create(tenant=tenant, month=month_start)

        remaining_quota = None
        if tenant.plan and tenant.plan.max_campaign_emails:
            remaining_quota = max(tenant.plan.max_campaign_emails - usage.emails_sent, 0)

        with tenant_context(tenant), override(site_language()):  # students read it in the site's language
            from apps.email_campaigns.models import CampaignRecipient, CampaignStatus, EmailCampaign, RecipientStatus
            from apps.notifications.email_render import unsubscribe_url

            campaign = EmailCampaign.objects.select_related("sender").filter(pk=campaign_id).first()
            if not campaign:
                logger.error("Campaign %s not found during send phase", campaign_id)
                return

            campaign.recipient_count = recipient_count
            # One render for everyone; each recipient gets their own name and unsubscribe link.
            html, text = campaign_html(campaign, tenant)
            sender = _from(campaign, tenant)

            def record(recipient, state, error=""):
                CampaignRecipient.objects.create(
                    campaign=campaign,
                    user_id=recipient["id"],
                    user_name=recipient["name"] or "",
                    user_email=recipient["email"] or "",
                    status=state,
                    error_message=error[:500],
                    sent_at=timezone.now() if state == RecipientStatus.SENT else None,
                )

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
                    unsubscribe = unsubscribe_url(tenant, user_id=recipient["id"], email=recipient["email"])
                    if idx == 0 and not campaign.rendered_html:
                        # The campaign's preview: the first recipient's email, its unsubscribe link inert.
                        from .render import personalize

                        campaign.rendered_html = personalize(
                            html, {"FirstName": first_name(recipient["name"] or ""), "UnsubscribeUrl": "#"}
                        )
                        campaign.save(update_fields=["rendered_html"])
                    sent = send_one(
                        campaign,
                        tenant,
                        to=recipient["email"],
                        name=recipient["name"] or "",
                        unsubscribe=unsubscribe,
                        html=html,
                        text=text,
                        sender=sender,
                    )
                    if sent:
                        success += 1
                        record(recipient, RecipientStatus.SENT)
                    else:
                        failure += 1
                        record(recipient, RecipientStatus.FAILED, "Send returned false")
                except Exception as exc:
                    logger.exception("Failed to send email to %s for campaign %s", recipient.get("email"), campaign_id)
                    failure += 1
                    record(recipient, RecipientStatus.FAILED, str(exc))

            campaign.success_count = success
            campaign.failure_count = failure
            campaign.sent_at = timezone.now()

            if success == 0:
                campaign.status = CampaignStatus.FAILED
            elif failure == 0:
                campaign.status = CampaignStatus.SENT
            else:
                campaign.status = CampaignStatus.PARTIAL

            campaign.save(update_fields=["recipient_count", "success_count", "failure_count", "status", "sent_at"])

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


@shared_task
def build_starter_emails(tenant_id: int):
    """The emails made for her at setup (the interview's emails:starters milestone)."""
    from apps.core.models import Tenant

    from . import starters

    tenant = Tenant.objects.filter(pk=tenant_id).first()
    if tenant is None:
        return
    with tenant_context(tenant):
        starters.ensure(tenant)


@shared_task(queue="agents", ignore_result=True)
def run_design_job(schema_name: str, job_id: int):
    """The Designer's run on one email (the agents worker)."""
    from . import designer

    tenant = get_tenant_model().objects.filter(schema_name=schema_name).first()
    if tenant is None:
        return
    with tenant_context(tenant):
        designer.execute(tenant, job_id)
