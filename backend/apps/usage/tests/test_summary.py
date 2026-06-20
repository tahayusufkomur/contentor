from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)
SHARED_DOMAIN = "shared-test.localhost"
URL = "/api/v1/admin/usage/summary/"


def _client(user):
    c = APIClient(HTTP_HOST=SHARED_DOMAIN)
    c.force_authenticate(user=user)
    return c


def _coach():
    return User.objects.create_user(email="coach@u.com", name="Coach", password="x", role="owner")


def test_summary_aggregates_split_and_installs(tenant_ctx):
    coach = _coach()
    today = timezone.now().date()
    s1 = User.objects.create_user(email="s1@u.com", name="S1", password="x", role="student")
    s2 = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    s1.first_pwa_at = timezone.now()
    s1.save(update_fields=["first_pwa_at"])
    UsageEvent.objects.create(user=s1, mode="pwa", platform="ios", day=today)
    UsageEvent.objects.create(user=s2, mode="pwa", platform="desktop", day=today)
    UsageEvent.objects.create(user=s2, mode="browser", platform="android", day=today)

    res = _client(coach).get(URL)
    assert res.status_code == 200
    data = res.json()
    assert data["pwa_sessions"] == 2
    assert data["browser_sessions"] == 1
    assert data["pwa_pct"] == 67  # round(2 / 3 * 100)
    assert data["installed_students"] == 1
    assert {"day": today.isoformat(), "pwa": 2, "browser": 1} in data["daily"]


def test_summary_windowing_excludes_old(tenant_ctx):
    coach = _coach()
    s = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    old = timezone.now().date() - timedelta(days=40)
    UsageEvent.objects.create(user=s, mode="pwa", platform="ios", day=old)
    res = _client(coach).get(URL + "?days=30")
    assert res.status_code == 200
    data = res.json()
    assert data["pwa_sessions"] == 0
    assert data["daily"] == []


def test_summary_empty_is_zeroed(tenant_ctx):
    res = _client(_coach()).get(URL)
    assert res.status_code == 200
    assert res.json() == {
        "pwa_sessions": 0,
        "browser_sessions": 0,
        "pwa_pct": 0,
        "installed_students": 0,
        "daily": [],
    }


def test_summary_forbidden_for_student(tenant_ctx):
    student = User.objects.create_user(email="st@u.com", name="St", password="x", role="student")
    res = _client(student).get(URL)
    assert res.status_code == 403
