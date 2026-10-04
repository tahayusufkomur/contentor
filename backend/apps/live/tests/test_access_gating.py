"""Access gating for paid live content (audit P0-C).

- Zoom join link / meeting id and on-site exact address must not leak to
  anonymous users on PAID events (but stay public on FREE events).
- Stream tokens must be scoped to the specific call/channel.
"""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.live import livecraft
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@gating.test",
        name="Owner",
        password="secret123",
        role="owner",  # noqa: S106  # pragma: allowlist secret
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@gating.test",
        name="Student",
        password="secret123",
        role="student",  # noqa: S106  # pragma: allowlist secret
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
class TestZoomLinkGating:
    def _paid_zoom(self, owner):
        return ZoomClass.objects.create(
            title="Paid Zoom",
            instructor=owner,
            pricing_type="paid",
            price=100,
            zoom_link="https://zoom.us/j/secret",
            zoom_meeting_id="999",
            scheduled_at=timezone.now() + timedelta(days=1),
        )

    def test_anonymous_cannot_see_paid_zoom_link(self, tenant_ctx, owner):
        zoom = self._paid_zoom(owner)
        data = make_client().get(f"/api/v1/zoom-classes/{zoom.pk}/").json()
        assert data["zoom_link"] == ""
        assert data["zoom_meeting_id"] == ""

    def test_student_without_purchase_cannot_see_paid_zoom_link(self, tenant_ctx, owner, student):
        zoom = self._paid_zoom(owner)
        data = make_client(student).get(f"/api/v1/zoom-classes/{zoom.pk}/").json()
        assert data["zoom_link"] == ""

    def test_owner_sees_paid_zoom_link(self, tenant_ctx, owner):
        zoom = self._paid_zoom(owner)
        data = make_client(owner).get(f"/api/v1/zoom-classes/{zoom.pk}/").json()
        assert data["zoom_link"] == "https://zoom.us/j/secret"
        assert data["zoom_meeting_id"] == "999"

    def test_free_zoom_link_stays_public(self, tenant_ctx, owner):
        zoom = ZoomClass.objects.create(
            title="Free Zoom",
            instructor=owner,
            pricing_type="free",
            zoom_link="https://zoom.us/j/open",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        data = make_client().get(f"/api/v1/zoom-classes/{zoom.pk}/").json()
        assert data["zoom_link"] == "https://zoom.us/j/open"


@pytest.mark.django_db(transaction=True)
class TestOnsiteAddressGating:
    def test_anonymous_cannot_see_paid_event_address(self, tenant_ctx, owner):
        ev = OnsiteEvent.objects.create(
            title="Paid Retreat",
            instructor=owner,
            pricing_type="paid",
            price=500,
            location="Berlin",
            address="Exactstrasse 1, 10115 Berlin",
            scheduled_at=timezone.now() + timedelta(days=2),
        )
        data = make_client().get(f"/api/v1/onsite-events/{ev.pk}/").json()
        assert data["address"] == ""
        assert data["location"] == "Berlin"  # general location stays public

    def test_owner_sees_paid_event_address(self, tenant_ctx, owner):
        ev = OnsiteEvent.objects.create(
            title="Paid Retreat",
            instructor=owner,
            pricing_type="paid",
            price=500,
            location="Berlin",
            address="Exactstrasse 1, 10115 Berlin",
            scheduled_at=timezone.now() + timedelta(days=2),
        )
        data = make_client(owner).get(f"/api/v1/onsite-events/{ev.pk}/").json()
        assert data["address"] == "Exactstrasse 1, 10115 Berlin"


def _live(model, owner):
    return model.objects.create(
        title="Free", instructor=owner, pricing_type="free", status="live", scheduled_at=timezone.now()
    )


@pytest.mark.django_db(transaction=True)
class TestJoinRoles:
    """Contentor decides who joins as what; the fake LiveCraft echoes it into the link."""

    def test_class_student_joins_as_participant(self, tenant_ctx, owner, student):
        lc = _live(LiveClass, owner)
        url = make_client(student).post(f"/api/v1/live/{lc.pk}/token/").json()["join_url"]
        assert url.endswith(f"/{lc.room_name}/u{student.id}/participant")

    def test_stream_student_joins_as_viewer(self, tenant_ctx, owner, student):
        ls = _live(LiveStream, owner)
        url = make_client(student).post(f"/api/v1/live-streams/{ls.pk}/token/").json()["join_url"]
        assert url.endswith(f"/{ls.room_name}/u{student.id}/viewer")

    def test_instructor_joins_as_host(self, tenant_ctx, owner):
        lc = _live(LiveClass, owner)
        resp = make_client(owner).post(f"/api/v1/live/{lc.pk}/token/").json()
        assert resp["join_url"].endswith(f"/u{owner.id}/host")
        assert resp["role"] == "host"

    def test_blocked_student_gets_403(self, tenant_ctx, owner, student):
        lc = _live(LiveClass, owner)
        with patch("apps.live.livecraft.join_url", side_effect=livecraft.LiveCraftError("blocked", 403)):
            resp = make_client(student).post(f"/api/v1/live/{lc.pk}/token/")
        assert resp.status_code == 403
