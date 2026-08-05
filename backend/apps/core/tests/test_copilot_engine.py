"""run_turn: model union in, executable proposal cards out. The model is
always mocked — these tests pin the post-processing contract."""

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.core.copilot import engine

pytestmark = pytest.mark.django_db

TENANT = SimpleNamespace(schema_name="demo_yoga", name="Demo Yoga", wizard_state={"answers": {"niche": "yoga"}})


def _turn(**kw):
    return engine.CopilotTurn.model_validate(kw)


def _run(parsed):
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine.site_ai, "preview_edit", return_value=({"home": []}, {}, Decimal("0"))),
        mock.patch.object(
            engine.site_ai,
            "diff_current",
            return_value=[{"page": "home", "block_type": "hero", "field": "heading", "old": "a", "new": "b"}],
        ),
    ):
        return engine.run_turn(TENANT, [], [], "hi")


def test_answer_and_ask_pass_through():
    payload, cost = _run(_turn(kind="answer", text="You can sell courses."))
    assert payload == {"kind": "answer", "text": "You can sell courses."}
    assert cost == Decimal("0.01")
    payload, _ = _run(_turn(kind="ask", text="Warmer how — colors or copy?"))
    assert payload["kind"] == "ask"


def test_edit_pages_action_becomes_card_with_changes_and_token():
    parsed = _turn(
        kind="actions", text="Here's my plan", actions=[{"kind": "edit_pages", "instruction": "warmer hero"}]
    )
    with (
        mock.patch.object(engine.site_ai, "preview_edit", return_value=({"home": []}, {}, Decimal("0"))),
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(
            engine.site_ai,
            "diff_current",
            return_value=[{"page": "home", "field": "heading", "block_type": "hero", "old": "a", "new": "b"}],
        ),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "make it warmer")
    (card,) = payload["actions"]
    assert card["kind"] == "edit_pages" and card["changes"][0]["new"] == "b"
    assert card["token"]  # stashed and executable


def test_add_block_card_carries_the_built_block():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "add_block", "page": "home", "block_type": "cta", "fields": {"heading": "Join us"}}],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "add a call to action")
    (card,) = payload["actions"]
    assert card["kind"] == "add_block" and "Join us" in card["detail"]


def test_invalid_actions_are_dropped_and_fallback_answer_returned():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "add_block", "page": "home", "block_type": "testimonials", "fields": {}}],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "add testimonials")
    assert payload["kind"] == "answer"  # nothing proposable survived


def test_failed_model_call_still_reports_cost():
    from apps.core.ai import AiError

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=AiError("boom", cost_usd=Decimal("0.004"))),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        pytest.raises(AiError),
    ):
        engine.run_turn(TENANT, [], [], "hi")


def test_create_course_action_becomes_card_with_stashed_params():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_course",
                "title": "Yoga Foundations",
                "description": "Start here.",
                "price": 49,
                "modules": [{"title": "Basics", "lessons": ["Breathing", "Posture"]}],
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "create my first course")
    (card,) = payload["actions"]
    assert card["kind"] == "create_course"
    assert "Yoga Foundations" in card["title"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["pricing_type"] == "paid"
    assert stashed["params"]["price"] == "49.00"
    assert stashed["params"]["modules"][0]["lessons"] == [{"title": "Breathing"}, {"title": "Posture"}]
    assert "is_published" not in stashed["params"]


def test_create_event_card_requires_future_date():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_event",
                "event_kind": "live",
                "title": "Morning flow",
                "scheduled_at": "2020-01-01T09:00:00Z",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "schedule a class")
    assert payload["kind"] == "answer"  # past-date proposal dropped, fallback answer


def test_create_event_onsite_card_stashes_location_and_kind():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_event",
                "event_kind": "onsite",
                "title": "Berlin retreat",
                "location": "Studio Mitte",
                "scheduled_at": "2030-06-01T10:00:00Z",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "plan a retreat")
    (card,) = payload["actions"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["event_kind"] == "onsite"
    assert stashed["params"]["location"] == "Studio Mitte"
    assert stashed["params"]["scheduled_at"].startswith("2030-06-01")


def test_create_blog_post_card_maps_summary_to_excerpt():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_blog_post",
                "title": "5 stretches",
                "summary": "A five-minute routine.",
                "body_html": "<p>Go.</p>",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "write a blog post")
    (card,) = payload["actions"]
    assert card["kind"] == "create_blog_post"
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["excerpt"] == "A five-minute routine."
    assert "status" not in stashed["params"]
