import pytest
from django.db import transaction
from django.db.utils import IntegrityError

from apps.accounts.models import User
from apps.notifications.models import Announcement, AnnouncementRecipient, LiveReminderLog, PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@notiftest.com",
        name="Student",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="student",
    )


def test_push_subscription_endpoint_unique(student):
    PushSubscription.objects.create(user=student, endpoint="https://push/1", p256dh="p", auth="a")
    with pytest.raises(IntegrityError), transaction.atomic():
        PushSubscription.objects.create(user=student, endpoint="https://push/1", p256dh="q", auth="b")


def test_live_reminder_log_dedupes_by_key(tenant_ctx):
    _, created_first = LiveReminderLog.objects.get_or_create(key="liveclass:1")
    _, created_second = LiveReminderLog.objects.get_or_create(key="liveclass:1")
    assert created_first is True
    assert created_second is False


def test_announcement_defaults(tenant_ctx):
    coach = User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106
    a = Announcement.objects.create(title="Hi", body="<p>Hi</p>", created_by=coach)
    assert a.status == "scheduled"
    assert a.scheduled_at is None
    assert a.recipient_count == 0 and a.push_sent_count == 0


def test_recipient_unique_per_announcement(tenant_ctx):
    coach = User.objects.create_user(email="c2@m.com", name="C", password="x", role="owner")  # noqa: S106
    stu = User.objects.create_user(email="s2@m.com", name="S", password="x", role="student")  # noqa: S106
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach)
    AnnouncementRecipient.objects.create(announcement=a, user=stu)
    with pytest.raises(IntegrityError), transaction.atomic():
        AnnouncementRecipient.objects.create(announcement=a, user=stu)
