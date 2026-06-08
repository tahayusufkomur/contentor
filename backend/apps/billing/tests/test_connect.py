"""Phase B — Stripe Connect onboarding + status endpoints.

The connect provider (Stripe Account / AccountLink) is mocked so tests need no
live Stripe. Covers the D4 monetization gate (Free tenants blocked), owner-only
access, account reuse, and the status readout.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, Tenant

SHARED_DOMAIN = "shared-test.localhost"
ONBOARD_URL = "/api/v1/billing/connect/onboard/"
STATUS_URL = "/api/v1/billing/connect/status/"
DASHBOARD_URL = "/api/v1/billing/connect/dashboard/"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def paid_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="phaseB-pro",
        defaults={
            "price_monthly": 49,
            "transaction_fee_pct": 4,
            "max_students": 1000,
            "max_storage_gb": 500,
            "max_streaming_hours": 500,
            "max_campaign_emails": 5000,
            "is_live_enabled": True,
            "prices": {"USD": {"amount_cents": 4990, "stripe_price_id": "price_b_usd"}},
        },
    )
    return plan


@pytest.fixture()
def free_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="phaseB-free",
        defaults={
            "price_monthly": 0,
            "transaction_fee_pct": 0,
            "max_students": 10,
            "max_storage_gb": 1,
            "max_streaming_hours": 0,
            "max_campaign_emails": 0,
        },
    )
    return plan


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@phaseb.test",
        name="Owner",
        password="secret123",
        role="owner",  # noqa: S106
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@phaseb.test",
        name="Student",
        password="secret123",
        role="student",  # noqa: S106
    )


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _set_plan(tenant, plan, **extra):
    Tenant.objects.filter(pk=tenant.pk).update(
        plan=plan,
        stripe_account_id=extra.get("stripe_account_id", ""),
        stripe_charges_enabled=extra.get("stripe_charges_enabled", False),
        stripe_payouts_enabled=extra.get("stripe_payouts_enabled", False),
    )


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_onboard_issues_link_for_paid_active(restore_public, owner, paid_plan):
    tenant = restore_public
    _set_plan(tenant, paid_plan)

    with (
        patch("apps.billing.providers.connect.create_express_account", return_value="acct_b_123") as mk_acct,
        patch(
            "apps.billing.providers.connect.create_account_link",
            return_value="https://connect.stripe.com/setup/s/x",
        ) as mk_link,
    ):
        resp = _client(owner).post(ONBOARD_URL, format="json")

    assert resp.status_code == 200, resp.content
    assert resp.json()["onboarding_url"].startswith("https://connect.stripe.com/")
    mk_acct.assert_called_once()
    mk_link.assert_called_once()
    tenant.refresh_from_db()
    assert tenant.stripe_account_id == "acct_b_123"


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_onboard_reuses_existing_account(restore_public, owner, paid_plan):
    tenant = restore_public
    _set_plan(tenant, paid_plan, stripe_account_id="acct_existing")

    with (
        patch("apps.billing.providers.connect.create_express_account") as mk_acct,
        patch(
            "apps.billing.providers.connect.create_account_link",
            return_value="https://connect.stripe.com/setup/s/y",
        ) as mk_link,
    ):
        resp = _client(owner).post(ONBOARD_URL, format="json")

    assert resp.status_code == 200, resp.content
    mk_acct.assert_not_called()
    assert mk_link.call_args.kwargs["account_id"] == "acct_existing"


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_onboard_blocked_for_free_tenant(restore_public, owner, free_plan):
    tenant = restore_public
    _set_plan(tenant, free_plan)

    with patch("apps.billing.providers.connect.create_express_account") as mk_acct:
        resp = _client(owner).post(ONBOARD_URL, format="json")

    assert resp.status_code == 402, resp.content
    assert resp.json()["error"] == "UPGRADE_REQUIRED"
    mk_acct.assert_not_called()


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_onboard_requires_owner(restore_public, student, paid_plan):
    tenant = restore_public
    _set_plan(tenant, paid_plan)
    resp = _client(student).post(ONBOARD_URL, format="json")
    assert resp.status_code == 403, resp.content


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_status_reports_readiness(restore_public, owner, paid_plan):
    tenant = restore_public
    _set_plan(tenant, paid_plan, stripe_account_id="acct_s", stripe_charges_enabled=True, stripe_payouts_enabled=True)

    resp = _client(owner).get(STATUS_URL)
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["connected"] is True
    assert body["charges_enabled"] is True
    assert body["payouts_enabled"] is True
    assert body["can_monetize"] is True


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_dashboard_link_requires_connected_account(restore_public, owner, paid_plan):
    tenant = restore_public
    _set_plan(tenant, paid_plan, stripe_account_id="")
    resp = _client(owner).get(DASHBOARD_URL)
    assert resp.status_code == 400, resp.content
    assert resp.json()["error"] == "NOT_CONNECTED"


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_dashboard_link_returns_url(restore_public, owner, paid_plan):
    tenant = restore_public
    _set_plan(tenant, paid_plan, stripe_account_id="acct_d", stripe_charges_enabled=True)
    with patch(
        "apps.billing.providers.connect.create_dashboard_link",
        return_value="https://connect.stripe.com/express/x",
    ):
        resp = _client(owner).get(DASHBOARD_URL)
    assert resp.status_code == 200, resp.content
    assert resp.json()["dashboard_url"].startswith("https://connect.stripe.com/")


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_status_free_tenant_cannot_monetize(restore_public, owner, free_plan):
    tenant = restore_public
    _set_plan(tenant, free_plan)
    resp = _client(owner).get(STATUS_URL)
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["connected"] is False
    assert body["can_monetize"] is False
    assert body["is_paid_active"] is False
