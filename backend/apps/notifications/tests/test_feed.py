import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import Announcement, AnnouncementRecipient

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def setup(tenant_ctx):
    coach = User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106
    s1 = User.objects.create_user(email="s1@m.com", name="S1", password="x", role="student")  # noqa: S106
    s2 = User.objects.create_user(email="s2@m.com", name="S2", password="x", role="student")  # noqa: S106
    a = Announcement.objects.create(title="Hi", body="<p>x</p>", created_by=coach, status="sent")
    AnnouncementRecipient.objects.create(announcement=a, user=s1)
    return a, s1, s2


def client(user):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c


def test_feed_scoped_to_user(setup):
    a, s1, s2 = setup
    res1 = client(s1).get("/api/v1/notifications/feed/")
    assert res1.data["unread_count"] == 1 and len(res1.data["items"]) == 1
    res2 = client(s2).get("/api/v1/notifications/feed/")
    assert res2.data["unread_count"] == 0 and res2.data["items"] == []


def test_mark_read_idempotent(setup):
    a, s1, _ = setup
    first = client(s1).post(f"/api/v1/notifications/feed/{a.id}/read/")
    assert first.data["unread_count"] == 0
    rec = AnnouncementRecipient.objects.get(announcement=a, user=s1)
    read_at = rec.read_at
    second = client(s1).post(f"/api/v1/notifications/feed/{a.id}/read/")
    assert second.data["unread_count"] == 0
    rec.refresh_from_db()
    assert rec.read_at == read_at  # unchanged
