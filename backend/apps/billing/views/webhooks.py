"""Provider webhook endpoints.

Mounted at `/api/webhooks/<provider>/` outside the `/api/v1/` prefix so it
escapes `TenantJWTAuthentication`. Runs in the public schema (region +
tenant middleware skip `/api/webhooks/*`).

Phase 1 ships `POST /api/webhooks/stripe/`. Acknowledged but not yet fully
handled: `customer.subscription.deleted`, `invoice.payment_failed` — those are
Phase 2.
"""

from __future__ import annotations

import json
import logging
import traceback
from datetime import UTC, datetime
from decimal import Decimal

from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.accounts.models import User
from apps.billing.providers.stripe_provider import StripeProvider
from apps.billing.providers.types import InvalidWebhookSignature
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant, WebhookEvent

logger = logging.getLogger(__name__)

_STRIPE_HANDLED = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "invoice.paid",
    # Acknowledged-but-deferred (Phase 2):
    "customer.subscription.deleted",
    "invoice.payment_failed",
}


def _ts_to_dt(ts):
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=UTC)


def _resolve_tenant(metadata: dict) -> Tenant | None:
    tid = metadata.get("tenant_id") if isinstance(metadata, dict) else None
    if not tid:
        return None
    try:
        return Tenant.objects.get(pk=int(tid))
    except (Tenant.DoesNotExist, ValueError, TypeError):
        return None


def _resolve_user(metadata: dict) -> User | None:
    uid = metadata.get("user_id") if isinstance(metadata, dict) else None
    if not uid:
        return None
    try:
        return User.objects.get(pk=int(uid))
    except (User.DoesNotExist, ValueError, TypeError):
        return None


def _resolve_plan(metadata: dict) -> PlatformPlan | None:
    pid = metadata.get("plan_id") if isinstance(metadata, dict) else None
    if not pid:
        return None
    try:
        return PlatformPlan.objects.get(pk=int(pid))
    except (PlatformPlan.DoesNotExist, ValueError, TypeError):
        return None


def _upsert_subscription_from_event(*, tenant, user, plan, session_obj, subscription_obj):
    """Create or update PlatformSubscription from a checkout.session.completed
    event. `subscription_obj` may be None if the event only carries a
    subscription id — we look up the subscription on Stripe's side separately
    in `customer.subscription.created/updated` events. Here we only set what we
    have.
    """
    provider_sub_id = ""
    provider_cust_id = ""
    if session_obj is not None:
        provider_sub_id = session_obj.get("subscription") or ""
        provider_cust_id = session_obj.get("customer") or ""

    period_start = None
    period_end = None
    sub_status = PlatformSubscription.STATUS_ACTIVE
    if subscription_obj is not None:
        period_start = _ts_to_dt(subscription_obj.get("current_period_start"))
        period_end = _ts_to_dt(subscription_obj.get("current_period_end"))
        raw_status = subscription_obj.get("status", "active")
        sub_status = _map_stripe_status(raw_status)

    sub, _ = PlatformSubscription.objects.update_or_create(
        tenant=tenant,
        defaults={
            "user": user,
            "plan": plan,
            "status": sub_status,
            "provider": "stripe",
            "provider_subscription_id": provider_sub_id,
            "provider_customer_id": provider_cust_id,
            "current_period_start": period_start,
            "current_period_end": period_end,
        },
    )

    # Mirror plan on Tenant so the rest of the platform's plan-based code paths
    # (quota gates, fee percentage) see the upgrade.
    if tenant.plan_id != plan.pk:
        Tenant.objects.filter(pk=tenant.pk).update(plan=plan)

    # Cache the Stripe customer on the user if not present.
    if provider_cust_id and not user.payment_customer_id:
        User.objects.filter(pk=user.pk).update(payment_customer_id=provider_cust_id)

    return sub


def _map_stripe_status(stripe_status: str) -> str:
    mapping = {
        "active": PlatformSubscription.STATUS_ACTIVE,
        "trialing": PlatformSubscription.STATUS_ACTIVE,
        "past_due": PlatformSubscription.STATUS_PAST_DUE,
        "unpaid": PlatformSubscription.STATUS_PAST_DUE,
        "canceled": PlatformSubscription.STATUS_CANCELED,
        "incomplete": PlatformSubscription.STATUS_INCOMPLETE,
        "incomplete_expired": PlatformSubscription.STATUS_CANCELED,
    }
    return mapping.get(stripe_status, PlatformSubscription.STATUS_INCOMPLETE)


