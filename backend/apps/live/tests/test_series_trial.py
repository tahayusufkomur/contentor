"""The free trial of a weekly class: its first session still to come is free for everyone, the rest keep their
price, and turning it off gives that session back exactly the ways it had."""

from __future__ import annotations

from datetime import UTC, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing import ways
from apps.billing.models import AccessWindow, Bundle, BundleItem, Payment, SubscriptionPlan, SubscriptionPlanAccess
from apps.billing.models.core import listed_items, original_price
from apps.core.access import ContentAccessService
from apps.live import series
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)

PAID = {"free": None, "buy": {"price": "19.00", "window": None}, "plans": []}
WINDOW = {"opens_after_days": 2, "closes_after_days": 30}


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@trial.test", name="Owner", password="x", role="owner")  # noqa: S106


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@trial.test", name="Student", password="x", role="student")  # noqa: S106


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _series(owner, count=4, *, model=LiveClass, sold=PAID, title="Pads", **extra):
    """``count`` weekly sessions, the first in two days, each set to ``sold`` as the series' ways."""
    start = timezone.now() + timedelta(days=2)
    made = []
    for n in range(count):
        row = model.objects.create(
            title=title, instructor=owner, scheduled_at=start + timedelta(weeks=n), status="scheduled", **extra
        )
        ways.set_ways(row, sold)
        made.append(row)
    return made


def _fresh(*rows):
    return [type(r).objects.get(pk=r.pk) for r in rows]


def _snapshot(row):
    """Everything that says how people get in: the columns, the windows and the plan links."""
    ctype = ContentType.objects.get_for_model(row)
    row = type(row).objects.get(pk=row.pk)
    windows = AccessWindow.objects.filter(content_type=ctype, object_id=row.pk).order_by("way")
    links = SubscriptionPlanAccess.objects.filter(content_type=ctype, object_id=row.pk).order_by("plan_id")
    return {
        "columns": (row.pricing_type, row.price),
        "ways": ways.ways_of(row),
        "windows": [(w.way, w.opens_after_days, w.opens_on, w.closes_after_days, w.closes_on) for w in windows],
        "links": [
            (link.plan_id, link.opens_after_days, link.opens_on, link.closes_after_days, link.closes_on)
            for link in links
        ],
    }


def test_trial_on_is_one_free_session_anyone_joins_and_the_rest_still_need_payment(owner, student, settings):
    settings.BILLING_BYPASS_ENABLED = True
    first, *later = rows = _series(owner)
    assert series.set_trial(first, True).pk == first.pk
    first, *later = _fresh(*rows)

    assert (first.is_trial, first.pricing_type, first.price) == (True, "free", 0)
    assert [(r.is_trial, r.pricing_type, r.price) for r in later] == [(False, "paid", Decimal("19.00"))] * 3

    access = ContentAccessService()
    for who in (AnonymousUser(), student):  # anyone, signed in or not
        assert access.check_access(who, first)
        for row in later:
            info = access.get_access_info(who, row)
            assert not info.has_access and info.unlock_methods == ["purchase"] and info.price == Decimal("19.00")

    # The checkout has nothing to sell for the trial; every other session is bought as before.
    pay = "/api/v1/billing/payments/initialize/"

    def buy(row):
        body = {"items": [{"content_type": "live_class", "object_id": row.pk}]}
        return _client(student).post(pay, body, format="json")

    assert buy(first).status_code == 400 and not Payment.objects.exists()
    assert buy(later[0]).status_code == 201
    assert access.check_access(student, later[0]) and not access.check_access(student, later[1])

    # The store lists what is for sale: the paid sessions, not the trial.
    on_sale = {i["id"] for i in _client(student).get("/api/v1/billing/store/").json() if i["type"] == "live_class"}
    assert first.pk not in on_sale and {r.pk for r in later} <= on_sale


def test_the_public_calendar_labels_only_the_trial_session(owner):
    first, *later = _series(owner)
    series.set_trial(first, True)
    got = {e["id"]: e for e in _client().get("/api/v1/calendar/").json()}
    assert got[first.pk]["is_trial"] is True and got[first.pk]["pricing_type"] == "free"
    assert all(got[r.pk]["is_trial"] is False and got[r.pk]["pricing_type"] == "paid" for r in later)
    detail = _client().get(f"/api/v1/calendar/live_class/{first.pk}/").json()
    assert detail["is_trial"] is True and detail["access_info"]["has_access"] is True
    assert _client().get(f"/api/v1/live/{first.pk}/").json()["is_trial"] is True


