"""
Live Class and Live Stream API tests.

Tests for:
  - GET/POST /api/v1/live/
  - GET/PUT/DELETE /api/v1/live/<pk>/
  - POST /api/v1/live/<pk>/start/
  - POST /api/v1/live/<pk>/stop/
  - POST /api/v1/live/<pk>/token/
  - GET/POST /api/v1/live-streams/
  - GET/PUT/DELETE /api/v1/live-streams/<pk>/
  - POST /api/v1/live-streams/<pk>/start/
  - POST /api/v1/live-streams/<pk>/stop/

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan
from apps.billing.ways import set_ways
from apps.core.storage import build_s3_path
from apps.live.livecraft import LiveCraftError
from apps.live.models import LiveClass, LiveStream

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@livetest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@livetest.com", name="Student", password="secret123", role="student")


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="coach@livetest.com", name="Coach", password="secret123", role="coach")


# ---------------------------------------------------------------------------
# Content fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def draft_live_class(tenant_ctx, owner):
    return LiveClass.objects.create(
        title="Draft Class",
        description="A draft live class",
        instructor=owner,
        status="draft",
        pricing_type="free",
        price=Decimal("0.00"),
    )


@pytest.fixture()
def scheduled_live_class(tenant_ctx, owner):
    return LiveClass.objects.create(
        title="Scheduled Class",
        description="A scheduled live class",
        instructor=owner,
        status="scheduled",
        pricing_type="free",
        price=Decimal("0.00"),
    )


@pytest.fixture()
def draft_live_stream(tenant_ctx, owner):
    return LiveStream.objects.create(
        title="Draft Stream",
        description="A draft live stream",
        instructor=owner,
        status="draft",
        pricing_type="free",
        price=Decimal("0.00"),
    )


@pytest.fixture()
def scheduled_live_stream(tenant_ctx, owner):
    return LiveStream.objects.create(
        title="Scheduled Stream",
        description="A scheduled live stream",
        instructor=owner,
        status="scheduled",
        pricing_type="free",
        price=Decimal("0.00"),
    )


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ===========================================================================
# Live Class Tests
# ===========================================================================


@pytest.mark.django_db(transaction=True)
class TestLiveClassListCreate:
    def test_unauthenticated_sees_scheduled_live_and_ended(self, draft_live_class, scheduled_live_class, owner):
        """Unauthenticated users see scheduled, live, and ended classes but not drafts."""
        # Also create a live and ended class
        LiveClass.objects.create(
            title="Live Now",
            instructor=owner,
            status="live",
            pricing_type="free",
        )
        LiveClass.objects.create(
            title="Ended Class",
            instructor=owner,
            status="ended",
            pricing_type="free",
        )
        client = make_client()
        response = client.get("/api/v1/live/")
        assert response.status_code == 200, response.content
        data = response.json()
        titles = [item["title"] for item in data]
        assert "Scheduled Class" in titles
        assert "Live Now" in titles
        assert "Ended Class" in titles
        assert "Draft Class" not in titles

    def test_student_sees_scheduled_live_ended(self, draft_live_class, scheduled_live_class, owner, student):
        """Students see scheduled, live, and ended classes (for recordings)."""
        LiveClass.objects.create(
            title="Ended Class",
            instructor=owner,
            status="ended",
            pricing_type="free",
        )
        client = make_client(student)
        response = client.get("/api/v1/live/")
        assert response.status_code == 200, response.content
        data = response.json()
        titles = [item["title"] for item in data]
        assert "Scheduled Class" in titles
        assert "Ended Class" in titles
        assert "Draft Class" not in titles

    def test_owner_sees_all_including_draft(self, draft_live_class, scheduled_live_class, owner):
        """Owner sees all classes including draft."""
        client = make_client(owner)
        response = client.get("/api/v1/live/")
        assert response.status_code == 200, response.content
        data = response.json()
        titles = [item["title"] for item in data]
        assert "Draft Class" in titles
        assert "Scheduled Class" in titles

    def test_owner_can_request_paginated_live_classes(self, draft_live_class, scheduled_live_class, owner):
        """limit/offset switches list endpoint to paginated response."""
        client = make_client(owner)
        response = client.get("/api/v1/live/?limit=1&offset=0&ordering=title&search=Class")
        assert response.status_code == 200, response.content
        data = response.json()
        assert isinstance(data, dict)
        assert {"count", "next", "results"}.issubset(data.keys())
        assert data["count"] >= 2
        assert len(data["results"]) == 1

    def test_owner_creates_live_class(self, owner, tenant_ctx):
        """Owner can create a live class."""
        client = make_client(owner)
        payload = {
            "title": "New Live Class",
            "description": "Created by owner",
            "pricing_type": "free",
        }
        response = client.post("/api/v1/live/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["title"] == "New Live Class"

    def test_student_cannot_create_live_class(self, student, tenant_ctx):
        """Student gets 403 when trying to create a live class."""
        client = make_client(student)
        payload = {"title": "Student Class", "pricing_type": "free"}
        response = client.post("/api/v1/live/", data=payload, format="json")
        assert response.status_code == 403, response.content

    def test_create_with_scheduled_at_is_scheduled(self, owner, tenant_ctx):
        """A class created with a scheduled time becomes 'scheduled' (visible to
        students), not stuck as a hidden 'draft'."""
        client = make_client(owner)
        payload = {
            "title": "Scheduled via API",
            "pricing_type": "free",
            "scheduled_at": "2099-01-01T10:00:00Z",
        }
        response = client.post("/api/v1/live/", data=payload, format="json")
        assert response.status_code == 201, response.content
        assert response.json()["status"] == "scheduled"

    def test_create_without_scheduled_at_stays_draft(self, owner, tenant_ctx):
        """A class created without a scheduled time stays a draft."""
        client = make_client(owner)
        payload = {"title": "No schedule", "pricing_type": "free"}
        response = client.post("/api/v1/live/", data=payload, format="json")
        assert response.status_code == 201, response.content
        assert response.json()["status"] == "draft"


@pytest.mark.django_db(transaction=True)
class TestLiveClassDetail:
    def test_anyone_can_get_detail(self, scheduled_live_class, student):
        """Any user can get a published live class (a draft is a 404: test_held_drafts)."""
        client = make_client(student)
        response = client.get(f"/api/v1/live/{scheduled_live_class.pk}/")
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Scheduled Class"

    def test_owner_updates_live_class(self, draft_live_class, owner):
        """Owner can update a live class."""
        client = make_client(owner)
        response = client.put(
            f"/api/v1/live/{draft_live_class.pk}/",
            data={"title": "Updated Title"},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Updated Title"

    def test_whiteboard_key_must_be_this_tenants(self, draft_live_class, owner):
        client = make_client(owner)
        url = f"/api/v1/live/{draft_live_class.pk}/"
        other = {"whiteboard_key": "tenants/other/whiteboard/x.excalidraw"}
        assert client.put(url, other, format="json").status_code == 400
        mine = build_s3_path("whiteboard", "x.excalidraw")
        assert client.put(url, {"whiteboard_key": mine}, format="json").status_code == 200
        assert client.get(url).json()["whiteboard_key"] == mine

    @patch("apps.live.livecraft.requests.request")
    def test_watermark_change_on_a_live_class_never_calls_livecraft(self, req, draft_live_class, owner, settings):
        # Only the room's creation carries it: in a running room the hosts switch it themselves.
        settings.LIVECRAFT_FAKE = False
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        response = make_client(owner).put(f"/api/v1/live/{draft_live_class.pk}/", {"watermark": True}, format="json")
        assert response.json()["watermark"] is True
        req.assert_not_called()

    def test_student_cannot_update_live_class(self, draft_live_class, student):
        """Student gets 403 when trying to update."""
        client = make_client(student)
        response = client.put(
            f"/api/v1/live/{draft_live_class.pk}/",
            data={"title": "Hacked"},
            format="json",
        )
        assert response.status_code == 403, response.content

    def test_owner_deletes_live_class(self, draft_live_class, owner):
        """Owner can delete a live class."""
        client = make_client(owner)
        response = client.delete(f"/api/v1/live/{draft_live_class.pk}/")
        assert response.status_code == 204, response.content

    def test_coach_cannot_delete_live_class(self, draft_live_class, coach):
        """Coach gets 403 when trying to delete (only owner can delete)."""
        client = make_client(coach)
        response = client.delete(f"/api/v1/live/{draft_live_class.pk}/")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveClassStart:
    @patch("apps.live.livecraft.create_room")
    def test_draft_class_can_be_started(self, mock_create_call, draft_live_class, owner):
        """Draft class can be started, status becomes live."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["status"] == "live"

    @patch("apps.live.livecraft.create_room")
    def test_scheduled_class_can_be_started(self, mock_create_call, scheduled_live_class, owner):
        """Scheduled class can be started, status becomes live."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{scheduled_live_class.pk}/start/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "live"

    @patch("apps.live.views.generate_presigned_download_url", return_value="https://s3/lesson.excalidraw?sig")
    @patch("apps.live.livecraft.create_room")
    def test_start_hands_livecraft_the_prepared_board(self, create_room, sign, draft_live_class, owner):
        draft_live_class.whiteboard_key = build_s3_path("whiteboard", "lesson.excalidraw")
        draft_live_class.save(update_fields=["whiteboard_key"])
        assert make_client(owner).post(f"/api/v1/live/{draft_live_class.pk}/start/").status_code == 200
        assert sign.call_args.args == (draft_live_class.whiteboard_key,)
        assert create_room.call_args.kwargs["whiteboard_url"] == "https://s3/lesson.excalidraw?sig"

    @patch("apps.live.livecraft.create_room")
    def test_start_without_a_board_sends_none(self, create_room, draft_live_class, owner):
        make_client(owner).post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert create_room.call_args.kwargs["whiteboard_url"] is None

    @patch("apps.live.livecraft.create_room")
    def test_start_asks_livecraft_for_the_watermark_the_class_has(
        self, create_room, draft_live_class, scheduled_live_class, owner
    ):
        client = make_client(owner)
        draft_live_class.watermark = True
        draft_live_class.save(update_fields=["watermark"])
        assert client.post(f"/api/v1/live/{draft_live_class.pk}/start/").status_code == 200
        assert create_room.call_args.kwargs["watermark"] is True
        assert client.post(f"/api/v1/live/{scheduled_live_class.pk}/start/").status_code == 200
        assert create_room.call_args.kwargs["watermark"] is False

    @patch("apps.live.livecraft.create_room")
    def test_already_live_class_returns_400(self, mock_create_call, draft_live_class, owner):
        """Already live class returns 400."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert response.status_code == 400, response.content

    @patch("apps.live.livecraft.create_room")
    def test_student_cannot_start_class(self, mock_create_call, draft_live_class, student):
        """Student gets 403 when trying to start a class."""
        client = make_client(student)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveClassStop:
    @patch("apps.live.livecraft.end_room")
    def test_live_class_can_be_stopped(self, mock_stop_call, draft_live_class, owner):
        """Live class can be stopped, status becomes ended."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/stop/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "ended"

    @patch("apps.live.livecraft.end_room")
    def test_non_live_class_returns_400(self, mock_stop_call, draft_live_class, owner):
        """Non-live class returns 400 on stop."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/stop/")
        assert response.status_code == 400, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveClassToken:
    def test_student_gets_viewer_token_for_free_class(self, draft_live_class, student, owner):
        """Student gets token with role=viewer for a free live class."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(student)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert draft_live_class.room_name in data["join_url"]
        assert data["role"] == "viewer"

    def test_owner_gets_host_token(self, draft_live_class, owner):
        """Owner/instructor gets token with role=host."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 200, response.content
        assert response.json()["role"] == "host"

    def test_non_live_class_returns_400(self, draft_live_class, student):
        """Non-live class returns 400 on token request."""
        client = make_client(student)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 400, response.content

    @patch("apps.live.livecraft.create_room")
    @patch("apps.live.livecraft.join_url")
    def test_host_recreates_an_expired_room(self, join_url, create_room, draft_live_class, owner):
        """LiveCraft drops a room left empty; the host's join opens it again."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        join_url.side_effect = [LiveCraftError("room not found", 404), "https://lc/join"]
        response = make_client(owner).post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 200, response.content
        assert response.json()["join_url"] == "https://lc/join"
        assert create_room.call_args.kwargs["layout"] == "meeting"

    @patch("apps.live.livecraft.create_room")
    @patch("apps.live.livecraft.join_url", side_effect=LiveCraftError("room not found", 404))
    def test_student_waits_for_an_expired_room(self, join_url, create_room, draft_live_class, student, owner):
        """A student can't reopen the room: they get a clear 409, not a 502."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        response = make_client(student).post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 409, response.content
        assert "not started" in response.json()["detail"]
        create_room.assert_not_called()


