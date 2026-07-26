"""AI site-edit metering + engine. Metering mirrors apps/blog/ai.py; the edit
engine reuses ai_compose so the model can only touch whitelisted fields."""

from datetime import UTC, datetime
from decimal import Decimal

from django.db.models import F, Sum

from apps.core.models import SiteAiUpdateUsage


def current_month():
    return datetime.now(UTC).strftime("%Y-%m")


def tenant_usage(tenant_schema, month=None):
    row, _ = SiteAiUpdateUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month or current_month())
    return row


def global_spend(month=None):
    total = SiteAiUpdateUsage.objects.filter(month=month or current_month()).aggregate(t=Sum("usd_spent"))["t"]
    return total or Decimal("0")


def record_attempt_cost(tenant_schema, usd, month=None):
    """Charged on EVERY call attempt (preview or apply) — kill-switch integrity."""
    row = tenant_usage(tenant_schema, month=month)
    SiteAiUpdateUsage.objects.filter(pk=row.pk).update(usd_spent=F("usd_spent") + usd)


def record_update(tenant_schema, month=None):
    """Only a successful, persisted apply consumes a quota credit."""
    row = tenant_usage(tenant_schema, month=month)
    SiteAiUpdateUsage.objects.filter(pk=row.pk).update(updates_used=F("updates_used") + 1)


def plan_limit(tenant):
    from apps.core.models import PlatformSubscription

    try:
        plan = tenant.platform_subscription.plan
    except PlatformSubscription.DoesNotExist:
        return 0
    return plan.max_site_ai_updates or 0


def availability(tenant, month=None):
    """The Phase-2 admin Site AI's monthly-quota gate. The reveal's 3 free
    applies are a separate counter (wizard_state["reveal_applies_used"]) and
    do not consult this function."""
    limit = plan_limit(tenant)
    used = tenant_usage(tenant.schema_name, month=month).updates_used
    remaining = max(0, limit - used)
    reason = None if remaining > 0 else "quota_exhausted"
    return {"enabled": remaining > 0, "remaining": remaining, "limit": limit, "reason": reason}