def test_with_the_trial_off_every_session_is_priced_as_it_is_today(owner, student):
    rows = _series(owner)
    assert series.trial_state(rows[0]) == {
        "on": False,
        "available": True,
        "session_id": rows[0].pk,
        "session_at": rows[0].scheduled_at,
    }
    access = ContentAccessService()
    for row in _fresh(*rows):
        assert (row.is_trial, row.trial_ways, row.pricing_type, row.price) == (False, None, "paid", Decimal("19.00"))
        assert not access.check_access(student, row)
        assert ways.ways_of(row) == {"free": None, "buy": {"price": "19.00", "window": None}, "plans": []}
    assert {e["is_trial"] for e in _client().get("/api/v1/calendar/").json()} == {False}


def test_re_expanding_after_the_trial_is_on_keeps_every_new_session_paid(owner):
    # Sold with a window and in a subscription: all of it is copied, none of it the free override.
    plan = SubscriptionPlan.objects.create(name="Members", price=30, billing_interval_months=1)
    sold = {
        "free": None,
        "buy": {"price": "19.00", "window": {"closes_after_days": 30}},
        "plans": [{"plan_id": plan.pk, "window": {"opens_after_days": 7}}],
    }
    first, second = _series(owner, 2, sold=sold)
    series.set_trial(first, True)
    start = first.scheduled_at.astimezone(UTC).date()
    sched = {
        "mode": "recurring",
        "start": start.isoformat(),
        "end": (start + timedelta(weeks=3)).isoformat(),
        "days": [(start.weekday() + 1) % 7],
        "times": [first.scheduled_at.astimezone(UTC).strftime("%H:%M")],
        "tz": "UTC",
    }
    first = LiveClass.objects.get(pk=first.pk)
    added = series.expand(first, sched, "UTC")
    assert added >= 2
    new = LiveClass.objects.exclude(pk__in=[first.pk, second.pk])
    assert new.count() == added
    for row in new:
        assert (row.is_trial, row.trial_ways, row.pricing_type, row.price) == (False, None, "paid", Decimal("19.00"))
        assert ways.ways_of(row) == ways.ways_of(second)
    assert LiveClass.objects.filter(is_trial=True).count() == 1


def test_finishing_a_focus_series_after_the_trial_is_on_keeps_every_new_session_paid(owner):
    from apps.core.focus.kinds import event as focus_event
    from apps.tenant_config.models import FocusCreation

    first, second = _series(owner, 2)
    series.set_trial(first, True)
    second.delete()  # she dropped the second one; finishing makes the rest from the first
    start = first.scheduled_at.astimezone(UTC)
    when = {
        "mode": "recurring",
        "start": start.date().isoformat(),
        "end": (start.date() + timedelta(weeks=3)).isoformat(),
        "days": [(start.weekday() + 1) % 7],
        "times": [start.strftime("%H:%M")],
        "tz": "UTC",
    }
    ref = focus_event.ref_for("live", first.pk)
    FocusCreation.objects.create(kind="event", mode="focus", record_id=ref, answers={"when": when})
    assert focus_event._settle_series(ref).pk == first.pk
    rest = LiveClass.objects.exclude(pk=first.pk)
    assert rest.count() >= 2
    assert {(r.is_trial, r.pricing_type, r.price) for r in rest} == {(False, "paid", Decimal("19.00"))}


