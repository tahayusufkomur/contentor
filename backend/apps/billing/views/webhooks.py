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
from datetime import UTC, datetime, timedelta
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
from apps.domains.webhooks import handle_domain_event

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


def _ts_to_dt(ts):
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=UTC)


def _sub_period(sub_obj):
    """(start, end) datetimes for a Stripe Subscription payload, across API versions.

    Pre-2025 versions expose `current_period_start/end` at the top level; newer
    versions (e.g. clover) moved them onto each subscription item.
    """
    start = sub_obj.get("current_period_start")
    end = sub_obj.get("current_period_end")
    if start is None or end is None:
        items = (sub_obj.get("items") or {}).get("data") or []
        if items:
            start = start if start is not None else items[0].get("current_period_start")
            end = end if end is not None else items[0].get("current_period_end")
    return _ts_to_dt(start), _ts_to_dt(end)


def _invoice_subscription_id(invoice) -> str:
    """Subscription id from an Invoice payload, across API versions.

    Legacy versions carry a top-level `subscription`; newer versions moved it to
    `parent.subscription_details.subscription` (and onto each line item).
    """
    sub = invoice.get("subscription")
    if isinstance(sub, dict):
        return sub.get("id") or ""
    if sub:
        return sub
    details = (invoice.get("parent") or {}).get("subscription_details") or {}
    sub = details.get("subscription")
    if isinstance(sub, dict):
        return sub.get("id") or ""
    return sub or ""


def _invoice_period_end(invoice):
    """Billing-period end from an Invoice payload.

    Prefer the first line item's period (the subscription's actual cycle); the
    top-level `period_end` is the invoice's own period and can equal creation
    time for the first invoice.
    """
    lines = (invoice.get("lines") or {}).get("data") or []
    if lines:
        period = lines[0].get("period") or {}
        if period.get("end"):
            return _ts_to_dt(period["end"])
    return _ts_to_dt(invoice.get("period_end"))


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
        period_start, period_end = _sub_period(subscription_obj)
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

    # Tenant.plan is mirrored automatically by the PlatformSubscription
    # post_save signal (apps.core.signals) — no manual mirror write needed.

    # Cache the Stripe customer on the user if not present.
    if provider_cust_id and not user.payment_customer_id:
        User.objects.filter(pk=user.pk).update(payment_customer_id=provider_cust_id)

    logger.info(
        "platform subscription upserted tenant=%s plan=%s status=%s sub=%s",
        tenant.slug,
        getattr(plan, "slug", plan.pk),
        sub_status,
        provider_sub_id or "-",
    )
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


def _resolve_tenant_for_connect(event, metadata):
    """Resolve the tenant for a connected-account (direct-charge) event.

    Connect events carry the connected account id in the top-level `account`
    field; resolve by `stripe_account_id`, falling back to `metadata.tenant_id`.
    """
    account_id = event.get("account") or ""
    if account_id:
        tenant = Tenant.objects.filter(stripe_account_id=account_id).first()
        if tenant is not None:
            return tenant
    return _resolve_tenant(metadata)


def _handle_marketplace_checkout_completed(event):
    """Complete a student→coach one-time payment (direct charge) and grant access.

    The `Payment` row lives in the tenant schema, so switch into it via
    `tenant_context`. Idempotent: a replay finds the payment already completed
    and no-ops.
    """
    session = event["data"]["object"]
    metadata = session.get("metadata") or {}
    payment_id = metadata.get("payment_id")
    tenant = _resolve_tenant_for_connect(event, metadata)
    if tenant is None or not payment_id:
        logger.warning(
            "marketplace checkout.session.completed missing tenant/payment_id: account=%s payment_id=%s",
            event.get("account"),
            payment_id,
        )
        return

    provider_payment_id = session.get("payment_intent") or session.get("id") or ""
    # Best-effort hosted receipt link for the buyer's order history.
    receipt_url = ""
    if event.get("account") and provider_payment_id.startswith("pi_"):
        from apps.billing.providers import connect

        receipt_url = connect.retrieve_receipt_url(account_id=event["account"], payment_intent_id=provider_payment_id)
    with tenant_context(tenant):
        from apps.billing.models import Payment
        from apps.billing.views.payments import grant_access_for_payment

        payment = Payment.objects.filter(pk=int(payment_id)).first()
        if payment is None:
            logger.warning("marketplace payment %s not found in tenant=%s", payment_id, tenant.slug)
            return
        if payment.status != "completed":
            payment.status = "completed"
            payment.provider = "stripe"
            payment.provider_payment_id = provider_payment_id
            if receipt_url:
                payment.metadata = {**(payment.metadata or {}), "receipt_url": receipt_url}
            payment.save(update_fields=["status", "provider", "provider_payment_id", "metadata"])
        grant_access_for_payment(payment)
        logger.info(
            "marketplace payment completed tenant=%s payment=%s amount=%s",
            tenant.slug,
            payment_id,
            getattr(payment, "amount", "?"),
        )


def _connected_tenant(event):
    """Return the tenant whose connected account this Connect event came from."""
    account_id = event.get("account") or ""
    if not account_id:
        return None
    return Tenant.objects.filter(stripe_account_id=account_id).first()


