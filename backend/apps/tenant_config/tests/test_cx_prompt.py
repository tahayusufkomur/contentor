"""Prompts are generated from the catalog, so new primitives reach the model."""

from apps.tenant_config import sections
from apps.tenant_config.cx import prompt as cx_prompt
from apps.tenant_config.cx.catalog import icons, primitives

COACH = {
    "brand": "Maya Laurent",
    "niche": "yoga",
    "topic": "yoga",
    "description": "I teach slow flow.",
    "followups": [{"q": "Where do you teach?", "a": "Lisbon"}],
    "goals": ["course", "live"],
}


def test_system_prompt_lists_every_primitive_family_and_icon():
    text = cx_prompt.system_prompt()
    for name in primitives():
        assert f"- {name} [" in text
    for family in sections.families():
        assert f"- {family} (" in text
    assert ", ".join(icons()) in text
    assert '"name": "Retreat itinerary"' in text


def test_compose_turn_carries_request_coach_and_the_styles_layouts():
    turn = cx_prompt.compose_turn("A retreat itinerary", "about", COACH, "maison")
    assert "BUILD THIS SECTION: A retreat itinerary" in turn
    assert "PAGE: about" in turn
    assert "FACT: Where do you teach? — Lisbon" in turn
    assert "- benefits: edit" in turn


def test_compose_turn_without_a_style():
    assert "STYLE: neutral" in cx_prompt.compose_turn("A retreat itinerary", "home", COACH, "")


def test_refine_turn_carries_the_current_section():
    turn = cx_prompt.refine_turn("Warmer heading", {"csl": 1}, {"heading": "Hi"}, COACH, "maison")
    assert "CHANGE THIS SECTION: Warmer heading" in turn
    assert 'CURRENT CONTENT: {"heading": "Hi"}' in turn


def test_repair_turn_lists_at_most_twelve_problems():
    turn = cx_prompt.repair_turn("BUILD", [f"problem {i}" for i in range(20)])
    assert "- problem 11" in turn and "problem 12" not in turn
