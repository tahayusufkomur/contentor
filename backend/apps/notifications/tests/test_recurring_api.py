import pytest

from apps.notifications.serializers import RecurringAnnouncementSerializer
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _cfg(tz="UTC"):
    # Reuse-and-reset in place — never delete the tenant's shared TenantConfig
    # row. See test_announcement_email.py's _cfg() for why: under
    # pytest-xdist, TenantConfig.objects.all().delete() here can delete the
    # row a concurrently-running worker's test (e.g. tenant_config's
    # test_setup_status.py) is mid-request on, raising DoesNotExist there.
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Z")
    cfg.brand_name = "Z"
    cfg.theme = "ocean"
    cfg.timezone = tz
    cfg.save()
    return cfg


def test_weekly_requires_weekday(tenant_ctx):
    _cfg()
    s = RecurringAnnouncementSerializer(
        data={
            "title": "T",
            "body": "b",
            "filters": {},
            "frequency": "weekly",
            "send_time": "09:00",
            "start_date": "2026-06-01",
        }
    )
    assert not s.is_valid()
    assert "weekday" in str(s.errors)


def test_monthly_requires_day_of_month(tenant_ctx):
    _cfg()
    s = RecurringAnnouncementSerializer(
        data={
            "title": "T",
            "body": "b",
            "filters": {},
            "frequency": "monthly",
            "send_time": "09:00",
            "start_date": "2026-06-01",
        }
    )
    assert not s.is_valid()
    assert "day_of_month" in str(s.errors)


def test_create_sets_next_run(tenant_ctx):
    _cfg()
    s = RecurringAnnouncementSerializer(
        data={
            "title": "T",
            "body": "b",
            "filters": {},
            "frequency": "daily",
            "send_time": "09:00",
            "start_date": "2026-06-01",
        }
    )
    assert s.is_valid(), s.errors
    obj = s.save(created_by=None)
    assert obj.next_run_at is not None
