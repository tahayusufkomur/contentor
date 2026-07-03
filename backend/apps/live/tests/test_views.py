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
        live_cls = LiveClass.objects.create(
            title="Live Now",
            instructor=owner,
            status="live",
            pricing_type="free",
        )
        ended_cls = LiveClass.objects.create(
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
        ended_cls = LiveClass.objects.create(
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
    def test_anyone_can_get_detail(self, draft_live_class, student):
        """Any user can get live class detail."""
        client = make_client(student)
        response = client.get(f"/api/v1/live/{draft_live_class.pk}/")
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Draft Class"

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
    @patch("apps.live.stream_service.create_call")
    def test_draft_class_can_be_started(self, mock_create_call, draft_live_class, owner):
        """Draft class can be started, status becomes live."""
        mock_create_call.return_value = None
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["status"] == "live"

    @patch("apps.live.stream_service.create_call")
    def test_scheduled_class_can_be_started(self, mock_create_call, scheduled_live_class, owner):
        """Scheduled class can be started, status becomes live."""
        mock_create_call.return_value = None
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{scheduled_live_class.pk}/start/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "live"

    @patch("apps.live.stream_service.create_call")
    def test_already_live_class_returns_400(self, mock_create_call, draft_live_class, owner):
        """Already live class returns 400."""
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert response.status_code == 400, response.content

    @patch("apps.live.stream_service.create_call")
    def test_student_cannot_start_class(self, mock_create_call, draft_live_class, student):
        """Student gets 403 when trying to start a class."""
        client = make_client(student)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/start/")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveClassStop:
    @patch("apps.live.stream_service.stop_call")
    def test_live_class_can_be_stopped(self, mock_stop_call, draft_live_class, owner):
        """Live class can be stopped, status becomes ended."""
        mock_stop_call.return_value = None
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/stop/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "ended"

    @patch("apps.live.stream_service.stop_call")
    def test_non_live_class_returns_400(self, mock_stop_call, draft_live_class, owner):
        """Non-live class returns 400 on stop."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/stop/")
        assert response.status_code == 400, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveClassToken:
    @patch("apps.live.views.settings")
    @patch("apps.live.stream_service.generate_user_token")
    @patch("apps.live.stream_service.upsert_user")
    def test_student_gets_viewer_token_for_free_class(
        self, mock_upsert, mock_gen_token, mock_settings, draft_live_class, student, owner
    ):
        """Student gets token with role=viewer for a free live class."""
        mock_upsert.return_value = None
        mock_gen_token.return_value = "fake-token-123"
        mock_settings.GETSTREAM_API_KEY = "fake-api-key"
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(student)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["token"] == "fake-token-123"
        assert data["role"] == "viewer"

    @patch("apps.live.views.settings")
    @patch("apps.live.stream_service.generate_user_token")
    @patch("apps.live.stream_service.upsert_user")
    def test_owner_gets_host_token(self, mock_upsert, mock_gen_token, mock_settings, draft_live_class, owner):
        """Owner/instructor gets token with role=host."""
        mock_upsert.return_value = None
        mock_gen_token.return_value = "fake-token-host"
        mock_settings.GETSTREAM_API_KEY = "fake-api-key"
        draft_live_class.status = "live"
        draft_live_class.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["token"] == "fake-token-host"
        assert data["role"] == "host"

    def test_non_live_class_returns_400(self, draft_live_class, student):
        """Non-live class returns 400 on token request."""
        client = make_client(student)
        response = client.post(f"/api/v1/live/{draft_live_class.pk}/token/")
        assert response.status_code == 400, response.content


# ===========================================================================
# Live Stream Tests
# ===========================================================================


@pytest.mark.django_db(transaction=True)
class TestLiveStreamListCreate:
    def test_unauthenticated_sees_scheduled_and_live_only(self, draft_live_stream, scheduled_live_stream, owner):
        """Unauthenticated users see only scheduled and live streams."""
        live_stream = LiveStream.objects.create(
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
    def test_anyone_can_get_detail(self, draft_live_stream, student):
        """Any user can get live stream detail."""
        client = make_client(student)
        response = client.get(f"/api/v1/live-streams/{draft_live_stream.pk}/")
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Draft Stream"

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
    @patch("apps.live.stream_service.create_livestream")
    def test_draft_stream_can_be_started(self, mock_create, draft_live_stream, owner):
        """Draft stream can be started, status becomes live."""
        mock_create.return_value = None
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/start/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "live"

    @patch("apps.live.stream_service.create_livestream")
    def test_scheduled_stream_can_be_started(self, mock_create, scheduled_live_stream, owner):
        """Scheduled stream can be started, status becomes live."""
        mock_create.return_value = None
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{scheduled_live_stream.pk}/start/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "live"

    @patch("apps.live.stream_service.create_livestream")
    def test_already_live_stream_returns_400(self, mock_create, draft_live_stream, owner):
        """Already live stream returns 400."""
        draft_live_stream.status = "live"
        draft_live_stream.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/start/")
        assert response.status_code == 400, response.content

    @patch("apps.live.stream_service.create_livestream")
    def test_student_cannot_start_stream(self, mock_create, draft_live_stream, student):
        """Student gets 403 when trying to start a stream."""
        client = make_client(student)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/start/")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestLiveStreamStop:
    @patch("apps.live.stream_service.stop_livestream")
    def test_live_stream_can_be_stopped(self, mock_stop, draft_live_stream, owner):
        """Live stream can be stopped, status becomes ended."""
        mock_stop.return_value = None
        draft_live_stream.status = "live"
        draft_live_stream.save(update_fields=["status"])
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/stop/")
        assert response.status_code == 200, response.content
        assert response.json()["status"] == "ended"

    @patch("apps.live.stream_service.stop_livestream")
    def test_non_live_stream_returns_400(self, mock_stop, draft_live_stream, owner):
        """Non-live stream returns 400 on stop."""
        client = make_client(owner)
        response = client.post(f"/api/v1/live-streams/{draft_live_stream.pk}/stop/")
        assert response.status_code == 400, response.content