# ===========================================================================
# Live Stream Tests
# ===========================================================================


@pytest.mark.django_db(transaction=True)
class TestLiveStreamListCreate:
    def test_unauthenticated_sees_scheduled_and_live_only(self, draft_live_stream, scheduled_live_stream, owner):
        """Unauthenticated users see only scheduled and live streams."""
        LiveStream.objects.create(
            title="Live Now Stream",
            instructor=owner,
            status="live",
            pricing_type="free",
        )
        client = make_client()
        response = client.get("/api/v1/live-streams/")
        assert response.status_code == 200, response.content
        data = response.json()
        titles = [item["title"] for item in data]
        assert "Scheduled Stream" in titles
        assert "Live Now Stream" in titles
        assert "Draft Stream" not in titles

    def test_owner_sees_all_including_draft(self, draft_live_stream, scheduled_live_stream, owner):
        """Owner sees all streams including draft."""
        client = make_client(owner)
        response = client.get("/api/v1/live-streams/")
        assert response.status_code == 200, response.content
        data = response.json()
        titles = [item["title"] for item in data]
        assert "Draft Stream" in titles
        assert "Scheduled Stream" in titles

    def test_owner_can_request_paginated_live_streams(self, draft_live_stream, scheduled_live_stream, owner):
        """limit/offset switches stream list endpoint to paginated response."""
        client = make_client(owner)
        response = client.get("/api/v1/live-streams/?limit=1&offset=0&ordering=title&search=Stream")
        assert response.status_code == 200, response.content
        data = response.json()
        assert isinstance(data, dict)
        assert {"count", "next", "results"}.issubset(data.keys())
        assert data["count"] >= 2
        assert len(data["results"]) == 1

    def test_owner_creates_live_stream(self, owner, tenant_ctx):
        """Owner can create a live stream."""
        client = make_client(owner)
        payload = {
            "title": "New Live Stream",
            "description": "Created by owner",
            "pricing_type": "free",
        }
        response = client.post("/api/v1/live-streams/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["title"] == "New Live Stream"

    def test_student_cannot_create_live_stream(self, student, tenant_ctx):
        """Student gets 403 when trying to create a live stream."""
        client = make_client(student)
        payload = {"title": "Student Stream", "pricing_type": "free"}
        response = client.post("/api/v1/live-streams/", data=payload, format="json")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveStreamDetail:
    def test_anyone_can_get_detail(self, scheduled_live_stream, student):
        """Any user can get a published live stream (a draft is a 404: test_held_drafts)."""
        client = make_client(student)
        response = client.get(f"/api/v1/live-streams/{scheduled_live_stream.pk}/")
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Scheduled Stream"

    def test_owner_updates_live_stream(self, draft_live_stream, owner):
        """Owner can update a live stream."""
        client = make_client(owner)
        response = client.put(
            f"/api/v1/live-streams/{draft_live_stream.pk}/",
            data={"title": "Updated Stream"},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Updated Stream"

    def test_student_cannot_update_live_stream(self, draft_live_stream, student):
        """Student gets 403 when trying to update."""
        client = make_client(student)
        response = client.put(
            f"/api/v1/live-streams/{draft_live_stream.pk}/",
            data={"title": "Hacked"},
            format="json",
        )
        assert response.status_code == 403, response.content

    def test_owner_deletes_live_stream(self, draft_live_stream, owner):
        """Owner can delete a live stream."""
        client = make_client(owner)
        response = client.delete(f"/api/v1/live-streams/{draft_live_stream.pk}/")
        assert response.status_code == 204, response.content

    def test_coach_cannot_delete_live_stream(self, draft_live_stream, coach):
        """Coach gets 403 when trying to delete (only owner can delete)."""
        client = make_client(coach)
        response = client.delete(f"/api/v1/live-streams/{draft_live_stream.pk}/")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveStreamStart:
    @patch("apps.live.livecraft.create_room")
    def test_draft_stream_can_be_started(self, mock_create, draft_live_stream, owner):
        """Draft stream can be started, status becomes live."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/start/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "live"

    @patch("apps.live.livecraft.create_room")
    def test_scheduled_stream_can_be_started(self, mock_create, scheduled_live_stream, owner):
        """Scheduled stream can be started, status becomes live."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{scheduled_live_stream.pk}/start/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "live"

    @patch("apps.live.livecraft.create_room")
    def test_already_live_stream_returns_400(self, mock_create, draft_live_stream, owner):
        """Already live stream returns 400."""
        draft_live_stream.status = "live"
        draft_live_stream.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/start/")
        assert response.status_code == 400, response.content

    @patch("apps.live.livecraft.create_room")
    def test_student_cannot_start_stream(self, mock_create, draft_live_stream, student):
        """Student gets 403 when trying to start a stream."""
        client = make_client(student)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/start/")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveStreamStop:
    @patch("apps.live.livecraft.end_room")
    def test_live_stream_can_be_stopped(self, mock_stop, draft_live_stream, owner):
        """Live stream can be stopped, status becomes ended."""
        draft_live_stream.status = "live"
        draft_live_stream.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/stop/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "ended"

    @patch("apps.live.livecraft.end_room")
    def test_non_live_stream_returns_400(self, mock_stop, draft_live_stream, owner):
        """Non-live stream returns 400 on stop."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/stop/")
        assert response.status_code == 400, response.content


@pytest.mark.django_db(transaction=True)
def test_paid_event_price_uses_the_tenants_currency(tenant_ctx, owner):
    """Students must see the currency the coach charges in, never a hardcoded one."""
    from django.db import connection

    from apps.core.models import Tenant

    Tenant.objects.filter(pk=connection.tenant.pk).update(billing_currency="EUR")
    connection.tenant.billing_currency = "EUR"
    paid = LiveClass.objects.create(
        title="Paid Class",
        description="",
        instructor=owner,
        status="scheduled",
        pricing_type="paid",
        price=Decimal("25.00"),
    )
    try:
        resp = APIClient(HTTP_HOST=SHARED_DOMAIN).get(f"/api/v1/calendar/live_class/{paid.pk}/")
        assert resp.status_code == 200, resp.content
        assert resp.json()["access_info"]["currency"] == "EUR"
    finally:
        Tenant.objects.filter(pk=connection.tenant.pk).update(billing_currency="USD")
        connection.tenant.billing_currency = "USD"


@pytest.mark.django_db(transaction=True)
def test_event_detail_offers_each_way_with_its_window(tenant_ctx, owner, student):
    """The event page gets every way's window, and the viewer's own dates."""
    plan = SubscriptionPlan.objects.create(name="Gold", price=Decimal("29.00"), currency="EUR")
    event = LiveClass.objects.create(
        title="Windowed Class", description="", instructor=owner, status="scheduled", pricing_type="free"
    )
    set_ways(
        event,
        {
            "free": {"window": {"closes_on": "2099-12-31"}},
            "buy": {"price": "25", "window": {"closes_after_days": 365}},
            "plans": [{"plan_id": plan.pk, "window": {"opens_after_days": 30}}],
        },
    )
    url = f"/api/v1/calendar/live_class/{event.pk}/"
    body = make_client(student).get(url).json()
    options = body["unlock_options"]
    assert options["free"] == {"window": {"closes_on": "2099-12-31"}}
    assert options["purchase"]["window"] == {"closes_after_days": 365}
    assert options["plans"][0]["window"] == {"opens_after_days": 30}
    assert body["access_info"]["has_access"] is True  # free until the close
    assert body["access_info"]["access_ends_at"] is not None
    assert body["access_info"]["opens_at"] is None

    buy = {"price": "25", "window": None}
    set_ways(event, {"free": {"window": {"opens_on": "2099-01-01"}}, "buy": buy, "plans": []})
    info = make_client(student).get(url).json()["access_info"]
    assert info["has_access"] is False
    assert info["opens_at"] is not None
    assert info["access_ends_at"] is None
