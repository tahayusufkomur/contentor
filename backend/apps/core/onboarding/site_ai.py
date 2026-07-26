"""AI site-edit metering + engine. Metering mirrors apps/blog/ai.py; the edit
engine reuses ai_compose so the model can only touch whitelisted fields."""

from datetime import UTC, datetime
from decimal import Decimal

from django.db.models import F, Sum
from django_tenants.utils import tenant_context

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
    """The admin Site AI's monthly-quota gate. The reveal's free applies are a
    separate counter (wizard_state["reveal_applies_used"]) and do not consult
    this function.

    Reason precedence mirrors apps/blog/ai.py: a plan with no allowance at all
    reads as `upgrade_required` (ask them to upgrade), while a plan whose
    allowance is spent reads as `quota_exhausted` (ask them to wait or upgrade).
    """
    limit = plan_limit(tenant)
    used = tenant_usage(tenant.schema_name, month=month).updates_used
    remaining = max(0, limit - used)
    if limit <= 0:
        reason = "upgrade_required"
    elif remaining <= 0:
        reason = "quota_exhausted"
    else:
        reason = None
    return {"enabled": remaining > 0, "remaining": remaining, "limit": limit, "reason": reason}


# ── Site-edit engine (preview + apply) ──────────────────────────────────────
#
# A site edit is a re-compose with an instruction: this reuses ai_compose's
# whitelisted-field trust boundary (WRITABLE_FIELDS/FIELD_CAPS, sanitization,
# no fabricated testimonials) rather than inventing a new editing engine.


def preview_edit(tenant, instruction):
    """Recompose the current pages with a natural-language instruction.
    Returns (pages, extras, cost); does NOT save. Raises
    ai_compose.ComposeError on AI failure (the caller keeps the current
    pages). Establishes its own tenant_context."""
    from apps.core.onboarding import ai_compose
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        answers = (tenant.wizard_state or {}).get("answers") or {}
        pages, extras = ai_compose.compose_pages(
            cfg.pages or {},
            brand_name=cfg.brand_name,
            niche=answers.get("niche") or "general",
            description=answers.get("description") or "",
            # compose_pages' `followups` are {q, a} pairs threaded into the
            # brief as "Asked/answered" lines (ai_compose._brief) — the
            # coach's free-text instruction rides as one synthetic pair
            # rather than compose_pages growing a second, redundant
            # "instruction" parameter.
            followups=[{"q": "What would you like changed about the site?", "a": instruction}],
            goals=list(answers.get("goals") or []),
            locale="en",
            tenant_schema=tenant.schema_name,
        )
    # compose_pages already records its own USD spend via ai_compose.record_spend;
    # the caller (the preview SSE view) additionally records it against the
    # site-ai meter via record_attempt_cost, so return 0 here to avoid
    # double-charging the same spend into two different ledgers.
    return pages, extras, Decimal("0")


def apply_edit(tenant, pages, extras=None):
    """Persist the proposed pages (and, when present, the safe
    meta_description extra) onto TenantConfig. Establishes its own
    tenant_context.

    Deliberately does NOT reuse tasks._apply_compose_extras for the
    navbar_cta/course/download retitle extras: that helper expects the full
    build_config_overrides() shape (a populated navbar_config, the compose
    call's course/download items) that the reveal's initial compose builds —
    a chat edit has none of that context, and reconstructing it just to
    reuse the helper is out of scope for this reveal-chat MVP.
    """
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        cfg.pages = pages
        update_fields = ["pages"]
        if extras and extras.get("meta_description"):
            cfg.meta_description = extras["meta_description"]
            update_fields.append("meta_description")
        cfg.save(update_fields=update_fields)
