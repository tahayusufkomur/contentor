import pytest

from apps.accounts.models import User
from apps.notifications.models import LiveReminderLog, PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@notiftest.com",
        name="Student",
        password="secret123",
        role="student",
    )


def test_push_subscription_endpoint_unique(student):
    PushSubscription.objects.create(
        user=student, endpoint="https://push/1", p256dh="p", auth="a"
    )
    with pytest.raises(Exception):
        PushSubscription.objects.create(
            user=student, endpoint="https://push/1", p256dh="q", auth="b"
        )


def test_live_reminder_log_dedupes_by_key(tenant_ctx):
    _, created_first = LiveReminderLog.objects.get_or_create(key="liveclass:1")
    _, created_second = LiveReminderLog.objects.get_or_create(key="liveclass:1")
    assert created_first is True
    assert created_second is False
