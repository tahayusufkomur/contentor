"""Monetization gate (decision D4).

Free coaches can never get paid in the app: no payouts, no paid
content/subscriptions/bundles. Charging students requires a **paid plan**
(Starter/Pro) with an **active** platform subscription, and — to actually move
money — completed Stripe Connect onboarding (`charges_enabled`). A trial is
not active: it runs Starter's features, but selling waits for the first charge
(decision 2026-10-16).

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


# New coaches start on a Starter trial, card taken at checkout and charged when
# it ends (decision 2026-10-16); there is no Free plan for them to fall back on.
TRIAL_DAYS = 14
TRIAL_PLAN_NAME = "starter"


def _bypass() -> bool:
    return bool(getattr(settings, "BILLING_BYPASS_ENABLED", False))


def trial_days_for(tenant: Tenant, plan) -> int:
    """The free days a checkout for `plan` opens with: Starter's trial, once
    per tenant, for coaches who signed up without a Free plan. Kept-free
    tenants upgrade to sell, so theirs starts paid."""
    from .models import PlatformSubscription

    if not tenant.requires_plan or (plan.name or "").lower() != TRIAL_PLAN_NAME:
        return 0
    if PlatformSubscription.objects.filter(tenant=tenant).exists():
        return 0  # a trial or a plan already ran
    return TRIAL_DAYS


def is_paid_active(tenant: Tenant | None) -> bool:
    """True if the tenant is on a paid plan with an active platform subscription.

    This is the gate for *reaching* Connect onboarding and publishing paid
    content — it does NOT require charges to be enabled yet (that's the point of
    onboarding).
    """
    plan = getattr(tenant, "plan", None)
    if tenant is None or plan is None or plan.is_free:
        return False
    # Avoid a circular import at module load.
    from .models import PlatformSubscription

    if _bypass():
        # The reverse one-to-one's DoesNotExist is an AttributeError: no row, no trial.
        sub = getattr(tenant, "platform_subscription", None)
        return getattr(sub, "status", None) != PlatformSubscription.STATUS_TRIALING

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
