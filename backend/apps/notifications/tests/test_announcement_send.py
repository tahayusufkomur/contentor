from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.notifications import services
from apps.notifications.models import Announcement, AnnouncementRecipient, PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106


def _student(email, with_sub=True):
    u = User.objects.create_user(email=email, name="S", password="x", role="student")  # noqa: S106
    if with_sub:
        PushSubscription.objects.create(user=u, endpoint=f"https://p/{email}", p256dh="p", auth="a")
    return u


def test_send_materializes_and_pushes(coach):
    s_push = _student("p@m.com", with_sub=True)
    s_nopush = _student("n@m.com", with_sub=False)
    a = Announcement.objects.create(title="Hi", body="<p>Hi</p>", created_by=coach, filters_json={})

    with patch.object(services, "send_to_subscription", return_value=True) as mock:
        services.send_announcement_to_recipients(a)

    a.refresh_from_db()
    assert a.status == "sent" and a.sent_at is not None
    assert a.recipient_count == 2
    assert a.push_sent_count == 1
    assert mock.call_count == 1
    assert AnnouncementRecipient.objects.get(announcement=a, user=s_push).push_status == "sent"
    assert AnnouncementRecipient.objects.get(announcement=a, user=s_nopush).push_status == "none"


def test_send_pushes_to_every_subscription_of_a_user(coach):
    """A user with multiple device subscriptions must be pushed on EVERY one.
    A short-circuiting any() would stop at the first success and skip later
    devices (e.g. a reinstalled PWA whose old subscription still 201s)."""
    student = _student("multi@m.com", with_sub=False)
    PushSubscription.objects.create(user=student, endpoint="https://p/old", p256dh="p", auth="a")
    PushSubscription.objects.create(user=student, endpoint="https://p/new", p256dh="p", auth="a")
    a = Announcement.objects.create(title="Multi", body="x", created_by=coach, filters_json={})

    with patch.object(services, "send_to_subscription", return_value=True) as mock:
        services.send_announcement_to_recipients(a)

    assert mock.call_count == 2  # both devices, not just the first
    a.refresh_from_db()
    assert a.push_sent_count == 1  # one recipient (user), counted once


def test_send_marks_failed(coach):
    _student("p@m.com", with_sub=True)
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach, filters_json={})
    with patch.object(services, "send_to_subscription", return_value=False):
        services.send_announcement_to_recipients(a)
    assert AnnouncementRecipient.objects.filter(announcement=a, push_status="failed").count() == 1
    a.refresh_from_db()
    assert a.push_sent_count == 0


def test_send_marks_expired_when_subscription_deleted_during_send(coach):
    """When send_to_subscription returns False AND deletes the sub (dead endpoint
    cleanup), the recipient's push_status must be 'expired'."""
    student = _student("x@m.com", with_sub=True)
    a = Announcement.objects.create(title="Expired", body="x", created_by=coach, filters_json={})

    def _send_and_delete(sub, payload):
        sub.delete()
        return False

    with patch.object(services, "send_to_subscription", side_effect=_send_and_delete):
        services.send_announcement_to_recipients(a)

    recipient = AnnouncementRecipient.objects.get(announcement=a, user=student)
    assert recipient.push_status == "expired"
    assert not PushSubscription.objects.filter(user=student).exists()
