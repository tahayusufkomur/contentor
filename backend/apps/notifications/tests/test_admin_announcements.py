from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import Announcement

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106


def client(user=None):
    c = APIClient(HTTP_HOST=HOST)
    if user:
        c.force_authenticate(user=user)
    return c


def test_preview_counts(coach):
    User.objects.create_user(email="s@m.com", name="S", password="x", role="student")  # noqa: S106
    res = client(coach).post("/api/v1/admin/notifications/announcements/preview/", {"filters": {}}, format="json")
    assert res.status_code == 200
    assert res.data["audience"] == 1


def test_create_send_now_enqueues(coach):
    with patch("apps.notifications.admin_views.fanout_announcement.delay") as mock:
        res = client(coach).post(
            "/api/v1/admin/notifications/announcements/",
            {"title": "Hi", "body": "<p>x</p>", "filters": {}},
            format="json",
        )
    assert res.status_code == 201
    assert mock.call_count == 1


def test_create_scheduled_does_not_enqueue(coach):
    future = (timezone.now() + timedelta(hours=2)).isoformat()
    with patch("apps.notifications.admin_views.fanout_announcement.delay") as mock:
        res = client(coach).post(
            "/api/v1/admin/notifications/announcements/",
            {"title": "Later", "body": "x", "filters": {}, "scheduled_at": future},
            format="json",
        )
    assert res.status_code == 201
    assert mock.call_count == 0
    assert Announcement.objects.get().status == "scheduled"


def test_patch_blocked_once_sent(coach):
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach, status="sent")
    res = client(coach).patch(f"/api/v1/admin/notifications/announcements/{a.id}/", {"title": "New"}, format="json")
    assert res.status_code == 409


def test_patch_clear_schedule_sends_now(coach):
    """Clearing scheduled_at via PATCH must enqueue fanout, not set status=sent directly."""
    future = timezone.now() + timedelta(hours=2)
    a = Announcement.objects.create(
        title="Scheduled",
        body="x",
        created_by=coach,
        status="scheduled",
        scheduled_at=future,
    )
    with patch("apps.notifications.admin_views.fanout_announcement.delay") as mock:
        res = client(coach).patch(
            f"/api/v1/admin/notifications/announcements/{a.id}/",
            {"scheduled_at": None},
            format="json",
        )
    assert res.status_code == 200
    a.refresh_from_db()
    # status must remain "scheduled" — fanout flips it after delivery
    assert a.status == "scheduled"
    assert a.scheduled_at is None
    assert mock.call_count == 1


def test_non_coach_forbidden(tenant_ctx):
    stu = User.objects.create_user(email="s@m.com", name="S", password="x", role="student")  # noqa: S106
    res = client(stu).get("/api/v1/admin/notifications/announcements/")
    assert res.status_code == 403
