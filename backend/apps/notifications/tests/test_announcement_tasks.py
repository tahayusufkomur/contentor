from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import connection
from django.utils import timezone

from apps.accounts.models import User
from apps.notifications.models import Announcement
from apps.notifications.tasks import dispatch_due_announcements, fanout_announcement

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106


def test_fanout_calls_send(coach):
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach, filters_json={})
    with patch("apps.notifications.tasks.send_announcement_to_recipients") as mock:
        fanout_announcement(a.id, connection.schema_name)
    assert mock.call_count == 1
    assert mock.call_args.args[0].id == a.id


def test_fanout_is_exactly_once(coach):
    """Calling fanout_announcement twice must deliver exactly once (atomic claim)."""
    a = Announcement.objects.create(title="Once", body="x", created_by=coach, filters_json={})
    with patch("apps.notifications.tasks.send_announcement_to_recipients") as mock:
        fanout_announcement(a.id, connection.schema_name)
        fanout_announcement(a.id, connection.schema_name)
    assert mock.call_count == 1
    a.refresh_from_db()
    assert a.status == "sent"


def test_dispatch_enqueues_due_only(coach):
    due = Announcement.objects.create(
        title="Due",
        body="x",
        created_by=coach,
        status="scheduled",
        scheduled_at=timezone.now() - timedelta(minutes=1),
    )
    Announcement.objects.create(
        title="Future",
        body="x",
        created_by=coach,
        status="scheduled",
        scheduled_at=timezone.now() + timedelta(hours=1),
    )
    with patch("apps.notifications.tasks.fanout_announcement.delay") as mock:
        dispatch_due_announcements()
    called_ids = [c.args[0] for c in mock.call_args_list]
    assert due.id in called_ids and len(called_ids) == 1
