"""PlatformSubscription is the single source of truth; Tenant.plan is a mirror
kept current by a signal — no write path can leave them diverged.

Rule: a non-canceled subscription mirrors its plan onto Tenant.plan; a canceled
or deleted subscription reverts Tenant.plan to Free.
"""

from __future__ import annotations

import pytest
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

pytestmark = pytest.mark.django_db
SHARED_SCHEMA = "shared_test"


@pytest.fixture()
def owner(restore_public):
    return User.objects.create(email="mirror-owner@x.com", region="global", role="owner")


@pytest.fixture()
def paid_plan(restore_public):
    return PlatformPlan.objects.create(name="mirror-starter", price_monthly=19, transaction_fee_pct=5)


@pytest.fixture()
def free_plan(restore_public):
    plan, _ = PlatformPlan.objects.get_or_create(name="Free", defaults={"price_monthly": 0, "transaction_fee_pct": 0})
    return plan


def _tenant():
    return Tenant.objects.get(schema_name=SHARED_SCHEMA)


def test_creating_active_subscription_mirrors_plan(owner, paid_plan):
    PlatformSubscription.objects.create(
        tenant=_tenant(),
        user=owner,
        plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE,
        provider="manual",
    )
    assert _tenant().plan_id == paid_plan.pk


def test_changing_subscription_plan_updates_mirror(owner, paid_plan, free_plan):
    sub = PlatformSubscription.objects.create(
        tenant=_tenant(),
        user=owner,
        plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE,
        provider="manual",
    )
    assert _tenant().plan_id == paid_plan.pk
    other = PlatformPlan.objects.create(name="mirror-pro", price_monthly=49, transaction_fee_pct=4)
    sub.plan = other
    sub.save(update_fields=["plan"])
    assert _tenant().plan_id == other.pk


def test_canceling_subscription_reverts_mirror_to_free(owner, paid_plan, free_plan):
    sub = PlatformSubscription.objects.create(
        tenant=_tenant(),
        user=owner,
        plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE,
        provider="manual",
    )
    assert _tenant().plan_id == paid_plan.pk
    sub.status = PlatformSubscription.STATUS_CANCELED
    sub.save(update_fields=["status"])
    assert _tenant().plan_id == free_plan.pk


def test_deleting_subscription_reverts_mirror_to_free(owner, paid_plan, free_plan):
    sub = PlatformSubscription.objects.create(
        tenant=_tenant(),
        user=owner,
        plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE,
        provider="manual",
    )
    assert _tenant().plan_id == paid_plan.pk
    # Deleting cascades (SET_NULL) to the tenant-only billing_payment table —
    # run inside the tenant schema so that cascade resolves.
    with schema_context(SHARED_SCHEMA):
        PlatformSubscription.objects.filter(pk=sub.pk).delete()
    assert _tenant().plan_id == free_plan.pk


def test_django_admin_plan_is_read_only():
    from apps.core.admin import TenantAdmin

    assert "plan" in TenantAdmin.readonly_fields
