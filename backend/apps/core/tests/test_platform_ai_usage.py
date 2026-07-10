"""Superadmin cross-feature AI usage rollup: spend/counts per feature,
kill-switch flags, top-tenant spend, ratings, and a 7-day question
sparkline — the aggregation feeding /admin/ai in the superadmin SPA."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AiTranscript, BlogAiUsage, HelpBotUsage, LogoAiUsage, StudentBotUsage

SHARED_DOMAIN = "shared-test.localhost"
pytestmark = pytest.mark.django_db


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root-ai-usage@contentor.app",
        region="global",
        role="owner",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture()
def coach_user(restore_public):
    return User.objects.create(email="coach-ai-usage@contentor.app", region="global", role="owner")


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_rollup_aggregates_all_features(superuser, restore_public, settings):
    settings.HELP_BOT_GLOBAL_MONTHLY_USD = 50
    HelpBotUsage.objects.create(tenant_schema="a", month="2026-07", questions=2, usd_spent=Decimal("0.2"))
    HelpBotUsage.objects.create(tenant_schema="__marketing__", month="2026-07", questions=1, usd_spent=Decimal("0.1"))
    StudentBotUsage.objects.create(tenant_schema="a", month="2026-07", questions=3, usd_spent=Decimal("0.03"))
    BlogAiUsage.objects.create(tenant_schema="a", month="2026-07", generations_used=1, usd_spent=Decimal("0.05"))
    LogoAiUsage.objects.create(tenant_schema="a", month="2026-07", packs_used=1, usd_spent=Decimal("0.08"))
    AiTranscript.objects.create(
        feature="help_bot",
        audience="coach",
        tenant_schema="a",
        question="q",
        answer="x",
        provider="cli",
        model="m",
        rating="up",
    )

    resp = _client(superuser).get("/api/v1/platform/ai-usage/", {"month": "2026-07"})
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["month"] == "2026-07"

    by_key = {f["key"]: f for f in data["features"]}
    assert by_key["help_bot"]["count"] == 3 and by_key["help_bot"]["usd_spent"] == "0.3000"
    assert by_key["student_bot"]["count"] == 3
    assert by_key["blog_ai"]["count"] == 1 and by_key["brand_pack"]["count"] == 1
    assert data["ratings"]["up"] == 1
    assert data["top_tenants"][0]["tenant_schema"] == "a"
    # tenant "a" totals 0.2 + 0.03 + 0.05 + 0.08 = 0.36 across the 4 usage meters.
    assert data["top_tenants"][0]["usd_spent"] == "0.3600"
    assert data["top_tenants"][0]["count"] == 1  # 1 non-preview transcript for tenant "a"


def test_kill_switch_flag(superuser, restore_public, settings):
    settings.STUDENT_BOT_GLOBAL_MONTHLY_USD = 1
    StudentBotUsage.objects.create(tenant_schema="a", month="2026-07", usd_spent=Decimal("2"))
    resp = _client(superuser).get("/api/v1/platform/ai-usage/", {"month": "2026-07"})
    student = next(f for f in resp.json()["features"] if f["key"] == "student_bot")
    assert student["kill_switch_tripped"] is True


def test_kill_switch_flag_not_tripped_below_cap(superuser, restore_public, settings):
    settings.BLOG_AI_MONTHLY_BUDGET_USD = 30
    BlogAiUsage.objects.create(tenant_schema="a", month="2026-07", usd_spent=Decimal("29.9999"))
    resp = _client(superuser).get("/api/v1/platform/ai-usage/", {"month": "2026-07"})
    blog = next(f for f in resp.json()["features"] if f["key"] == "blog_ai")
    assert blog["kill_switch_tripped"] is False


def test_kill_switch_flag_at_exact_cap_boundary(superuser, restore_public, settings):
    settings.LOGO_AI_MONTHLY_BUDGET_USD = 5
    LogoAiUsage.objects.create(tenant_schema="a", month="2026-07", usd_spent=Decimal("5.00"))
    resp = _client(superuser).get("/api/v1/platform/ai-usage/", {"month": "2026-07"})
    brand_pack = next(f for f in resp.json()["features"] if f["key"] == "brand_pack")
    assert brand_pack["kill_switch_tripped"] is True


def test_top_tenants_sorted_desc_and_limited_to_ten(superuser, restore_public):
    for i in range(12):
        HelpBotUsage.objects.create(
            tenant_schema=f"t{i}", month="2026-07", questions=1, usd_spent=Decimal(f"{i + 1}.00")
        )
    resp = _client(superuser).get("/api/v1/platform/ai-usage/", {"month": "2026-07"})
    top = resp.json()["top_tenants"]
    assert len(top) == 10
    amounts = [Decimal(t["usd_spent"]) for t in top]
    assert amounts == sorted(amounts, reverse=True)
    assert top[0]["tenant_schema"] == "t11"  # highest spend: 12.00


def test_ratings_and_daily_questions_exclude_preview_transcripts(superuser, restore_public):
    AiTranscript.objects.create(
        feature="help_bot",
        audience="coach",
        tenant_schema="a",
        question="real question",
        answer="x",
        provider="cli",
        model="m",
        rating="up",
        is_preview=False,
    )
    AiTranscript.objects.create(
        feature="help_bot",
        audience="coach",
        tenant_schema="a",
        question="coach testing the prompt",
        answer="x",
        provider="cli",
        model="m",
        rating="down",
        is_preview=True,
    )
    AiTranscript.objects.create(
        feature="student_bot",
        audience="student",
        tenant_schema="a",
        question="unrated question",
        answer="x",
        provider="cli",
        model="m",
        is_preview=False,
    )

    month = timezone.now().strftime("%Y-%m")
    resp = _client(superuser).get("/api/v1/platform/ai-usage/", {"month": month})
    data = resp.json()
    assert data["ratings"]["up"] == 1
    assert data["ratings"]["down"] == 0  # the down rating belongs to the excluded preview row
    assert data["ratings"]["unrated"] == 1
    total_daily = sum(d["count"] for d in data["daily_questions"])
    assert total_daily == 2  # 3 transcripts created, 1 preview excluded


def test_defaults_to_current_month(superuser, restore_public):
    resp = _client(superuser).get("/api/v1/platform/ai-usage/")
    assert resp.status_code == 200
    assert resp.json()["month"] == timezone.now().strftime("%Y-%m")


def test_requires_superuser(restore_public):
    resp = _client().get("/api/v1/platform/ai-usage/")
    assert resp.status_code in (401, 403)


def test_forbidden_for_non_superuser(coach_user, restore_public):
    resp = _client(coach_user).get("/api/v1/platform/ai-usage/")
    assert resp.status_code in (401, 403)
