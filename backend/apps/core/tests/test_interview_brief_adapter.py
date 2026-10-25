"""Brief facts from the /setup interview reach every AI consumer."""

from types import SimpleNamespace

from apps.core.onboarding import site_composer
from apps.core.onboarding.ai_curate import CoachBrief

STATE = {
    "flow": "interview",
    "answers": {
        "niche": "yoga",
        "description": "Gentle yoga for desk workers",
        "teaches": "Yoga",
        "audience": "Desk workers",
        "story": "Taught for 12 years after a back injury",
        "description_followups": {"items": [{"q": "Old question?", "a": "Old answer"}]},
    },
}


def _tenant():
    return SimpleNamespace(wizard_state=STATE, name="Glow", template_niche="yoga")


def test_coach_brief_carries_interview_facts():
    brief = CoachBrief.from_tenant(_tenant())
    assert ("Old question?", "Old answer") in brief.followups
    assert ("Who they work with", "Desk workers") in brief.followups
    assert ("Their story", "Taught for 12 years after a back injury") in brief.followups


def test_composer_coach_data_carries_interview_facts():
    data = site_composer._coach_data(_tenant(), "Glow")
    assert {"q": "Who they work with", "a": "Desk workers"} in data["followups"]
    assert data["description"] == "Gentle yoga for desk workers"


def test_composer_coach_data_speaks_as_she_answered():
    several = {**STATE, "answers": {**STATE["answers"], "teachers": "several"}}
    tenant = SimpleNamespace(wizard_state=several, name="Glow", template_niche="yoga")
    assert site_composer._coach_data(tenant, "Maya Laurent")["speaker"] == "we"
    assert site_composer._coach_data(_tenant(), "Maya Laurent")["speaker"] == "I"  # no answer: the guess