@pytest.mark.parametrize(
    "sold",
    [
        {"free": None, "buy": {"price": "19.00", "window": None}, "plans": []},
        {
            "free": None,
            "buy": {"price": "19.50", "window": {"opens_after_days": 2, "closes_after_days": 30}},
            "plans": [],
        },
        {"free": None, "buy": {"price": "12.00", "window": {"closes_on": "2031-06-30"}}, "plans": "plan"},
        {"free": None, "buy": None, "plans": "plan"},
        {"free": {"window": {"closes_after_days": 7}}, "buy": {"price": "9.00", "window": None}, "plans": []},
    ],
    ids=["buy", "buy-window", "buy-and-plan", "members-only", "free-window-and-buy"],
)
def test_turning_it_off_restores_the_first_session_exactly(owner, sold):
    plan = SubscriptionPlan.objects.create(name="Members", price=30, billing_interval_months=1)
    if sold["plans"] == "plan":
        sold = {**sold, "plans": [{"plan_id": plan.pk, "window": {"opens_after_days": 7}}]}
    first, second = _series(owner, 3, sold=sold)[:2]
    before, other = _snapshot(first), _snapshot(second)

    series.set_trial(first, True)
    assert _snapshot(first)["columns"] == ("free", 0) and _snapshot(first)["windows"] == []
    assert _snapshot(first)["links"] == []  # free for everyone: nothing else to hold it
    assert _snapshot(first)["ways"] == before["ways"]  # what the ways API says is still the series' own
    assert _snapshot(second) == other

    assert series.set_trial(first, False) is None
    assert _snapshot(first) == before
    assert _snapshot(second) == other
    restored = LiveClass.objects.get(pk=first.pk)
    assert (restored.is_trial, restored.trial_ways) == (False, None)
    assert series.trial_state(first)["on"] is False


def test_what_is_set_while_the_trial_is_on_is_what_it_goes_back_to(owner):
    first, second = _series(owner)[:2]
    series.set_trial(first, True)
    first = LiveClass.objects.get(pk=first.pk)

    # A change of the series' ways (the Access section, the assistant, her interview) reaches the trial row too.
    ways.set_ways(first, {"free": None, "buy": {"price": "25", "window": None}, "plans": []})
    first = LiveClass.objects.get(pk=first.pk)
    assert (first.pricing_type, first.price) == ("free", 0)
    assert ways.ways_of(first)["buy"] == {"price": "25.00", "window": None}
    # ...and a copy of it is the real price, never the free one.
    copy = LiveClass.objects.create(title="Pads", instructor=first.instructor, scheduled_at=timezone.now())
    ways.copy_ways(first, copy)
    assert (copy.pricing_type, copy.price, copy.is_trial) == ("paid", Decimal("25.00"), False)

    series.set_trial(first, False)
    first = LiveClass.objects.get(pk=first.pk)
    assert (first.pricing_type, first.price) == ("paid", Decimal("25.00"))
    assert second.price == Decimal("19.00")


def test_a_subscription_deleted_while_the_trial_is_on_does_not_break_turning_it_off(owner):
    plan = SubscriptionPlan.objects.create(name="Members", price=30, billing_interval_months=1)
    members_only = {"free": None, "buy": None, "plans": [{"plan_id": plan.pk, "window": None}]}
    first = _series(owner, 2, sold=members_only)[0]
    series.set_trial(first, True)
    plan.delete()
    first = LiveClass.objects.get(pk=first.pk)
    assert ways.ways_of(first)["plans"] == []  # the stale plan is left out, never an error
    series.set_trial(first, False)
    assert LiveClass.objects.get(pk=first.pk).pricing_type == "free"  # nothing left to sell it by


def test_the_trial_is_the_first_session_still_to_come_and_stays_there_once_it_has_passed(owner):
    past = LiveClass.objects.create(
        title="Pads", instructor=owner, scheduled_at=timezone.now() - timedelta(days=3), status="ended"
    )
    ways.set_ways(past, PAID)
    first, second, third = _series(owner, 3)
    series.set_trial(second, True)  # any session of the series stands for it
    assert [r.is_trial for r in _fresh(past, first, second, third)] == [False, True, False, False]

    # Its day passes: it keeps the label and the free price, and the next session does not take over.
    LiveClass.objects.filter(pk=first.pk).update(scheduled_at=timezone.now() - timedelta(hours=1))
    assert series.set_trial(second, True).pk == first.pk  # already on: nothing moves
    assert [r.is_trial for r in _fresh(past, first, second, third)] == [False, True, False, False]
    state = series.trial_state(third)
    assert state["on"] is True and state["available"] is False and state["session_id"] == first.pk


