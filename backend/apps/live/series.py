"""A weekly class is a series: every row of one event model with the same title
(there is no series model). /setup and focus mode both turn a weekly schedule
into its sessions here, and the event form and focus mode publish them together."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Case, F, Value, When
from django.utils import timezone

from apps.billing import ways
from apps.tenant_config import interview_schedule

# The ways in (pricing_type, price, windows, plan links) are copied by ways.copy_ways.
COPIED = ("title", "description", "instructor", "status", "duration_minutes")
COPIED += ("thumbnail", "thumbnail_url")
# What only some kinds have: the in-person place, a Zoom link, a room's recording and watermark.
COPIED_WHEN_PRESENT = ("location", "address", "max_capacity", "zoom_link", "zoom_meeting_id", "auto_recording")
COPIED_WHEN_PRESENT += ("watermark",)


def expand(first, schedule: dict, tz: str) -> int:
    """Copy ``first`` to every later future slot of ``schedule`` (in the coach's
    timezone, at her local time on every date), each in the memberships ``first``
    is in. Capped by interview_schedule.MAX_CLASSES. Returns how many were added.
    The caller owns ``first``: expand never moves it, so a past ``first`` stays past."""
    after = max(filter(None, (first.scheduled_at, timezone.now())))
    later = [d for d in interview_schedule.occurrences(schedule, tz) if d > after]
    model = type(first)
    fields = COPIED + tuple(f for f in COPIED_WHEN_PRESENT if hasattr(first, f))
    with transaction.atomic():
        for when in later:
            row = model(**{f: getattr(first, f) for f in fields}, scheduled_at=when)
            row.save()
            ways.copy_ways(first, row)
    return len(later)


def rows(row):
    """Every session of ``row``'s series: the same model, the same title."""
    return type(row).objects.filter(title=row.title).order_by("scheduled_at")


# The series shares one place: Keep as a draft may have copied it blank.
PLACE = ("location", "address", "zoom_link", "zoom_meeting_id")


def publish_series(row) -> int:
    """Every held (draft) session still to come becomes scheduled, and takes
    ``row``'s place (address, Zoom link) where its own is blank; sessions
    already scheduled, live, ended or past are left alone. Returns the count."""
    model = type(row)
    place = {
        f: Case(When(**{f: ""}, then=Value(value)), default=F(f), output_field=model._meta.get_field(f))
        for f in PLACE
        if (value := getattr(row, f, ""))
    }
    return rows(row).filter(status="draft", scheduled_at__gt=timezone.now()).update(status="scheduled", **place)
