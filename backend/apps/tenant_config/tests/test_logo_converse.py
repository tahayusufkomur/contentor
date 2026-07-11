"""Staged Design-with-AI conversation: stage prompt selection, turn/critique
validation. core_ai is always mocked — no network access."""

from decimal import Decimal

import pytest

from apps.tenant_config import logo_converse

_ICON_TURN = {
    "message": "Here are three directions.",
    "designs": [
        {
            "concept": "A rising line.",
            "rationale": "Your practice, carried through.",
            "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 30}],
            "palette": {
                "name": "Calm",
                "primary": "#0f766e",
                "secondary": "#14b8a6",
                "accent": "#f59e0b",
                "ink": "#111827",
            },
            "color_roles": {"mark": "primary", "mark2": "secondary", "mark_accent": "accent"},
        }
    ],
}

_NAME_TURN = {
    "message": "Two lockups.",
    "designs": [
        {
            **_ICON_TURN["designs"][0],
            "layout": "horizontal",
            "badge_shape": "none",
            "badge_outline": False,
            "font": "Manrope",
            "typography": {"case": "none", "tracking": 0, "weight": 700},
            "color_roles": {
                "badge": "primary",
                "mark": "ink",
                "mark2": "secondary",
                "mark_accent": "accent",
                "text": "ink",
                "tagline": "secondary",
            },
            "mark_scale": 1.2,
            "mark_gradient": {"to": "accent", "angle": 45},
            "tagline": "",
        }
    ],
}


def _mock_structured(monkeypatch, payload, cost=Decimal("0.02")):
    def fake(*, system, user, output_model, model, max_tokens):
        return output_model.model_validate(payload), cost, model

    monkeypatch.setattr(logo_converse.core_ai, "structured", fake)
    return fake


class TestConverseTurn:
    def test_icon_turn_validates_marks_and_palette(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        _mock_structured(monkeypatch, _ICON_TURN)
        result = logo_converse.converse_turn("icon", {"brand_name": "Flow", "niche": "yoga"}, [], {}, "hi")
        assert result.message == "Here are three directions."
        (design,) = result.designs
        assert design["paths"]  # compiled through the trust boundary
        assert design["palette"]["primary"] == "#0f766e"

    def test_name_turn_carries_full_lockup(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        _mock_structured(monkeypatch, _NAME_TURN)
        result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], {"mark_elements": []}, "go")
        (design,) = result.designs
        assert design["mark_scale"] == 1.2
        assert design["mark_gradient"] == {"to": "accent", "angle": 45.0}

    def test_unknown_stage_rejected(self):
        with pytest.raises(ValueError):
            logo_converse.converse_turn("logo", {}, [], {}, "x")

    def test_all_invalid_marks_raise(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        bad = {**_ICON_TURN, "designs": [{**_ICON_TURN["designs"][0], "elements": []}]}
        _mock_structured(monkeypatch, bad)
        with pytest.raises(logo_converse.ConverseError):
            logo_converse.converse_turn("icon", {"brand_name": "Flow"}, [], {}, "hi")


class TestCritiqueTurn:
    def test_critique_returns_corrected_designs(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"

        def fake_messages(*, system, messages, output_model, model, max_tokens):
            # image blocks made it into the user turn
            blocks = messages[0]["content"]
            assert any(b.get("type") == "image" for b in blocks)
            return output_model.model_validate(_ICON_TURN), Decimal("0.01"), model

        monkeypatch.setattr(logo_converse.core_ai, "structured_messages", fake_messages)
        draft = {"stage": "icon", "message": "m", "designs": _ICON_TURN["designs"]}
        result = logo_converse.critique_turn("icon", draft, ["aGVsbG8="])
        assert result.designs


# --- image-model icon marks (generate -> vectorize) -----------------------

_TRACED_PATHS = [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]


def _icon_turn_with_prompts():
    turn = {
        "message": _ICON_TURN["message"],
        "designs": [{**_ICON_TURN["designs"][0], "image_prompt": "flat vector leaf mark"}],
    }
    return turn


def _run_icon_turn(monkeypatch, parsed_dict, enabled=True, images=None, image_cost=None, traced="unset"):
    from apps.tenant_config import logo_image, logo_trace

    parsed = logo_converse._IconTurn.model_validate(parsed_dict)
    monkeypatch.setattr(
        logo_converse.core_ai, "structured", lambda **kwargs: (parsed, Decimal("0.02"), "claude-sonnet-5")
    )
    monkeypatch.setattr(logo_image, "enabled", lambda: enabled)
    calls = {}

    def fake_generate(prompts):
        calls["prompts"] = prompts
        return (images if images is not None else [b"png"] * len(prompts)), (image_cost or Decimal("0.067"))

    monkeypatch.setattr(logo_image, "generate_mark_images", fake_generate)
    monkeypatch.setattr(logo_trace, "trace_mark", lambda png: _TRACED_PATHS if traced == "unset" else traced)
    result = logo_converse.converse_turn("icon", {}, [], {}, "hi")
    return result, calls


def test_icon_turn_swaps_in_traced_paths_and_adds_image_cost(monkeypatch):
    result, calls = _run_icon_turn(monkeypatch, _icon_turn_with_prompts())
    assert calls["prompts"] == ["flat vector leaf mark"]
    assert result.designs[0]["paths"] == _TRACED_PATHS
    assert result.cost_usd == Decimal("0.02") + Decimal("0.067")
    assert "image_prompt" not in result.designs[0]


def test_icon_turn_gemini_failure_falls_back_to_authored_paths(monkeypatch):
    plain = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)[0]
    result, _ = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), images=[None])
    assert result.designs[0]["paths"] == plain.designs[0]["paths"]  # authored compile
    assert result.cost_usd == Decimal("0.02") + Decimal("0.067")  # attempt still billed


