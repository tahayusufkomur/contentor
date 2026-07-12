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
from apps.live.models import LiveClass, OnsiteEvent, ZoomClass

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


@pytest.mark.django_db(transaction=True)
class TestTokenScoping:
    def test_live_class_token_is_scoped_to_the_call(self, tenant_ctx, owner, student):
        lc = LiveClass.objects.create(
            title="Free Live",
            instructor=owner,
            pricing_type="free",
            status="live",
            scheduled_at=timezone.now(),
        )
        with patch("apps.live.views.stream_service.generate_user_token", return_value="tok") as gen:
            resp = make_client(student).post(f"/api/v1/live/{lc.pk}/token/")
        assert resp.status_code == 200
        # Token must be restricted to this call's CID, not app-wide.
        _, kwargs = gen.call_args
        assert kwargs.get("call_cids") == [f"default:{lc.room_name}"]