def test_the_trial_does_not_apply_to_a_single_session_a_free_class_or_zoom(owner):
    (only,) = _series(owner, 1)
    assert series.trial_state(only)["available"] is False
    with pytest.raises(series.TrialError):
        series.set_trial(only, True)

    free = _series(owner, 3, sold={"free": {"window": None}, "buy": None, "plans": []}, title="Free flow")
    assert series.trial_state(free[0])["available"] is False
    with pytest.raises(series.TrialError):
        series.set_trial(free[0], True)

    zoom = _series(owner, 3, model=ZoomClass, sold={"free": {"window": None}, "buy": None, "plans": []}, title="Zoom")
    assert series.trial_state(zoom[0]) == {"on": False, "available": False, "session_id": None, "session_at": None}
    with pytest.raises(series.TrialError):
        series.set_trial(zoom[0], True)

    # Only sessions still to come count: one left after the others passed is not a series to give a trial to.
    old = _series(owner, 3, title="Winding down")
    LiveClass.objects.filter(pk__in=[old[0].pk, old[1].pk]).update(scheduled_at=timezone.now() - timedelta(days=5))
    assert series.trial_state(old[2])["available"] is False


@pytest.mark.parametrize("model", [LiveClass, LiveStream, OnsiteEvent])
def test_the_trial_works_for_every_kind_that_can_be_sold(owner, model):
    first, second = _series(owner, 2, model=model)
    series.set_trial(first, True)
    assert (ContentAccessService().check_access(AnonymousUser(), model.objects.get(pk=first.pk)), second.price) == (
        True,
        Decimal("19.00"),
    )
    assert not ContentAccessService().check_access(AnonymousUser(), model.objects.get(pk=second.pk))


def test_a_trial_session_in_a_bundle_is_not_counted_as_bought_apart(owner):
    first, *later = _series(owner, 3)
    bundle = Bundle.objects.create(name="Pads pack", price=Decimal("30.00"))
    ctype = ContentType.objects.get_for_model(LiveClass)
    for row in (first, *later):
        BundleItem.objects.create(bundle=bundle, content_type=ctype, object_id=row.pk)
    assert original_price(listed_items(bundle, drafts=True)) == Decimal("57.00")
    series.set_trial(first, True)
    # The free session is not part of what the bundle saves; the other two are.
    assert original_price(listed_items(bundle, drafts=True)) == Decimal("38.00")


class TestTrialEndpoint:
    def _url(self, row, kind="live"):
        return f"/api/v1/admin/events/{kind}/{row.pk}/trial/"

    def test_the_class_page_turns_it_on_and_off(self, owner):
        first, second = _series(owner, 2)
        coach = _client(owner)
        got = coach.get(self._url(second)).json()  # any session of the series
        assert (got["on"], got["available"], got["session_id"]) == (False, True, first.pk)

        got = coach.put(self._url(second), {"on": True}, format="json").json()
        assert (got["on"], got["available"], got["session_id"]) == (True, False, first.pk)
        assert LiveClass.objects.get(pk=first.pk).is_trial

        got = coach.put(self._url(first), {"on": False}, format="json").json()
        assert (got["on"], got["available"]) == (False, True)
        assert not LiveClass.objects.filter(is_trial=True).exists()

    def test_it_says_why_it_cannot_be_turned_on(self, owner):
        (only,) = _series(owner, 1)
        refused = _client(owner).put(self._url(only), {"on": True}, format="json")
        assert refused.status_code == 400 and "two sessions" in refused.json()["detail"]
        assert _client(owner).put(self._url(only), {"on": "yes"}, format="json").status_code == 400
        assert _client(owner).get(self._url(only, "nope")).status_code == 404

    def test_zoom_has_no_trial(self, owner):
        zoom = _series(owner, 2, model=ZoomClass, sold={"free": {"window": None}, "buy": None, "plans": []})
        assert _client(owner).get(self._url(zoom[0], "zoom")).json()["available"] is False
        assert _client(owner).put(self._url(zoom[0], "zoom"), {"on": True}, format="json").status_code == 400

    def test_only_her_team_can_use_it(self, owner, student):
        first = _series(owner, 2)[0]
        assert _client().get(self._url(first)).status_code in (401, 403)
        assert _client(student).put(self._url(first), {"on": True}, format="json").status_code == 403
        assert not LiveClass.objects.get(pk=first.pk).is_trial


def test_the_admin_list_carries_the_trial_label(owner):
    first = _series(owner, 2)[0]
    series.set_trial(first, True)
    got = _client(owner).get("/api/v1/admin/events/").json()["results"]
    assert {e["id"]: e["is_trial"] for e in got} == {
        first.pk: True,
        LiveClass.objects.exclude(pk=first.pk).get().pk: False,
    }
