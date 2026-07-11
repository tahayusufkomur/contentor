"""AI Brand Pack (Logo Studio): one Claude call -> bespoke vector marks +
brand palettes. Anthropic is always mocked here — no real network access in
tests. See docs/superpowers/specs/2026-07-08-logo-ai-brand-pack-design.md
and docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md.
"""

import json
import subprocess
from decimal import Decimal
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from apps.core import ai as core_ai
from apps.core.models import LogoAiUsage
from apps.tenant_config import logo_ai


class _FakeMark:
    """Marks carry geometric elements (dicts are accepted alongside pydantic
    instances by _validate_pack_mark) that logo_geometry compiles to paths."""

    def __init__(self, rationale="A rising ring", elements=None):
        self.rationale = rationale
        self.elements = elements if elements is not None else [logo_ai._Circle(type="circle", cx=50, cy=50, r=20)]


class _FakeDesign:
    """A full Brand Pack v3 design: geometry (rationale/elements, same shape
    _validate_pack_mark already expects) plus the lockup fields
    _validate_lockup/_validate_design add on top."""

    def __init__(self, **overrides):
        self.concept = overrides.get("concept", "A rising ring")
        self.rationale = overrides.get("rationale", "Feels like growth.")
        self.elements = overrides.get(
            "elements",
            [logo_ai._Circle(type="circle", cx=50, cy=50, r=20)],
        )
        self.layout = overrides.get("layout", "horizontal")
        self.badge_shape = overrides.get("badge_shape", "none")
        self.badge_outline = overrides.get("badge_outline", False)
        self.font = overrides.get("font", "Manrope")
        self.typography = overrides.get("typography", logo_ai._Typography(case="upper", tracking=0.12, weight=600))
        self.palette_index = overrides.get("palette_index", 1)
        self.color_roles = overrides.get("color_roles", logo_ai._ColorRoles())
        self.mark_scale = overrides.get("mark_scale", 1.0)
        self.mark_gradient = overrides.get("mark_gradient")


class _FakePalette:
    def __init__(self, name="Sunrise", primary="#1a56db", secondary="#93c5fd", accent="#f59e0b", ink="#111827"):
        self.name = name
        self.primary = primary
        self.secondary = secondary
        self.accent = accent
        self.ink = ink


class _FakeRefined:
    """A parsed _RefinedDesign: mark/palette are fakes too (same pattern as
    _FakeDesign for the pack flow), plus the lockup fields
    _validate_lockup adds on top."""

    def __init__(self, **overrides):
        self.mark = overrides.get("mark", _FakeMark())
        self.palette = overrides.get("palette", _FakePalette())
        self.font_vibe = overrides.get("font_vibe", "Elegant")
        self.layout = overrides.get("layout", "horizontal")
        self.badge_shape = overrides.get("badge_shape", "none")
        self.badge_outline = overrides.get("badge_outline", False)
        self.font = overrides.get("font", "Manrope")
        self.typography = overrides.get("typography", logo_ai._Typography())
        self.color_roles = overrides.get("color_roles", logo_ai._ColorRoles())
        self.rationale = overrides.get("rationale", "Refined to fit the instruction.")
        self.mark_scale = overrides.get("mark_scale", 1.0)
        self.mark_gradient = overrides.get("mark_gradient")


class _FakeParsedOutput:
    def __init__(self, designs, palettes, tagline="Breathe deeply.", font_vibe="Elegant"):
        self.designs = designs
        self.palettes = palettes
        self.tagline = tagline
        self.font_vibe = font_vibe


class _FakeUsage:
    def __init__(
        self,
        input_tokens=200,
        output_tokens=2000,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    ):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.cache_read_input_tokens = cache_read_input_tokens
        self.cache_creation_input_tokens = cache_creation_input_tokens


class _FakeResponse:
    def __init__(self, parsed_output, usage):
        self.parsed_output = parsed_output
        self.usage = usage


def _valid_designs():
    return [
        _FakeDesign(
            rationale="A rising line evokes growth.",
            elements=[{"type": "path", "d": "M10 10 L90 90 Z", "fill": "mark2"}],
        ),
        _FakeDesign(
            rationale="A closed loop for community.",
            elements=[{"type": "ring", "cx": 50, "cy": 50, "r": 40, "thickness": 6}],
        ),
        _FakeDesign(
            rationale="Bad mark, only unsafe paths.",
            elements=[{"type": "path", "d": "javascript:alert(1)"}],
        ),
    ]


