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
    with mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")):
        payload, _ = engine.run_turn(TENANT, [], [], "add a call to action")
    (card,) = payload["actions"]
    assert card["kind"] == "add_block" and "Join us" in card["detail"]


def test_invalid_actions_are_dropped_and_fallback_answer_returned():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "add_block", "page": "home", "block_type": "testimonials", "fields": {}}],
    )
    with mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")):
        payload, _ = engine.run_turn(TENANT, [], [], "add testimonials")
    assert payload["kind"] == "answer"  # nothing proposable survived


def test_failed_model_call_still_reports_cost():
    from apps.core.ai import AiError

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=AiError("boom", cost_usd=Decimal("0.004"))),
        pytest.raises(AiError),
    ):
        engine.run_turn(TENANT, [], [], "hi")
