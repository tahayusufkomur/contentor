"""
TDD: ZoomClass calendar events must emit type "zoom_class" (not "live_class")
     so that the detail URL /api/v1/calendar/zoom_class/<pk>/ resolves correctly.

Tests:
  1. GET /api/v1/calendar/ returns ZoomClass with type == "zoom_class"
  2. GET /api/v1/calendar/zoom_class/<pk>/ returns the right record
     with cal_type converted to "live_class" (student-facing).
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.live.models import ZoomClass

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@zoomtest.com",
        name="Zoom Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


@pytest.fixture()
def zoom_class(tenant_ctx, owner):
    return ZoomClass.objects.create(
        title="My Zoom Session",
        instructor=owner,
        pricing_type="free",
        scheduled_at=timezone.now() + timedelta(days=1),
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
class TestZoomClassCalendarType:
    def test_calendar_feed_emits_zoom_class_type(self, tenant_ctx, zoom_class):
        """Calendar list must serialise ZoomClass rows with type == 'zoom_class'."""
        when = zoom_class.scheduled_at
        frm = (when - timedelta(days=1)).date().isoformat()
        to = (when + timedelta(days=1)).date().isoformat()

        resp = make_client().get(f"/api/v1/calendar/?from={frm}&to={to}")
        assert resp.status_code == 200, resp.content

        events = resp.json()
        zoom_events = [e for e in events if e["title"] == "My Zoom Session"]
        assert len(zoom_events) == 1, f"Expected 1 zoom event, got: {zoom_events}"
        assert zoom_events[0]["type"] == "zoom_class", f"Expected type 'zoom_class', got '{zoom_events[0]['type']}'"

    def test_calendar_detail_returns_zoom_class_with_live_class_cal_type(self, tenant_ctx, zoom_class):
        """
        GET /api/v1/calendar/zoom_class/<pk>/ must resolve to the ZoomClass
        record and return type == "live_class" (student-facing cal_type).
        """
        resp = make_client().get(f"/api/v1/calendar/zoom_class/{zoom_class.pk}/")
        assert resp.status_code == 200, resp.content

        data = resp.json()
        assert data["id"] == zoom_class.pk
        assert data["title"] == "My Zoom Session"
        # Detail view converts zoom_class → live_class for student-facing display
        assert data["type"] == "live_class", f"Expected cal_type 'live_class', got '{data['type']}'"
