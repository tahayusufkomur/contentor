import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_tenant_model, tenant_context

from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

from .models import LiveReminderLog
from .payloads import live_reminder_payload
from .services import broadcast_to_tenant, send_to_subscriptions, subscriptions_with_access

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
    for tenant in get_tenant_model().objects.exclude(schema_name="public"):
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
def fanout_broadcast(message: str, schema_name: str) -> None:
    from .payloads import broadcast_payload

    tenant_model = get_tenant_model()
    try:
        tenant = tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return
    with tenant_context(tenant):
        broadcast_to_tenant(broadcast_payload(message))
