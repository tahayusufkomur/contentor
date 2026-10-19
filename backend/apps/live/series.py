"""A weekly class is a series: every row of one event model with the same title
(there is no series model). /setup and focus mode both turn a weekly schedule
into its sessions here, and the event form and focus mode publish them together."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.billing.models import SubscriptionPlanAccess
from apps.tenant_config import interview_schedule

COPIED = ("title", "description", "instructor", "status", "pricing_type", "price", "duration_minutes")
COPIED += ("thumbnail", "thumbnail_url")
# What only some kinds have: the in-person place, a Zoom link, a room's recording.
COPIED_WHEN_PRESENT = ("location", "address", "max_capacity", "zoom_link", "zoom_meeting_id", "auto_recording")


def expand(first, schedule: dict, tz: str) -> int:
    """Copy ``first`` to every later future slot of ``schedule`` (in the coach's
    timezone, at her local time on every date), each in the memberships ``first``
    is in. Capped by interview_schedule.MAX_CLASSES. Returns how many were added."""
    after = max(filter(None, (first.scheduled_at, timezone.now())))
    later = [d for d in interview_schedule.occurrences(schedule, tz) if d > after]
    model = type(first)
    fields = COPIED + tuple(f for f in COPIED_WHEN_PRESENT if hasattr(first, f))
    ct = ContentType.objects.get_for_model(model)
    plan_ids = list(
        SubscriptionPlanAccess.objects.filter(content_type=ct, object_id=first.pk).values_list("plan_id", flat=True)
    )
    for when in later:
        row = model(**{f: getattr(first, f) for f in fields}, scheduled_at=when)
        row.save()
        SubscriptionPlanAccess.objects.bulk_create(
            SubscriptionPlanAccess(plan_id=pk, content_type=ct, object_id=row.pk) for pk in plan_ids
        )
    return len(later)


def rows(row):
    """Every session of ``row``'s series: the same model, the same title."""
    return type(row).objects.filter(title=row.title).order_by("scheduled_at")


def publish_series(row) -> int:
    """Every held (draft) session still to come becomes scheduled; sessions
    already scheduled, live, ended or past are left alone. Returns the count."""
    return rows(row).filter(status="draft", scheduled_at__gt=timezone.now()).update(status="scheduled")
