import pytest
from django.db import IntegrityError

from apps.core.models import OnboardingAiUsage

pytestmark = pytest.mark.django_db


def test_usage_row_unique_per_tenant_month():
    OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")
    with pytest.raises(IntegrityError):
        OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")


def test_usage_defaults():
    row = OnboardingAiUsage.objects.create(tenant_schema="glow2", month="2026-07")
    assert row.composes_used == 0
    assert float(row.usd_spent) == 0.0


from decimal import Decimal
from types import SimpleNamespace

from apps.core.onboarding import ai_compose

PAGES = {
    "home": {
        "blocks": [
            {"id": "blk_hero", "type": "hero", "enabled": True, "layout": "centered",
             "heading": "Welcome to Glow", "subheading": "Old sub", "ctaText": "Browse",
             "ctaHref": "/courses", "bgImage": {"url": None, "photo_id": "9"},
             "overlay": "dark", "overlayStrength": "medium"},
            {"id": "blk_testimonials", "type": "testimonials", "enabled": True,
             "heading": "What students say", "items": [{"name": "Priya", "text": "Real quote"}]},
            {"id": "blk_cta", "type": "cta", "enabled": True, "heading": "Ready?",
             "buttonText": "Join", "buttonHref": "/courses"},
        ]
    },
    "faq": {"blocks": [{"id": "blk_faq", "type": "faq", "enabled": True,
                        "heading": "FAQ", "items": [{"q": "Old?", "a": "Old."}]}]},
}


def _fake_structured(blocks):
    """Monkeypatch factory: core_ai.structured returning the given block updates."""
    def fake(**kwargs):
        output_model = kwargs["output_model"]
        parsed = output_model.model_validate({"blocks": blocks})
        return parsed, 0.03, "claude-sonnet-5"
    return fake


def _compose(monkeypatch, blocks, **overrides):
    monkeypatch.setattr(ai_compose.core_ai, "structured", _fake_structured(blocks))
    kwargs = {"brand_name": "Glow", "niche": "yoga", "description": "Vinyasa for busy people",
              "goals": ["sell_courses"], "locale": "en", "tenant_schema": "glow"}
    kwargs.update(overrides)
    return ai_compose.compose_pages(PAGES, **kwargs)


def test_applies_whitelisted_copy(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_hero", "heading": "Yoga for busy people",
         "subheading": "Calm in 20 minutes a day", "ctaText": "Start today"},
        {"page": "home", "block_id": "blk_cta", "heading": "Your mat is waiting", "buttonText": "Begin"},
    ])
    hero = out["home"]["blocks"][0]
    assert hero["heading"] == "Yoga for busy people"
    assert hero["ctaText"] == "Start today"
    assert hero["ctaHref"] == "/courses"  # non-writable fields untouched
    assert hero["bgImage"] == {"url": None, "photo_id": "9"}
    assert out["home"]["blocks"][2]["buttonText"] == "Begin"
    # Input dict not mutated:
    assert PAGES["home"]["blocks"][0]["heading"] == "Welcome to Glow"


def test_testimonials_never_touched(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_testimonials", "heading": "Hacked",
         "items": [{"q": "x", "a": "y"}]},
    ])
    assert out["home"]["blocks"][1]["heading"] == "What students say"
    assert out["home"]["blocks"][1]["items"] == [{"name": "Priya", "text": "Real quote"}]


def test_unknown_block_and_page_ignored(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_nope", "heading": "X"},
        {"page": "basement", "block_id": "blk_hero", "heading": "X"},
    ])
    assert out["home"]["blocks"][0]["heading"] == "Welcome to Glow"


def test_length_caps_and_faq_items(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_hero", "heading": "H" * 500},
        {"page": "faq", "block_id": "blk_faq",
         "items": [{"q": f"Q{i}?", "a": "A" * 900} for i in range(10)]},
    ])
    assert len(out["home"]["blocks"][0]["heading"]) == ai_compose.FIELD_CAPS["heading"]
    faq = out["faq"]["blocks"][0]
    assert len(faq["items"]) == ai_compose.MAX_FAQ_ITEMS
    assert all(len(item["a"]) <= ai_compose.FIELD_CAPS["a"] for item in faq["items"])


def test_body_is_sanitized(monkeypatch):
    pages = {"about": {"blocks": [{"id": "blk_intro", "type": "richText", "enabled": True,
                                   "heading": "About", "body": "old"}]}}
    monkeypatch.setattr(ai_compose.core_ai, "structured", _fake_structured(
        [{"page": "about", "block_id": "blk_intro", "body": "<p>Hi</p><script>evil()</script>"}]
    ))
    out = ai_compose.compose_pages(pages, brand_name="G", niche="yoga", description="",
                                   goals=[], locale="en", tenant_schema="glow")
    assert "<script>" not in out["about"]["blocks"][0]["body"]
    assert "<p>Hi</p>" in out["about"]["blocks"][0]["body"]


def test_locale_reaches_prompt(monkeypatch):
    seen = {}
    def spy(**kwargs):
        seen["user"] = kwargs["user"]
        output_model = kwargs["output_model"]
        return output_model.model_validate({"blocks": []}), 0.01, "m"
    monkeypatch.setattr(ai_compose.core_ai, "structured", spy)
    ai_compose.compose_pages(PAGES, brand_name="Glow", niche="yoga", description="desc",
                             goals=["sell_courses"], locale="tr", tenant_schema="glow")
    assert "Turkish" in seen["user"]
    assert "Glow" in seen["user"] and "desc" in seen["user"]


def test_usage_recorded_on_failure_and_success(monkeypatch):
    from apps.core import ai as core_ai_mod

    def boom(**kwargs):
        raise core_ai_mod.AiError("provider down", cost_usd=0.01)
    monkeypatch.setattr(ai_compose.core_ai, "structured", boom)
    with pytest.raises(ai_compose.ComposeError):
        ai_compose.compose_pages(PAGES, brand_name="G", niche="yoga", description="",
                                 goals=[], locale="en", tenant_schema="spend1")
    row = ai_compose.tenant_usage("spend1")
    row.refresh_from_db()
    assert row.usd_spent == Decimal("0.0100")
    assert row.composes_used == 0

    _compose(monkeypatch, [], tenant_schema="spend1")
    row.refresh_from_db()
    assert row.composes_used == 1


def test_compose_available_respects_flag_and_budget(monkeypatch, settings):
    monkeypatch.setattr(ai_compose.core_ai, "available", lambda: True)
    settings.ONBOARDING_AI_ENABLED = False
    assert ai_compose.compose_available() is False
    settings.ONBOARDING_AI_ENABLED = True
    assert ai_compose.compose_available() is True
    settings.ONBOARDING_AI_MONTHLY_BUDGET_USD = 0.005
    ai_compose.record_spend("budget-tenant", 0.01)
    assert ai_compose.compose_available() is False
