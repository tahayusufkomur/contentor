"""GET /api/v1/admin/events/ — the four kinds of class and event as one list."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from apps.tags.models import Tag

SHARED_DOMAIN = "shared-test.localhost"
URL = "/api/v1/admin/events/"

pytestmark = pytest.mark.django_db(transaction=True)


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@events.test", name="Owner", password="x", role="owner")  # noqa: S106


@pytest.fixture()
def events(owner):
    """One of each kind around now, plus an undated draft."""
    now = timezone.now()

    def make(model, title, hours, **extra):
        when = None if hours is None else now + timedelta(hours=hours)
        status = "scheduled" if when else "draft"
        return model.objects.create(title=title, instructor=owner, scheduled_at=when, status=status, **extra)

    return {
        "zoom_past": make(ZoomClass, "Zoom last week", -170, zoom_link="https://zoom.us/j/1"),
        "stream_soon": make(LiveStream, "Stream tomorrow", 24),
        "live_later": make(LiveClass, "Class next week", 170),
        "onsite_latest": make(OnsiteEvent, "Retreat next month", 700, location="Studio A"),
        "draft": make(LiveClass, "Untimed idea", None),
    }


def _titles(response):
    assert response.status_code == 200, response.content
    return [row["title"] for row in response.json()["results"]]


def test_all_four_kinds_come_back_soonest_first_with_drafts_last(owner, events):
    body = _client(owner).get(URL).json()
    assert body["count"] == 5
    assert [(row["title"], row["kind"]) for row in body["results"]] == [
        ("Zoom last week", "zoom"),
        ("Stream tomorrow", "stream"),
        ("Class next week", "live"),
        ("Retreat next month", "onsite"),
        ("Untimed idea", "live"),
    ]
    # Each row is its own kind's full shape, so the page needs no second call.
    by_title = {row["title"]: row for row in body["results"]}
    assert by_title["Retreat next month"]["location"] == "Studio A"
    assert by_title["Zoom last week"]["zoom_link"] == "https://zoom.us/j/1"
    assert by_title["Class next week"]["room_name"]


def test_latest_first_still_puts_drafts_last(owner, events):
    assert _titles(_client(owner).get(URL, {"ordering": "-scheduled_at"})) == [
        "Retreat next month",
        "Class next week",
        "Stream tomorrow",
        "Zoom last week",
        "Untimed idea",
    ]


def test_upcoming_and_past_split_on_the_clock(owner, events):
    client = _client(owner)
    assert _titles(client.get(URL, {"when": "past"})) == ["Zoom last week"]
    assert _titles(client.get(URL, {"when": "upcoming"})) == [
        "Stream tomorrow",
        "Class next week",
        "Retreat next month",
        "Untimed idea",
    ]


def test_a_class_she_started_is_upcoming_and_one_that_just_began_is_too(owner, events):
    now = timezone.now()
    LiveClass.objects.create(
        title="Running late", instructor=owner, status="live", scheduled_at=now - timedelta(hours=5)
    )
    ZoomClass.objects.create(title="Began 20 min ago", instructor=owner, scheduled_at=now - timedelta(minutes=20))
    client = _client(owner)
    # She ended this one early: it is over, though its hour is not.
    LiveClass.objects.create(
        title="Cut short", instructor=owner, status="ended", scheduled_at=now - timedelta(minutes=10)
    )
    upcoming = _titles(client.get(URL, {"when": "upcoming"}))
    assert "Running late" in upcoming
    assert "Began 20 min ago" in upcoming
    assert "Cut short" not in upcoming
    assert _titles(client.get(URL, {"when": "past"})) == ["Zoom last week", "Cut short"]


def test_computed_status_follows_the_clock_where_the_stored_one_cannot(owner, events):
    rows = {row["title"]: row for row in _client(owner).get(URL).json()["results"]}
    # Nothing ever ends a Zoom class in the database.
    assert rows["Zoom last week"]["status"] == "scheduled"
    assert rows["Zoom last week"]["computed_status"] == "ended"
    assert rows["Untimed idea"]["computed_status"] == "draft"


def test_search_and_tags_span_kinds(owner, events):
    tag = Tag.objects.create(name="Beginners", slug="beginners", scope="event")
    events["stream_soon"].tags.add(tag)
    events["onsite_latest"].tags.add(tag)
    client = _client(owner)
    assert _titles(client.get(URL, {"tags": str(tag.id)})) == ["Stream tomorrow", "Retreat next month"]
    assert _titles(client.get(URL, {"search": "next"})) == ["Class next week", "Retreat next month"]
    assert _titles(client.get(URL, {"ordering": "title", "search": "e"}))[0] == "Class next week"


def test_a_page_boundary_falls_between_kinds(owner, events):
    client = _client(owner)
    first = client.get(URL, {"limit": 2, "offset": 0}).json()
    second = client.get(URL, {"limit": 2, "offset": 2}).json()
    assert first["count"] == second["count"] == 5
    assert first["next"]
    assert [row["kind"] for row in first["results"]] == ["zoom", "stream"]
    assert [row["kind"] for row in second["results"]] == ["live", "onsite"]


def test_an_unknown_ordering_falls_back_to_the_date(owner, events):
    assert _titles(_client(owner).get(URL, {"ordering": "price; drop table"}))[0] == "Zoom last week"


def test_it_is_for_the_coach(owner, events):
    student = User.objects.create_user(email="s@events.test", name="S", password="x", role="student")  # noqa: S106
    assert _client(student).get(URL).status_code == 403
    assert _client().get(URL).status_code in (401, 403)


# The one form edits through each kind's own endpoint.
EDIT_URLS = {
    "live_later": "/api/v1/live/",
    "stream_soon": "/api/v1/live-streams/",
    "zoom_past": "/api/v1/zoom-classes/",
    "onsite_latest": "/api/v1/onsite-events/",
}


@pytest.mark.parametrize("name", list(EDIT_URLS))
def test_clearing_the_date_makes_a_draft_and_setting_one_schedules_it(owner, events, name):
    event = events[name]
    url = f"{EDIT_URLS[name]}{event.pk}/"
    client = _client(owner)

    assert client.put(url, {"scheduled_at": None}, format="json").status_code == 200
    event.refresh_from_db()
    assert (event.scheduled_at, event.status) == (None, "draft")

    when = (timezone.now() + timedelta(days=3)).isoformat()
    assert client.put(url, {"scheduled_at": when}, format="json").status_code == 200
    event.refresh_from_db()
    assert event.status == "scheduled"
    assert event.scheduled_at is not None


def test_editing_a_live_class_leaves_it_live(owner, events):
    live = events["live_later"]
    live.status = "live"
    live.save(update_fields=["status"])
    resp = _client(owner).put(f"/api/v1/live/{live.pk}/", {"scheduled_at": None, "title": "Renamed"}, format="json")
    assert resp.status_code == 200
    live.refresh_from_db()
    assert (live.status, live.title) == ("live", "Renamed")


def test_capacity_and_price_can_be_cleared(owner, events):
    onsite = events["onsite_latest"]
    url = f"/api/v1/onsite-events/{onsite.pk}/"
    client = _client(owner)
    assert (
        client.put(url, {"max_capacity": 12, "pricing_type": "paid", "price": "15.00"}, format="json").status_code
        == 200
    )
    assert (
        client.put(url, {"max_capacity": None, "pricing_type": "free", "price": "0"}, format="json").status_code == 200
    )
    onsite.refresh_from_db()
    assert onsite.max_capacity is None
    assert onsite.pricing_type == "free"
