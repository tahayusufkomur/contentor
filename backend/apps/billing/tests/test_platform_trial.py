"""The Starter trial (decision 2026-10-16): a coach who signed up without a
Free plan starts on a 14-day Starter trial, card taken at checkout. The trial
runs Starter's features but cannot sell, and no plan at all pauses the site."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import override_settings
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.views.webhooks_platform import _handle_subscription_event
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant
from apps.core.monetization import TRIAL_DAYS, is_paid_active, trial_days_for
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.setup_items import publish_blockers

pytestmark = pytest.mark.django_db
URL = "/api/v1/billing/platform/subscription/"


@pytest.fixture()
def starter(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="starter",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "is_live_enabled": True,
            "is_active": True,
            "prices": {"USD": {"amount_cents": 1990, "stripe_price_id": "price_test_trial_usd"}},
        },
    )
    return plan


@pytest.fixture()
def tenant(restore_public):
    """The shared tenant as a coach who signed up after Free was retired."""
    PlatformSubscription.objects.filter(tenant=restore_public).delete()
    Tenant.objects.filter(pk=restore_public.pk).update(requires_plan=True, billing_currency="USD")
    restore_public.refresh_from_db()
    return restore_public


@pytest.fixture()
def coach(restore_public):
    # Public schema: PlatformSubscription.user points there.
    return User.objects.create_user(email="coach@trial.test", name="Coach", password="x", role="owner")  # noqa: S106


@pytest.fixture()
def client(tenant_ctx):
    owner = User.objects.create_user(email="owner@trial.test", name="Owner", password="x", role="owner")  # noqa: S106
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=owner)
    return c


def _subscribe(tenant, coach, plan, status, provider="stripe"):
    PlatformSubscription.objects.create(
        tenant=tenant,
        user=coach,
        plan=plan,
        status=status,
        provider=provider,
        provider_subscription_id="sub_trial_test",
        current_period_end=datetime.now(tz=UTC) + timedelta(days=TRIAL_DAYS),
    )
    tenant.refresh_from_db()


def test_the_trial_is_starters_once_and_only_without_a_free_plan(tenant, coach, starter):
    assert trial_days_for(tenant, starter) == TRIAL_DAYS
    assert trial_days_for(tenant, PlatformPlan(name="pro")) == 0
    tenant.requires_plan = False  # a kept-free coach upgrades to sell, paid at once
    assert trial_days_for(tenant, starter) == 0
    tenant.requires_plan = True
    _subscribe(tenant, coach, starter, PlatformSubscription.STATUS_CANCELED)
    assert trial_days_for(tenant, starter) == 0


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_trial_dummy")  # noqa: S106
def test_checkout_opens_the_trial_with_the_card_taken(tenant, starter, client):
    # The owner's platform account (public schema): Stripe's metadata names it,
    # not the tenant schema's copy, whose id means someone else in public.
    with schema_context("public"):
        account = User.objects.create_user(email=tenant.owner_email, name="Owner", password="x", role="coach")  # noqa: S106
    session = SimpleNamespace(id="cs_trial", url="https://checkout.stripe.com/c/pay/cs_trial", expires_at=1893456000)
    with patch("stripe.checkout.Session.create", return_value=session) as create:
        response = client.post("/api/v1/billing/platform/checkout/", data={"plan_id": starter.pk}, format="json")
    assert response.status_code == 200, response.content
    kwargs = create.call_args.kwargs
    assert kwargs["mode"] == "subscription"
    assert kwargs["subscription_data"]["trial_period_days"] == TRIAL_DAYS
    assert kwargs["metadata"]["user_id"] == str(account.pk)


def test_a_trial_runs_the_plan_but_sells_only_once_charged(tenant, coach, starter):
    _subscribe(tenant, coach, starter, PlatformSubscription.STATUS_TRIALING)
    assert tenant.is_subscription_active and tenant.has_paid_platform_plan
    assert not tenant.is_paused
    assert not is_paid_active(tenant)
    PlatformSubscription.objects.filter(tenant=tenant).update(status=PlatformSubscription.STATUS_ACTIVE)
    assert is_paid_active(tenant)


def test_no_plan_pauses_only_a_tenant_that_needs_one(tenant, coach, starter, tenant_ctx):
    assert tenant.is_paused
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    assert "plan" in publish_blockers(config, tenant)
    _subscribe(tenant, coach, starter, PlatformSubscription.STATUS_CANCELED)
    assert tenant.is_paused
    tenant.requires_plan = False  # kept free: falls back to Free instead
    assert not tenant.is_paused


def test_stripe_trialing_is_its_own_status(tenant, coach, starter):
    now = int(datetime.now(tz=UTC).timestamp())
    metadata = {"tenant_id": str(tenant.pk), "plan_id": str(starter.pk), "user_id": str(coach.pk)}
    sub = {"id": "sub_trial_wh", "status": "trialing", "metadata": metadata, "customer": "cus_trial"}
    sub |= {"current_period_start": now, "current_period_end": now + TRIAL_DAYS * 86400, "cancel_at_period_end": False}
    _handle_subscription_event({"data": {"object": sub}})
    assert PlatformSubscription.objects.get(tenant=tenant).status == PlatformSubscription.STATUS_TRIALING


def test_subscription_says_none_and_offers_the_trial(tenant, starter, client):
    body = client.get(URL).json()
    assert body["status"] == "none" and body["paused"] is True
    assert body["trial"] == {"plan_id": starter.pk, "days": TRIAL_DAYS}


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_trial_dummy")  # noqa: S106
def test_plan_actions_cancel_resume_and_start_now(tenant, coach, starter, client):
    _subscribe(tenant, coach, starter, PlatformSubscription.STATUS_TRIALING)
    now = int(datetime.now(tz=UTC).timestamp())
    stripe_sub = {"id": "sub_trial_test", "customer": "cus_trial", "current_period_start": now}
    stripe_sub |= {"current_period_end": now + 30 * 86400, "metadata": {}}

    with patch(
        "stripe.Subscription.modify", return_value={**stripe_sub, "status": "trialing", "cancel_at_period_end": True}
    ) as modify:
        body = client.post(URL, data={"action": "cancel"}, format="json").json()
    assert modify.call_args.kwargs == {"cancel_at_period_end": True}
    assert body["status"] == "trialing" and body["cancel_at_period_end"] is True

    with patch(
        "stripe.Subscription.modify", return_value={**stripe_sub, "status": "active", "cancel_at_period_end": False}
    ) as modify:
        body = client.post(URL, data={"action": "start_now"}, format="json").json()
    assert modify.call_args.kwargs == {"trial_end": "now"}
    assert body["status"] == "active"

    response = client.post(URL, data={"action": "start_now"}, format="json")
    assert response.status_code == 409  # no trial left to end
    assert client.post(URL, data={"action": "refund"}, format="json").status_code == 400


def test_no_second_checkout_while_a_plan_runs(tenant, coach, starter, client):
    _subscribe(tenant, coach, starter, PlatformSubscription.STATUS_TRIALING)
    response = client.post("/api/v1/billing/platform/checkout/", data={"plan_id": starter.pk}, format="json")
    assert response.status_code == 409  # a second subscription would bill beside the first


def test_checkout_completed_never_turns_a_trial_active(tenant, coach, starter):
    """Stripe sends the subscription events and checkout.session.completed in
    any order, and the session carries no subscription object."""
    from apps.billing.views.webhooks_platform import _upsert_subscription_from_event

    session = {"subscription": "sub_trial_test", "customer": "cus_trial", "payment_status": "no_payment_required"}
    # Session first: nothing was charged, so it is the trial.
    _upsert_subscription_from_event(tenant=tenant, user=coach, plan=starter, session_obj=session, subscription_obj=None)
    assert PlatformSubscription.objects.get(tenant=tenant).status == PlatformSubscription.STATUS_TRIALING
    # Subscription event first: the session keeps what it set.
    PlatformSubscription.objects.filter(tenant=tenant).update(status=PlatformSubscription.STATUS_TRIALING)
    paid = {**session, "payment_status": "paid"}
    _upsert_subscription_from_event(tenant=tenant, user=coach, plan=starter, session_obj=paid, subscription_obj=None)
    assert PlatformSubscription.objects.get(tenant=tenant).status == PlatformSubscription.STATUS_TRIALING
