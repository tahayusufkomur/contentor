"""logo_gen.color + logo_gen.brief: palette conversion and the prompt."""

import pytest
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.tenant_config.logo_gen import brief as lb
from apps.tenant_config.logo_gen.color import oklch_to_hex


@pytest.mark.parametrize(
    "oklch, expected",
    [
        ("oklch(1 0 0)", "#ffffff"),
        ("oklch(0 0 0)", "#000000"),
        ("oklch(0.48 0.1 12)", "#8d434e"),  # atelier primary
        ("oklch(0.17 0.014 160)", "#0a110d"),  # terminal background
    ],
)
def test_oklch_to_hex(oklch, expected):
    assert oklch_to_hex(oklch) == expected


def test_oklch_to_hex_clamps_out_of_gamut():
    assert oklch_to_hex("oklch(0.83 0.22 148)") == "#3cec6d"  # terminal primary (channels clamp to 0..255)


def _brief():
    return lb.LogoBrief(
        brand="Elara Face Yoga",
        business="face yoga and facial massage for women over 40",
        mood="A beauty atelier — blush paper, a light italic serif.",
        typography="a light high-contrast serif (Cormorant-like) paired with a clean sans",
        palette={
            "background": "#f8eeea",
            "surface": "#f2e2dd",
            "primary": "#8c4451",
            "accent": "#a6713a",
            "ink": "#3f2a2b",
            "muted": "#7a5f60",
        },
        style_id="atelier",
        palette_id="",
    )


def test_image_prompt_carries_every_brief_field_and_the_rules():
    text = lb.image_prompt(_brief(), lb.Concept(concept="a face in profile drawn in one line", archetype="mark_name"))
    for needle in (
        '"Elara Face Yoga" (spell it exactly)',
        "women over 40",
        "blush paper",
        "Cormorant-like",
        "background #f8eeea",
        "primary #8c4451",
        "accent #a6713a",
        "text #3f2a2b",
        "Use only these colours",
        "Mark concept: a face in profile drawn in one line",
        "a symbol or pictorial mark on the left",
        "No words, letters or characters other than the brand name",
        "aspect ratio 4:3",
        "32 pixels",
    ):
        assert needle in text
    assert "tagline" not in text.lower()


def test_image_prompt_archetypes_change_the_composition_sentence():
    word = lb.image_prompt(_brief(), lb.Concept(concept="x", archetype="wordmark"))
    emblem = lb.image_prompt(_brief(), lb.Concept(concept="x", archetype="emblem"))
    assert "the typography itself is the logo" in word
    assert "mark and name inside one enclosing shape" in emblem


@pytest.mark.django_db
def test_logo_brief_from_tenant_reads_the_style_palette(tenant_with_interview):
    tenant, answers = tenant_with_interview  # fixture: see conftest below
    b = lb.logo_brief(tenant, {**answers, "style": "atelier", "palette": ""})
    assert b.brand == tenant.name
    assert b.style_id == "atelier" and b.palette["primary"] == "#8d434e"
    assert set(b.palette) == set(lb.ROLES)
    assert "Cormorant" in b.typography and "atelier" in b.mood.lower()


@pytest.mark.django_db
def test_logo_brief_uses_the_palette_variant(tenant_with_interview):
    tenant, answers = tenant_with_interview
    own = lb.logo_brief(tenant, {**answers, "style": "atelier", "palette": ""})
    fig = lb.logo_brief(tenant, {**answers, "style": "atelier", "palette": "fig"})
    assert own.palette["primary"] != fig.palette["primary"] and fig.palette_id == "fig"


def test_concepts_for_returns_count_distinct_archetypes(monkeypatch):
    class _Out(BaseModel):
        concepts: list

    def fake_structured(**kw):
        assert kw["effort"] == "max"
        return (
            kw["output_model"].model_validate(
                {
                    "concepts": [
                        {"concept": "a lotus whose petals form a face", "archetype": "mark_name"},
                        {"concept": "the name set in a thin serif with a hairline", "archetype": "wordmark"},
                        {"concept": "a profile inside an arch", "archetype": "emblem"},
                    ]
                }
            ),
            0,
            "gemini-3.1-pro-high",
        )

    monkeypatch.setattr(core_ai, "structured", fake_structured)
    out = lb.concepts_for(_brief(), count=3)
    assert [c.archetype for c in out] == ["mark_name", "wordmark", "emblem"]


def test_concepts_for_falls_back_when_the_model_fails(monkeypatch):
    def boom(**kw):
        raise core_ai.AiError("down")

    monkeypatch.setattr(core_ai, "structured", boom)
    out = lb.concepts_for(_brief(), count=3, avoid=["x"], defects=["generic"])
    assert len(out) == 3 and {c.archetype for c in out} == {"mark_name", "wordmark", "emblem"}
