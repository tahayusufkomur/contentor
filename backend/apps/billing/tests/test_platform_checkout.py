"""Integration tests for POST /api/v1/billing/platform/checkout/.

These tests mock `stripe.checkout.Session.create` so they do not require real
Stripe credentials and run in CI without network access. They cover the
checkout view's tenant-currency lock-in, locale resolution, and error paths.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, Tenant

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def starter_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="phase1-starter",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "max_students": 100,
            "max_storage_gb": 100,
            "max_streaming_hours": 100,
            "max_campaign_emails": 1000,
            "is_live_enabled": True,
            "prices": {
                "USD": {"amount_cents": 1900, "stripe_price_id": "price_test_starter_usd"},
                "TRY": {"amount_cents": 65000, "stripe_price_id": "price_test_starter_try"},
            },
        },
    )
    return plan


@pytest.fixture()
def starter_plan_no_usd(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="phase1-starter-no-usd",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "max_students": 100,
            "max_storage_gb": 100,
            "max_streaming_hours": 100,
            "max_campaign_emails": 1000,
            "is_live_enabled": True,
            "prices": {
                "USD": {"amount_cents": 1900, "stripe_price_id": ""},
                "TRY": {"amount_cents": 65000, "stripe_price_id": "price_test_starter_try"},
            },
        },
    )
    return plan


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@phase1.test",
        name="Phase 1 Owner",
        password="secret123",  # noqa: S106
        role="owner",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@phase1.test",
        name="Student",
        password="secret123",  # noqa: S106
        role="student",
    )


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _fake_stripe_session():
    return SimpleNamespace(
        id="cs_test_phase1_abc",
        url="https://checkout.stripe.com/c/pay/cs_test_phase1_abc",
        expires_at=int(datetime(2030, 1, 1, tzinfo=UTC).timestamp()),
    )


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_phase1_dummy")  # noqa: S106
def test_checkout_creates_session_for_global_tenant_with_usd(restore_public, owner, starter_plan):
    """Global tenant with empty billing_currency persists USD and gets a USD price line item."""
    tenant = restore_public
    # Reset state to exercise the lock-on-first-checkout path.
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="", region="global")
    client = _client(owner)

    with patch("stripe.checkout.Session.create", return_value=_fake_stripe_session()) as create_mock:
        response = client.post(
            "/api/v1/billing/platform/checkout/",
            data={"plan_id": starter_plan.pk},
            format="json",
        )

    assert response.status_code == 200, response.content
    data = response.json()
    assert data["checkout_url"].startswith("https://checkout.stripe.com/")
    assert data["provider"] == "stripe"

    tenant.refresh_from_db()
    assert tenant.billing_currency == "USD"

    kwargs = create_mock.call_args.kwargs
    assert kwargs["mode"] == "subscription"
    assert kwargs["line_items"] == [{"price": "price_test_starter_usd", "quantity": 1}]
    assert kwargs["customer_email"] == owner.email
    assert kwargs["locale"] == "en"
    assert kwargs["metadata"]["tenant_id"] == str(tenant.pk)
    assert kwargs["metadata"]["plan_id"] == str(starter_plan.pk)
    assert kwargs["metadata"]["region"] == "global"
    assert "session_id={CHECKOUT_SESSION_ID}" in kwargs["success_url"]


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_phase1_dummy")  # noqa: S106
def test_checkout_creates_session_for_tr_tenant_with_try(restore_public, owner, starter_plan):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="", region="tr")
    owner.preferred_locale = "tr"
    owner.save(update_fields=["preferred_locale"])
    client = _client(owner)

    with patch("stripe.checkout.Session.create", return_value=_fake_stripe_session()) as create_mock:
        response = client.post(
            "/api/v1/billing/platform/checkout/",
            data={"plan_id": starter_plan.pk},
            format="json",
        )

    assert response.status_code == 200, response.content
    tenant.refresh_from_db()
    assert tenant.billing_currency == "TRY"

    kwargs = create_mock.call_args.kwargs
    assert kwargs["line_items"] == [{"price": "price_test_starter_try", "quantity": 1}]
    assert kwargs["locale"] == "tr"
    assert kwargs["metadata"]["region"] == "tr"


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_phase1_dummy")  # noqa: S106
def test_checkout_with_locked_currency_uses_locked_value(restore_public, owner, starter_plan):
    """Pre-locked billing_currency must not change on checkout."""
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="USD", region="tr")
    client = _client(owner)

    with patch("stripe.checkout.Session.create", return_value=_fake_stripe_session()) as create_mock:
        response = client.post(
            "/api/v1/billing/platform/checkout/",
            data={"plan_id": starter_plan.pk},
            format="json",
        )

    assert response.status_code == 200, response.content
    tenant.refresh_from_db()
    assert tenant.billing_currency == "USD"  # unchanged

    kwargs = create_mock.call_args.kwargs
    assert kwargs["line_items"] == [{"price": "price_test_starter_usd", "quantity": 1}]


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_phase1_dummy")  # noqa: S106
def test_checkout_returns_400_when_price_missing(restore_public, owner, starter_plan_no_usd):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="USD", region="global")
    client = _client(owner)

    response = client.post(
        "/api/v1/billing/platform/checkout/",
        data={"plan_id": starter_plan_no_usd.pk},
        format="json",
    )
    assert response.status_code == 400, response.content
    body = response.json()
    assert body["error"] == "PRICE_NOT_AVAILABLE"
    assert body["currency"] == "USD"


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_phase1_dummy")  # noqa: S106
def test_checkout_requires_owner_role(restore_public, student, starter_plan):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="USD", region="global")
    client = _client(student)

    response = client.post(
        "/api/v1/billing/platform/checkout/",
        data={"plan_id": starter_plan.pk},
        format="json",
    )
    assert response.status_code == 403, response.content


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_phase1_dummy")  # noqa: S106
def test_checkout_returns_404_for_missing_plan(restore_public, owner):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency="USD", region="global")
    client = _client(owner)
    response = client.post(
        "/api/v1/billing/platform/checkout/",
        data={"plan_id": 999_999},
        format="json",
    )
    assert response.status_code == 404, response.content
