from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import connection
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.notifications.models import Announcement
from apps.notifications.tasks import dispatch_due_announcements, dispatch_due_recurrences, fanout_announcement

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def unprovisioned_tenant(restore_public):
    """Row-only tenant with NO postgres schema — mirrors a wizard signup
    that was created (creator_signup_verify) but abandoned before
    wizard_finalize/provision_tenant ever ran. Fan-out tasks that iterate
    every tenant must skip these or they crash on the missing schema.

    Deliberately does NOT touch connection.set_schema_to_public() — that
    would corrupt an already-active tenant_ctx for tests that need both a
    real tenant and a zombie one. core_tenant is a shared-app table reachable
    via the public part of search_path from any tenant context, and
    auto_create_schema is already False by default on the model."""
    t, _ = Tenant.objects.get_or_create(
        schema_name="zombie_wizard",
        defaults={
            "name": "Zombie Wizard",
            "slug": "zombie-wizard",
            "subdomain": "zombie-wizard",
            "owner_email": "coach@x.com",
        },
    )
    yield t
    Tenant.objects.filter(schema_name="zombie_wizard").delete()


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


def test_dispatch_announcements_skips_unprovisioned_tenant(unprovisioned_tenant, coach):
    """A tenant whose schema was never created must be skipped outright, not
    silently error-logged every tick (previously: ProgrammingError caught by
    the per-tenant try/except and logged as an ERROR on every run)."""
    Announcement.objects.create(
        title="Due",
        body="x",
        created_by=coach,
        status="scheduled",
        scheduled_at=timezone.now() - timedelta(minutes=1),
    )
    with (
        patch("apps.notifications.tasks.fanout_announcement.delay") as mock,
        patch("apps.notifications.tasks.logger.exception") as log_mock,
    ):
        dispatch_due_announcements()
    assert mock.call_count == 1
    log_mock.assert_not_called()


def test_dispatch_recurrences_skips_unprovisioned_tenant(unprovisioned_tenant):
    """Same guard for the recurrence fan-out — must skip cleanly, not log an
    error for a tenant that was never actually provisioned."""
    with patch("apps.notifications.tasks.logger.exception") as log_mock:
        dispatch_due_recurrences()
    log_mock.assert_not_called()
