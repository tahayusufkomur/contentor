from __future__ import annotations

import logging

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
        sub.status = "active"
        sub.provider_subscription_id = obj.get("subscription", "") or sub.provider_subscription_id
        sub.provider_customer_id = obj.get("customer", "") or sub.provider_customer_id
        sub.save(update_fields=["status", "provider_subscription_id", "provider_customer_id", "updated_at"])
        provision_domain.delay(cd.id)
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
