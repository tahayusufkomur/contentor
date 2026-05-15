"""Phase 0 — Tenant.is_subscription_active and WebhookEvent uniqueness."""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, WebhookEvent

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach_user(restore_public):
    return User.objects.create_user(
        email="coach@phase0.test",
        name="Phase 0 Coach",
        password="secret123",  # noqa: S106 — test fixture password
        role="owner",
    )


@pytest.fixture()
def plan(restore_public):
    return PlatformPlan.objects.create(
        name="phase0-starter",
        price_monthly=19,
        transaction_fee_pct=8,
        max_students=100,
        max_storage_gb=100,
        max_streaming_hours=100,
        max_campaign_emails=1000,
    )


def test_is_subscription_active_false_without_row(restore_public):
    tenant = restore_public
    # Defensive cleanup in case a prior test left a subscription attached.
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    assert tenant.is_subscription_active is False


@pytest.mark.parametrize("status", ["active", "past_due"])
def test_is_subscription_active_true_for_active_and_past_due(restore_public, coach_user, plan, status):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    PlatformSubscription.objects.create(
        tenant=tenant,
        user=coach_user,
        plan=plan,
        status=status,
        provider="bypass",
    )
    tenant.refresh_from_db()
    assert tenant.is_subscription_active is True


@pytest.mark.parametrize("status", ["incomplete", "canceled"])
def test_is_subscription_active_false_for_other_statuses(restore_public, coach_user, plan, status):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    PlatformSubscription.objects.create(
        tenant=tenant,
        user=coach_user,
        plan=plan,
        status=status,
        provider="bypass",
    )
    tenant.refresh_from_db()
    assert tenant.is_subscription_active is False


def test_webhook_event_unique_constraint(restore_public):
    WebhookEvent.objects.filter(provider="stripe", provider_event_id="evt_dup_phase0").delete()
    WebhookEvent.objects.create(
        provider="stripe",
        provider_event_id="evt_dup_phase0",
        event_type="checkout.session.completed",
        payload={},
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        WebhookEvent.objects.create(
            provider="stripe",
            provider_event_id="evt_dup_phase0",
            event_type="checkout.session.completed",
            payload={},
        )
    # Cleanup so test re-runs don't fail.
    WebhookEvent.objects.filter(provider="stripe", provider_event_id="evt_dup_phase0").delete()


def test_platform_plan_is_free_by_name(restore_public):
    # The Free plan may already exist from the data-migration backfill; treat
    # it as a get_or_create. Override price_monthly so we're sure the
    # "by name" rule is being exercised (not the "price_monthly == 0" rule).
    plan, _ = PlatformPlan.objects.update_or_create(
        name="Free",
        defaults={
            "price_monthly": 19,  # nonzero — name should still win
            "transaction_fee_pct": 0,
        },
    )
    assert plan.is_free is True
    # Restore to a zero-price Free so subsequent tests/fixtures observe the
    # standard shape.
    PlatformPlan.objects.filter(name="Free").update(price_monthly=0)


def test_platform_plan_is_free_by_zero_price(restore_public):
    plan = PlatformPlan.objects.create(
        name="custom-zero-price",
        price_monthly=0,
        transaction_fee_pct=0,
    )
    assert plan.is_free is True
    plan.delete()


def test_platform_plan_not_free(restore_public):
    plan = PlatformPlan.objects.create(
        name="paid-tier",
        price_monthly=19,
        transaction_fee_pct=0,
    )
    assert plan.is_free is False
    plan.delete()
