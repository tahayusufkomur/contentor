"""Superadmin platform-wide PWA usage rollup across tenant schemas."""

from __future__ import annotations

import pytest
from django.utils import timezone
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.usage.models import UsageEvent

SHARED_DOMAIN = "shared-test.localhost"
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root-usage@contentor.app",
        region="global",
        role="owner",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture()
def coach_user(restore_public):
    return User.objects.create(email="coach-usage@contentor.app", region="global", role="owner")


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_platform_usage_aggregates_and_breaks_down_by_tenant(superuser, restore_public):
    tenant = restore_public
    today = timezone.now().date()
    with tenant_context(tenant):
        s1 = User.objects.create_user(email="s1@u.com", name="S1", password="x", role="student")  # noqa: S106
        s2 = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")  # noqa: S106
        s1.first_pwa_at = timezone.now()
        s1.save(update_fields=["first_pwa_at"])
        UsageEvent.objects.create(user=s1, mode="pwa", platform="ios", day=today)
        UsageEvent.objects.create(user=s2, mode="pwa", platform="desktop", day=today)
        UsageEvent.objects.create(user=s2, mode="browser", platform="android", day=today)
    try:
        resp = _client(superuser).get("/api/v1/platform/usage/")
        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["installed_students"] == 1
        assert body["pwa_sessions"] == 2
        assert body["browser_sessions"] == 1
        assert body["pwa_pct"] == 67  # round(2 / 3 * 100)
        row = next(r for r in body["by_tenant"] if r["slug"] == tenant.slug)
        assert row["installed"] == 1
        assert row["pwa_sessions"] == 2
        assert row["browser_sessions"] == 1
        assert row["pwa_pct"] == 67
    finally:
        with tenant_context(tenant):
            UsageEvent.objects.all().delete()
            User.objects.filter(role="student").delete()


def test_platform_usage_requires_superuser(coach_user):
    resp = _client(coach_user).get("/api/v1/platform/usage/")
    assert resp.status_code == 403
