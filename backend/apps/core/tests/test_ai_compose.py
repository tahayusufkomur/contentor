from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.core.models import OnboardingAiUsage
from apps.core.onboarding import ai_compose

pytestmark = pytest.mark.django_db


def test_usage_row_unique_per_tenant_month():
    OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")
    with pytest.raises(IntegrityError):
        OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")


def test_usage_defaults():
    row = OnboardingAiUsage.objects.create(tenant_schema="glow2", month="2026-07")
    assert row.composes_used == 0
    assert float(row.usd_spent) == 0.0


PAGES = {
    "home": {
        "blocks": [
            {
                "id": "blk_hero",
                "type": "hero",
                "enabled": True,
                "layout": "centered",
                "heading": "Welcome to Glow",
                "subheading": "Old sub",
                "ctaText": "Browse",
                "ctaHref": "/courses",
                "bgImage": {"url": None, "photo_id": "9"},
                "overlay": "dark",
                "overlayStrength": "medium",
            },
            {
                "id": "blk_testimonials",
                "type": "testimonials",
                "enabled": True,
                "heading": "What students say",
                "items": [{"name": "Priya", "text": "Real quote"}],
            },
            {
                "id": "blk_cta",
                "type": "cta",
                "enabled": True,
                "heading": "Ready?",
                "buttonText": "Join",
                "buttonHref": "/courses",
            },
        ]
    },
    "faq": {
        "blocks": [
            {"id": "blk_faq", "type": "faq", "enabled": True, "heading": "FAQ", "items": [{"q": "Old?", "a": "Old."}]}
        ]
    },
}


def _fake_structured_dict(result_dict):
    """Monkeypatch factory: core_ai.structured returning the given result dict."""

    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate(result_dict)
        return parsed, 0.03, "claude-sonnet-5"

    return fake


def _fake_structured(blocks):
    """Back-compat shim: only block updates, no extras."""
    return _fake_structured_dict({"blocks": blocks})


def _compose_full(monkeypatch, result_dict, **overrides):
    monkeypatch.setattr(ai_compose.core_ai, "structured", _fake_structured_dict(result_dict))
    kwargs = {
        "brand_name": "Glow",
        "niche": "yoga",
        "description": "Vinyasa for busy people",
        "goals": ["sell_courses"],
        "locale": "en",
        "tenant_schema": "glow",
    }
    kwargs.update(overrides)
    return ai_compose.compose_pages(PAGES, **kwargs)


def _compose(monkeypatch, blocks, **overrides):
    pages, _extras = _compose_full(monkeypatch, {"blocks": blocks}, **overrides)
    return pages


def test_applies_whitelisted_copy(monkeypatch):
    out = _compose(
        monkeypatch,
        [
            {
                "page": "home",
                "block_id": "blk_hero",
                "heading": "Yoga for busy people",
                "subheading": "Calm in 20 minutes a day",
                "ctaText": "Start today",
            },
            {"page": "home", "block_id": "blk_cta", "heading": "Your mat is waiting", "buttonText": "Begin"},
        ],
    )
    hero = out["home"]["blocks"][0]
    assert hero["heading"] == "Yoga for busy people"
    assert hero["ctaText"] == "Start today"
    assert hero["ctaHref"] == "/courses"  # non-writable fields untouched
    assert hero["bgImage"] == {"url": None, "photo_id": "9"}
    assert out["home"]["blocks"][2]["buttonText"] == "Begin"
    # Input dict not mutated:
    assert PAGES["home"]["blocks"][0]["heading"] == "Welcome to Glow"


def test_testimonials_never_touched(monkeypatch):
    out = _compose(
        monkeypatch,
        [
            {"page": "home", "block_id": "blk_testimonials", "heading": "Hacked", "items": [{"q": "x", "a": "y"}]},
        ],
    )
    assert out["home"]["blocks"][1]["heading"] == "What students say"
    assert out["home"]["blocks"][1]["items"] == [{"name": "Priya", "text": "Real quote"}]


def test_unknown_block_and_page_ignored(monkeypatch):
    out = _compose(
        monkeypatch,
        [
            {"page": "home", "block_id": "blk_nope", "heading": "X"},
            {"page": "basement", "block_id": "blk_hero", "heading": "X"},
        ],
    )
    assert out["home"]["blocks"][0]["heading"] == "Welcome to Glow"


def test_length_caps_and_faq_items(monkeypatch):
    out = _compose(
        monkeypatch,
        [
            {"page": "home", "block_id": "blk_hero", "heading": "H" * 500},
            {"page": "faq", "block_id": "blk_faq", "items": [{"q": f"Q{i}?", "a": "A" * 900} for i in range(10)]},
        ],
    )
    assert len(out["home"]["blocks"][0]["heading"]) == ai_compose.FIELD_CAPS["heading"]
    faq = out["faq"]["blocks"][0]
    assert len(faq["items"]) == ai_compose.MAX_FAQ_ITEMS
    assert all(len(item["a"]) <= ai_compose.FIELD_CAPS["a"] for item in faq["items"])