def _tenant_sub_status(stripe_status: str) -> str:
    """Map a Stripe subscription status to the tenant `Subscription` statuses."""
    return {
        "active": "active",
        "trialing": "active",
        "past_due": "past_due",
        "unpaid": "past_due",
        "incomplete": "past_due",
        "canceled": "expired",
        "incomplete_expired": "expired",
    }.get(stripe_status, "past_due")


def _upsert_tenant_subscription(
    tenant, *, provider_sub_id, provider_cust_id, metadata, sub_status, period_start, period_end, cancel_at_period_end
):
    """Create/update a tenant `Subscription` from a connected-account event.

    Runs inside the tenant schema. Keyed on `provider_subscription_id` so
    checkout.session.completed and customer.subscription.* converge on one row.
    """
    plan_id = metadata.get("subscription_plan_id")
    user_id = metadata.get("user_id")
    if not (provider_sub_id and plan_id and user_id):
        logger.warning("marketplace subscription event missing refs: sub=%s meta=%s", provider_sub_id, metadata)
        return
    from apps.billing.views.payments import tenant_currency

    billing_currency = tenant_currency(tenant)
    with tenant_context(tenant):
        from apps.billing.models import Subscription as TenantSub
        from apps.billing.models import SubscriptionPlan

        plan = SubscriptionPlan.objects.filter(pk=int(plan_id)).first()
        if plan is None:
            logger.warning("marketplace subscription for unknown plan=%s tenant=%s", plan_id, tenant.slug)
            return
        now = timezone.now()
        TenantSub.objects.update_or_create(
            provider="stripe",
            provider_subscription_id=provider_sub_id,
            defaults={
                "student_id": int(user_id),
                "plan": plan,
                "billing_amount": plan.price,
                "billing_currency": billing_currency,
                "status": sub_status,
                "provider_customer_id": provider_cust_id or "",
                "cancel_at_period_end": cancel_at_period_end,
                "current_period_start": period_start or now,
                # Fallback until the next subscription webhook carries real periods.
                "current_period_end": period_end or (now + timedelta(days=30 * (plan.billing_interval_months or 1))),
            },
        )
        logger.info(
            "marketplace subscription upserted tenant=%s plan=%s status=%s sub=%s",
            tenant.slug,
            plan.pk,
            sub_status,
            provider_sub_id,
        )


def _handle_marketplace_subscription_checkout(event):
    """checkout.session.completed (mode=subscription) for a student→coach plan."""
    session = event["data"]["object"]
    metadata = session.get("metadata") or {}
    tenant = _connected_tenant(event) or _resolve_tenant(metadata)
    if tenant is None:
        logger.warning("marketplace subscription checkout: unresolved tenant account=%s", event.get("account"))
        return
    _upsert_tenant_subscription(
        tenant,
        provider_sub_id=session.get("subscription") or "",
        provider_cust_id=session.get("customer") or "",
        metadata=metadata,
        sub_status="active",
        period_start=None,
        period_end=None,
        cancel_at_period_end=False,
    )


def _handle_marketplace_subscription_event(event, tenant):
    """customer.subscription.created/updated for a connected account."""
    sub_obj = event["data"]["object"]
    period_start, period_end = _sub_period(sub_obj)
    _upsert_tenant_subscription(
        tenant,
        provider_sub_id=sub_obj.get("id") or "",
        provider_cust_id=sub_obj.get("customer") or "",
        metadata=sub_obj.get("metadata") or {},
        sub_status=_tenant_sub_status(sub_obj.get("status", "")),
        period_start=period_start,
        period_end=period_end,
        cancel_at_period_end=bool(sub_obj.get("cancel_at_period_end")),
    )


def _handle_marketplace_subscription_deleted(event, tenant):
    """customer.subscription.deleted → expire the tenant Subscription."""
    sub_obj = event["data"]["object"]
    provider_sub_id = sub_obj.get("id") or ""
    with tenant_context(tenant):
        from apps.billing.models import Subscription as TenantSub

        sub = TenantSub.objects.filter(provider="stripe", provider_subscription_id=provider_sub_id).first()
        if sub is None:
            return
        sub.status = "expired"
        sub.cancelled_at = timezone.now()
        sub.save(update_fields=["status", "cancelled_at"])


def _invoice_subscription_metadata(invoice) -> dict:
    """The subscription's metadata as embedded on the invoice (new API: under
    `parent.subscription_details`; older: `subscription_details`)."""
    for container in (invoice.get("parent") or {}, invoice):
        details = container.get("subscription_details") or {}
        meta = details.get("metadata")
        if meta:
            return meta
    return {}


