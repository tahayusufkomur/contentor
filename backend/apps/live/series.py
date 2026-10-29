"""A weekly class is a series: every row of one event model with the same title
(there is no series model). /setup and focus mode both turn a weekly schedule
into its sessions here, and the event form and focus mode publish them together.
Its optional free trial (``set_trial``) makes the first session still to come free for everyone."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Case, F, Value, When
from django.utils import timezone
from django.utils.translation import gettext as _

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


# ---- the free trial -----------------------------------------------------------

FREE = {"free": {"window": None}, "buy": None, "plans": []}


class TrialError(Exception):
    """Why the trial cannot be turned on; ``str()`` is a sentence for the creator."""


def trial_session(row):
    """The series' trial session in any state (it stays on a session that has passed), or None."""
    return rows(row).filter(is_trial=True).first() if hasattr(row, "is_trial") else None


def _to_come(row):
    return rows(row).filter(scheduled_at__gt=timezone.now())


def trial_state(row) -> dict:
    """What the class page shows: ``on`` (the series has a trial) and ``available`` (it can be turned on: a series
    of sessions still to come, more than one, the first sold or in a subscription; never Zoom, which is free only).
    ``session_id`` / ``session_at`` name the trial session when it is on, else the one it would be."""
    if not hasattr(row, "is_trial"):
        return {"on": False, "available": False, "session_id": None, "session_at": None}
    trial = trial_session(row)
    upcoming = list(_to_come(row)[:2])
    first = trial or (upcoming[0] if upcoming else None)
    return {
        "on": trial is not None,
        "available": trial is None and len(upcoming) > 1 and upcoming[0].pricing_type != "free",
        "session_id": first.pk if first else None,
        "session_at": first.scheduled_at if first else None,
    }


def set_trial(row, on: bool):
    """Turn the series' free trial on or off; returns the trial session, or None once it is off.

    On: the earliest session still to come becomes free for everyone and wears the Trial label. Its own ways
    (price, windows, subscriptions) are kept on the row and every other session is left alone, so a copy of the
    series (``expand``) or a later change of its ways goes on using the real ones. It stays on that session once
    that has passed: the trial never hops to the next. Already on: nothing changes.
    Off: that session gets back exactly the ways it had."""
    with transaction.atomic():
        current = rows(row).select_for_update().filter(is_trial=True).first() if hasattr(row, "is_trial") else None
        if on:
            if current is not None:
                return current
            if not trial_state(row)["available"]:
                raise TrialError(
                    _(
                        "A free trial needs a paid class with at least two sessions still to come "
                        "(Zoom sessions are always free)."
                    )
                )
            first = _to_come(row).select_for_update().first()
            first.trial_ways = ways.ways_of(first)
            first.is_trial = True
            first.save(update_fields=["is_trial", "trial_ways"])
            ways.set_ways(first, FREE, raw=True)
            return first
        if current is not None:
            back = ways.ways_of(current)  # a deleted subscription is already left out
            if not (back["free"] or back["buy"] or back["plans"]):  # it was in a subscription that is gone
                back = FREE
            current.is_trial, current.trial_ways = False, None
            current.save(update_fields=["is_trial", "trial_ways"])
            ways.set_ways(current, back)
        return None