def _handle_checkout_session_completed(event, webhook_event):
    session = event["data"]["object"]
    metadata = session.get("metadata") or {}
    tenant = _resolve_tenant(metadata)
    user = _resolve_user(metadata)
    plan = _resolve_plan(metadata)
    if not (tenant and user and plan):
        webhook_event.processing_error = f"Could not resolve tenant/user/plan from metadata={metadata}"
        webhook_event.save(update_fields=["processing_error"])
        logger.warning(
            "checkout.session.completed missing metadata refs: tenant=%s user=%s plan=%s",
            tenant,
            user,
            plan,
        )
        return
    _upsert_subscription_from_event(
        tenant=tenant,
        user=user,
        plan=plan,
        session_obj=session,
        subscription_obj=None,
    )


def _handle_subscription_event(event):
    """Handle customer.subscription.{created,updated}.

    Looks up our PlatformSubscription row by `provider_subscription_id`; if
    missing, also tries `metadata.tenant_id` so a delayed event still lands.
    """
    sub_obj = event["data"]["object"]
    metadata = sub_obj.get("metadata") or {}
    provider_sub_id = sub_obj.get("id", "")
    provider_cust_id = sub_obj.get("customer", "")
    mapped_status = _map_stripe_status(sub_obj.get("status", ""))
    period_start = _ts_to_dt(sub_obj.get("current_period_start"))
    period_end = _ts_to_dt(sub_obj.get("current_period_end"))
    cancel_at_period_end = bool(sub_obj.get("cancel_at_period_end"))

    sub = None
    if provider_sub_id:
        sub = PlatformSubscription.objects.filter(provider="stripe", provider_subscription_id=provider_sub_id).first()
    if sub is None:
        tenant = _resolve_tenant(metadata)
        if tenant is None:
            logger.warning(
                "subscription event for sub=%s missing tenant_id metadata; ignoring",
                provider_sub_id,
            )
            return
        user = _resolve_user(metadata) or User.objects.filter(email=tenant.owner_email).first()
        plan = _resolve_plan(metadata) or tenant.plan
        if user is None or plan is None:
            logger.warning(
                "subscription event for sub=%s could not resolve user/plan; ignoring",
                provider_sub_id,
            )
            return
        PlatformSubscription.objects.update_or_create(
            tenant=tenant,
            defaults={
                "user": user,
                "plan": plan,
                "provider": "stripe",
                "provider_subscription_id": provider_sub_id,
                "provider_customer_id": provider_cust_id,
                "status": mapped_status,
                "current_period_start": period_start,
                "current_period_end": period_end,
                "cancel_at_period_end": cancel_at_period_end,
            },
        )
        Tenant.objects.filter(pk=tenant.pk).update(plan=plan)
        return

    sub.status = mapped_status
    sub.current_period_start = period_start
    sub.current_period_end = period_end
    sub.cancel_at_period_end = cancel_at_period_end
    if provider_cust_id:
        sub.provider_customer_id = provider_cust_id
    sub.save(
        update_fields=[
            "status",
            "current_period_start",
            "current_period_end",
            "cancel_at_period_end",
            "provider_customer_id",
            "updated_at",
        ]
    )


