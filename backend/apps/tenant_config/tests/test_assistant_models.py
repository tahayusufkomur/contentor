"""Task 6: student site-assistant data models — usage meter, plan quota
field, per-tenant config singleton + knowledge entries. Pure data-layer
verification only; no bot logic (see Task 7+)."""

import pytest
from django.db import IntegrityError
from django.test import override_settings

from apps.core.models import PlatformPlan, StudentBotUsage
from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry

pytestmark = pytest.mark.django_db(transaction=True)


def test_assistant_config_singleton(tenant_ctx):
    a, b = AssistantConfig.load(), AssistantConfig.load()
    assert a.pk == b.pk == 1 and a.enabled is False and a.suggested_questions == []


def test_knowledge_entry_constants():
    assert AssistantKnowledgeEntry.MAX_ENTRIES == 50
    assert AssistantKnowledgeEntry.MAX_CONTENT_CHARS == 1500


def test_student_bot_usage_unique_per_month():
    StudentBotUsage.objects.create(tenant_schema="t", month="2026-07")
    with pytest.raises(IntegrityError):
        StudentBotUsage.objects.create(tenant_schema="t", month="2026-07")


def test_plan_field_default_zero():
    plan = PlatformPlan.objects.create(name="x", price_monthly=0, transaction_fee_pct=0)
    assert plan.max_student_bot_questions == 0


# Mirrors backend/apps/billing/tests/test_seed_plans.py's mocking pattern:
# real Stripe env vars aren't set in tests, so pin STRIPE_PRICE_* overrides
# and blank STRIPE_SECRET_KEY (skips live price provisioning), and empty
# CONTENTOR_SUPERUSERS so the command returns right after plans are seeded
# instead of also seeding superusers/demo tenants.
@override_settings(
    BILLING_FREE_PLAN_NAME="Free",
    STRIPE_PRICE_STARTER_USD="price_starter_usd_test",
    STRIPE_PRICE_STARTER_TRY="price_starter_try_test",
    STRIPE_PRICE_PRO_USD="price_pro_usd_test",
    STRIPE_PRICE_PRO_TRY="price_pro_try_test",
    STRIPE_SECRET_KEY="",
    CONTENTOR_SUPERUSERS=[],
)
def test_seeded_quotas(restore_public):
    from django.core.management import call_command

    call_command("seed_plans")
    by_name = {p.name: p.max_student_bot_questions for p in PlatformPlan.objects.all()}
    assert by_name["starter"] == 300 and by_name["pro"] == 1500
