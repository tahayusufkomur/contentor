"""Unit tests for the D4 monetization gate (`apps.core.monetization`).

Free coaches can never monetize. Paid coaches must have an active platform
subscription to *reach* onboarding (`is_paid_active`) and additionally have
Stripe charges enabled to *take a payment* (`can_monetize`). Under bypass
(dev/CI) a paid plan alone satisfies both, for parity testing.
"""

from __future__ import annotations

import pytest
from django.test import override_settings

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant
from apps.core.monetization import can_monetize, is_paid_active

pytestmark = pytest.mark.django_db


@pytest.fixture()
def paid_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="mon-pro", defaults={"price_monthly": 49, "transaction_fee_pct": 4}
    )
    return plan


@pytest.fixture()
def free_plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="mon-free", defaults={"price_monthly": 0, "transaction_fee_pct": 0}
    )
    return plan


def _activate_subscription(tenant, plan):
    user = User.objects.create(email="msub@contentor.app", region="global", role="owner")
    PlatformSubscription.objects.update_or_create(
        tenant=tenant,
        defaults={"user": user, "plan": plan, "status": PlatformSubscription.STATUS_ACTIVE},
    )


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_free_plan_never_monetizes(restore_public, free_plan):
    tenant = restore_public
    tenant.plan = free_plan
    assert is_paid_active(tenant) is False
    assert can_monetize(tenant) is False


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_paid_plan_without_active_subscription_not_active(restore_public, paid_plan):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    tenant.plan = paid_plan
    assert is_paid_active(tenant) is False


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_paid_active_without_charges_cannot_monetize(restore_public, paid_plan):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(plan=paid_plan, stripe_charges_enabled=False)
    _activate_subscription(tenant, paid_plan)
    tenant.refresh_from_db()
    assert is_paid_active(tenant) is True
    assert can_monetize(tenant) is False


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_paid_active_with_charges_can_monetize(restore_public, paid_plan):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(plan=paid_plan, stripe_charges_enabled=True)
    _activate_subscription(tenant, paid_plan)
    tenant.refresh_from_db()
    assert can_monetize(tenant) is True


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_bypass_paid_plan_can_monetize_without_stripe(restore_public, paid_plan):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    Tenant.objects.filter(pk=tenant.pk).update(plan=paid_plan, stripe_charges_enabled=False)
    tenant.refresh_from_db()
    assert is_paid_active(tenant) is True
    assert can_monetize(tenant) is True
