from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.live.models import LiveClass
from apps.notifications import tasks
from apps.notifications.models import LiveReminderLog, PushSubscription
from apps.notifications.services import subscriptions_with_access

pytestmark = pytest.mark.django_db(transaction=True)


def _coach():
    return User.objects.create_user(email="coach@remtest.com", name="Coach", password="secret123", role="owner")


def _student(n: int) -> User:
    user = User.objects.create_user(email=f"s{n}@remtest.com", name=f"S{n}", password="secret123", role="student")
    PushSubscription.objects.create(user=user, endpoint=f"https://push/{n}", p256dh="p", auth="a")
    return user


def _upcoming(coach, **kwargs) -> LiveClass:
    return LiveClass.objects.create(
        title=kwargs.pop("title", "Morning Flow"),
        instructor=coach,
        scheduled_at=timezone.now() + timedelta(minutes=10),
        duration_minutes=60,
        **kwargs,
    )


def test_reminder_sent_once_for_upcoming_class(tenant_ctx):
    """Dedupe: the reminder for one event fires exactly once across passes."""
    _upcoming(_coach())  # default pricing_type="free"
    with patch.object(tasks, "send_to_subscriptions", return_value=1) as send:
        tasks._send_reminders_for_current_tenant()
        tasks._send_reminders_for_current_tenant()  # second pass must dedupe
    assert send.call_count == 1
    assert LiveReminderLog.objects.count() == 1


def test_free_event_targets_all_subscribers(tenant_ctx):
    """A free class is reachable by everyone — no per-user access check."""
    coach = _coach()
    _student(1)
    _student(2)
    event = _upcoming(coach, title="Free Flow", pricing_type="free")
    assert subscriptions_with_access(event).count() == 2


def test_paid_event_targets_only_users_with_access(tenant_ctx):
    """A paid class only reminds students who can attend (purchasers/subscribers)."""
    coach = _coach()
    s1 = _student(1)
    _student(2)
    event = _upcoming(coach, title="Paid Masterclass", pricing_type="paid", price=20)

    # subscriptions_with_access imports ContentAccessService lazily from
    # apps.core.access (deferred, to dodge a circular import), so patching it at
    # that definition site is what the function actually picks up. The service
    # itself is tested in apps/core; here we stub it to prove the targeting wires
    # it in. Only s1 is granted access; the coach has no PushSubscription, so the
    # eligible set is exactly {s1} (note: owner/coach would pass check_access, but
    # they don't opt into student push).
    with patch("apps.core.access.ContentAccessService") as svc:
        svc.return_value.check_access.side_effect = lambda user, content: user.pk == s1.pk
        eligible = list(subscriptions_with_access(event))

    assert {sub.user_id for sub in eligible} == {s1.pk}
