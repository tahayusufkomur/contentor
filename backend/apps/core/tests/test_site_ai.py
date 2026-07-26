"""AI site-edit metering (mirrors apps/blog/ai.py's accounting contract) +
the recompose-with-instruction preview/apply engine (Plan 5 — reveal chat +
site-AI quota)."""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from apps.core.models import PlatformPlan, SiteAiUpdateUsage
from apps.core.onboarding import site_ai

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "site_ai_test"


def _tenant(limit, paid=True):
    plan = PlatformPlan.objects.create(
        name=f"sa-{limit}-{paid}", price_monthly=1, transaction_fee_pct=1, max_site_ai_updates=limit
    )
    return SimpleNamespace(
        schema_name=SCHEMA, platform_subscription=SimpleNamespace(plan=plan), has_paid_platform_plan=paid
    )


def test_availability_counts_remaining(settings):
    settings.ANTHROPIC_API_KEY = "k"
    SiteAiUpdateUsage.objects.create(tenant_schema=SCHEMA, month=site_ai.current_month(), updates_used=1)
    a = site_ai.availability(_tenant(3))
    assert a["remaining"] == 2 and a["limit"] == 3


def test_record_update_increments_only_the_counter():
    site_ai.record_attempt_cost(SCHEMA, Decimal("0.02"))
    site_ai.record_update(SCHEMA)
    row = site_ai.tenant_usage(SCHEMA)
    assert row.updates_used == 1 and row.usd_spent == Decimal("0.02")
