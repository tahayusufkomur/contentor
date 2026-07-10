"""Logo Studio AI refinement endpoint: paid-tier gate, monthly quota
(separate from the Brand Pack's), no result cache, and the shared global
budget kill-switch. Anthropic itself is always mocked via
``logo_ai.refine_design`` — no real network access.
"""

from decimal import Decimal

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import LogoAiUsage, PlatformPlan, PlatformSubscription
from apps.tenant_config import logo_ai

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"

_FAKE_DESIGN = {
    "mark": {
        "rationale": "A rising line.",
        "paths": [{"d": "M0 0 Z", "fill": "mark"}],
        "elements": [{"type": "path", "d": "M0 0 Z"}],
    },
    "palette": {"name": "Sunrise", "primary": "#e11d48", "secondary": "#f97316", "accent": "#fbbf24", "ink": "#111827"},
    "font_vibe": "Elegant",
    "layout": "stacked",
    "rationale": "Warmed the palette and gave the mark more lift.",
}

_RECIPE = {
    "layout": "horizontal",
    "name": "Test Brand",
    "tagline": "",
    "mark": {"type": "initials", "style": "plain"},
    "colors": {"mark": "#111827", "text": "#111827"},
}


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@refinetest.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


@pytest.fixture()
def coach_client(coach):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture()
def paid_tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name="Refine Test Paid", price_monthly=19, transaction_fee_pct=5)
        owner = User.objects.create_user(
            email="refine-owner@x.com",
            name="Owner",
            password="x",
            role="owner",  # noqa: S106
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_shared():
    def _scrub():
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Refine Test Paid").delete()
            User.objects.filter(email="refine-owner@x.com").delete()
            LogoAiUsage.objects.all().delete()

    _scrub()
    yield
    _scrub()


def _mock_success(monkeypatch, cost_usd=Decimal("0.02"), design=None):
    calls = []

    def fake(*args, **kwargs):
        calls.append((args, kwargs))
        return logo_ai.RefineResult(design or _FAKE_DESIGN, cost_usd)

    monkeypatch.setattr(logo_ai, "refine_design", fake)
    return calls


class TestLogoRefine:
    def test_disabled_without_api_key(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = ""
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "warmer colors"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data == {"design": None, "source": "disabled", "refine_remaining": 0}
        assert calls == []

    def test_upgrade_required_for_free_tenant(self, coach_client, tenant_ctx, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "warmer colors"},
            format="json",
        )
        assert resp.data["source"] == "upgrade_required"
        assert calls == []

    def test_blank_instruction_is_an_error_and_does_not_call_anthropic(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "   "},
            format="json",
        )
        assert resp.data["source"] == "error"
        assert calls == []

    def test_success_records_quota_and_cost_and_returns_design(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        _mock_success(monkeypatch, cost_usd=Decimal("0.02"))
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "elements": [{"type": "path", "d": "M0 0 Z"}], "instruction": "warmer and bolder"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.data["source"] == "ai"
        assert resp.data["design"] == _FAKE_DESIGN
        assert resp.data["refine_remaining"] == 19

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.refinements_used == 1
        assert row.usd_spent == Decimal("0.02")

    def test_quota_exhausted_blocks_new_refinement(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        for _ in range(20):
            logo_ai.record_successful_refinement(paid_tenant.schema_name, month=logo_ai._current_month())
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "more premium"},
            format="json",
        )
        assert resp.data == {"design": None, "source": "quota_exhausted", "refine_remaining": 0}
        assert calls == []

    def test_error_records_cost_but_not_quota(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"

        def raise_error(*args, **kwargs):
            raise logo_ai.RefineError("nothing usable", cost_usd=Decimal("0.01"))

        monkeypatch.setattr(logo_ai, "refine_design", raise_error)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "rounder mark"},
            format="json",
        )
        assert resp.data["source"] == "error"
        assert resp.data["design"] is None

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.refinements_used == 0
        assert row.usd_spent == Decimal("0.01")

    def test_generic_exception_records_zero_cost_and_does_not_propagate(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"

        def raise_generic(*args, **kwargs):
            raise RuntimeError("network blip")

        monkeypatch.setattr(logo_ai, "refine_design", raise_generic)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "rounder mark"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["source"] == "error"

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.refinements_used == 0
        assert row.usd_spent == 0

    def test_global_budget_kill_switch_blocks_new_refinement(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        settings.LOGO_AI_MONTHLY_BUDGET_USD = 1.0
        logo_ai.record_attempt_cost(paid_tenant.schema_name, Decimal("1.5"), month=logo_ai._current_month())
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "more premium"},
            format="json",
        )
        assert resp.data["source"] == "disabled"
        assert calls == []

    def test_instruction_is_clamped_to_300_chars(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        seen = {}

        def fake(recipe, elements, instruction):
            seen["instruction"] = instruction
            return logo_ai.RefineResult(_FAKE_DESIGN, Decimal("0.02"))

        monkeypatch.setattr(logo_ai, "refine_design", fake)
        coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "x" * 500},
            format="json",
        )
        assert len(seen["instruction"]) == 300

    def test_status_endpoint_reports_refine_remaining(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        logo_ai.record_successful_refinement(paid_tenant.schema_name, month=logo_ai._current_month())
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.data["refine_remaining"] == 19
