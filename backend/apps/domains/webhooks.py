from __future__ import annotations

import logging

from django.db import transaction

from apps.core.models import Domain

from .models import CustomDomain, DomainSubscription
from .tasks import provision_domain, renew_domain

logger = logging.getLogger(__name__)

_HANDLED = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
}


def _subscription_id_from_obj(event_type: str, obj: dict) -> str:
    """Extract the Stripe subscription id from an event object.

    For subscription events the id is the object id itself.
    For invoice events it lives at ``subscription`` (legacy) or
    ``parent.subscription_details.subscription`` (newer API versions).
    Do NOT import from apps.billing.views.webhooks — that module imports us.
    """
    if event_type.startswith("customer.subscription."):
        return obj.get("id") or ""
    # invoice.* path
    sub = obj.get("subscription")
    if isinstance(sub, dict):
        return sub.get("id") or ""
    if sub:
        return sub
    details = (obj.get("parent") or {}).get("subscription_details") or {}
    sub = details.get("subscription")
    if isinstance(sub, dict):
        return sub.get("id") or ""
    return sub or ""


def _resolve_custom_domain(event_type: str, obj: dict) -> CustomDomain | None:
    """Resolve a CustomDomain from an event object.

    Tries, in order:
    1. ``domains_custom_domain_id`` in metadata (works for checkout session +
       subscription objects).
    2. Subscription id → DomainSubscription lookup (works for invoice events
       whose metadata is absent / on the subscription, not the invoice).
    """
    cd_id = (obj.get("metadata") or {}).get("domains_custom_domain_id", "")
    if cd_id:
        return CustomDomain.objects.filter(pk=cd_id).first()

    sub_id = _subscription_id_from_obj(event_type, obj)
    if not sub_id:
        return None
    ds = DomainSubscription.objects.filter(provider_subscription_id=sub_id).first()
    return ds.custom_domain if ds is not None else None


def _flat_id(value) -> str:
    """A Stripe ref that may arrive expanded (object) or as a bare id."""
    if isinstance(value, dict):
        return value.get("id") or ""
    return value or ""


def activate_domain_checkout(cd: CustomDomain, *, subscription_id: str = "", customer_id: str = "") -> None:
    """The one checkout-completed transition: activate the subscription and
    enqueue provisioning. Shared by the webhook, the return-from-checkout sync
    probe, and the dev bypass path, so whichever lands second is a no-op.
    """
    sub, _ = DomainSubscription.objects.get_or_create(tenant=cd.tenant, custom_domain=cd)
    sub.status = "active"
    sub.provider_subscription_id = subscription_id or sub.provider_subscription_id
    sub.provider_customer_id = customer_id or sub.provider_customer_id
    sub.save(update_fields=["status", "provider_subscription_id", "provider_customer_id", "updated_at"])
    # Enqueue only after the surrounding transaction commits, so a later
    # rollback can't leave a provisioning task running for a domain whose
    # activation was undone.
    transaction.on_commit(lambda: provision_domain.delay(cd.id))


def sync_domain_checkout_session(tenant, session_id: str) -> bool:
    """Domain twin of billing's sync_platform_checkout_session: pull the
    Checkout Session ourselves instead of waiting for the webhook — local dev
    receives none, and prod's can land after the redirect. Applies the same
    guards and the same transition as handle_domain_event, so whichever path
    lands second is a no-op. Returns True when a domain was activated.
    """
    from django.conf import settings

    if settings.DOMAINS_BYPASS_ENABLED:
        return False  # bypass sessions are fake ids; the bypass path activates directly

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:  # noqa: BLE001 — any retrieve failure just means "not synced"
        logger.warning("domain checkout sync: retrieve failed session=%s tenant=%s: %s", session_id, tenant.slug, exc)
        return False

    cd_id = (session.get("metadata") or {}).get("domains_custom_domain_id", "")
    if not cd_id:
        return False  # not a domain session (e.g. a platform-plan session id)
    cd = CustomDomain.objects.filter(pk=cd_id, tenant=tenant).first()
    if cd is None:
        logger.warning("domain checkout sync: tenant mismatch session=%s tenant=%s", session_id, tenant.slug)
        return False
    # The webhook can trust its event; a session retrieved by id must prove
    # it was actually paid before we activate anything.
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        return False
    activate_domain_checkout(
        cd,
        subscription_id=_flat_id(session.get("subscription")),
        customer_id=_flat_id(session.get("customer")),
    )
    return True


def handle_domain_event(event: dict) -> bool:
    """Return True if this event belongs to a domain subscription and was handled."""
    etype = event.get("type", "")
    if etype not in _HANDLED:
        return False
    obj = event.get("data", {}).get("object", {})
    cd = _resolve_custom_domain(etype, obj)
    if cd is None:
        return False
    sub, _ = DomainSubscription.objects.get_or_create(tenant=cd.tenant, custom_domain=cd)

    if etype == "checkout.session.completed":
        activate_domain_checkout(
            cd,
            subscription_id=_flat_id(obj.get("subscription")),
            customer_id=_flat_id(obj.get("customer")),
        )
        return True

    if etype in ("customer.subscription.created", "customer.subscription.updated"):
        sub.provider_subscription_id = obj.get("id") or sub.provider_subscription_id
        customer = obj.get("customer", "")
        if customer:
            sub.provider_customer_id = customer
        stripe_status = obj.get("status", "")
        if stripe_status in ("active", "trialing"):
            sub.status = "active"
        sub.save(update_fields=["status", "provider_subscription_id", "provider_customer_id", "updated_at"])
        return True

    if etype == "customer.subscription.deleted":
        Domain.objects.filter(domain=cd.domain, tenant=cd.tenant).delete()
        cd.provisioning_status = "lapsed"
        cd.save(update_fields=["provisioning_status", "updated_at"])
        sub.status = "canceled"
        sub.save(update_fields=["status", "updated_at"])
        return True

    if etype == "invoice.paid":
        if cd.provisioning_status == "live":
            renew_domain.delay(cd.id)
        return True

    if etype == "invoice.payment_failed":
        sub.status = "past_due"
        sub.save(update_fields=["status", "updated_at"])
        return True

    return False
