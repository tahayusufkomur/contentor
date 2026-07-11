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
