"""A held class (a draft with a date) stays a draft until she publishes it, and students never see it."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Payment
from apps.core.copilot import content
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from apps.notifications import tasks
from apps.notifications.models import LiveReminderLog

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@held.test", name="Owner", password="x", role="owner")  # noqa: S106


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@held.test", name="Student", password="x", role="student")  # noqa: S106


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _class(owner, *, days=3, minutes=0, status="draft", title="Pads", **extra):
    when = None if days is None else timezone.now() + timedelta(days=days, minutes=minutes)
    return LiveClass.objects.create(title=title, instructor=owner, scheduled_at=when, status=status, **extra)


def test_saving_a_held_draft_keeps_it_a_draft(owner):
    held = _class(owner)
    # The event form sends every field, the date it already had among them.
    body = {"title": "Pads, slow", "scheduled_at": held.scheduled_at.isoformat()}
    resp = _client(owner).put(f"/api/v1/live/{held.pk}/", body, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "draft"
    held.refresh_from_db()
    assert (held.title, held.status) == ("Pads, slow", "draft")

    # A new date on a held class is still a held class.
    later = (timezone.now() + timedelta(days=9)).isoformat()
    _client(owner).put(f"/api/v1/live/{held.pk}/", {"scheduled_at": later}, format="json")
    held.refresh_from_db()
    assert held.status == "draft"

    # Asking for it by name schedules it.
    resp = _client(owner).put(f"/api/v1/live/{held.pk}/", {"status": "scheduled"}, format="json")
    assert resp.json()["status"] == "scheduled"


def test_dating_an_undated_draft_still_publishes_it(owner):
    undated = _class(owner, days=None)
    when = (timezone.now() + timedelta(days=2)).isoformat()
    resp = _client(owner).put(f"/api/v1/live/{undated.pk}/", {"scheduled_at": when}, format="json")
    assert resp.json()["status"] == "scheduled"

    # Clearing the date makes it a draft again.
    resp = _client(owner).put(f"/api/v1/live/{undated.pk}/", {"scheduled_at": None}, format="json")
    assert resp.json()["status"] == "draft"


def test_held_drafts_are_hidden_from_calendar_details_and_reminders(owner, student):
    soon = {"days": 0, "minutes": 10}  # inside the reminder's 15-minute window
    held = _class(owner, title="Held", **soon)
    shown = _class(owner, title="Shown", status="scheduled", **soon)

    for viewer in (None, student):
        titles = [e["title"] for e in _client(viewer).get("/api/v1/calendar/").json()]
        assert titles == ["Shown"]
        assert _client(viewer).get(f"/api/v1/calendar/live_class/{held.pk}/").status_code == 404
        assert _client(viewer).get(f"/api/v1/calendar/live_class/{shown.pk}/").status_code == 200
    # She still sees her own draft.
    assert _client(owner).get(f"/api/v1/calendar/live_class/{held.pk}/").status_code == 200

    with patch.object(tasks, "send_to_subscriptions", return_value=1) as send:
        tasks._send_reminders_for_current_tenant()
    assert send.call_count == 1
    assert list(LiveReminderLog.objects.values_list("key", flat=True)) == [f"liveclass:{shown.pk}"]


def test_publish_series_from_the_form_publishes_every_held_session(owner):
    first, second, third = (_class(owner, days=d) for d in (2, 9, 16))
    past = _class(owner, days=-5)
    other = _class(owner, title="Other")

    resp = _client(owner).put(f"/api/v1/live/{second.pk}/", {"publish_series": True}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "scheduled"

    def status(row):
        row.refresh_from_db()
        return row.status

    assert [status(r) for r in (first, second, third)] == ["scheduled"] * 3
    assert (status(past), status(other)) == ("draft", "draft")


def test_the_assistant_editing_a_held_draft_keeps_it_a_draft(owner):
    held = _class(owner)
    later = (timezone.now() + timedelta(days=6)).isoformat()
    content.edit_event(held.pk, "live", {"title": "Pads, slow", "description": "Easy.", "scheduled_at": later})
    held.refresh_from_db()
    assert (held.title, held.status) == ("Pads, slow", "draft")


def test_the_assistant_dating_an_undated_draft_publishes_it(owner):
    undated = _class(owner, days=None)
    when = (timezone.now() + timedelta(days=4)).isoformat()
    result = content.edit_event(undated.pk, "live", {"scheduled_at": when})
    undated.refresh_from_db()
    assert undated.status == "scheduled"
    assert {"field": "status", "old": "draft", "new": "scheduled"} in result["changes"]


def test_a_held_class_is_not_on_the_store_and_cannot_be_bought(owner, student, settings):
    settings.BILLING_BYPASS_ENABLED = True
    paid = {"pricing_type": "paid", "price": Decimal("20.00")}
    held = _class(owner, title="Held", **paid)
    _class(owner, title="Shown", status="scheduled", **paid)
    onsite = OnsiteEvent.objects.create(
        title="Held retreat", instructor=owner, status="draft", scheduled_at=held.scheduled_at, **paid
    )

    store = [(i["type"], i["title"]) for i in _client(student).get("/api/v1/billing/store/").json()]
    assert store == [("live_class", "Shown")]

    for kind, row in (("live_class", held), ("onsite_event", onsite)):
        body = {"items": [{"content_type": kind, "object_id": row.pk}]}
        refused = _client(student).post("/api/v1/billing/payments/initialize/", body, format="json")
        assert refused.status_code == 400, refused.content
        assert "not on sale" in refused.json()["detail"]
    assert not Payment.objects.exists()

    # Her products list (the bundle picker) still has her held classes.
    products = {i["title"] for i in _client(owner).get("/api/v1/billing/products/").json()}
    assert {"Held", "Shown", "Held retreat"} <= products


KINDS = [
    (LiveClass, "/api/v1/live/", {}),
    (LiveStream, "/api/v1/live-streams/", {}),
    (ZoomClass, "/api/v1/zoom-classes/", {"zoom_link": "https://zoom.us/j/1"}),
    (OnsiteEvent, "/api/v1/onsite-events/", {}),
]


@pytest.mark.parametrize(("model", "path", "extra"), KINDS, ids=lambda v: getattr(v, "__name__", None))
def test_a_held_class_detail_is_404_for_students_and_visible_to_the_coach(owner, student, model, path, extra):
    when = timezone.now() + timedelta(days=3)
    held = model.objects.create(title="Held", instructor=owner, status="draft", scheduled_at=when, **extra)
    shown = model.objects.create(title="Shown", instructor=owner, status="scheduled", scheduled_at=when, **extra)
    for viewer in (None, student):
        assert _client(viewer).get(f"{path}{held.pk}/").status_code == 404
        assert _client(viewer).get(f"{path}{shown.pk}/").status_code == 200
    resp = _client(owner).get(f"{path}{held.pk}/")
    assert (resp.status_code, resp.json()["status"]) == (200, "draft")