def _handle_marketplace_invoice_paid(event, tenant):
    """invoice.paid → extend the period, apply a pending plan change, record a Payment."""
    invoice = event["data"]["object"]
    provider_sub_id = _invoice_subscription_id(invoice)
    if not provider_sub_id:
        return
    with tenant_context(tenant):
        from apps.billing.models import Payment
        from apps.billing.models import Subscription as TenantSub

        sub = TenantSub.objects.filter(provider="stripe", provider_subscription_id=provider_sub_id).first()
        if sub is None:
            # First-invoice race: Stripe often delivers invoice.paid *before*
            # checkout.session.completed / customer.subscription.created, so the
            # row may not exist yet. Bootstrap it from the invoice's embedded
            # subscription metadata so the first charge is never dropped.
            _upsert_tenant_subscription(
                tenant,
                provider_sub_id=provider_sub_id,
                provider_cust_id=invoice.get("customer") or "",
                metadata=_invoice_subscription_metadata(invoice),
                sub_status="active",
                period_start=None,
                period_end=None,
                cancel_at_period_end=False,
            )
            sub = TenantSub.objects.filter(provider="stripe", provider_subscription_id=provider_sub_id).first()
        if sub is None:
            logger.warning("marketplace invoice.paid: unresolved subscription %s", provider_sub_id)
            return
        new_period_end = _invoice_period_end(invoice)
        if new_period_end:
            sub.current_period_end = new_period_end
        if sub.status == "past_due":
            sub.status = "active"
        fields = ["current_period_end", "status"]
        # Apply a scheduled plan change now that a new cycle has been billed.
        if sub.pending_plan_id:
            sub.plan_id = sub.pending_plan_id
            sub.billing_amount = sub.pending_plan.price
            sub.billing_currency = sub.pending_plan.currency
            sub.pending_plan = None
            fields += ["plan", "billing_amount", "billing_currency", "pending_plan"]
        sub.save(update_fields=fields)

        amount_cents = invoice.get("amount_paid") or invoice.get("amount_due") or 0
        Payment.objects.create(
            student_id=sub.student_id,
            payment_type="subscription",
            status="completed",
            amount=Decimal(amount_cents) / Decimal(100),
            platform_fee=Decimal("0.00"),
            submerchant_payout=Decimal("0.00"),
            currency=(invoice.get("currency") or sub.billing_currency or "USD").upper(),
            provider="stripe",
            provider_payment_id=invoice.get("payment_intent") or invoice.get("id") or "",
            subscription=sub,
            metadata={
                "invoice_id": invoice.get("id", ""),
                "receipt_url": invoice.get("hosted_invoice_url", ""),
            },
        )
        logger.info(
            "marketplace payment recorded tenant=%s sub=%s student=%s amount=%s",
            tenant.slug,
            provider_sub_id,
            sub.student_id,
            Decimal(amount_cents) / Decimal(100),
        )


def _handle_marketplace_invoice_failed(event, tenant):
    """invoice.payment_failed → mark the tenant Subscription past_due."""
    invoice = event["data"]["object"]
    provider_sub_id = _invoice_subscription_id(invoice)
    if not provider_sub_id:
        return
    with tenant_context(tenant):
        from apps.billing.models import Subscription as TenantSub

        TenantSub.objects.filter(provider="stripe", provider_subscription_id=provider_sub_id).update(status="past_due")


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
    period_start, period_end = _sub_period(sub_obj)
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
        # Tenant.plan mirrored by the PlatformSubscription post_save signal.
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
    sub_id = _invoice_subscription_id(invoice)
    if not sub_id:
        return

    sub = PlatformSubscription.objects.filter(provider="stripe", provider_subscription_id=sub_id).first()
    if sub is None:
        logger.info("invoice.paid for unknown sub=%s; nothing to do", sub_id)
        return

    new_period_end = _invoice_period_end(invoice)
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
            logger.info(
                "platform payment recorded tenant=%s sub=%s amount=%s %s",
                tenant.slug,
                sub_id,
                Decimal(amount_cents) / Decimal(100),
                currency,
            )
    except Exception:  # noqa: BLE001 — payment record is bookkeeping, not load-bearing
        logger.exception(
            "Failed to record platform-subscription Payment for sub=%s; subscription state updated regardless",
            sub_id,
        )


def _handle_account_updated(event):
    """Persist Connect payout-readiness from an `account.updated` event.

    Connect events carry the connected account id in the top-level `account`
    field; for `account.updated` the event object *is* that account. Resolve the
    tenant by `stripe_account_id`, falling back to `metadata.tenant_id`, then
    mirror `charges_enabled` / `payouts_enabled` onto the public-schema Tenant.
    """
    account = event["data"]["object"]
    account_id = account.get("id") or event.get("account") or ""
    if not account_id:
        return

    tenant = Tenant.objects.filter(stripe_account_id=account_id).first()
    if tenant is None:
        metadata = account.get("metadata") or {}
        tenant = _resolve_tenant(metadata)
        # First-seen account (created before we persisted the id, e.g. replay):
        # bind the id so future lookups resolve directly.
        if tenant is not None and not tenant.stripe_account_id:
            Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id=account_id)
    if tenant is None:
        logger.warning("account.updated for unknown connected account=%s; ignoring", account_id)
        return

    Tenant.objects.filter(pk=tenant.pk).update(
        stripe_charges_enabled=bool(account.get("charges_enabled")),
        stripe_payouts_enabled=bool(account.get("payouts_enabled")),
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
                        logger.info("Acknowledged platform subscription.deleted (deferred)")
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