def _design(**overrides):
    """Builds a real, schema-validated `_Design` pydantic instance (unlike
    `_FakeDesign`, which just duck-types the attributes) so tests can assert
    on pydantic validation itself (e.g. an invalid mark_gradient role)."""
    fields = {
        "concept": "A rising ring",
        "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 20}],
        "rationale": "Feels like growth.",
        "layout": "horizontal",
        "badge_shape": "none",
        "badge_outline": False,
        "font": "Manrope",
        "typography": {"case": "upper", "tracking": 0.12, "weight": 600},
        "palette_index": 1,
        "color_roles": {},
    }
    fields.update(overrides)
    return logo_ai._Design(**fields)


def _valid_palettes():
    return [
        _FakePalette("Sunrise", "#e11d48", "#f97316", "#fbbf24", "#111827"),
        _FakePalette("Ocean", "#0ea5e9", "#1d4ed8", "#38bdf8", "#f9fafb"),  # too-light ink
        _FakePalette("Slate", "#334155", "#64748b", "#94a3b8", "#0f172a"),
    ]


def _mock_client(monkeypatch, designs=None, palettes=None, usage=None):
    response = _FakeResponse(
        _FakeParsedOutput(
            designs if designs is not None else _valid_designs(),
            palettes if palettes is not None else _valid_palettes(),
        ),
        usage or _FakeUsage(),
    )
    fake_client = SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: response))
    monkeypatch.setattr(core_ai, "_anthropic_client", lambda: fake_client)
    return response


def _mock_refine_client(monkeypatch, parsed=None, usage=None):
    response = _FakeResponse(parsed if parsed is not None else _FakeRefined(), usage or _FakeUsage())
    fake_client = SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: response))
    monkeypatch.setattr(core_ai, "_anthropic_client", lambda: fake_client)
    return response


