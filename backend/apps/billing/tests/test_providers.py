"""PaymentProvider abstraction tests.

Covers:
- `get_provider(tenant)` returns BypassProvider under the env flag, otherwise
  StripeProvider.
- `StripeProvider.create_checkout_session(...)` raises `ProviderError` when
  the configured Stripe price ID is missing for the tenant's currency
  (Phase 1 contract — replaces the Phase 0 NotImplementedError stub).
- `StripeProvider.create_customer_portal_session` and `cancel_subscription`
  still raise NotImplementedError — those land in Phase 2.
- `BypassProvider.create_checkout_session(...)` returns a `CheckoutSession`
  and inserts a `WebhookEvent(provider="bypass")` row.
"""

from __future__ import annotations

import pytest
from django.test import override_settings

from apps.billing.providers import (
    CheckoutSession,
    PaymentProvider,
    ProviderError,
    get_provider,
)
from apps.billing.providers.bypass_provider import BypassProvider
from apps.billing.providers.stripe_provider import StripeProvider
from apps.core.models import PlatformPlan, WebhookEvent

pytestmark = pytest.mark.django_db


@pytest.fixture()
def plan(db):
    return PlatformPlan.objects.create(
        name="phase0-test-starter",
        price_monthly=19,
        transaction_fee_pct=8,
        max_students=100,
        max_storage_gb=100,
        max_streaming_hours=100,
        max_campaign_emails=1000,
        is_live_enabled=True,
        prices={
            "USD": {"amount_cents": 1900, "stripe_price_id": "price_usd_starter_test"},
            "TRY": {"amount_cents": 65000, "stripe_price_id": "price_try_starter_test"},
        },
    )


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_get_provider_returns_bypass_when_flag_on(shared_tenant):
    provider = get_provider(shared_tenant)
    assert isinstance(provider, BypassProvider)
    assert provider.name == "bypass"
    assert isinstance(provider, PaymentProvider)


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_get_provider_returns_stripe_when_flag_off(shared_tenant):
    provider = get_provider(shared_tenant)
    assert isinstance(provider, StripeProvider)
    assert provider.name == "stripe"
    assert isinstance(provider, PaymentProvider)


def test_stripe_provider_create_checkout_session_raises_provider_error_when_price_missing(shared_tenant):
    """Phase 1: when the plan has no Stripe price for the tenant's currency,
    the adapter raises a typed `ProviderError` with `code=PRICE_NOT_AVAILABLE`.
    No real Stripe call is attempted.
    """
    plan_no_price = PlatformPlan.objects.create(
        name="phase1-test-empty-prices",
        price_monthly=19,
        transaction_fee_pct=8,
        max_students=100,
        max_storage_gb=100,
        max_streaming_hours=100,
        max_campaign_emails=1000,
        prices={"USD": {"amount_cents": 1900, "stripe_price_id": ""}},
    )
    # Force a known billing currency so the adapter looks up the empty entry.
    shared_tenant.billing_currency = "USD"
    provider = StripeProvider()
    with pytest.raises(ProviderError) as excinfo:
        provider.create_checkout_session(
            tenant=shared_tenant,
            user=None,
            plan=plan_no_price,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            locale="en",
        )
    assert excinfo.value.code == "PRICE_NOT_AVAILABLE"


def test_stripe_provider_phase2_methods_raise_not_implemented():
    """Customer Portal + cancel land in Phase 2; the skeletons stay until then."""
    provider = StripeProvider()
    with pytest.raises(NotImplementedError):
        provider.create_customer_portal_session(provider_customer_id="cus_x", return_url="https://example.com")
    with pytest.raises(NotImplementedError):
        provider.cancel_subscription(provider_subscription_id="sub_x")


def test_bypass_provider_create_checkout_session_emits_webhook_event(restore_public, shared_tenant, plan):
    # The fixture `restore_public` ensures public-schema rows exist.
    before = WebhookEvent.objects.filter(provider="bypass").count()
    provider = BypassProvider()
    session = provider.create_checkout_session(
        tenant=shared_tenant,
        user=None,
        plan=plan,
        success_url="https://example.com/success",
        cancel_url="https://example.com/cancel",
        locale="en",
    )
    assert isinstance(session, CheckoutSession)
    assert session.url == "https://example.com/success"
    assert session.provider_session_id.startswith("bypass_cs_")
    after = WebhookEvent.objects.filter(provider="bypass").count()
    assert after == before + 1
    last = WebhookEvent.objects.filter(provider="bypass").latest("received_at")
    assert last.event_type == "checkout.session.completed"
    assert last.payload["tenant_id"] == shared_tenant.pk
    assert last.payload["plan_id"] == plan.pk
