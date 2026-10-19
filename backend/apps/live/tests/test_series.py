"""The weekly series: one class copied to every slot of a schedule, published together."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
from apps.live import series
from apps.live.models import LiveClass, OnsiteEvent
from apps.tenant_config import interview_schedule as schedule

pytestmark = pytest.mark.django_db


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@series.test", name="Owner", password="x", role="owner")  # noqa: S106


def _weekly(start, end, days, times, tz="UTC"):
    return {"mode": "recurring", "start": start, "end": end, "days": days, "times": times, "tz": tz}


def _first(owner, schedule_, model=LiveClass, **extra):
    """The coach's first session, at the schedule's first slot."""
    at = schedule.occurrences(schedule_, "UTC")[0]
    return model.objects.create(
        title="Pads", description="Slow flow", instructor=owner, scheduled_at=at, status="draft", **extra
    )


def test_expand_copies_the_first_session_to_every_later_slot(owner):
    # 7 Jan 2030 is a Monday: Tue 8, Thu 10, Tue 15, Thu 17.
    sched = _weekly("2030-01-07", "2030-01-21", [2, 4], ["18:30"])
    first = _first(owner, sched, pricing_type="paid", price=15, duration_minutes=45)
    assert series.expand(first, sched, "UTC") == 3
    rows = list(LiveClass.objects.order_by("scheduled_at"))
    assert [r.scheduled_at.isoformat()[:16] for r in rows] == [
        "2030-01-08T18:30",
        "2030-01-10T18:30",
        "2030-01-15T18:30",
        "2030-01-17T18:30",
    ]
    for row in rows:
        assert (row.title, row.description, row.instructor, row.status) == ("Pads", "Slow flow", owner, "draft")
        assert (row.pricing_type, row.price, row.duration_minutes) == ("paid", 15, 45)
    assert len({r.room_name for r in rows}) == 4


def test_expand_copies_the_in_person_place(owner):
    sched = _weekly("2030-01-07", "2030-01-21", [2], ["10:00"])  # Tue 8, Tue 15
    first = _first(owner, sched, model=OnsiteEvent, location="Studio A", address="1 Main St")
    assert series.expand(first, sched, "UTC") == 1
    assert set(OnsiteEvent.objects.values_list("location", "address")) == {("Studio A", "1 Main St")}


def test_a_series_starts_at_the_first_future_slot_in_her_timezone(owner):
    zone = ZoneInfo("Pacific/Auckland")
    today = timezone.now().astimezone(zone).date()
    # Every day at 00:00 her time, from yesterday: the slots of yesterday and
    # today have passed, so the series begins tomorrow at her midnight.
    sched = _weekly(
        (today - timedelta(days=1)).isoformat(),
        (today + timedelta(days=4)).isoformat(),
        [0, 1, 2, 3, 4, 5, 6],
        ["00:00"],
        tz="Pacific/Auckland",
    )
    first = _first(owner, sched)  # yesterday's slot, already past
    added = series.expand(first, sched, "UTC")
    later = LiveClass.objects.exclude(pk=first.pk).order_by("scheduled_at")
    assert added == later.count() == 4
    assert all(r.scheduled_at > timezone.now() for r in later)
    assert later[0].scheduled_at.astimezone(zone) == datetime.combine(
        today + timedelta(days=1), datetime.min.time(), tzinfo=zone
    )


@pytest.mark.parametrize(
    ("tz", "start", "end"),
    [
        # Europe/Berlin leaves summer time on Sunday 27 Oct 2030; US zones on 3 Nov 2030.
        ("Europe/Berlin", "2030-10-14", "2030-12-08"),
        ("America/New_York", "2030-10-21", "2030-12-15"),
    ],
)
def test_a_series_keeps_her_local_time_across_a_clock_change(owner, tz, start, end):
    sched = _weekly(start, end, [1], ["18:00"], tz=tz)  # Mondays, eight of them
    first = _first(owner, sched)
    assert series.expand(first, sched, "UTC") == 7
    zone = ZoneInfo(tz)
    local = [r.scheduled_at.astimezone(zone) for r in LiveClass.objects.order_by("scheduled_at")]
    assert len(local) == 8
    assert {(d.hour, d.minute) for d in local} == {(18, 0)}
    # The clock really changed inside the span, so the UTC offset moved.
    assert len({d.utcoffset() for d in local}) == 2


def test_expand_is_capped_at_sixty(owner):
    sched = _weekly("2030-01-01", "2030-12-31", [0, 1, 2, 3, 4, 5, 6], ["09:00"])
    first = _first(owner, sched)
    assert series.expand(first, sched, "UTC") == schedule.MAX_CLASSES - 1
    assert LiveClass.objects.count() == schedule.MAX_CLASSES == 60


def test_later_sessions_join_the_first_ones_memberships(owner):
    sched = _weekly("2030-01-07", "2030-01-21", [2], ["19:00"])
    first = _first(owner, sched)
    plan = SubscriptionPlan.objects.create(name="Weekly", price="25.00", currency="USD")
    other = SubscriptionPlan.objects.create(name="Other", price="9.00", currency="USD")
    ct = ContentType.objects.get_for_model(LiveClass)
    SubscriptionPlanAccess.objects.create(plan=plan, content_type=ct, object_id=first.pk)
    SubscriptionPlanAccess.objects.create(plan=other, content_type=ct, object_id=first.pk)
    assert series.expand(first, sched, "UTC") == 1
    later = LiveClass.objects.exclude(pk=first.pk).get()
    got = SubscriptionPlanAccess.objects.filter(content_type=ct, object_id=later.pk)
    assert set(got.values_list("plan__name", flat=True)) == {"Weekly", "Other"}


def test_rows_are_the_same_model_with_the_same_title(owner):
    sched = _weekly("2030-01-07", "2030-01-21", [2], ["19:00"])
    first = _first(owner, sched)
    series.expand(first, sched, "UTC")
    LiveClass.objects.create(title="Other class", instructor=owner)
    OnsiteEvent.objects.create(title="Pads", instructor=owner)
    got = series.rows(first)
    assert got.count() == 2 and {r.title for r in got} == {"Pads"} and set(map(type, got)) == {LiveClass}


def test_publish_series_skips_past_and_published_rows(owner):
    now = timezone.now()

    def make(hours, status="draft", title="Pads"):
        return LiveClass.objects.create(
            title=title, instructor=owner, scheduled_at=now + timedelta(hours=hours), status=status
        )

    held_a, held_b = make(24), make(48)
    past, live, ended = make(-24), make(1, "scheduled"), make(-5, "ended")
    elsewhere = make(24, title="Other class")
    undated = LiveClass.objects.create(title="Pads", instructor=owner)
    assert series.publish_series(held_a) == 2
    statuses = {r.pk: r.status for r in LiveClass.objects.all()}
    assert statuses[held_a.pk] == statuses[held_b.pk] == "scheduled"
    assert statuses[past.pk] == "draft" and statuses[undated.pk] == "draft"
    assert statuses[live.pk] == "scheduled" and statuses[ended.pk] == "ended"
    assert statuses[elsewhere.pk] == "draft"
    assert series.publish_series(held_a) == 0  # nothing held is left


def test_publish_series_moves_an_in_person_series_too(owner):
    when = timezone.now() + timedelta(days=2)
    row = OnsiteEvent.objects.create(title="Retreat", instructor=owner, scheduled_at=when)
    assert series.publish_series(row) == 1
    row.refresh_from_db()
    assert row.status == "scheduled"