def test_body_is_sanitized(monkeypatch):
    pages = {
        "about": {
            "blocks": [{"id": "blk_intro", "type": "richText", "enabled": True, "heading": "About", "body": "old"}]
        }
    }
    monkeypatch.setattr(
        ai_compose.core_ai,
        "structured",
        _fake_structured([{"page": "about", "block_id": "blk_intro", "body": "<p>Hi</p><script>evil()</script>"}]),
    )
    out, _extras = ai_compose.compose_pages(
        pages, brand_name="G", niche="yoga", description="", goals=[], locale="en", tenant_schema="glow"
    )
    assert "<script>" not in out["about"]["blocks"][0]["body"]
    assert "<p>Hi</p>" in out["about"]["blocks"][0]["body"]


def test_locale_reaches_prompt(monkeypatch):
    seen = {}

    def spy(**kwargs):
        seen["user"] = kwargs["user"]
        output_model = kwargs["output_model"]
        return output_model.model_validate({"blocks": []}), 0.01, "m"

    monkeypatch.setattr(ai_compose.core_ai, "structured", spy)
    ai_compose.compose_pages(
        PAGES,
        brand_name="Glow",
        niche="yoga",
        description="desc",
        goals=["sell_courses"],
        locale="tr",
        tenant_schema="glow",
    )
    assert "Turkish" in seen["user"]
    assert "Glow" in seen["user"] and "desc" in seen["user"]


def test_usage_recorded_on_failure_and_success(monkeypatch):
    from apps.core import ai as core_ai_mod

    def boom(**kwargs):
        raise core_ai_mod.AiError("provider down", cost_usd=0.01)

    monkeypatch.setattr(ai_compose.core_ai, "structured", boom)
    with pytest.raises(ai_compose.ComposeError):
        ai_compose.compose_pages(
            PAGES, brand_name="G", niche="yoga", description="", goals=[], locale="en", tenant_schema="spend1"
        )
    row = ai_compose.tenant_usage("spend1")
    row.refresh_from_db()
    assert row.usd_spent == Decimal("0.0100")
    assert row.composes_used == 0

    _compose(monkeypatch, [], tenant_schema="spend1")
    row.refresh_from_db()
    assert row.composes_used == 1


def test_extras_clamped_and_validated(monkeypatch):
    _pages, extras = _compose_full(
        monkeypatch,
        {
            "blocks": [],
            "meta_description": "Calm vinyasa yoga for busy professionals. " * 10,  # over 170 chars
            "navbar_cta": "Start Your Yoga Journey Today Right Now",  # over 30 chars
            "courses": [
                {"id": 1, "title": "Morning Flow Foundations", "description": "Gentle start."},
                {"id": 99, "title": "Hallucinated", "description": "x"},  # id not sent -> dropped
            ],
            "downloads": [{"id": 5, "title": "Breathing Guide"}],
        },
        courses=({"id": 1, "title": "Yoga Course 1", "description": "old"},),
        downloads=({"id": 5, "title": "Guide 1", "description": ""},),
    )
    assert len(extras["meta_description"]) <= 170
    assert len(extras["navbar_cta"]) <= 30
    assert set(extras["courses"]) == {1}
    assert extras["courses"][1]["title"] == "Morning Flow Foundations"
    assert set(extras["downloads"]) == {5}


def test_extras_empty_when_model_returns_none(monkeypatch):
    _pages, extras = _compose_full(monkeypatch, {"blocks": []})
    assert extras == {"meta_description": "", "navbar_cta": "", "courses": {}, "downloads": {}}


def test_compose_available_respects_flag_and_budget(monkeypatch, settings):
    monkeypatch.setattr(ai_compose.core_ai, "available", lambda: (True, "ok"))
    settings.ONBOARDING_AI_ENABLED = False
    assert ai_compose.compose_available() is False
    settings.ONBOARDING_AI_ENABLED = True
    assert ai_compose.compose_available() is True
    settings.ONBOARDING_AI_MONTHLY_BUDGET_USD = 0.005
    ai_compose.record_spend("budget-tenant", 0.01)
    assert ai_compose.compose_available() is False


def test_compose_available_respects_provider_unavailable(monkeypatch, settings):
    monkeypatch.setattr(ai_compose.core_ai, "available", lambda: (False, "cli_no_binary"))
    settings.ONBOARDING_AI_ENABLED = True
    settings.ONBOARDING_AI_MONTHLY_BUDGET_USD = 100
    assert ai_compose.compose_available() is False
