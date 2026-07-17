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

from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.providers.stripe_provider import StripeProvider
from apps.billing.providers.types import InvalidWebhookSignature
from apps.core.models import WebhookEvent
from apps.domains.webhooks import handle_domain_event

from .webhooks_common import (
    _invoice_period_end,  # noqa: F401  (re-exported: tests import payload helpers from here)
    _invoice_subscription_id,  # noqa: F401
    _sub_period,  # noqa: F401
)
from .webhooks_connect import (
    _connected_tenant,
    _handle_account_updated,
    _handle_marketplace_checkout_completed,
    _handle_marketplace_invoice_failed,
    _handle_marketplace_invoice_paid,
    _handle_marketplace_subscription_checkout,
    _handle_marketplace_subscription_deleted,
    _handle_marketplace_subscription_event,
)
from .webhooks_platform import (
    _handle_invoice_paid,
    _handle_platform_subscription_deleted,
    _handle_subscription_event,
    _resolve_plan,
    _resolve_tenant,
    _resolve_user,
    _upsert_subscription_from_event,
    sync_platform_checkout_session,  # noqa: F401  (re-exported: onboarding + tests import it from here)
)

logger = logging.getLogger(__name__)

_STRIPE_HANDLED = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "invoice.paid",
    # Connect (marketplace) — coach payout onboarding readiness (Phase B):
    "account.updated",
    # Acknowledged-but-deferred (Phase 2):
    "customer.subscription.deleted",
    "invoice.payment_failed",
}


def _handle_checkout_session_completed(event, webhook_event):
    session = event["data"]["object"]
    metadata = session.get("metadata") or {}
    # Marketplace (student→coach) carries `payment_id` (one-time) or
    # `subscription_plan_id` (recurring); platform (coach→Contentor) carries `plan_id`.
    if metadata.get("payment_id"):
        _handle_marketplace_checkout_completed(event)
        return
    if metadata.get("subscription_plan_id"):
        _handle_marketplace_subscription_checkout(event)
        return
    # Only activate the plan once the session is actually paid. Async/delayed
    # payment methods can complete the session with payment_status "unpaid" —
    # granting the plan then would hand out a paid plan for free.
    payment_status = session.get("payment_status")
    if payment_status not in ("paid", "no_payment_required"):
        logger.info(
            "platform checkout.session.completed not paid (payment_status=%s); skipping activation",
            payment_status,
        )
        return
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

    # Dedup semantics (critical): a WebhookEvent row must NOT mark an event as
    # "seen" until it has actually been PROCESSED. Otherwise a transiently-failed
    # event (500 → Stripe retry) would hit the duplicate fast-path on retry and
    # be silently dropped forever. So:
    #   - brand-new row            -> process it
    #   - existing, processed_at set -> genuine duplicate, ack 200
    #   - existing, not processed    -> a prior attempt failed; REPROCESS it
    # Wrap create() in its own atomic block so the IntegrityError doesn't poison
    # any outer transaction (pytest provides one in `transaction=False` db tests).
    try:
        with transaction.atomic():
            webhook_event = WebhookEvent.objects.create(
                provider="stripe",
                provider_event_id=event_id,
                event_type=event_type,
                payload=event_dict,
            )
    except IntegrityError:
        existing = WebhookEvent.objects.filter(provider="stripe", provider_event_id=event_id).first()
        if existing is None or existing.processed_at is not None:
            logger.info("Duplicate Stripe webhook event ignored: %s", event_id)
            return Response(
                {"received": True, "duplicate": True},
                status=status.HTTP_200_OK,
            )
        webhook_event = existing
        logger.info("Reprocessing previously-failed Stripe webhook event: %s", event_id)

    if event_type not in _STRIPE_HANDLED:
        webhook_event.processed_at = timezone.now()
        webhook_event.save(update_fields=["processed_at"])
        return Response(
            {"received": True, "handled": False, "event_type": event_type},
            status=status.HTTP_200_OK,
        )

    logger.info("stripe webhook received type=%s id=%s", event_type, event_id)
    try:
        with transaction.atomic():
            if handle_domain_event(event_dict):
                logger.info("stripe webhook handled by domains app type=%s id=%s", event_type, event_id)
            else:
                # Connect events from a coach's connected account (marketplace,
                # student→coach) carry an `account` field and act on the tenant
                # `Subscription`; platform events (coach→Contentor) have none and act
                # on `PlatformSubscription`.
                connected = _connected_tenant(event_dict)
                if event_type == "checkout.session.completed":
                    _handle_checkout_session_completed(event_dict, webhook_event)
                elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
                    if connected:
                        _handle_marketplace_subscription_event(event_dict, connected)
                    else:
                        _handle_subscription_event(event_dict)
                elif event_type == "customer.subscription.deleted":
                    if connected:
                        _handle_marketplace_subscription_deleted(event_dict, connected)
                    else:
                        _handle_platform_subscription_deleted(event_dict)
                elif event_type == "invoice.paid":
                    if connected:
                        _handle_marketplace_invoice_paid(event_dict, connected)
                    else:
                        _handle_invoice_paid(event_dict)
                elif event_type == "invoice.payment_failed":
                    if connected:
                        _handle_marketplace_invoice_failed(event_dict, connected)
                    else:
                        logger.info("Acknowledged platform invoice.payment_failed (deferred)")
                elif event_type == "account.updated":
                    _handle_account_updated(event_dict)
                else:
                    logger.info("Acknowledged Stripe event (no handler): %s", event_type)

        webhook_event.processed_at = timezone.now()
        # Clear any error from a prior failed attempt now that it succeeded.
        webhook_event.processing_error = ""
        webhook_event.save(update_fields=["processed_at", "processing_error"])
        logger.info("stripe webhook processed type=%s id=%s", event_type, event_id)
    except Exception:  # noqa: BLE001 — record + re-raise for Stripe retry
        webhook_event.processing_error = traceback.format_exc()
        webhook_event.save(update_fields=["processing_error"])
        logger.exception("Stripe webhook handler raised for event=%s", event_id)
        raise

    return Response(
        {"received": True, "handled": True, "event_type": event_type},
        status=status.HTTP_200_OK,
    )
