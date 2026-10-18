"""An event carries its kept cover design: `cover_design` on the calendar (the feed and an event's page),
on each kind's own list and detail, and on the coach's one list of every class and event."""

from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from apps.media import designs
from apps.media.models import Photo

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
CALENDAR = "/api/v1/calendar/"
ADMIN_EVENTS = "/api/v1/admin/events/"
COVER_KEYS = {"id", "recipe", "photos", "logo_url", "look"}

# The design's kind of event, its model, the calendar's name for it and the path of its own list.
KINDS = [
    ("live", LiveClass, "live_class", "/api/v1/live/"),
    ("stream", LiveStream, "live_stream", "/api/v1/live-streams/"),
    ("zoom", ZoomClass, "zoom_class", "/api/v1/zoom-classes/"),
    ("onsite", OnsiteEvent, "onsite_event", "/api/v1/onsite-events/"),
]
EACH_KIND = pytest.mark.parametrize(("kind", "model", "event_type", "path"), KINDS)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="event-cover-owner@x.com", name="Owner", password="x", role="owner", is_staff=True
    )


def client(user=None):
    c = APIClient(HTTP_HOST=HOST)
    if user is not None:
        c.force_authenticate(user=user)
    return c


def photo(name):
    # "demo/" is a shared prefix every tenant may be handed a link to.
    return Photo.objects.create(s3_key=f"demo/{name}.jpg", title=name)


def session(owner, model, title, days=3):
    return model.objects.create(title=title, instructor=owner, scheduled_at=timezone.now() + timedelta(days=days))


def kept(kind, title, picture):
    draft = designs.open_draft(kind, title, recipe={"photo": {"id": str(picture.pk)}})
    designs.keep(draft)
    return draft


def design_reads(captured):
    """How often a request read the kept designs."""
    return sum('"media_design"' in query["sql"] for query in captured.captured_queries)


@EACH_KIND
def test_calendar_event_has_cover_design(owner, kind, model, event_type, path):
    session(owner, model, "Morning Flow")
    visitor = client()

    def payloads():
        [listed] = [event for event in visitor.get(CALENDAR).json() if event["type"] == event_type]
        return [listed, visitor.get(f"{CALENDAR}{event_type}/{listed['id']}/").json()]

    assert [payload["cover_design"] for payload in payloads()] == [None, None]  # the plain photo

    picture = photo("chosen")
    design = kept(kind, "Morning Flow", picture)

    for payload in payloads():
        cover = payload["cover_design"]
        assert set(cover) == COVER_KEYS
        assert cover["id"] == str(design.pk)
        assert cover["recipe"]["photo"]["id"] == str(picture.pk)
        assert list(cover["photos"]) == [str(picture.pk)]


@EACH_KIND
def test_event_payloads_carry_the_cover_design(owner, kind, model, event_type, path):
    event = session(owner, model, "Morning Flow")
    assert client(owner).get(f"{path}{event.pk}/").json()["cover_design"] is None

    design = kept(kind, "Morning Flow", photo("chosen"))

    coach = client(owner)
    [listed] = coach.get(path).json()
    [row] = coach.get(ADMIN_EVENTS).json()["results"]
    detail = coach.get(f"{path}{event.pk}/").json()
    assert [payload["cover_design"]["id"] for payload in (listed, row, detail)] == [str(design.pk)] * 3


def test_a_series_shares_its_cover_and_another_title_does_not(owner):
    first, second = session(owner, LiveClass, "Morning Flow", days=1), session(owner, LiveClass, "Morning Flow", days=2)
    other = session(owner, LiveClass, "Evening Flow", days=3)
    design = kept("live", "Morning Flow", photo("chosen"))

    covers = {e["id"]: e["cover_design"] for e in client().get(CALENDAR).json()}

    assert covers[first.pk]["id"] == covers[second.pk]["id"] == str(design.pk)
    assert covers[other.pk] is None


def test_cover_reads_do_not_grow_with_events(owner):
    def add(count, start):
        for number in range(start, start + count):
            for kind, model, _event_type, _path in KINDS:
                title = f"{kind} {number}"
                session(owner, model, title, days=number + 1)
                kept(kind, title, photo(f"{kind}{number}"))

    def reads(path):
        with CaptureQueriesContext(connection) as captured:
            assert client(owner).get(path).status_code == 200
        return design_reads(captured)

    def every_list():
        return [reads(path) for path in (CALENDAR, ADMIN_EVENTS, "/api/v1/live/", "/api/v1/onsite-events/")]

    add(2, 0)
    few = every_list()
    add(3, 2)

    assert all(few)  # the designs are read at all,
    assert every_list() == few  # and once per request, however many events it lists
