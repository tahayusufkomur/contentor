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


def test_critique_cannot_replace_a_traced_mark(monkeypatch):
    """A traced draft mark is immutable through the critique: the model
    can't re-author paths it never wrote, and element-echo matching alone
    proved brittle in live runs (drifted elements read as a 'redraw' and
    silently degraded the Gemini mark to primitives)."""
    draft = _draft_with_traced_paths()
    redrawn = {**_ICON_TURN["designs"][0], "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 20}]}
    result = _critique(monkeypatch, draft, [redrawn])
    assert result.designs[0]["paths"] == _TRACED_PATHS
    assert result.designs[0]["elements"] == draft["designs"][0]["elements"]


def test_critique_redraw_of_an_authored_mark_recompiles(monkeypatch):
    """Authored drafts (paths == their compiled elements) keep the redraw
    flow: the critique's new elements win."""
    parsed = logo_converse._IconTurn.model_validate({"message": "m", "designs": [_ICON_TURN["designs"][0]]})
    design = logo_converse._validate_icon_design(parsed.designs[0])  # authored: paths match elements
    draft = {"stage": "icon", "designs": [design], "message": "draft"}
    redrawn = {**_ICON_TURN["designs"][0], "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 20}]}
    result = _critique(monkeypatch, draft, [redrawn])
    assert result.designs[0]["paths"] != design["paths"]
    assert result.designs[0]["elements"][0]["r"] == 20


def test_critique_refine_keeps_traced_mark(monkeypatch):
    """Editor-refine Pass B: the cached (already traced-pinned) design's mark
    survives the critique redraw, same immutability rule as the stages."""
    from apps.tenant_config import logo_ai

    parsed = logo_ai._RefinedDesign.model_validate(
        {
            "mark": {"rationale": "redrawn", "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 20}]},
            "palette": {
                "name": "P",
                "primary": "#0f766e",
                "secondary": "#14b8a6",
                "accent": "#f59e0b",
                "ink": "#111827",
            },
            "font_vibe": "Minimal",
            "layout": "horizontal",
            "badge_shape": "none",
            "badge_outline": False,
            "font": "Manrope",
            "typography": {"case": "none", "tracking": 0, "weight": 700},
            "color_roles": {},
            "rationale": "r",
        }
    )
    monkeypatch.setattr(logo_converse.core_ai, "structured_messages", lambda **kwargs: (parsed, Decimal("0.01"), "m"))
    traced_mark = {
        "rationale": "traced",
        "paths": list(_TRACED_PATHS),
        "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 30}],
    }
    cached = {"kind": "refine", "design": {"mark": traced_mark}}
    result = logo_converse.critique_refine(cached, ["ZmFrZQ=="])
    assert result.design["mark"]["paths"] == _TRACED_PATHS
    assert result.design["font"] == "Manrope"  # restyling still applied


# --- pinned traced-path inheritance across stage transitions ---------------
# _NAME_TURN's design spreads _ICON_TURN["designs"][0] verbatim, so its
# "elements" is exactly [{"type": "circle", "cx": 50, "cy": 50, "r": 30}] —
# the same fixture used below as the "pinned" side of the match.
_TRACED_PATHS = [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]


def _validated_icon_elements():
    """The elements a real client actually echoes back as `pinned.mark_elements`
    — already normalized by _validate_pack_mark (floats, explicit fill/opacity/
    cut), exactly what the icon stage's API response hands back. Raw
    _ICON_TURN elements (bare ints, no defaults) would never json-match the
    equally-normalized elements _NAME_TURN's design recompiles to below (see
    _draft_with_traced_paths above for the same normalization gotcha)."""
    parsed = logo_converse._IconTurn.model_validate(_ICON_TURN)
    return logo_converse._validate_icon_design(parsed.designs[0])["elements"]


def test_name_stage_inherits_pinned_icon_traced_paths(monkeypatch, settings):
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    pinned = {
        "mark_elements": _validated_icon_elements(),
        "mark_paths": _TRACED_PATHS,
    }
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] == _TRACED_PATHS


def test_name_stage_stamps_traced_paths_even_when_model_drifts_elements(monkeypatch, settings):
    """THE fix for the live failure: haiku doesn't reliably echo the pinned
    elements byte-identically, so a traced pinned mark must be stamped
    unconditionally — element drift must never cost the coach their Gemini
    mark."""
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    pinned = {
        "mark_elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 99}],  # != _NAME_TURN's elements
        "mark_paths": _TRACED_PATHS,
    }
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] == _TRACED_PATHS


def test_name_stage_authored_pinned_mark_keeps_recompile_flow(monkeypatch, settings):
    """An authored pinned mark (paths == its own compiled elements) is NOT
    stamped — the model may legitimately fine-tune authored geometry, so its
    freshly compiled paths win."""
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    authored_elements = [{"type": "circle", "cx": 50, "cy": 50, "r": 20}]
    from apps.tenant_config.logo_ai import compile_elements

    authored_paths = logo_converse._validate_custom_paths(compile_elements(authored_elements))
    pinned = {"mark_elements": authored_elements, "mark_paths": authored_paths}
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] != authored_paths  # the model's own (r=30) mark, recompiled


def test_name_stage_ignores_hostile_pinned_paths(monkeypatch, settings):
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    hostile = [{"d": 'M0 0 url("x") Z', "fill": "mark"}]  # fails the injection whitelist
    pinned = {"mark_elements": _ICON_TURN["designs"][0]["elements"], "mark_paths": hostile}
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] != hostile
    assert design["paths"]  # still compiled through the trust boundary, not empty


def test_name_stage_without_mark_paths_recompiles_as_before(monkeypatch, settings):
    """No mark_paths sent at all (old client, or icon stage never picked) —
    byte-identical to pre-fix behavior."""
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    pinned = {"mark_elements": _ICON_TURN["designs"][0]["elements"]}
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"]
    assert design["paths"] != _TRACED_PATHS


def test_tagline_stage_inherits_pinned_lockup_traced_paths(monkeypatch, settings):
    """The name -> tagline half: pinned.lockup carries the whole previously-
    picked design, paths included (no frontend change needed for this half)."""
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    tagline_turn = {**_NAME_TURN, "message": "One line to finish it."}
    _mock_structured(monkeypatch, tagline_turn)
    pinned = {"lockup": {**_NAME_TURN["designs"][0], "elements": _validated_icon_elements(), "paths": _TRACED_PATHS}}
    result = logo_converse.converse_turn("tagline", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] == _TRACED_PATHS


def test_tagline_stage_prompt_never_permits_an_empty_tagline():
    """Content guard, not a behavioral test: the model's real compliance is
    unverifiable from a unit test (its response is always mocked here), so
    this only pins the prompt text itself — the old escape-hatch sentence
    must be gone and a positive non-empty requirement must be present. If
    this ever needs to change, that's a deliberate product decision, not an
    accidental revert."""
    prompt = logo_converse.TAGLINE_STAGE_PROMPT
    assert 'may keep tagline ""' not in prompt
    assert "non-empty" in prompt
