"""Superadmin granting a plan from the Tenant edit form must set the FULL
subscription state, not just the `Tenant.plan` mirror.

Root cause of the reported bug: editing `Tenant.plan` alone left
`PlatformSubscription` untouched, so every status reader (coach subscription
tile, quotas, monetization dashboard, mailbox eligibility) still saw "free".
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

SHARED_DOMAIN = "shared-test.localhost"
pytestmark = pytest.mark.django_db


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root@contentor.app", region="global", role="owner",
        is_staff=True, is_superuser=True,
    )


@pytest.fixture()
def owner(restore_public):
    tenant = restore_public
    return User.objects.create(email=tenant.owner_email, region="global", role="owner")


@pytest.fixture()
def paid_plan(restore_public):
    return PlatformPlan.objects.create(name="grant-starter", price_monthly=19, transaction_fee_pct=5)


@pytest.fixture()
def free_plan(restore_public):
    # A seeded "Free" plan may already exist (unique name) — reuse it.
    plan, _ = PlatformPlan.objects.get_or_create(
        name="Free", defaults={"price_monthly": 0, "transaction_fee_pct": 0}
    )
    return plan


def _client(user):
    c = APIClient(HTTP_HOST=SHARED_DOMAIN)
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f"/api/v1/platform-admin/tenants/{pk}/"


def test_granting_paid_plan_creates_active_subscription(superuser, owner, paid_plan):
    tenant = Tenant.objects.get(schema_name="shared_test")
    resp = _client(superuser).patch(_url(tenant.pk), {"plan": paid_plan.pk}, format="json")
    assert resp.status_code == 200, resp.content

    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.status == PlatformSubscription.STATUS_ACTIVE
    assert sub.plan_id == paid_plan.pk
    tenant.refresh_from_db()
    assert tenant.plan_id == paid_plan.pk
    assert tenant.has_paid_platform_plan is True


def test_granting_free_plan_cancels_existing_subscription(superuser, owner, paid_plan, free_plan):
    tenant = Tenant.objects.get(schema_name="shared_test")
    PlatformSubscription.objects.create(
        tenant=tenant, user=owner, plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE, provider="manual",
    )
    resp = _client(superuser).patch(_url(tenant.pk), {"plan": free_plan.pk}, format="json")
    assert resp.status_code == 200, resp.content

    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.status == PlatformSubscription.STATUS_CANCELED
    tenant.refresh_from_db()
    assert tenant.has_paid_platform_plan is False


def test_editing_name_only_leaves_stripe_subscription_untouched(superuser, owner, paid_plan):
    tenant = Tenant.objects.get(schema_name="shared_test")
    Tenant.objects.filter(pk=tenant.pk).update(plan=paid_plan)
    PlatformSubscription.objects.create(
        tenant=tenant, user=owner, plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE, provider="stripe",
        provider_subscription_id="sub_real_1",
    )
    resp = _client(superuser).patch(_url(tenant.pk), {"name": "Renamed"}, format="json")
    assert resp.status_code == 200, resp.content

    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.provider == "stripe"
    assert sub.status == PlatformSubscription.STATUS_ACTIVE


def test_changing_plan_on_active_stripe_sub_is_blocked(superuser, owner, paid_plan, free_plan):
    tenant = Tenant.objects.get(schema_name="shared_test")
    Tenant.objects.filter(pk=tenant.pk).update(plan=paid_plan)
    PlatformSubscription.objects.create(
        tenant=tenant, user=owner, plan=paid_plan,
        status=PlatformSubscription.STATUS_ACTIVE, provider="stripe",
        provider_subscription_id="sub_real_2",
    )
    resp = _client(superuser).patch(_url(tenant.pk), {"plan": free_plan.pk}, format="json")
    assert resp.status_code == 400
    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.plan_id == paid_plan.pk  # unchanged
    assert sub.provider == "stripe"
    # The rejected grant must roll back the mirror too (requests aren't atomic).
    tenant.refresh_from_db()
    assert tenant.plan_id == paid_plan.pk


def test_granting_without_owner_account_errors(superuser, paid_plan):
    # No User exists for the tenant's owner_email (owner fixture not used).
    tenant = Tenant.objects.get(schema_name="shared_test")
    User.objects.filter(email=tenant.owner_email).delete()
    resp = _client(superuser).patch(_url(tenant.pk), {"plan": paid_plan.pk}, format="json")
    assert resp.status_code == 400
    assert not PlatformSubscription.objects.filter(tenant=tenant).exists()
