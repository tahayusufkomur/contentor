import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_tenant_model, tenant_context

from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

from .models import LiveReminderLog
from .payloads import live_reminder_payload
from .services import (
    broadcast_to_tenant,
    send_announcement_to_recipients,
    send_to_subscriptions,
    subscriptions_with_access,
)

logger = logging.getLogger(__name__)

_LIVE_MODELS = (LiveClass, LiveStream, ZoomClass, OnsiteEvent)
_WINDOW_MINUTES = 15


def _send_reminders_for_current_tenant() -> None:
    now = timezone.now()
    horizon = now + timedelta(minutes=_WINDOW_MINUTES)
    for model in _LIVE_MODELS:
        upcoming = model.objects.filter(scheduled_at__gt=now, scheduled_at__lte=horizon)
        for event in upcoming:
            key = f"{model.__name__.lower()}:{event.pk}"
            _, created = LiveReminderLog.objects.get_or_create(key=key)
            if not created:
                continue
            # Only remind students who can actually attend (free → everyone,
            # paid → purchasers/subscribers). New-content + broadcast stay broad.
            send_to_subscriptions(subscriptions_with_access(event), live_reminder_payload(event.title))


@shared_task
def send_live_reminders() -> None:
    for tenant in get_tenant_model().objects.exclude(schema_name="public").filter(provisioning_status="ready"):
        with tenant_context(tenant):
            try:
                _send_reminders_for_current_tenant()
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("live reminder fan-out failed for %s", tenant.schema_name)


@shared_task
def fanout_new_content(course_id: int, schema_name: str) -> None:
    from apps.courses.models import Course

    from .payloads import new_content_payload

    tenant_model = get_tenant_model()
    try:
        tenant = tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return
    with tenant_context(tenant):
        course = Course.objects.filter(pk=course_id).first()
        if not course:
            return
        broadcast_to_tenant(new_content_payload(course.title, f"/courses/{course.slug}"))


@shared_task
def fanout_announcement(announcement_id: int, schema_name: str) -> None:
    from .models import Announcement

    tenant_model = get_tenant_model()
    try:
        tenant = tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return
    with tenant_context(tenant):
        # Atomic claim: only one worker can transition scheduled -> sent.
        # A concurrent/duplicate dispatch (slow fanout re-enqueued by beat)
        # claims 0 rows and returns without re-sending.
        claimed = Announcement.objects.filter(pk=announcement_id, status="scheduled").update(status="sent")
        if not claimed:
            return
        announcement = Announcement.objects.get(pk=announcement_id)
        send_announcement_to_recipients(announcement)


@shared_task
def dispatch_due_announcements() -> None:
    from .models import Announcement

    now = timezone.now()
    for tenant in get_tenant_model().objects.exclude(schema_name="public").filter(provisioning_status="ready"):
        with tenant_context(tenant):
            try:
                due = Announcement.objects.filter(status="scheduled", scheduled_at__lte=now)
                for announcement in due:
                    fanout_announcement.delay(announcement.id, tenant.schema_name)
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("announcement dispatch failed for %s", tenant.schema_name)


@shared_task
def dispatch_due_recurrences() -> None:
    for tenant in get_tenant_model().objects.exclude(schema_name="public").filter(provisioning_status="ready"):
        with tenant_context(tenant):
            try:
                _dispatch_recurrences_for_current_tenant()
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("recurrence dispatch failed for %s", tenant.schema_name)


def _dispatch_recurrences_for_current_tenant() -> None:
    from apps.tenant_config.models import TenantConfig

    from . import recurrence as rec
    from .models import Announcement, RecurringAnnouncement
    from .services import send_announcement_to_recipients

    now = timezone.now()
    cfg = TenantConfig.objects.first()
    tz_name = cfg.timezone if cfg else "UTC"
    for rule in RecurringAnnouncement.objects.filter(is_active=True, next_run_at__lte=now):
        old_next = rule.next_run_at
        new_next = rec.next_occurrence(
            frequency=rule.frequency,
            send_time=rule.send_time,
            weekday=rule.weekday,
            day_of_month=rule.day_of_month,
            after_utc=now,
            tz_name=tz_name,
            start_date=rule.start_date,
        )
        still_active = not (rule.end_date and new_next.date() > rule.end_date)
        # Exactly-once claim: only the worker that advances next_run_at spawns.
        claimed = RecurringAnnouncement.objects.filter(pk=rule.pk, next_run_at=old_next).update(
            next_run_at=new_next, is_active=still_active
        )
        if not claimed:
            continue
        ann = Announcement.objects.create(
            title=rule.title,
            body=rule.body,
            link=rule.link,
            filters_json=rule.filters_json,
            also_email=rule.also_email,
            status="scheduled",
            recurrence=rule,
        )
        send_announcement_to_recipients(ann)
