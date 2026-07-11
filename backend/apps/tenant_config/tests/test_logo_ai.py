"""Logo Studio AI internals: single-call refine, cost estimation, durable
usage accounting, and lockup validation. Anthropic is always mocked here — no
real network access in tests. See
docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md.
"""

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


class _FakePalette:
    def __init__(self, name="Sunrise", primary="#1a56db", secondary="#93c5fd", accent="#f59e0b", ink="#111827"):
        self.name = name
        self.primary = primary
        self.secondary = secondary
        self.accent = accent
        self.ink = ink


class _FakeRefined:
    """A parsed _RefinedDesign: mark/palette are fakes that duck-type the
    attributes _validate_pack_mark/_validate_pack_palette read, plus the lockup
    fields _validate_lockup adds on top."""

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


def _design(**overrides):
    """Builds a real, schema-validated `_Design` pydantic instance so tests
    can assert on pydantic validation itself (e.g. an invalid mark_gradient
    role) as well as the `_validate_lockup` clamps."""
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


def _mock_refine_client(monkeypatch, parsed=None, usage=None):
    response = _FakeResponse(parsed if parsed is not None else _FakeRefined(), usage or _FakeUsage())
    fake_client = SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: response))
    monkeypatch.setattr(core_ai, "_anthropic_client", lambda: fake_client)
    return response


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
