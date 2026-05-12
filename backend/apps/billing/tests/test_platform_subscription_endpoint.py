"""Integration tests for GET /api/v1/billing/platform/subscription/."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@subendpoint.test",
        name="Owner",
        password="secret123",  # noqa: S106
        role="owner",
    )


@pytest.fixture()
def starter_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="phase1-subendpoint-starter",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "max_students": 100,
            "max_storage_gb": 100,
            "max_streaming_hours": 100,
            "max_campaign_emails": 1000,
        },
    )
    return plan


@pytest.fixture()
def free_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="Free",
        defaults={
            "price_monthly": 0,
            "transaction_fee_pct": 10,
            "max_students": 10,
            "max_storage_gb": 1,
            "max_streaming_hours": 2,
            "max_campaign_emails": 100,
        },
    )
    return plan


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@override_settings(BILLING_FREE_PLAN_NAME="Free")
def test_subscription_endpoint_returns_free_when_none(restore_public, owner, free_plan):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    response = _client(owner).get("/api/v1/billing/platform/subscription/")
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["status"] == "free"
    assert body["plan"]["name"] == "Free"
    assert body["is_active"] is False


def test_subscription_endpoint_returns_active_state(restore_public, starter_plan):
    """End-to-end check that the GET endpoint surfaces an active subscription.

    The PlatformSubscription lives in the public schema, so we create the
    coach in the public schema (not the tenant schema) — the FK targets the
    public-schema User row, not the duplicate one in the tenant schema.
    """
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="USD")
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    coach = User.objects.create_user(
        email="endpoint-active-owner@test.com",
        name="Endpoint Active Owner",
        password="secret123",  # noqa: S106
        role="owner",
    )
    period_end = datetime.now(tz=UTC) + timedelta(days=30)
    PlatformSubscription.objects.create(
        tenant=tenant,
        user=coach,
        plan=starter_plan,
        status=PlatformSubscription.STATUS_ACTIVE,
        provider="stripe",
        provider_subscription_id="sub_endpoint_test",
        provider_customer_id="cus_endpoint_test",
        current_period_end=period_end,
    )
    response = _client(coach).get("/api/v1/billing/platform/subscription/")
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["status"] == "active"
    assert body["plan"]["id"] == starter_plan.pk
    assert body["plan"]["name"] == starter_plan.name
    assert body["currency"] == "USD"
    assert body["provider"] == "stripe"
    assert body["is_active"] is True
    assert body["cancel_at_period_end"] is False
    # Tidy up the public-schema row so subsequent tests aren't perturbed.
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    coach.delete()


def test_subscription_endpoint_requires_owner_role(restore_public, tenant_ctx):
    student = User.objects.create_user(
        email="student@subendpoint.test",
        name="Student",
        password="secret123",  # noqa: S106
        role="student",
    )
    response = _client(student).get("/api/v1/billing/platform/subscription/")
    assert response.status_code == 403, response.content
