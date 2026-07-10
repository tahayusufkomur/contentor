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

from apps.core import ai as core_ai
from apps.core.models import LogoAiUsage
from apps.tenant_config import logo_ai


class _FakePath:
    def __init__(self, d, fill="mark", fill_rule=None, opacity=None):
        self.d = d
        self.fill = fill
        self.fill_rule = fill_rule
        self.opacity = opacity


class _FakeMark:
    def __init__(self, rationale, paths):
        self.rationale = rationale
        self.paths = paths


class _FakePalette:
    def __init__(self, name, primary, secondary, accent, ink):
        self.name = name
        self.primary = primary
        self.secondary = secondary
        self.accent = accent
        self.ink = ink


class _FakeParsedOutput:
    def __init__(self, marks, palettes, tagline="Breathe deeply.", font_vibe="Elegant"):
        self.marks = marks
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


def _valid_marks():
    return [
        _FakeMark("A rising line evokes growth.", [_FakePath("M10 10 L90 90 Z", "mark2")]),
        _FakeMark("A closed loop for community.", [_FakePath("M0 0 H100 V100 Z")]),
        _FakeMark("Bad mark, only unsafe paths.", [_FakePath("javascript:alert(1)")]),
    ]


def _valid_palettes():
    return [
        _FakePalette("Sunrise", "#e11d48", "#f97316", "#fbbf24", "#111827"),
        _FakePalette("Ocean", "#0ea5e9", "#1d4ed8", "#38bdf8", "#f9fafb"),  # too-light ink
        _FakePalette("Slate", "#334155", "#64748b", "#94a3b8", "#0f172a"),
    ]


def _mock_client(monkeypatch, marks=None, palettes=None, usage=None):
    response = _FakeResponse(
        _FakeParsedOutput(
            marks if marks is not None else _valid_marks(),
            palettes if palettes is not None else _valid_palettes(),
        ),
        usage or _FakeUsage(),
    )
    fake_client = SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: response))
    monkeypatch.setattr(core_ai, "_anthropic_client", lambda: fake_client)
    return response


@pytest.mark.django_db
class TestGenerateBrandPack:
    def test_returns_validated_pack_and_estimated_cost(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        _mock_client(monkeypatch)
        result = logo_ai.generate_brand_pack("Zeynep Yoga", "yoga", "#1a56db")
        # the all-unsafe-path mark is dropped; the other two survive
        assert len(result.pack["marks"]) == 2
        assert result.pack["marks"][0]["paths"] == [{"d": "M10 10 L90 90 Z", "fill": "mark2"}]
        assert result.pack["marks"][0]["rationale"] == "A rising line evokes growth."
        assert len(result.pack["palettes"]) == 3
        assert result.pack["tagline"] == "Breathe deeply."
        assert result.pack["font_vibe"] == "Elegant"
        assert result.cost_usd > 0

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
            marks=[_FakeMark("bad", [_FakePath("javascript:alert(1)")])],
        )
        with pytest.raises(logo_ai.BrandPackError):
            logo_ai.generate_brand_pack("Z", "yoga", "#1a56db")

    def test_error_carries_estimated_cost_even_on_validation_failure(self, monkeypatch):
        _mock_client(
            monkeypatch,
            marks=[_FakeMark("bad", [_FakePath("javascript:alert(1)")])],
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
                "marks": [{"rationale": "A ring.", "paths": [{"d": "M50 8 A42 42 0 1 1 49.9 8 Z", "fill": "mark"}]}],
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
        assert len(result.pack["marks"]) == 1
        assert result.pack["palettes"][0]["primary"] == "#1a56db"


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
