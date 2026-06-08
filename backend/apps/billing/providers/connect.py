"""Stripe Connect (Express) helpers for coach payout onboarding (Phase B).

Decisions D6/D7: **Express** accounts (Stripe-hosted, platform-branded
onboarding; coach gets a limited payouts dashboard) and **direct charges** on
the connected account in Phase C. This module only covers account lifecycle:
create the Express account, mint a hosted onboarding link, and read back
readiness (`charges_enabled` / `payouts_enabled`).

Like `apps.core.stripe_pricing`, the stripe client is resolved lazily so import
never hard-fails and per-test `override_settings` takes effect. When Stripe is
unconfigured these raise `ProviderError(code="CONNECT_NOT_CONFIGURED")` so the
view returns a clean 400 instead of a 500.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.conf import settings

from .types import ProviderError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ConnectAccountStatus:
    """Readiness snapshot for a connected account."""

    account_id: str
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool


@dataclass(frozen=True)
class MarketplaceCheckout:
    """Return value of `create_marketplace_checkout`."""

    url: str
    session_id: str


def _client() -> Any:
    """Return the stripe module with api_key set, or raise if unconfigured."""
    if not settings.STRIPE_SECRET_KEY:
        raise ProviderError(
            "Stripe is not configured (STRIPE_SECRET_KEY missing).",
            code="CONNECT_NOT_CONFIGURED",
        )
    try:
        import stripe
    except ImportError as exc:  # pragma: no cover — SDK is a hard dep in prod
        raise ProviderError("stripe SDK not installed.", code="CONNECT_NOT_CONFIGURED") from exc
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def create_express_account(*, tenant, business_url: str = "") -> str:
    """Create an Express connected account for the tenant and return its id.

    Capabilities `card_payments` + `transfers` are requested so the account can
    accept direct charges and receive payouts (D7). The tenant id is stashed in
    metadata as a secondary resolution path for webhooks.
    """
    stripe = _client()
    country = "TR" if getattr(tenant, "region", "") == "tr" else "US"
    try:
        account = stripe.Account.create(
            type="express",
            country=country,
            email=getattr(tenant, "owner_email", None) or None,
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            business_profile={"url": business_url} if business_url else None,
            metadata={"tenant_id": str(tenant.pk), "tenant_slug": tenant.slug},
        )
    except Exception as exc:  # noqa: BLE001 — surface as a clean provider error
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return account.id


def create_account_link(*, account_id: str, refresh_url: str, return_url: str) -> str:
    """Mint a Stripe-hosted onboarding URL for the connected account."""
    stripe = _client()
    try:
        link = stripe.AccountLink.create(
            account=account_id,
            type="account_onboarding",
            refresh_url=refresh_url,
            return_url=return_url,
            collection_options={"fields": "currently_due"},
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return link.url


def create_dashboard_link(*, account_id: str) -> str:
    """Mint a single-use login link to the coach's Express payouts dashboard.

    Only valid once the account has completed onboarding (charges enabled);
    Stripe rejects it otherwise, which surfaces as a clean `ProviderError`.
    """
    stripe = _client()
    try:
        link = stripe.Account.create_login_link(account_id)
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return link.url


def create_marketplace_checkout(
    *,
    account_id: str,
    line_items: list[dict],
    application_fee_cents: int,
    success_url: str,
    cancel_url: str,
    customer_email: str = "",
    metadata: dict | None = None,
) -> MarketplaceCheckout:
    """Create a one-time student→coach Checkout Session as a **direct charge** (D7).

    The session is created *on* the connected account (`stripe_account=account_id`),
    so the coach is merchant of record and owns disputes/refunds; the platform
    takes `application_fee_amount`. `line_items` use inline `price_data` (content
    is priced ad hoc, not via pre-made Stripe Prices).
    """
    stripe = _client()
    payment_intent_data: dict = {}
    if application_fee_cents > 0:
        payment_intent_data["application_fee_amount"] = application_fee_cents
    if metadata:
        payment_intent_data["metadata"] = metadata
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            payment_intent_data=payment_intent_data or None,
            metadata=metadata or {},
            customer_email=customer_email or None,
            success_url=success_url,
            cancel_url=cancel_url,
            stripe_account=account_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return MarketplaceCheckout(url=session.url, session_id=session.id)


def provision_subscription_price(*, account_id: str, product_name: str, currency: str, amount_cents: int) -> str:
    """Create a recurring monthly Price (and its Product) **on the connected account**.

    Returns the new Price id. Called when a plan has no Price yet or its amount
    changed — we never mutate an existing Price (Stripe Prices are immutable), so
    existing subscribers stay on their old one (D1 grandfathering).
    """
    stripe = _client()
    try:
        product = stripe.Product.create(name=product_name[:250], stripe_account=account_id)
        price = stripe.Price.create(
            product=product.id,
            currency=currency.lower(),
            unit_amount=amount_cents,
            recurring={"interval": "month"},
            stripe_account=account_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return price.id


def create_subscription_checkout(
    *,
    account_id: str,
    price_id: str,
    application_fee_percent: float,
    success_url: str,
    cancel_url: str,
    customer_email: str = "",
    metadata: dict | None = None,
) -> MarketplaceCheckout:
    """Hosted Checkout (mode=subscription) for a student→coach recurring plan.

    Created on the connected account (direct charges, D7) with
    `subscription_data.application_fee_percent` as the platform's cut.
    """
    stripe = _client()
    subscription_data: dict = {"metadata": metadata or {}}
    if application_fee_percent > 0:
        subscription_data["application_fee_percent"] = application_fee_percent
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            subscription_data=subscription_data,
            metadata=metadata or {},
            customer_email=customer_email or None,
            success_url=success_url,
            cancel_url=cancel_url,
            stripe_account=account_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return MarketplaceCheckout(url=session.url, session_id=session.id)


def update_subscription_price(*, account_id: str, subscription_id: str, new_price_id: str) -> None:
    """Swap a connected-account subscription's item to `new_price_id` (no proration).

    The new price takes effect on the next billing cycle.
    """
    stripe = _client()
    try:
        sub = stripe.Subscription.retrieve(subscription_id, stripe_account=account_id)
        item_id = sub["items"]["data"][0]["id"]
        stripe.Subscription.modify(
            subscription_id,
            items=[{"id": item_id, "price": new_price_id}],
            proration_behavior="none",
            stripe_account=account_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc


def cancel_subscription(*, account_id: str, subscription_id: str, at_period_end: bool = True) -> None:
    """Cancel a connected-account subscription (default: at period end)."""
    stripe = _client()
    try:
        if at_period_end:
            stripe.Subscription.modify(subscription_id, cancel_at_period_end=True, stripe_account=account_id)
        else:
            stripe.Subscription.cancel(subscription_id, stripe_account=account_id)
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc


def retrieve_account_status(*, account_id: str) -> ConnectAccountStatus:
    """Read the connected account's current readiness from Stripe."""
    stripe = _client()
    try:
        acct = stripe.Account.retrieve(account_id)
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc
    return ConnectAccountStatus(
        account_id=acct.get("id", account_id),
        charges_enabled=bool(acct.get("charges_enabled")),
        payouts_enabled=bool(acct.get("payouts_enabled")),
        details_submitted=bool(acct.get("details_submitted")),
    )
