"""Integration tests for GET /api/v1/billing/platform/entitlements/.

The endpoint powers the coach-admin "Paid feature" badges: it returns one
boolean per paid feature telling the frontend whether the current tenant's plan
INCLUDES that feature. A badge shows only when the boolean is False (locked).
Each boolean must match the gate the feature's own page enforces.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db

# Every feature key the endpoint must report.
FEATURE_KEYS = {
    "live",
    "ai_blog",
    "student_bot",
    "logo_studio",
    "payouts",
    "platform_mailbox",
    "selling",
}


@pytest.fixture()
def full_paid_plan(restore_public):
    """A paid plan that includes every paid feature."""
    plan, _ = PlatformPlan.objects.update_or_create(
        name="entitlements-full-pro",
        defaults={
            "price_monthly": 49,
            "transaction_fee_pct": 6,
            "max_students": 500,
            "max_storage_gb": 500,
            "max_streaming_hours": 500,
            "max_campaign_emails": 5000,
            "max_ai_blog_posts": 30,
            "max_student_bot_questions": 1500,
            "is_live_enabled": True,
        },
    )
    return plan


@pytest.fixture()
def live_only_plan(restore_public):
    """A paid plan that includes Live but NOT the AI features (both quotas 0)."""
    plan, _ = PlatformPlan.objects.update_or_create(
        name="entitlements-live-only",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "max_ai_blog_posts": 0,
            "max_student_bot_questions": 0,
            "is_live_enabled": True,
        },
    )
    return plan


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _make_owner(email: str) -> User:
    return User.objects.create_user(
        email=email,
        name="Owner",
        password="secret123",  # noqa: S106
        role="owner",
    )


def _activate(tenant: Tenant, plan: PlatformPlan, coach: User) -> None:
    """Put the tenant on `plan` the way the grant/checkout flow does: an active
    PlatformSubscription AND the mirrored Tenant.plan FK."""
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    PlatformSubscription.objects.create(
        tenant=tenant,
        user=coach,
        plan=plan,
        status=PlatformSubscription.STATUS_ACTIVE,
        provider="manual",
        current_period_end=datetime.now(tz=UTC) + timedelta(days=30),
    )
    Tenant.objects.filter(pk=tenant.pk).update(plan=plan)


def _make_free(tenant: Tenant) -> None:
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    Tenant.objects.filter(pk=tenant.pk).update(plan=None)


def test_entitlements_free_tenant_locks_every_feature(restore_public):
    tenant = restore_public
    _make_free(tenant)
    coach = _make_owner("free-owner@entitlements.test")

    response = _client(coach).get("/api/v1/billing/platform/entitlements/")

    assert response.status_code == 200, response.content
    body = response.json()
    assert set(body) == FEATURE_KEYS
    assert all(value is False for value in body.values()), body


def test_entitlements_full_paid_tenant_unlocks_every_feature(restore_public, full_paid_plan):
    tenant = restore_public
    coach = _make_owner("full-owner@entitlements.test")
    _activate(tenant, full_paid_plan, coach)

    response = _client(coach).get("/api/v1/billing/platform/entitlements/")

    assert response.status_code == 200, response.content
    body = response.json()
    assert set(body) == FEATURE_KEYS
    assert all(value is True for value in body.values()), body


def test_entitlements_reflect_per_feature_plan_flags(restore_public, live_only_plan):
    """A plan can include some paid features and not others — the AI-quota
    features (ai_blog, student_bot) stay locked when the plan grants 0 of them,
    even though the plan is paid."""
    tenant = restore_public
    coach = _make_owner("liveonly-owner@entitlements.test")
    _activate(tenant, live_only_plan, coach)

    response = _client(coach).get("/api/v1/billing/platform/entitlements/")

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["live"] is True
    assert body["ai_blog"] is False
    assert body["student_bot"] is False
    # Anything gated purely on "has a paid plan" is unlocked.
    assert body["logo_studio"] is True
    assert body["payouts"] is True
    assert body["platform_mailbox"] is True
    # Selling (products/bundles/plans) shares the payouts gate.
    assert body["selling"] is True


def test_entitlements_requires_coach_role(restore_public):
    student = User.objects.create_user(
        email="student@entitlements.test",
        name="Student",
        password="secret123",  # noqa: S106
        role="student",
    )
    response = _client(student).get("/api/v1/billing/platform/entitlements/")
    assert response.status_code == 403, response.content
