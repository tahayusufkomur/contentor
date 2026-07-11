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


def _cli_settings(settings):
    settings.AI_PROVIDER = "cli"
    settings.AI_CLI_BIN = "claude"
    settings.AI_CLI_MODEL = "haiku"


def test_cli_provider_parses_envelope_and_validates(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON), stderr="")
    with mock.patch("subprocess.run", return_value=completed) as run:
        parsed, cost, model = ai._call_structured(
            "sys", "user", ai._BlogDraft, "claude-sonnet-5", max_tokens=ai.MAX_OUTPUT_TOKENS
        )
    assert parsed.title == "Morning Habits That Stick"
    assert cost == Decimal("0")
    assert model == "claude-sonnet-5"  # audit trail keeps the requested model
    argv = run.call_args.args[0]
    assert argv[argv.index("--model") + 1] == "sonnet"  # CLI's short alias for the request
    assert "--disallowedTools" in argv and "--max-turns" in argv
    env = run.call_args.kwargs["env"]
    assert "ANTHROPIC_API_KEY" not in env and "ANTHROPIC_AUTH_TOKEN" not in env


def test_cli_provider_strips_code_fences(settings):
    _cli_settings(settings)
    fenced = "```json\n" + DRAFT_JSON + "\n```"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(fenced), stderr="")
    with mock.patch("subprocess.run", return_value=completed):
        parsed, _, _ = ai._call_structured("sys", "user", ai._BlogDraft, "claude-sonnet-5", max_tokens=100)
    assert parsed.slug == "morning-habits"


def test_cli_provider_raises_blog_ai_error_on_failure(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=1, stdout="", stderr="boom")
    with mock.patch("subprocess.run", return_value=completed), pytest.raises(ai.BlogAiError):
        ai._call_structured("sys", "user", ai._BlogDraft, "claude-sonnet-5", max_tokens=100)


def test_generate_post_returns_rendered_fields(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON), stderr="")
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits")
    assert result.fields["title"] == "Morning Habits That Stick"
    assert "<strong>small</strong>" in result.fields["body_html"]
    assert result.fields["ai_model"] == "claude-sonnet-5"  # settings.BLOG_AI_MODEL default
    assert "slug" not in result.fields  # slugs are re-derived server-side


def _photo(id_, title, alt=""):
    return SimpleNamespace(id=id_, title=title, alt_text=alt)


DRAFT_JSON_WITH_PHOTOS = json.dumps(
    {
        "title": "Morning Habits That Stick",
        "slug": "morning-habits",
        "meta_description": "Five tiny habits.",
        "excerpt": "Start smaller than you think.",
        "tags": ["habits"],
        "cover_photo_id": "p1",
        "sections": [
            {"heading": "", "body_markdown": "Start **small**.", "photo_id": ""},
            {"heading": "Stretch first", "body_markdown": "A quick stretch.", "photo_id": "p2"},
        ],
    }
)


def test_available_photos_block_empty_for_no_photos():
    assert ai.available_photos_block([]) == ""


def test_available_photos_block_lists_id_title_alt():
    block = ai.available_photos_block([_photo("p1", "Morning stretch", "woman stretching at sunrise")])
    assert "<available_photos>" in block
    assert "p1" in block and "Morning stretch" in block and "woman stretching at sunrise" in block


def test_generate_post_picks_cover_and_inline_photos(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON_WITH_PHOTOS), stderr="")
    photos = [_photo("p1", "Morning stretch"), _photo("p2", "Journal on desk")]
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits", photos=photos)
    assert result.fields["cover_photo_id"] == "p1"
    assert result.fields["image_placements"] == [{"heading": "Stretch first", "photo_id": "p2"}]


def test_generate_post_drops_hallucinated_photo_ids(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON_WITH_PHOTOS), stderr="")
    # Neither p1 nor p2 is in the real candidate list -> both dropped, fails open.
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits", photos=[_photo("other", "x")])
    assert result.fields["cover_photo_id"] == ""
    assert result.fields["image_placements"] == []


def test_generate_post_caps_inline_placements_at_two(settings):
    _cli_settings(settings)
    three_sections = json.dumps(
        {
            **json.loads(DRAFT_JSON_WITH_PHOTOS),
            "cover_photo_id": "",
            "sections": [
                {"heading": "A", "body_markdown": "a", "photo_id": "p1"},
                {"heading": "B", "body_markdown": "b", "photo_id": "p2"},
                {"heading": "C", "body_markdown": "c", "photo_id": "p3"},
            ],
        }
    )
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(three_sections), stderr="")
    photos = [_photo("p1", "1"), _photo("p2", "2"), _photo("p3", "3")]
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "t", photos=photos)
    assert len(result.fields["image_placements"]) == 2


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
