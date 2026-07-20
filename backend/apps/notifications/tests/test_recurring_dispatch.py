from datetime import date, time, timedelta

import pytest
from django.utils import timezone

from apps.notifications import tasks
from apps.notifications.models import Announcement, RecurringAnnouncement
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _cfg():
    # Reuse-and-reset in place — never delete the tenant's shared TenantConfig
    # row. See test_announcement_email.py's _cfg() for why: under
    # pytest-xdist, TenantConfig.objects.all().delete() here can delete the
    # row a concurrently-running worker's test (e.g. tenant_config's
    # test_setup_status.py) is mid-request on, raising DoesNotExist there.
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Z")
    cfg.brand_name = "Z"
    cfg.theme = "ocean"
    cfg.timezone = "UTC"
    cfg.save()


def test_due_recurrence_spawns_announcement(tenant_ctx, monkeypatch):
    _cfg()
    r = RecurringAnnouncement.objects.create(
        title="Daily",
        body="b",
        filters_json={},
        frequency="daily",
        send_time=time(9, 0),
        start_date=date(2026, 1, 1),
        next_run_at=timezone.now() - timedelta(minutes=1),
    )
    monkeypatch.setattr(tasks, "send_announcement_to_recipients", lambda a: None, raising=False)
    # patch the symbol imported inside the helper
    import apps.notifications.services as services

    monkeypatch.setattr(services, "send_announcement_to_recipients", lambda a: None)

    tasks._dispatch_recurrences_for_current_tenant()

    assert Announcement.objects.filter(recurrence=r).count() == 1
    r.refresh_from_db()
    assert r.next_run_at > timezone.now()  # advanced


def test_exactly_once_no_double_spawn(tenant_ctx, monkeypatch):
    _cfg()
    r = RecurringAnnouncement.objects.create(
        title="Daily",
        body="b",
        filters_json={},
        frequency="daily",
        send_time=time(9, 0),
        start_date=date(2026, 1, 1),
        next_run_at=timezone.now() - timedelta(minutes=1),
    )
    import apps.notifications.services as services

    monkeypatch.setattr(services, "send_announcement_to_recipients", lambda a: None)

    tasks._dispatch_recurrences_for_current_tenant()
    tasks._dispatch_recurrences_for_current_tenant()  # second pass: already advanced

    assert Announcement.objects.filter(recurrence=r).count() == 1
