"""Superadmin platform plan editing — Phase A (admin-managed pricing).

PATCH /api/v1/platform/plans/<pk>/ — edit limits, fee, live toggle, and
per-currency amounts. Changing an amount provisions a fresh Stripe Price (mocked
here) and re-points the plan; other currencies and untouched fields are left alone.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, Tenant

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root@contentor.app",
        region="global",
        role="owner",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture()
def starter_plan(restore_public):
    PlatformPlan.objects.all().delete()
    return PlatformPlan.objects.create(
        name="starter",
        price_monthly=19,
        transaction_fee_pct=8,
        max_students=100,
        max_storage_gb=100,
        max_streaming_hours=100,
        max_campaign_emails=1000,
        is_live_enabled=True,
        prices={
            "USD": {"amount_cents": 1990, "stripe_price_id": "price_old_usd"},
            "TRY": {"amount_cents": 99900, "stripe_price_id": "price_old_try"},
        },
    )


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _url(pk):
    return f"/api/v1/platform/plans/{pk}/"


_LIST_URL = "/api/v1/platform/plans/"


def test_superuser_updates_limits_and_fee(superuser, starter_plan):
    resp = _client(superuser).patch(
        _url(starter_plan.pk),
        {"transaction_fee_pct": "5", "max_students": 250, "is_live_enabled": False},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    starter_plan.refresh_from_db()
    assert starter_plan.transaction_fee_pct == Decimal("5")
    assert starter_plan.max_students == 250
    assert starter_plan.is_live_enabled is False
    # Amounts left untouched when not in the payload.
    assert starter_plan.prices["USD"]["stripe_price_id"] == "price_old_usd"


@patch("apps.core.stripe_pricing.provision_stripe_price", return_value="price_new_usd")
def test_amount_change_provisions_new_price(mock_provision, superuser, starter_plan):
    resp = _client(superuser).patch(
        _url(starter_plan.pk),
        {"amounts": {"USD": 2490}},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    starter_plan.refresh_from_db()
    assert starter_plan.prices["USD"]["amount_cents"] == 2490
    assert starter_plan.prices["USD"]["stripe_price_id"] == "price_new_usd"
    # Legacy USD fallback kept in sync.
    assert starter_plan.price_monthly == Decimal("24.90")
    # The other currency is untouched (grandfathered, not re-provisioned).
    assert starter_plan.prices["TRY"]["stripe_price_id"] == "price_old_try"
    assert starter_plan.prices["TRY"]["amount_cents"] == 99900
    mock_provision.assert_called_once_with(plan_key="starter", currency="USD", amount_cents=2490)


@patch("apps.core.stripe_pricing.provision_stripe_price", return_value="")
def test_amount_change_without_stripe_keeps_old_price_id(mock_provision, superuser, starter_plan):
    resp = _client(superuser).patch(
        _url(starter_plan.pk),
        {"amounts": {"USD": 3000}},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    starter_plan.refresh_from_db()
    assert starter_plan.prices["USD"]["amount_cents"] == 3000
    # No new Price available → the prior id is preserved, not blanked.
    assert starter_plan.prices["USD"]["stripe_price_id"] == "price_old_usd"


def test_invalid_currency_rejected(superuser, starter_plan):
    resp = _client(superuser).patch(
        _url(starter_plan.pk),
        {"amounts": {"EUR": 1000}},
        format="json",
    )
    assert resp.status_code == 400


def test_non_superuser_forbidden(restore_public, starter_plan):
    coach = User.objects.create(email="coach@contentor.app", region="global", role="coach")
    resp = _client(coach).patch(
        _url(starter_plan.pk),
        {"max_students": 9},
        format="json",
    )
    assert resp.status_code == 403
    starter_plan.refresh_from_db()
    assert starter_plan.max_students == 100


def test_get_detail_returns_plan(superuser, starter_plan):
    resp = _client(superuser).get(_url(starter_plan.pk))
    assert resp.status_code == 200, resp.content
    assert resp.json()["name"] == "starter"


@patch("apps.core.stripe_pricing.provision_stripe_price", return_value="price_new_pro_usd")
def test_create_plan_provisions_prices(mock_provision, superuser, starter_plan):
    resp = _client(superuser).post(
        _LIST_URL,
        {
            "name": "pro",
            "transaction_fee_pct": "4",
            "max_students": 1000,
            "is_live_enabled": True,
            "amounts": {"USD": 4990},
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    plan = PlatformPlan.objects.get(name="pro")
    assert plan.is_active is True
    assert plan.transaction_fee_pct == Decimal("4")
    assert plan.prices["USD"]["amount_cents"] == 4990
    assert plan.prices["USD"]["stripe_price_id"] == "price_new_pro_usd"
    assert plan.price_monthly == Decimal("49.90")
    mock_provision.assert_called_once_with(plan_key="pro", currency="USD", amount_cents=4990)


def test_create_duplicate_name_rejected(superuser, starter_plan):
    resp = _client(superuser).post(_LIST_URL, {"name": "Starter"}, format="json")
    assert resp.status_code == 400


def test_archive_blocked_when_tenants_attached(superuser, starter_plan):
    Tenant.objects.create(
        schema_name="acme",
        name="Acme",
        slug="acme",
        subdomain="acme",
        owner_email="acme@contentor.app",
        plan=starter_plan,
    )
    resp = _client(superuser).delete(_url(starter_plan.pk))
    assert resp.status_code == 409, resp.content
    starter_plan.refresh_from_db()
    assert starter_plan.is_active is True


def test_archive_succeeds_when_no_tenants(superuser, starter_plan):
    resp = _client(superuser).delete(_url(starter_plan.pk))
    assert resp.status_code == 200, resp.content
    starter_plan.refresh_from_db()
    assert starter_plan.is_active is False