def _handle_invoice_paid(event):
    """Extend period_end on the PlatformSubscription and record a Payment row.

    The Payment model lives in the tenant schema, so we have to switch schemas
    via `tenant_context(...)` to insert one. We do this defensively — if the
    schema lookup fails we still update the subscription period and return
    silently.
    """
    invoice = event["data"]["object"]
    sub_id = invoice.get("subscription") or ""
    if not sub_id:
        return

    sub = PlatformSubscription.objects.filter(provider="stripe", provider_subscription_id=sub_id).first()
    if sub is None:
        logger.info("invoice.paid for unknown sub=%s; nothing to do", sub_id)
        return

    new_period_end = _ts_to_dt(invoice.get("period_end"))
    if new_period_end:
        sub.current_period_end = new_period_end
    if sub.status == PlatformSubscription.STATUS_PAST_DUE:
        sub.status = PlatformSubscription.STATUS_ACTIVE
    sub.save()

    # Create a Payment row in the tenant schema.
    amount_cents = invoice.get("amount_paid") or invoice.get("amount_due") or 0
    currency = (invoice.get("currency") or "USD").upper()
    provider_payment_id = invoice.get("payment_intent") or invoice.get("id") or ""

    try:
        tenant = sub.tenant
        with tenant_context(tenant):
            from apps.billing.models import Payment

            Payment.objects.create(
                student=sub.user,
                payment_type="subscription",
                status="completed",
                amount=Decimal(amount_cents) / Decimal(100),
                platform_fee=Decimal("0.00"),
                submerchant_payout=Decimal("0.00"),
                currency=currency,
                provider="stripe",
                provider_payment_id=provider_payment_id,
                platform_subscription_id=sub.pk,
                metadata={"invoice_id": invoice.get("id", "")},
            )
    except Exception:  # noqa: BLE001 — payment record is bookkeeping, not load-bearing
        logger.exception(
            "Failed to record platform-subscription Payment for sub=%s; subscription state updated regardless",
            sub_id,
        )


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def stripe_webhook(request):
    """Receive Stripe events. Public-schema, no auth.

    Order of operations:
      1. Verify the Stripe-Signature header (400 on failure).
      2. Insert WebhookEvent — IntegrityError on the unique constraint means
         we've already processed this event (replay). Return 200 fast-path.
      3. Inside `transaction.atomic()`, dispatch by event type. On success,
         stamp `processed_at`; on exception, record the traceback and re-raise
         so Stripe retries (500 → retry policy).
    """
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")

    try:
        event = StripeProvider().verify_webhook_signature(payload, sig_header)
    except InvalidWebhookSignature as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        return Response(
            {"error": "BAD_SIGNATURE"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # `event` is a Stripe object (StripeEvent). Convert to a plain dict for
    # storage in WebhookEvent.payload. The `to_dict()` method exists on stripe
    # objects; falling back to json round-trip for unusual fakes in tests.
    try:
        event_dict = event.to_dict()  # type: ignore[attr-defined]
    except AttributeError:
        try:
            event_dict = json.loads(json.dumps(event, default=str))
        except (TypeError, ValueError):
            event_dict = dict(event)

    event_id = event_dict.get("id") or ""
    event_type = event_dict.get("type") or ""

    # Webhook bodies land on the public-schema connection because the tenant
    # middleware short-circuits for `/api/webhooks/*`. Be defensive: force
    # public schema explicitly so a misconfigured middleware doesn't bury the
    # WebhookEvent in a tenant schema.
    connection.set_schema_to_public()

    # Wrap the create() in its own atomic block so an IntegrityError doesn't
    # poison any outer transaction (which pytest provides when run with
    # `transaction=False` mode for db tests).
    try:
        with transaction.atomic():
            webhook_event = WebhookEvent.objects.create(
                provider="stripe",
                provider_event_id=event_id,
                event_type=event_type,
                payload=event_dict,
            )
    except IntegrityError:
        logger.info("Duplicate Stripe webhook event ignored: %s", event_id)
        return Response(
            {"received": True, "duplicate": True},
            status=status.HTTP_200_OK,
        )

    if event_type not in _STRIPE_HANDLED:
        webhook_event.processed_at = timezone.now()
        webhook_event.save(update_fields=["processed_at"])
        return Response(
            {"received": True, "handled": False, "event_type": event_type},
            status=status.HTTP_200_OK,
        )

    try:
        with transaction.atomic():
            if event_type == "checkout.session.completed":
                _handle_checkout_session_completed(event_dict, webhook_event)
            elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
                _handle_subscription_event(event_dict)
            elif event_type == "invoice.paid":
                _handle_invoice_paid(event_dict)
            else:
                # Acknowledged Phase-2 events — log only.
                logger.info("Acknowledged Stripe event (Phase 2 will handle): %s", event_type)

        webhook_event.processed_at = timezone.now()
        webhook_event.save(update_fields=["processed_at"])
    except Exception:  # noqa: BLE001 — record + re-raise for Stripe retry
        webhook_event.processing_error = traceback.format_exc()
        webhook_event.save(update_fields=["processing_error"])
        logger.exception("Stripe webhook handler raised for event=%s", event_id)
        raise

    return Response(
        {"received": True, "handled": True, "event_type": event_type},
        status=status.HTTP_200_OK,
    )
