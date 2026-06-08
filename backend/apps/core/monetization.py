"""Monetization gate (decision D4).

Free coaches can never get paid in the app: no payouts, no paid
content/subscriptions/bundles. Charging students requires a **paid plan**
(Starter/Pro) with an **active** platform subscription, and — to actually move
money — completed Stripe Connect onboarding (`charges_enabled`).

Two questions, two helpers:
  - `is_paid_active(tenant)`  — may this tenant *reach* payout onboarding /
    publish paid content? Paid plan + active platform subscription.
  - `can_monetize(tenant)`    — may this tenant *take a real payment right now*?
    `is_paid_active` AND Stripe charges are enabled on the connected account.

Bypass parity: when `BILLING_BYPASS_ENABLED` is on (dev/CI), there is no real
Stripe account or PlatformSubscription, so a paid plan alone satisfies both —
otherwise the whole marketplace would be untestable without live Stripe.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from .models import Tenant


def _bypass() -> bool:
    return bool(getattr(settings, "BILLING_BYPASS_ENABLED", False))


def is_paid_active(tenant: Tenant | None) -> bool:
    """True if the tenant is on a paid plan with an active platform subscription.

    This is the gate for *reaching* Connect onboarding and publishing paid
    content — it does NOT require charges to be enabled yet (that's the point of
    onboarding).
    """
    plan = getattr(tenant, "plan", None)
    if tenant is None or plan is None or plan.is_free:
        return False
    if _bypass():
        return True
    # Avoid a circular import at module load.
    from .models import PlatformSubscription

    return PlatformSubscription.objects.filter(tenant=tenant, status=PlatformSubscription.STATUS_ACTIVE).exists()


def can_monetize(tenant: Tenant | None) -> bool:
    """True if the tenant may take a real payment right now.

    Requires `is_paid_active` plus completed Connect onboarding
    (`stripe_charges_enabled`). Under bypass the charges check is skipped.
    """
    if not is_paid_active(tenant):
        return False
    if _bypass():
        return True
    return bool(getattr(tenant, "stripe_charges_enabled", False))
