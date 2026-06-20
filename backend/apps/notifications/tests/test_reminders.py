from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.live.models import LiveClass
from apps.notifications import tasks
from apps.notifications.models import LiveReminderLog

pytestmark = pytest.mark.django_db(transaction=True)


def test_reminder_sent_once_for_upcoming_class(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@remtest.com",
        name="Coach",
        password="secret123",
        role="owner",
    )
    LiveClass.objects.create(
        title="Morning Flow",
        instructor=coach,
        scheduled_at=timezone.now() + timedelta(minutes=10),
        duration_minutes=60,
    )
    with patch.object(tasks, "broadcast_to_tenant", return_value=1) as send:
        tasks._send_reminders_for_current_tenant()
        tasks._send_reminders_for_current_tenant()  # second pass must dedupe
    assert send.call_count == 1
    assert LiveReminderLog.objects.count() == 1
