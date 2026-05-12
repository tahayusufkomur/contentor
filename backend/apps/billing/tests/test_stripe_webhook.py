"""Integration tests for POST /api/webhooks/stripe/.

These tests mock `stripe.Webhook.construct_event` so they do not require real
Stripe signing secrets. They exercise the idempotency dispatcher, signature
failure handling, and event-type routing.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
import stripe
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import (
    PlatformPlan,
    PlatformSubscription,
    WebhookEvent,
)

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach(restore_public):
    return User.objects.create_user(
        email="coach@webhooktest.com",
        name="Webhook Coach",
        password="secret123",  # noqa: S106
        role="owner",
    )


@pytest.fixture()
def plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="phase1-webhook-pro",
        defaults={
            "price_monthly": 49,
            "transaction_fee_pct": 5,
            "max_students": 500,
            "max_storage_gb": 500,
            "max_streaming_hours": 500,
            "max_campaign_emails": 5000,
            "prices": {
                "USD": {"amount_cents": 4900, "stripe_price_id": "price_test_pro_usd"},
            },
        },
    )
    return plan


def _checkout_session_completed_event(*, tenant, user, plan, event_id="evt_phase1_001"):
    """Build a Stripe-shaped event dict the webhook view will accept."""
    body = {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_phase1_001",
                "subscription": "sub_phase1_001",
                "customer": "cus_phase1_001",
                "metadata": {
                    "tenant_id": str(tenant.pk),
                    "user_id": str(user.pk),
                    "plan_id": str(plan.pk),
                    "region": tenant.region,
                },
            }
        },
    }
    return _wrap_event_dict(body)


def _subscription_updated_event(*, sub_id, status_="active", event_id="evt_phase1_sub_001"):
    body = {
        "id": event_id,
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": sub_id,
                "customer": "cus_phase1_001",
                "status": status_,
                "current_period_start": int(datetime(2026, 5, 1, tzinfo=UTC).timestamp()),
                "current_period_end": int(datetime(2026, 6, 1, tzinfo=UTC).timestamp()),
                "cancel_at_period_end": False,
                "metadata": {},
            }
        },
    }
    return _wrap_event_dict(body)


class _FakeEvent:
    """Mimics a `stripe.Event` object: dict-like with `to_dict()`."""

    def __init__(self, body):
        self._body = body

    def __getitem__(self, key):
        return self._body[key]

    def get(self, key, default=None):
        return self._body.get(key, default)

    def to_dict(self):
        return self._body


def _wrap_event_dict(body):
    return _FakeEvent(body)


def _post_webhook(client, event, sig_header="t=1,v1=fake"):
    return client.post(
        "/api/webhooks/stripe/",
        data="{}",
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE=sig_header,
    )


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_phase1_test")  # noqa: S106
def test_webhook_valid_signature_processes_checkout_session_completed(restore_public, coach, plan):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    WebhookEvent.objects.filter(provider="stripe").delete()
    client = APIClient()

    event = _checkout_session_completed_event(tenant=tenant, user=coach, plan=plan)
    with patch("stripe.Webhook.construct_event", return_value=event):
        response = _post_webhook(client, event)

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["received"] is True
    assert body["handled"] is True

    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.provider == "stripe"
    assert sub.provider_subscription_id == "sub_phase1_001"
    assert sub.provider_customer_id == "cus_phase1_001"
    assert sub.status == PlatformSubscription.STATUS_ACTIVE
    assert sub.plan_id == plan.pk

    tenant.refresh_from_db()
    assert tenant.plan_id == plan.pk

    coach.refresh_from_db()
    assert coach.payment_customer_id == "cus_phase1_001"


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_phase1_test")  # noqa: S106
def test_webhook_invalid_signature_returns_400(restore_public):
    client = APIClient()
    with patch(
        "stripe.Webhook.construct_event",
        side_effect=stripe.error.SignatureVerificationError("bad", "sig"),
    ):
        response = client.post(
            "/api/webhooks/stripe/",
            data="{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=invalid",
        )

    assert response.status_code == 400, response.content
    assert response.json()["error"] == "BAD_SIGNATURE"


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_phase1_test")  # noqa: S106
def test_webhook_duplicate_event_returns_200_no_dup_payment(restore_public, coach, plan):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    WebhookEvent.objects.filter(provider="stripe").delete()
    client = APIClient()

    event = _checkout_session_completed_event(tenant=tenant, user=coach, plan=plan, event_id="evt_phase1_dup")

    with patch("stripe.Webhook.construct_event", return_value=event):
        first = _post_webhook(client, event)
        second = _post_webhook(client, event)

    assert first.status_code == 200, first.content
    assert second.status_code == 200, second.content
    assert second.json()["duplicate"] is True
    assert WebhookEvent.objects.filter(provider_event_id="evt_phase1_dup").count() == 1


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_phase1_test")  # noqa: S106
def test_webhook_for_subscription_updated_updates_status(restore_public, coach, plan):
    tenant = restore_public
    PlatformSubscription.objects.filter(tenant=tenant).delete()
    WebhookEvent.objects.filter(provider="stripe").delete()
    # Seed an active subscription so the update can find it.
    PlatformSubscription.objects.create(
        tenant=tenant,
        user=coach,
        plan=plan,
        provider="stripe",
        provider_subscription_id="sub_phase1_existing",
        provider_customer_id="cus_phase1_existing",
        status=PlatformSubscription.STATUS_ACTIVE,
    )
    client = APIClient()

    event = _subscription_updated_event(sub_id="sub_phase1_existing", status_="past_due")
    with patch("stripe.Webhook.construct_event", return_value=event):
        response = _post_webhook(client, event)

    assert response.status_code == 200, response.content
    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.status == PlatformSubscription.STATUS_PAST_DUE
    assert sub.current_period_end is not None


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_phase1_test")  # noqa: S106
def test_webhook_unknown_event_type_returns_200_unhandled(restore_public):
    WebhookEvent.objects.filter(provider="stripe").delete()
    client = APIClient()
    event = _wrap_event_dict(
        {
            "id": "evt_phase1_unknown",
            "type": "customer.tax_id.created",
            "data": {"object": {}},
        }
    )
    with patch("stripe.Webhook.construct_event", return_value=event):
        response = _post_webhook(client, event)
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["received"] is True
    assert body["handled"] is False

    # Webhook row exists with processed_at set.
    we = WebhookEvent.objects.get(provider_event_id="evt_phase1_unknown")
    assert we.processed_at is not None
