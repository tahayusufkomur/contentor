from __future__ import annotations

import logging

from apps.core.models import Domain

from .models import CustomDomain, DomainSubscription
from .tasks import provision_domain, renew_domain

logger = logging.getLogger(__name__)

_HANDLED = {
    "checkout.session.completed",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.deleted",
}


def _custom_domain_id(obj: dict) -> str:
    return (obj.get("metadata") or {}).get("domains_custom_domain_id", "")


def handle_domain_event(event: dict) -> bool:
    """Return True if this event belongs to a domain subscription and was handled."""
    etype = event.get("type", "")
    if etype not in _HANDLED:
        return False
    obj = event.get("data", {}).get("object", {})
    cd_id = _custom_domain_id(obj)
    if not cd_id:
        return False
    cd = CustomDomain.objects.filter(pk=cd_id).first()
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

    if etype == "invoice.paid":
        # First invoice is paid at checkout; treat subsequent paid invoices as renewals.
        if cd.provisioning_status == "live":
            renew_domain.delay(cd.id)
        return True

    if etype in ("invoice.payment_failed", "customer.subscription.deleted"):
        Domain.objects.filter(domain=cd.domain, tenant=cd.tenant).delete()
        cd.provisioning_status = "lapsed"
        cd.save(update_fields=["provisioning_status", "updated_at"])
        sub.status = "canceled"
        sub.save(update_fields=["status", "updated_at"])
        return True

    return False
