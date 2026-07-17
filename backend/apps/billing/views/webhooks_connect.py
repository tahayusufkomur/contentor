"""Marketplace / Connect-side (student -> coach) Stripe webhook handlers.

These act on connected-account events (direct charges + coach subscription
plans) and write into the tenant schema via `tenant_context`.

NOTE: `apps.domains.webhooks` imports from `apps.billing.views.webhooks` (see
`domains/webhooks.py:30`), so this module — like `webhooks_platform` — must
never import from `apps.domains`; that one-way edge is preserved by keeping
`handle_domain_event` imported only in `webhooks.py`.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.core.models import Tenant

from .webhooks_common import _invoice_period_end, _invoice_subscription_id, _sub_period
from .webhooks_platform import _resolve_tenant

logger = logging.getLogger(__name__)


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