@pytest.mark.django_db
class TestGenerateBrandPack:
    def test_returns_validated_pack_and_estimated_cost(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        _mock_client(monkeypatch)
        result = logo_ai.generate_brand_pack("Zeynep Yoga", "yoga", "#1a56db")
        # the all-unsafe-path design is dropped; the other two survive
        assert len(result.pack["designs"]) == 2
        assert result.pack["designs"][0]["paths"] == [{"d": "M10 10 L90 90 Z", "fill": "mark2"}]
        assert result.pack["designs"][0]["rationale"] == "A rising line evokes growth."
        # the ring element was compiled to an evenodd two-disc path
        ring = result.pack["designs"][1]["paths"][0]
        assert ring["fill_rule"] == "evenodd"
        assert ring["d"].count("M") == 2
        assert len(result.pack["palettes"]) == 3
        assert result.pack["tagline"] == "Breathe deeply."
        assert result.pack["font_vibe"] == "Elegant"
        assert result.cost_usd > 0

    def test_pack_carries_full_designs(self, monkeypatch, settings):
        _mock_client(
            monkeypatch,
            designs=[_FakeDesign()],
            palettes=[_valid_palettes()[0]],
        )
        result = logo_ai.generate_brand_pack("Kai Coaching", "yoga", "#1a56db")
        design = result.pack["designs"][0]
        assert design["concept"] == "A rising ring"
        assert design["layout"] == "horizontal"
        assert design["badge_shape"] == "none"
        assert design["font"] == "Manrope"
        assert design["typography"] == {"case": "upper", "tracking": 0.12, "weight": 600}
        assert design["palette_index"] == 0  # clamped: only 1 palette in the fake
        assert design["color_roles"]["mark"] == "ink"
        assert design["paths"]  # compiled + validated as before
        assert "marks" not in result.pack

    def test_palette_index_and_free_text_are_clamped(self, monkeypatch):
        _mock_client(
            monkeypatch,
            designs=[
                _FakeDesign(
                    palette_index=99,
                    font="F" * 200,
                    concept="c" * 500,
                    typography=logo_ai._Typography(case="none", tracking=9, weight=700),
                )
            ],
            palettes=[_valid_palettes()[0]],
        )
        result = logo_ai.generate_brand_pack("Kai Coaching", "yoga", "#1a56db")
        design = result.pack["designs"][0]
        assert design["palette_index"] == 0
        assert len(design["font"]) == 60
        assert len(design["concept"]) == 200
        assert design["typography"]["tracking"] == 0.4

    def test_substitutes_low_contrast_ink(self, monkeypatch):
        _mock_client(monkeypatch)
        result = logo_ai.generate_brand_pack("Z", "yoga", "#1a56db")
        assert result.pack["palettes"][1]["ink"] == "#1a1a1a"
        # untouched, already-dark inks are kept
        assert result.pack["palettes"][0]["ink"] == "#111827"
        assert result.pack["palettes"][2]["ink"] == "#0f172a"

    def test_invalid_hex_in_palette_falls_back_to_primary(self, monkeypatch):
        palettes = [_FakePalette("Bad", "#1a56db", "not-a-color", "also-bad", "#111827")]
        _mock_client(monkeypatch, palettes=palettes)
        result = logo_ai.generate_brand_pack("Z", "yoga", "#1a56db")
        assert result.pack["palettes"][0]["secondary"] == "#1a56db"
        assert result.pack["palettes"][0]["accent"] == "#1a56db"

    def test_raises_when_every_mark_is_invalid(self, monkeypatch):
        _mock_client(
            monkeypatch,
            designs=[_FakeDesign(rationale="bad", elements=[])],
        )
        with pytest.raises(logo_ai.BrandPackError):
            logo_ai.generate_brand_pack("Z", "yoga", "#1a56db")

    def test_error_carries_estimated_cost_even_on_validation_failure(self, monkeypatch):
        _mock_client(
            monkeypatch,
            designs=[_FakeDesign(rationale="bad", elements=[])],
        )
        with pytest.raises(logo_ai.BrandPackError) as exc_info:
            logo_ai.generate_brand_pack("Z", "yoga", "#1a56db")
        assert exc_info.value.cost_usd > 0

    def test_client_exception_wraps_into_brand_pack_error(self, monkeypatch):
        # core.ai.structured wraps every anthropic SDK/network failure into
        # AiError; generate_brand_pack re-raises it as BrandPackError with
        # cost_usd=0 (no usage data on a failed call).
        def raise_parse(**kw):
            raise RuntimeError("boom")

        fake_client = SimpleNamespace(messages=SimpleNamespace(parse=raise_parse))
        monkeypatch.setattr(core_ai, "_anthropic_client", lambda: fake_client)
        with pytest.raises(logo_ai.BrandPackError) as exc_info:
            logo_ai.generate_brand_pack("Z", "yoga", "#1a56db")
        assert exc_info.value.cost_usd == Decimal("0")

    def test_generate_brand_pack_via_cli_provider(self, settings, monkeypatch):
        settings.AI_PROVIDER = "cli"
        settings.AI_CLI_BIN = "claude"
        settings.AI_CLI_MODEL = "haiku"
        pack_json = json.dumps(
            {
                "designs": [
                    {
                        "concept": "A steady ring.",
                        "rationale": "A ring.",
                        "elements": [{"type": "ring", "cx": 50, "cy": 50, "r": 42, "thickness": 8}],
                        "layout": "horizontal",
                        "badge_shape": "none",
                        "badge_outline": False,
                        "font": "Inter",
                        "typography": {"case": "none", "tracking": 0, "weight": 700},
                        "palette_index": 0,
                        "color_roles": {
                            "badge": "primary",
                            "mark": "ink",
                            "mark2": "secondary",
                            "mark_accent": "accent",
                            "text": "ink",
                            "tagline": "secondary",
                        },
                    }
                ],
                "palettes": [
                    {
                        "name": "Deep",
                        "primary": "#1a56db",
                        "secondary": "#93c5fd",
                        "accent": "#f59e0b",
                        "ink": "#111827",
                    }
                ],
                "tagline": "",
                "font_vibe": "Modern",
            }
        )
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps({"result": pack_json}), stderr=""
        )
        monkeypatch.setattr("subprocess.run", lambda cmd, **kw: completed)
        result = logo_ai.generate_brand_pack("Acme Coaching", "yoga", "#1a56db")
        assert result.cost_usd == Decimal("0")
        assert len(result.pack["designs"]) == 1
        assert result.pack["palettes"][0]["primary"] == "#1a56db"


