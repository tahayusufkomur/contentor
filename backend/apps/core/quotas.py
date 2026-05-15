"""Tenant quota helpers.

Phase 0: the `enforce_*` functions exist with the final signatures but only
check `tenant.is_subscription_active` and log the plan-limit lookup. They do
NOT yet enforce at call sites (Phase 3 wires them into the views/serializers
that mutate state) and they do NOT yet raise on over-quota.

`SubscriptionInactive` and `QuotaExceeded` are the canonical exceptions. The
DRF exception handler that maps these to 402 lands in Phase 3.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.core.models import Tenant

logger = logging.getLogger(__name__)


class BillingError(Exception):
    """Base for billing/quota errors."""


class SubscriptionInactive(BillingError):  # noqa: N818 — spec-defined name
    """Raised when a write is attempted against a tenant with no active sub."""

    code = "SUBSCRIPTION_INACTIVE"


class QuotaExceeded(BillingError):  # noqa: N818 — spec-defined name
    """Raised when an action would exceed a plan quota."""

    code = "QUOTA_EXCEEDED"

    def __init__(self, message: str, *, quota: str, limit: int, attempted: int):
        super().__init__(message)
        self.quota = quota
        self.limit = limit
        self.attempted = attempted


def _plan_limit(tenant: Tenant, attr: str) -> int:
    """Look up a quota limit from the tenant's plan; 0 if no plan attached."""
    plan = getattr(tenant, "plan", None)
    if plan is None:
        return 0
    return int(getattr(plan, attr, 0) or 0)


def _check_active(tenant: Tenant, *, quota: str) -> None:
    """Phase 0 — log only. Phase 3 will raise SubscriptionInactive."""
    if not tenant.is_subscription_active:
        logger.debug(
            "quota.%s: tenant=%s has no active subscription (Phase 0: not enforced)",
            quota,
            tenant.pk,
        )


def enforce_max_students(tenant: Tenant, *, current: int = 0, delta: int = 1) -> None:
    """Phase 0: lookup + log. Phase 3 will enforce."""
    _check_active(tenant, quota="max_students")
    limit = _plan_limit(tenant, "max_students")
    logger.debug(
        "quota.max_students: tenant=%s limit=%s current=%s delta=%s",
        tenant.pk,
        limit,
        current,
        delta,
    )


def enforce_max_storage_gb(tenant: Tenant, *, current_bytes: int = 0, delta_bytes: int = 0) -> None:
    """Phase 0: lookup + log. Phase 3 will enforce."""
    _check_active(tenant, quota="max_storage_gb")
    limit = _plan_limit(tenant, "max_storage_gb")
    logger.debug(
        "quota.max_storage_gb: tenant=%s limit=%s current_bytes=%s delta_bytes=%s",
        tenant.pk,
        limit,
        current_bytes,
        delta_bytes,
    )


def enforce_max_streaming_hours(tenant: Tenant, *, current_minutes: int = 0, delta_minutes: int = 0) -> None:
    """Phase 0: lookup + log. Phase 3 will enforce."""
    _check_active(tenant, quota="max_streaming_hours")
    limit = _plan_limit(tenant, "max_streaming_hours")
    logger.debug(
        "quota.max_streaming_hours: tenant=%s limit=%s current_minutes=%s delta_minutes=%s",
        tenant.pk,
        limit,
        current_minutes,
        delta_minutes,
    )


def enforce_max_campaign_emails(tenant: Tenant, *, current: int = 0, delta: int = 0) -> None:
    """Phase 0: lookup + log. Phase 3 will enforce."""
    _check_active(tenant, quota="max_campaign_emails")
    limit = _plan_limit(tenant, "max_campaign_emails")
    logger.debug(
        "quota.max_campaign_emails: tenant=%s limit=%s current=%s delta=%s",
        tenant.pk,
        limit,
        current,
        delta,
    )


__all__ = [
    "BillingError",
    "QuotaExceeded",
    "SubscriptionInactive",
    "enforce_max_campaign_emails",
    "enforce_max_storage_gb",
    "enforce_max_streaming_hours",
    "enforce_max_students",
]
