"""Every gate asks the paywall: an item's free window closing reaches visitors, lists and reminders."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.ways import set_ways
from apps.courses.models import Course
from apps.live.models import LiveClass, ZoomClass
from apps.notifications.models import PushSubscription
from apps.notifications.services import subscriptions_with_access
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)
SHARED_DOMAIN = "shared-test.localhost"


def at(moment):
    return mock.patch("django.utils.timezone.now", return_value=moment)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@gates.test", name="Owner", password="secret123", role="owner")


@pytest.fixture(autouse=True)
def utc_zone(tenant_ctx):
    """Calendar dates are read in the creator's zone: pin it so the day edges are plain."""
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Gates")
    was = config.timezone
    config.timezone = "UTC"
    config.save(update_fields=["timezone"])
    yield
    config.timezone = was
    config.save(update_fields=["timezone"])


def visitor():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def test_a_closed_free_window_hides_an_events_zoom_link_from_visitors(owner):
    zoom = ZoomClass.objects.create(
        title="Open Zoom",
        instructor=owner,
        zoom_link="https://zoom.us/j/secret",
        zoom_meeting_id="999",
        scheduled_at=NOW + timedelta(days=30),
        status="scheduled",
    )
    set_ways(zoom, {"free": {"window": {"closes_on": "2026-10-26"}}, "buy": None, "plans": []})
    with at(NOW):
        assert visitor().get(f"/api/v1/zoom-classes/{zoom.pk}/").json()["zoom_link"] == "https://zoom.us/j/secret"
    with at(datetime(2026, 10, 27, 0, 0, 0, tzinfo=UTC)):
        data = visitor().get(f"/api/v1/zoom-classes/{zoom.pk}/").json()
    assert data["zoom_link"] == ""
    assert data["zoom_meeting_id"] == ""


def test_a_closed_free_window_shows_the_paywall_on_the_course_list(owner):
    course = Course.objects.create(
        title="Spring", slug="spring", instructor=owner, pricing_type="paid", price=Decimal("49.00"), is_published=True
    )
    set_ways(
        course, {"free": {"window": {"closes_on": "2026-10-26"}}, "buy": {"price": "49", "window": None}, "plans": []}
    )

    def listed():
        (row,) = visitor().get("/api/v1/courses/").json()
        return row["access_info"]

    with at(NOW):
        info = listed()
    assert (info["has_access"], info["access_reason"]) == (True, "free")
    with at(datetime(2026, 10, 27, 0, 0, 0, tzinfo=UTC)):
        info = listed()
    assert info["has_access"] is False
    assert info["unlock_methods"] == ["purchase"]
    assert float(info["price"]) == 49.0


def test_live_reminders_skip_students_whose_window_closed(owner):
    event = LiveClass.objects.create(
        title="Newcomer Flow", instructor=owner, scheduled_at=NOW + timedelta(minutes=10), status="scheduled"
    )
    set_ways(event, {"free": {"window": {"closes_after_days": 7}}, "buy": None, "plans": []})
    newcomer = User.objects.create_user(email="new@gates.test", name="New", password="secret123", role="student")
    veteran = User.objects.create_user(email="old@gates.test", name="Old", password="secret123", role="student")
    User.objects.filter(pk=newcomer.pk).update(date_joined=NOW - timedelta(days=2))
    User.objects.filter(pk=veteran.pk).update(date_joined=NOW - timedelta(days=60))
    for n, user in enumerate((newcomer, veteran)):
        PushSubscription.objects.create(user=user, endpoint=f"https://push/{n}", p256dh="p", auth="a")
    with at(NOW):
        reached = {sub.user_id for sub in subscriptions_with_access(event)}
    assert reached == {newcomer.pk}
