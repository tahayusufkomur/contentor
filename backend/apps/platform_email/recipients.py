"""Resolve a platform recipient filter into public coach users.

A platform "recipient" is a coach — i.e. a tenant owner — represented by a
public `User` (role="coach"). Tenants link to their owner via `owner_email`.

Filter shapes:
    {"type": "all_coaches"}
    {"type": "plan",   "plan_ids":   [1, 2]}
    {"type": "tenant", "tenant_ids": [3, 4]}
    {"type": "individual", "user_ids": [5, 6]}
"""

from apps.accounts.models import User
from apps.core.models import Tenant

FILTER_TYPES = ("all_coaches", "plan", "tenant", "individual")


def _coach_qs():
    return User.objects.filter(role="coach", is_active=True)


def _emails_for_tenants(tenant_qs) -> list[str]:
    return list(
        tenant_qs.exclude(schema_name="public").exclude(owner_email="").values_list("owner_email", flat=True).distinct()
    )


def resolve_recipients(recipient_filter: dict):
    """Deduplicated queryset of active coach users matching the filter."""
    if not isinstance(recipient_filter, dict):
        return User.objects.none()

    filter_type = recipient_filter.get("type")

    if filter_type == "all_coaches":
        return _coach_qs()

    if filter_type == "plan":
        plan_ids = recipient_filter.get("plan_ids") or []
        if not plan_ids:
            return User.objects.none()
        emails = _emails_for_tenants(Tenant.objects.filter(plan_id__in=plan_ids))
        return _coach_qs().filter(email__in=emails)

    if filter_type == "tenant":
        tenant_ids = recipient_filter.get("tenant_ids") or []
        if not tenant_ids:
            return User.objects.none()
        emails = _emails_for_tenants(Tenant.objects.filter(pk__in=tenant_ids))
        return _coach_qs().filter(email__in=emails)

    if filter_type == "individual":
        user_ids = recipient_filter.get("user_ids") or []
        if not user_ids:
            return User.objects.none()
        return _coach_qs().filter(pk__in=user_ids)

    return User.objects.none()


def get_recipient_count(recipient_filter: dict) -> int:
    return resolve_recipients(recipient_filter).count()
