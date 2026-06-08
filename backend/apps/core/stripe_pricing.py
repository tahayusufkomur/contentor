"""Reusable Stripe Price provisioning for platform plans.

Both `seed_plans` (boot-time) and the superadmin plan-edit endpoint
(`views_platform.platform_plan_detail`) call `provision_stripe_price` so the
grandfathering behavior lives in exactly one place.

Grandfathering: each plan+currency owns a stable `lookup_key`. Stripe Prices are
immutable, so when the amount changes we create a *new* Price and transfer the
lookup_key onto it (`transfer_lookup_key=True`). Existing Stripe subscriptions
keep referencing the old Price — they are never re-billed at the new amount.
Only new checkouts pick up the new Price. Migrating a subscriber to a new price
is therefore a deliberate, manual action, never a side effect of editing.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from django.conf import settings

logger = logging.getLogger(__name__)


def _stripe_client() -> Any | None:
    """Return the stripe module with api_key set, or None if Stripe is unconfigured.

    Read lazily every call so test `override_settings(STRIPE_SECRET_KEY=...)`
    takes effect and module import never hard-fails when the SDK is absent.
    """
    if not settings.STRIPE_SECRET_KEY:
        return None
    try:
        import stripe
    except ImportError:
        logger.warning("stripe SDK not installed; skipping price provisioning")
        return None
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def provision_stripe_price(
    *,
    plan_key: str,
    currency: str,
    amount_cents: int,
    log: Callable[[str], Any] = logger.info,
) -> str:
    """Idempotently ensure a recurring monthly Stripe Price for plan+currency.

    Returns the Price id, or "" when Stripe is unconfigured or any Stripe call
    fails (so callers never hard-fail — checkout surfaces PRICE_NOT_AVAILABLE if
    the id is missing).
    """
    stripe = _stripe_client()
    if stripe is None:
        return ""

    lookup_key = f"contentor_{plan_key}_{currency.lower()}_monthly"
    cur = currency.lower()
    try:
        existing = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1)
        if existing.data:
            price = existing.data[0]
            if price.unit_amount == amount_cents and price.currency == cur:
                return price.id  # unchanged — reuse

        # One Product per plan (idempotent via metadata search).
        found = stripe.Product.search(query=f"metadata['contentor_plan']:'{plan_key}'", limit=1)
        if found.data:
            product_id = found.data[0].id
        else:
            product_id = stripe.Product.create(
                name=f"Contentor {plan_key.title()}",
                metadata={"contentor_plan": plan_key},
            ).id

        price = stripe.Price.create(
            product=product_id,
            currency=cur,
            unit_amount=amount_cents,
            recurring={"interval": "month"},
            lookup_key=lookup_key,
            transfer_lookup_key=True,  # move the key off any prior (old-amount) Price
            metadata={"contentor_plan": plan_key},
        )
        log(f"Provisioned Stripe price {price.id} ({plan_key}/{currency} {amount_cents})")
        return price.id
    except Exception as exc:  # noqa: BLE001 — log and continue; checkout 422s if missing
        log(f"WARNING: could not provision Stripe price for {plan_key}/{currency}: {exc}")
        return ""
