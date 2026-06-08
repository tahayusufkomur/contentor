"""Phase D — student→coach recurring subscriptions via Stripe Connect.

Stripe provider calls and webhook signature verification are mocked. Covers the
subscribe Checkout hand-off (+ D1 price provisioning/reuse), cancel and
change-plan, and the connected-account lifecycle webhooks (checkout completed,
invoice.paid with pending-plan apply, payment_failed → past_due, deleted →
expired).
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.test import override_settings
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Payment, Subscription, SubscriptionPlan
from apps.billing.providers.connect import MarketplaceCheckout
from apps.core.models import PlatformPlan, Tenant

SHARED_DOMAIN = "shared-test.localhost"
SUBSCRIBE_URL = "/api/v1/billing/subscribe/"
_PW = "secret123"  # noqa: S106

pytestmark = pytest.mark.django_db


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@subd.test",
        name="Owner",
        password=_PW,
        role="owner",  # noqa: S106
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@subd.test",
        name="Student",
        password=_PW,
        role="student",  # noqa: S106
    )


@pytest.fixture()
def plan(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Gold", price=Decimal("20.00"), currency="USD", is_active=True)


def _set_account(tenant, fee_pct=4):
    pplan, _ = PlatformPlan.objects.update_or_create(
        name="subd-pro", defaults={"price_monthly": 49, "transaction_fee_pct": fee_pct}
    )
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_subd", plan=pplan)


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_subscribe_provisions_price_and_returns_checkout(restore_public, student, plan):
    tenant = restore_public
    _set_account(tenant, fee_pct=4)

    checkout = MarketplaceCheckout(url="https://checkout.stripe.com/c/pay/cs_sub", session_id="cs_sub")
    with (
        patch("apps.billing.views.payments.can_monetize", return_value=True),
        patch("apps.billing.providers.connect.provision_subscription_price", return_value="price_gold") as mk_price,
        patch("apps.billing.providers.connect.create_subscription_checkout", return_value=checkout) as mk_checkout,
    ):
        resp = _client(student).post(SUBSCRIBE_URL, {"plan_id": plan.pk}, format="json")

    assert resp.status_code == 201, resp.content
    assert resp.json()["checkout_url"].startswith("https://checkout.stripe.com/")
    mk_price.assert_called_once()
    plan.refresh_from_db()
    assert plan.stripe_price_id == "price_gold"
    assert plan.stripe_price_amount_cents == 2000

    kwargs = mk_checkout.call_args.kwargs
    assert kwargs["price_id"] == "price_gold"
    assert kwargs["application_fee_percent"] == 4.0
    assert kwargs["metadata"]["subscription_plan_id"] == str(plan.pk)


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_subscribe_reuses_price_when_amount_unchanged(restore_public, student, plan):
    tenant = restore_public
    _set_account(tenant)
    SubscriptionPlan.objects.filter(pk=plan.pk).update(stripe_price_id="price_existing", stripe_price_amount_cents=2000)

    checkout = MarketplaceCheckout(url="https://checkout.stripe.com/c/pay/cs_x", session_id="cs_x")
    with (
        patch("apps.billing.views.payments.can_monetize", return_value=True),
        patch("apps.billing.providers.connect.provision_subscription_price") as mk_price,
        patch("apps.billing.providers.connect.create_subscription_checkout", return_value=checkout),
    ):
        resp = _client(student).post(SUBSCRIBE_URL, {"plan_id": plan.pk}, format="json")

    assert resp.status_code == 201, resp.content
    mk_price.assert_not_called()  # amount unchanged → existing Price reused


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_subscribe_blocked_when_coach_cannot_monetize(restore_public, student, plan):
    with (
        patch("apps.billing.views.payments.can_monetize", return_value=False),
        patch("apps.billing.providers.connect.create_subscription_checkout") as mk,
    ):
        resp = _client(student).post(SUBSCRIBE_URL, {"plan_id": plan.pk}, format="json")
    assert resp.status_code == 409, resp.content
    mk.assert_not_called()


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_cancel_marks_cancel_at_period_end(restore_public, student, plan):
    tenant = restore_public
    _set_account(tenant)
    now = datetime(2026, 6, 1, tzinfo=UTC)
    sub = Subscription.objects.create(
        student=student,
        plan=plan,
        billing_amount=plan.price,
        billing_currency="USD",
        status="active",
        provider="stripe",
        provider_subscription_id="sub_gold",
        current_period_start=now,
        current_period_end=datetime(2026, 7, 1, tzinfo=UTC),
    )
    with patch("apps.billing.providers.connect.cancel_subscription") as mk_cancel:
        resp = _client(student).post(f"/api/v1/billing/subscriptions/{sub.pk}/cancel/", format="json")
    assert resp.status_code == 200, resp.content
    mk_cancel.assert_called_once()
    sub.refresh_from_db()
    assert sub.cancel_at_period_end is True


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_change_plan_sets_pending(restore_public, student, plan):
    tenant = restore_public
    _set_account(tenant)
    other = SubscriptionPlan.objects.create(name="Platinum", price=Decimal("40.00"), currency="USD", is_active=True)
    now = datetime(2026, 6, 1, tzinfo=UTC)
    sub = Subscription.objects.create(
        student=student,
        plan=plan,
        billing_amount=plan.price,
        billing_currency="USD",
        status="active",
        provider="stripe",
        provider_subscription_id="sub_gold",
        current_period_start=now,
        current_period_end=datetime(2026, 7, 1, tzinfo=UTC),
    )
    with (
        patch("apps.billing.providers.connect.provision_subscription_price", return_value="price_plat"),
        patch("apps.billing.providers.connect.update_subscription_price") as mk_update,
    ):
        resp = _client(student).post(
            f"/api/v1/billing/subscriptions/{sub.pk}/change-plan/",
            {"plan_id": other.pk},
            format="json",
        )
    assert resp.status_code == 200, resp.content
    mk_update.assert_called_once()
    sub.refresh_from_db()
    assert sub.pending_plan_id == other.pk


# --- Webhook lifecycle ---


class _FakeEvent:
    def __init__(self, body):
        self._body = body

    def __getitem__(self, key):
        return self._body[key]

    def get(self, key, default=None):
        return self._body.get(key, default)

    def to_dict(self):
        return self._body


def _post_webhook(event):
    with patch("stripe.Webhook.construct_event", return_value=event):
        return APIClient().post(
            "/api/webhooks/stripe/",
            data="{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=fake",
        )


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_subd")  # noqa: S106
def test_webhook_subscription_checkout_creates_active_subscription(restore_public):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_subd_wh")
    with tenant_context(tenant):
        student = User.objects.create_user(
            email="s@subdwh.test",
            name="S",
            password=_PW,
            role="student",  # noqa: S106
        )
        plan = SubscriptionPlan.objects.create(name="WH Gold", price=Decimal("20.00"), currency="USD")
        plan_id, student_id = plan.pk, student.pk

    event = _FakeEvent(
        {
            "id": "evt_subd_co",
            "type": "checkout.session.completed",
            "account": "acct_subd_wh",
            "data": {
                "object": {
                    "id": "cs_subd",
                    "subscription": "sub_subd_1",
                    "customer": "cus_subd_1",
                    "metadata": {
                        "subscription_plan_id": str(plan_id),
                        "user_id": str(student_id),
                        "tenant_id": str(tenant.pk),
                    },
                }
            },
        }
    )
    resp = _post_webhook(event)
    assert resp.status_code == 200, resp.content
    with tenant_context(tenant):
        sub = Subscription.objects.get(provider_subscription_id="sub_subd_1")
        assert sub.status == "active"
        assert sub.student_id == student_id
        assert sub.plan_id == plan_id


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_subd")  # noqa: S106
def test_webhook_invoice_failed_and_deleted(restore_public):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_subd_wh2")
    with tenant_context(tenant):
        student = User.objects.create_user(
            email="s2@subdwh.test",
            name="S",
            password=_PW,
            role="student",  # noqa: S106
        )
        plan = SubscriptionPlan.objects.create(name="WH2", price=Decimal("20.00"), currency="USD")
        sub = Subscription.objects.create(
            student=student,
            plan=plan,
            billing_amount=plan.price,
            billing_currency="USD",
            status="active",
            provider="stripe",
            provider_subscription_id="sub_subd_2",
            current_period_start=datetime(2026, 6, 1, tzinfo=UTC),
            current_period_end=datetime(2026, 7, 1, tzinfo=UTC),
        )
        sub_pk = sub.pk

    failed = _FakeEvent(
        {
            "id": "evt_subd_fail",
            "type": "invoice.payment_failed",
            "account": "acct_subd_wh2",
            "data": {"object": {"subscription": "sub_subd_2"}},
        }
    )
    assert _post_webhook(failed).status_code == 200
    with tenant_context(tenant):
        assert Subscription.objects.get(pk=sub_pk).status == "past_due"

    deleted = _FakeEvent(
        {
            "id": "evt_subd_del",
            "type": "customer.subscription.deleted",
            "account": "acct_subd_wh2",
            "data": {"object": {"id": "sub_subd_2"}},
        }
    )
    assert _post_webhook(deleted).status_code == 200
    with tenant_context(tenant):
        assert Subscription.objects.get(pk=sub_pk).status == "expired"


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_subd")  # noqa: S106
def test_webhook_invoice_paid_applies_pending_plan_and_records_payment(restore_public):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_subd_wh3")
    with tenant_context(tenant):
        student = User.objects.create_user(
            email="s3@subdwh.test",
            name="S",
            password=_PW,
            role="student",  # noqa: S106
        )
        plan = SubscriptionPlan.objects.create(name="Old", price=Decimal("20.00"), currency="USD")
        new_plan = SubscriptionPlan.objects.create(name="New", price=Decimal("30.00"), currency="USD")
        sub = Subscription.objects.create(
            student=student,
            plan=plan,
            pending_plan=new_plan,
            billing_amount=plan.price,
            billing_currency="USD",
            status="past_due",
            provider="stripe",
            provider_subscription_id="sub_subd_3",
            current_period_start=datetime(2026, 6, 1, tzinfo=UTC),
            current_period_end=datetime(2026, 7, 1, tzinfo=UTC),
        )
        sub_pk, new_plan_id = sub.pk, new_plan.pk

    paid = _FakeEvent(
        {
            "id": "evt_subd_paid",
            "type": "invoice.paid",
            "account": "acct_subd_wh3",
            "data": {
                "object": {
                    "subscription": "sub_subd_3",
                    "amount_paid": 3000,
                    "currency": "usd",
                    "period_end": int(datetime(2026, 8, 1, tzinfo=UTC).timestamp()),
                    "payment_intent": "pi_subd_3",
                    "id": "in_subd_3",
                }
            },
        }
    )
    assert _post_webhook(paid).status_code == 200
    with tenant_context(tenant):
        sub = Subscription.objects.get(pk=sub_pk)
        assert sub.status == "active"
        assert sub.plan_id == new_plan_id  # pending plan applied
        assert sub.pending_plan_id is None
        assert Payment.objects.filter(subscription_id=sub_pk, amount=Decimal("30.00")).exists()
