"""Integration tests for GET /api/v1/billing/platform/plans/.

Covers the multi-currency `prices` map + limits added in Phase 1.5 for the
in-tenant upgrade card, and the invariant that `stripe_price_id` never leaks
into the public response.
"""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.core.models import PlatformPlan

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def plans_seeded(restore_public):
    """Seed two paid plans, only one of which has EUR priced (other is USD-only).

    Returns the list of plan PKs for assertions.
    """
    # Wipe any stale plans first so the test doesn't depend on global seed state.
    PlatformPlan.objects.all().delete()
    starter = PlatformPlan.objects.create(
        name="phase15-starter",
        price_monthly=19,
        transaction_fee_pct=8,
        max_students=100,
        max_storage_gb=50,
        max_streaming_hours=10,
        max_campaign_emails=1000,
        prices={
            "USD": {"amount_cents": 1900, "stripe_price_id": "price_test_starter_usd"},
            "EUR": {"amount_cents": 1900, "stripe_price_id": "price_test_starter_eur"},
        },
    )
    pro = PlatformPlan.objects.create(
        name="phase15-pro",
        price_monthly=49,
        transaction_fee_pct=5,
        max_students=1000,
        max_storage_gb=500,
        max_streaming_hours=100,
        max_campaign_emails=10000,
        prices={
            # EUR has no stripe_price_id yet — UI must mark it unavailable.
            "USD": {"amount_cents": 4900, "stripe_price_id": "price_test_pro_usd"},
            "EUR": {"amount_cents": 11900, "stripe_price_id": ""},
        },
    )
    return [starter.pk, pro.pk]


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def test_plans_endpoint_returns_prices_and_limits(restore_public, plans_seeded):
    """Plans response includes USD + EUR entries with amount_cents and `available`,
    plus the four limit fields the upgrade UI renders as feature bullets."""
    response = _client().get("/api/v1/billing/platform/plans/")
    assert response.status_code == 200, response.content
    body = response.json()
    plans = body["plans"]
    assert len(plans) >= 2

    starter = next(p for p in plans if p["name"] == "phase15-starter")
    pro = next(p for p in plans if p["name"] == "phase15-pro")

    # Per-currency prices map.
    assert starter["prices"]["USD"]["amount_cents"] == 1900
    assert starter["prices"]["USD"]["available"] is True
    assert starter["prices"]["EUR"]["amount_cents"] == 1900
    assert starter["prices"]["EUR"]["available"] is True

    # Pro has EUR priced but no stripe_price_id — must be available=False.
    assert pro["prices"]["USD"]["available"] is True
    assert pro["prices"]["EUR"]["available"] is False
    assert pro["prices"]["EUR"]["amount_cents"] == 11900

    # Limits.
    for plan in (starter, pro):
        assert "max_students" in plan
        assert "max_storage_gb" in plan
        assert "max_streaming_hours" in plan
        assert "max_campaign_emails" in plan
    assert starter["max_students"] == 100
    assert pro["max_students"] == 1000


def test_plans_endpoint_does_not_leak_stripe_ids(restore_public, plans_seeded):
    """The public endpoint must never expose the stripe_price_id value itself."""
    response = _client().get("/api/v1/billing/platform/plans/")
    assert response.status_code == 200, response.content
    # Walk the JSON body for any key named exactly `stripe_price_id`. We
    # serialize-then-parse so we exercise the exact bytes returned.
    raw = response.content.decode("utf-8")
    payload = json.loads(raw)

    def _walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                assert key != "stripe_price_id", f"stripe_price_id leaked at: {node}"
                _walk(value)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(payload)
    # Belt + braces: also assert the literal string isn't anywhere in the body.
    assert "price_test_starter_usd" not in raw
    assert "price_test_starter_eur" not in raw
    assert "price_test_pro_usd" not in raw


def test_plans_endpoint_currency_tenant_wins_else_visitor_country(restore_public, plans_seeded):
    from apps.core.models import Tenant

    url = "/api/v1/billing/platform/plans/"
    # A tenant with a currency always sees its own, whatever the visitor's country.
    Tenant.objects.filter(pk=restore_public.pk).update(billing_currency="EUR")
    assert _client().get(url, HTTP_CF_IPCOUNTRY="US").json()["currency"] == "EUR"
    # No currency yet (not decided / anonymous): guessed from the country header.
    Tenant.objects.filter(pk=restore_public.pk).update(billing_currency="")
    de = _client().get(url, HTTP_CF_IPCOUNTRY="DE").json()
    assert de["currency"] == "EUR"
    assert next(p for p in de["plans"] if p["name"] == "phase15-starter")["currency"] == "EUR"
    assert _client().get(url, HTTP_CF_IPCOUNTRY="US").json()["currency"] == "USD"
    assert _client().get(url).json()["currency"] == "USD"
