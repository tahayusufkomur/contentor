"""Platform-side (coach -> Contentor) Stripe webhook handlers.

PlatformSubscription is public-schema, so these functions run without a
tenant_context switch except where they touch the tenant-schema Payment model.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

from .webhooks_common import _invoice_period_end, _invoice_subscription_id, _sub_period

logger = logging.getLogger(__name__)


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


def sync_platform_checkout_session(tenant, session_id: str) -> bool:
    """Activate a platform plan by pulling the Checkout Session ourselves.

    The return-from-checkout path (wizard `?upgraded=1&session_id=…`) calls
    this instead of waiting for `checkout.session.completed`: local dev
    receives no webhooks unless `make stripe-listen` is running, and even in
    prod the redirect can beat the webhook. Applies the same guards and the
    same upsert as the webhook handler, so whichever path lands second is a
    no-op. Returns True when a subscription was upserted.
    """
    from apps.billing.providers.stripe_provider import retrieve_checkout_session
    from apps.billing.providers.types import ProviderError

    try:
        session = retrieve_checkout_session(session_id)
    except ProviderError as exc:
        logger.warning("checkout sync: retrieve failed session=%s tenant=%s: %s", session_id, tenant.slug, exc)
        return False

    metadata = session.get("metadata") or {}
    if str(metadata.get("tenant_id") or "") != str(tenant.pk):
        logger.warning("checkout sync: tenant mismatch session=%s tenant=%s", session_id, tenant.slug)
        return False
    if session.get("mode") != "subscription" or metadata.get("payment_id") or metadata.get("subscription_plan_id"):
        return False  # marketplace sessions are webhook-only territory
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        logger.info(
            "checkout sync: session not paid (payment_status=%s) session=%s",
            session.get("payment_status"),
            session_id,
        )
        return False
    user = _resolve_user(metadata)
    plan = _resolve_plan(metadata)
    if not (user and plan):
        logger.warning("checkout sync: unresolved metadata refs session=%s metadata=%s", session_id, dict(metadata))
        return False

    # `expand=["subscription"]` inlines the subscription object where the
    # webhook event carries only its id — flatten back to the id for the
    # session dict and pass the object separately so period/status land too.
    session = dict(session)
    subscription_obj = session.get("subscription")
    if isinstance(subscription_obj, str) or subscription_obj is None:
        subscription_obj = None
    else:
        session["subscription"] = subscription_obj.get("id") or ""
    _upsert_subscription_from_event(
        tenant=tenant,
        user=user,
        plan=plan,
        session_obj=session,
        subscription_obj=subscription_obj,
    )
    return True


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


def _handle_platform_subscription_deleted(event):
    """customer.subscription.deleted (platform): the coach's subscription has
    actually ended (Stripe fires this at period end for cancel-at-period-end, or
    immediately for a hard cancel). Mark our PlatformSubscription canceled so the
    post_save signal reverts the tenant to the Free plan — otherwise a canceled
    coach keeps their paid plan forever."""
    sub_obj = event["data"]["object"]
    provider_sub_id = sub_obj.get("id") or ""
    if not provider_sub_id:
        logger.warning("platform subscription.deleted with no subscription id; ignoring")
        return
    sub = PlatformSubscription.objects.filter(provider="stripe", provider_subscription_id=provider_sub_id).first()
    if sub is None:
        logger.info("platform subscription.deleted for unknown sub=%s; nothing to do", provider_sub_id)
        return
    if sub.status != PlatformSubscription.STATUS_CANCELED:
        sub.status = PlatformSubscription.STATUS_CANCELED
        sub.cancel_at_period_end = False
        sub.save(update_fields=["status", "cancel_at_period_end", "updated_at"])
        logger.info("platform subscription %s canceled; tenant reverted to Free", provider_sub_id)


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