@pytest.mark.django_db
class TestRefineDesign:
    def test_refine_design_carries_lockup_fields(self, monkeypatch):
        parsed = _FakeRefined(
            mark=_FakeMark(),
            palette=_FakePalette(),
            font_vibe="Script",
            layout="stacked",
            badge_shape="circle",
            badge_outline=True,
            font="Dancing Script",
            typography=logo_ai._Typography(case="title", tracking=0, weight=500),
            color_roles=logo_ai._ColorRoles(badge="ink", mark="white"),
            rationale="Warmer and softer.",
        )
        _mock_refine_client(monkeypatch, parsed=parsed)
        result = logo_ai.refine_design({}, [], "make it warmer")
        assert result.design["badge_shape"] == "circle"
        assert result.design["badge_outline"] is True
        assert result.design["font"] == "Dancing Script"
        assert result.design["typography"]["weight"] == 500
        assert result.design["color_roles"]["badge"] == "ink"
        assert result.design["layout"] == "stacked"


class TestEstimateCost:
    def test_sonnet_input_pricing(self):
        usage = _FakeUsage(input_tokens=1_000_000, output_tokens=0)
        assert core_ai.estimate_cost(usage, "claude-sonnet-5") == pytest.approx(2.00)

    def test_haiku_output_pricing(self):
        usage = _FakeUsage(input_tokens=0, output_tokens=1_000_000)
        assert core_ai.estimate_cost(usage, "claude-haiku-4-5") == pytest.approx(5.00)

    def test_cache_read_is_cheaper_than_input(self):
        usage = _FakeUsage(input_tokens=0, output_tokens=0, cache_read_input_tokens=1_000_000)
        assert core_ai.estimate_cost(usage, "claude-sonnet-5") < 2.00

    def test_unknown_model_defaults_to_sonnet_pricing(self):
        usage = _FakeUsage(input_tokens=1_000_000, output_tokens=0)
        assert core_ai.estimate_cost(usage, "some-future-model") == pytest.approx(2.00)


@pytest.mark.django_db
class TestUsageAccounting:
    def test_record_attempt_cost_accumulates_across_calls(self):
        logo_ai.record_attempt_cost("acme", 0.05, month="2026-07")
        logo_ai.record_attempt_cost("acme", 0.03, month="2026-07")
        row = LogoAiUsage.objects.get(tenant_schema="acme", month="2026-07")
        assert row.usd_spent == Decimal("0.08")
        assert row.packs_used == 0  # attempts alone never charge quota

    def test_record_successful_pack_increments_quota_only(self):
        logo_ai.record_successful_pack("acme", month="2026-07")
        logo_ai.record_successful_pack("acme", month="2026-07")
        row = LogoAiUsage.objects.get(tenant_schema="acme", month="2026-07")
        assert row.packs_used == 2
        assert row.usd_spent == 0

    def test_global_spend_sums_across_tenants_for_the_month_only(self):
        logo_ai.record_attempt_cost("acme", 1.5, month="2026-07")
        logo_ai.record_attempt_cost("beta", 2.5, month="2026-07")
        logo_ai.record_attempt_cost("acme", 10, month="2026-06")
        assert logo_ai.global_spend(month="2026-07") == Decimal("4.0")

    def test_tenant_usage_scoped_to_tenant_and_month(self):
        logo_ai.record_successful_pack("acme", month="2026-07")
        logo_ai.record_successful_pack("beta", month="2026-07")
        assert logo_ai.tenant_usage("acme", month="2026-07").packs_used == 1
        assert logo_ai.tenant_usage("acme", month="2026-06").packs_used == 0


class TestLockupProportionAndGradient:
    def test_defaults_pass_through(self):
        shaped = logo_ai._validate_lockup(_design())
        assert shaped["mark_scale"] == 1.0
        assert shaped["mark_gradient"] is None

    def test_mark_scale_clamped(self):
        shaped = logo_ai._validate_lockup(_design(mark_scale=9.0))
        assert shaped["mark_scale"] == 1.8
        shaped = logo_ai._validate_lockup(_design(mark_scale=0.1))
        assert shaped["mark_scale"] == 0.6

    def test_mark_gradient_shaped_and_angle_clamped(self):
        shaped = logo_ai._validate_lockup(_design(mark_gradient={"to": "accent", "angle": 999}))
        assert shaped["mark_gradient"] == {"to": "accent", "angle": 360.0}

    def test_gradient_to_white_rejected_by_schema(self):
        with pytest.raises(ValidationError):
            _design(mark_gradient={"to": "white", "angle": 90})
