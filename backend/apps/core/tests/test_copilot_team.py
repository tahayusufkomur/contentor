"""The six specialists: who they are, and who signs which action."""

import typing

from apps.core.copilot import engine, team


def _action_kinds():
    union = typing.get_args(engine.CopilotAction)[0]
    return {typing.get_args(model.model_fields["kind"].annotation)[0] for model in typing.get_args(union)}


def test_every_action_kind_has_an_owner():
    kinds = _action_kinds()
    assert len(kinds) > 20
    assert set(team.OWNERS) == kinds
    assert set(team.OWNERS.values()) <= set(team.KEYS)


def test_clean_keeps_known_keys_and_falls_back():
    assert team.clean("finance") == "finance"
    for junk in ("ceo", None, 7, {"x": 1}, ""):
        assert team.clean(junk) == "assistant"


def test_a_price_only_edit_is_the_financial_strategists():
    course = {"kind": "edit_course", "course_id": 1, "title": None, "description": None, "price": 49.0}
    assert team.owner_of("edit_course", course) == "finance"
    assert team.owner_of("edit_course", {**course, "title": "New"}) == "content"
    event = {
        "kind": "edit_event",
        "event_id": 3,
        "event_kind": "live",
        "title": None,
        "description": None,
        "scheduled_at": None,
        "location": None,
        "zoom_link": None,
        "price": 15.0,
    }
    assert team.owner_of("edit_event", event) == "finance"
    assert team.owner_of("edit_event", {**event, "location": "Studio 2"}) == "content"


def test_a_message_is_signed_by_whichever_owner_wrote_it():
    assert team.owner_of("draft_announcement", writer="marketing") == "marketing"
    assert team.owner_of("draft_announcement", writer="community") == "community"
    assert team.owner_of("draft_announcement", writer="designer") == "community"
    assert team.owner_of("draft_announcement") == "community"
    assert team.owner_of("draft_email") == "marketing"
    assert team.owner_of("draft_email", writer="community") == "community"


def test_unknown_kinds_belong_to_the_assistant():
    assert team.owner_of("nonsense") == "assistant"


def test_each_prompt_section_names_its_specialist_and_the_roster():
    sections = {key: team.prompt_section(key) for key in team.KEYS}
    for key, text in sections.items():
        assert f"You are the {team.NAMES[key]}." in text
        for name in team.NAMES.values():
            assert name in text
    assert len(set(sections.values())) == len(team.KEYS)
