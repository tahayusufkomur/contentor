"""BlogAiUsage meter + plan limit field (public schema)."""

import pytest
from django.db import IntegrityError

from apps.core.models import BlogAiUsage, PlatformPlan

pytestmark = pytest.mark.django_db


def test_blog_ai_usage_unique_per_tenant_month():
    BlogAiUsage.objects.create(tenant_schema="t1", month="2026-07")
    with pytest.raises(IntegrityError):
        BlogAiUsage.objects.create(tenant_schema="t1", month="2026-07")


def test_blog_ai_usage_defaults():
    row = BlogAiUsage.objects.create(tenant_schema="t1", month="2026-07")
    assert row.generations_used == 0
    assert row.usd_spent == 0


def test_platform_plan_blog_limit_defaults_to_zero():
    plan = PlatformPlan.objects.create(name="testplan", price_monthly=0, transaction_fee_pct=0)
    assert plan.max_ai_blog_posts == 0
