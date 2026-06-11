"""Superadmin platform endpoints: dashboard metrics, tenant enrichment,
subscriptions list, and webhook event log."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant, WebhookEvent

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root2@contentor.app",
        region="global",
        role="owner",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture()
def coach_user(restore_public):
    return User.objects.create(email="coach@padmin.test", region="global", role="owner")


@pytest.fixture()
def paid_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="padmin-pro",
        defaults={
            "price_monthly": 49,
            "transaction_fee_pct": 6,
            "prices": {"USD": {"amount_cents": 4990, "stripe_price_id": "price_padmin"}},
        },
    )
    return plan


@pytest.fixture()
def subscribed_tenant(restore_public, coach_user, paid_plan):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(plan=paid_plan, stripe_charges_enabled=True, stripe_payouts_enabled=True)
    tenant.refresh_from_db()
    PlatformSubscription.objects.update_or_create(
        tenant=tenant,
        defaults={
            "user": coach_user,
            "plan": paid_plan,
            "status": PlatformSubscription.STATUS_ACTIVE,
            "provider": "stripe",
            "provider_subscription_id": "sub_padmin_1",
            "current_period_end": timezone.now() + timedelta(days=20),
        },
    )
    return tenant


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_dashboard_includes_revenue_metrics(superuser, subscribed_tenant):
    resp = _client(superuser).get("/api/v1/platform/dashboard/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["platform_subscriptions"]["active_subscriptions"] >= 1
    assert "USD" in body["platform_subscriptions"]["mrr_by_currency"]
    assert "fees_by_currency" in body["marketplace"]
    assert "gross_by_currency" in body["marketplace"]
    assert isinstance(body["plan_distribution"], list)
    assert isinstance(body["recent_tenants"], list)
    assert body["monetization_ready_tenants"] >= 1
    assert "webhook_failures" in body


def test_dashboard_requires_superuser(restore_public, coach_user):
    resp = _client(coach_user).get("/api/v1/platform/dashboard/")
    assert resp.status_code == 403


def test_tenant_list_includes_monetization_columns(superuser, subscribed_tenant):
    resp = _client(superuser).get("/api/v1/platform/tenants/")
    assert resp.status_code == 200, resp.content
    row = next(t for t in resp.json() if t["slug"] == subscribed_tenant.slug)
    assert row["subscription_status"] == "active"
    assert row["stripe_charges_enabled"] is True


def test_tenant_list_search(superuser, subscribed_tenant):
    resp = _client(superuser).get("/api/v1/platform/tenants/", {"q": "no-such-tenant-xyz"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_tenant_detail_includes_subscription_and_marketplace(superuser, subscribed_tenant):
    resp = _client(superuser).get(f"/api/v1/platform/tenants/{subscribed_tenant.slug}/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["platform_subscription"]["status"] == "active"
    assert body["platform_subscription"]["plan"] == "padmin-pro"
    assert "gross_by_currency" in body["marketplace"]
    assert body["stripe_charges_enabled"] is True


def test_platform_subscriptions_list(superuser, subscribed_tenant):
    resp = _client(superuser).get("/api/v1/platform/subscriptions/")
    assert resp.status_code == 200, resp.content
    row = next(r for r in resp.json() if r["tenant_slug"] == subscribed_tenant.slug)
    assert row["plan"] == "padmin-pro"
    assert row["amount"] == "49.90"
    assert row["currency"] == "USD"


def test_webhook_events_list_and_filters(superuser, restore_public):
    WebhookEvent.objects.all().delete()
    WebhookEvent.objects.create(
        provider="stripe",
        provider_event_id="evt_padmin_ok",
        event_type="invoice.paid",
        processed_at=timezone.now(),
        payload={"id": "evt_padmin_ok"},
    )
    WebhookEvent.objects.create(
        provider="stripe",
        provider_event_id="evt_padmin_bad",
        event_type="charge.refunded",
        processed_at=timezone.now(),
        processing_error="boom",
    )

    client = _client(superuser)
    all_events = client.get("/api/v1/platform/webhook-events/").json()
    assert {e["provider_event_id"] for e in all_events} == {"evt_padmin_ok", "evt_padmin_bad"}

    failed = client.get("/api/v1/platform/webhook-events/", {"status": "failed"}).json()
    assert [e["provider_event_id"] for e in failed] == ["evt_padmin_bad"]

    typed = client.get("/api/v1/platform/webhook-events/", {"event_type": "invoice"}).json()
    assert [e["provider_event_id"] for e in typed] == ["evt_padmin_ok"]

    detail_pk = next(e["id"] for e in all_events if e["provider_event_id"] == "evt_padmin_ok")
    detail = client.get(f"/api/v1/platform/webhook-events/{detail_pk}/").json()
    assert detail["payload"] == {"id": "evt_padmin_ok"}


def test_webhook_events_require_superuser(coach_user):
    resp = _client(coach_user).get("/api/v1/platform/webhook-events/")
    assert resp.status_code == 403