def test_icon_turn_trace_rejection_falls_back(monkeypatch):
    plain = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)[0]
    result, _ = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), traced=None)
    assert result.designs[0]["paths"] == plain.designs[0]["paths"]


def test_icon_turn_invalid_traced_paths_fall_back(monkeypatch):
    plain = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)[0]
    hostile = [{"d": 'M0 0 url("x") Z', "fill": "mark"}]  # fails the injection whitelist
    result, _ = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), traced=hostile)
    assert result.designs[0]["paths"] == plain.designs[0]["paths"]


def test_icon_turn_key_unset_never_generates_and_strips_prompt(monkeypatch):
    result, calls = _run_icon_turn(monkeypatch, _icon_turn_with_prompts(), enabled=False)
    assert "prompts" not in calls
    assert result.cost_usd == Decimal("0.02")
    assert "image_prompt" not in result.designs[0]


def test_name_stage_never_generates_images(monkeypatch):
    from apps.tenant_config import logo_image

    parsed = logo_converse._LockupTurn.model_validate(_NAME_TURN)
    monkeypatch.setattr(logo_converse.core_ai, "structured", lambda **kwargs: (parsed, Decimal("0.02"), "m"))
    monkeypatch.setattr(logo_image, "enabled", lambda: True)
    monkeypatch.setattr(logo_image, "generate_mark_images", lambda prompts: pytest.fail("image gen on name stage"))
    logo_converse.converse_turn("name", {}, [], {}, "hi")


# --- critique keep-rule: unchanged elements keep traced paths --------------
# _TRACED_PATHS and _ICON_TURN already exist in this file (_ICON_TURN from
# before this feature; _TRACED_PATHS added by the image-marks block above:
# [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]).


def _draft_with_traced_paths():
    """A cached icon draft whose paths came from tracing (NOT from compiling
    its elements) — exactly what apply_image_marks produces. Built through
    the real validation path (not a raw _ICON_TURN dict) because
    _validate_pack_mark normalizes `elements` (fills in fill/opacity/cut,
    floats the coordinates) — a real cached draft always has that shape, and
    the keep-rule compares against exactly this normalized form."""
    parsed = logo_converse._IconTurn.model_validate({"message": "m", "designs": [_ICON_TURN["designs"][0]]})
    design = logo_converse._validate_icon_design(parsed.designs[0])
    design["paths"] = list(_TRACED_PATHS)
    return {"stage": "icon", "designs": [design], "message": "draft"}


def _critique(monkeypatch, draft, critique_designs):
    parsed = logo_converse._IconTurn.model_validate({"message": "Reviewed.", "designs": critique_designs})
    monkeypatch.setattr(logo_converse.core_ai, "structured_messages", lambda **kwargs: (parsed, Decimal("0.01"), "m"))
    return logo_converse.critique_turn("icon", draft, ["ZmFrZQ=="])


def test_critique_with_unchanged_elements_keeps_traced_paths(monkeypatch):
    draft = _draft_with_traced_paths()
    kept = dict(_ICON_TURN["designs"][0])  # same elements, no paths field
    result = _critique(monkeypatch, draft, [kept])
    assert result.designs[0]["paths"] == _TRACED_PATHS


def test_critique_redraw_recompiles_from_new_elements(monkeypatch):
    draft = _draft_with_traced_paths()
    # Same element type, different geometry — a genuine redraw.
    redrawn = {**_ICON_TURN["designs"][0], "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 20}]}
    result = _critique(monkeypatch, draft, [redrawn])
    assert result.designs[0]["paths"] != _TRACED_PATHS
    assert result.designs[0]["elements"][0]["r"] == 20
