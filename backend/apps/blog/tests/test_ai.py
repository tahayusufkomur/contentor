"""Provider selection, CLI envelope parsing, quota/availability logic.
No network, no real subprocess (mirrors test_help_bot.py style)."""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.blog import ai
from apps.core.models import BlogAiUsage, PlatformPlan

pytestmark = pytest.mark.django_db

SCHEMA = "blog_ai_test"
MONTH = "2026-07"

DRAFT_JSON = json.dumps(
    {
        "title": "Morning Habits That Stick",
        "slug": "morning-habits",
        "meta_description": "Five tiny habits.",
        "excerpt": "Start smaller than you think.",
        "tags": ["habits"],
        "sections": [{"heading": "", "body_markdown": "Start **small**."}],
    }
)


def _cli_envelope(result_text):
    return json.dumps({"type": "result", "result": result_text, "total_cost_usd": 0})


def test_cli_provider_parses_envelope_and_validates(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON), stderr="")
    with mock.patch("subprocess.run", return_value=completed) as run:
        parsed, cost = ai._call_structured("sys", "user", ai._BlogDraft, max_tokens=ai.MAX_OUTPUT_TOKENS)
    assert parsed.title == "Morning Habits That Stick"
    assert cost == Decimal("0")
    argv = run.call_args.args[0]
    assert "--disallowedTools" in argv and "--max-turns" in argv
    env = run.call_args.kwargs["env"]
    assert "ANTHROPIC_API_KEY" not in env and "ANTHROPIC_AUTH_TOKEN" not in env


def test_cli_provider_strips_code_fences(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    fenced = "```json\n" + DRAFT_JSON + "\n```"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(fenced), stderr="")
    with mock.patch("subprocess.run", return_value=completed):
        parsed, _ = ai._call_structured("sys", "user", ai._BlogDraft, max_tokens=100)
    assert parsed.slug == "morning-habits"


def test_cli_provider_raises_blog_ai_error_on_failure(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    completed = SimpleNamespace(returncode=1, stdout="", stderr="boom")
    with mock.patch("subprocess.run", return_value=completed):
        with pytest.raises(ai.BlogAiError):
            ai._call_structured("sys", "user", ai._BlogDraft, max_tokens=100)


def test_generate_post_returns_rendered_fields(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON), stderr="")
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits")
    assert result.fields["title"] == "Morning Habits That Stick"
    assert "<strong>small</strong>" in result.fields["body_html"]
    assert "slug" not in result.fields  # slugs are re-derived server-side


def _tenant(plan_limit, paid=True):
    plan = PlatformPlan.objects.create(
        name=f"p{plan_limit}-{paid}", price_monthly=1, transaction_fee_pct=1, max_ai_blog_posts=plan_limit
    )
    subscription = SimpleNamespace(plan=plan)
    return SimpleNamespace(schema_name=SCHEMA, platform_subscription=subscription, has_paid_platform_plan=paid)


def test_availability_upgrade_required_for_free(settings):
    settings.ANTHROPIC_API_KEY = "k"
    status = ai.availability(_tenant(0, paid=False))
    assert status["eligible"] is False and status["reason"] == "upgrade_required"


def test_availability_quota_exhausted(settings):
    settings.ANTHROPIC_API_KEY = "k"
    BlogAiUsage.objects.create(tenant_schema=SCHEMA, month=ai.current_month(), generations_used=5)
    status = ai.availability(_tenant(5))
    assert status["remaining"] == 0 and status["reason"] == "quota_exhausted"


def test_availability_budget_kill_switch(settings):
    settings.ANTHROPIC_API_KEY = "k"
    settings.BLOG_AI_MONTHLY_BUDGET_USD = 1.0
    BlogAiUsage.objects.create(tenant_schema="other", month=ai.current_month(), usd_spent=Decimal("2"))
    status = ai.availability(_tenant(5))
    assert status["enabled"] is False and status["reason"] == "budget"


def test_record_attempt_and_success_two_tier():
    ai.record_attempt_cost(SCHEMA, Decimal("0.03"), month=MONTH)
    row = ai.tenant_usage(SCHEMA, month=MONTH)
    assert row.usd_spent == Decimal("0.03") and row.generations_used == 0
    ai.record_success(SCHEMA, month=MONTH)
    row.refresh_from_db()
    assert row.generations_used == 1
