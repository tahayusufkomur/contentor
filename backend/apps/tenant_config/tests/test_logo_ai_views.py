"""Logo Studio AI Brand Pack endpoints: paid-tier gate, monthly quota,
30-day result cache, and the global budget kill-switch. Anthropic itself is
always mocked via ``logo_ai.generate_brand_pack`` — no real network access.
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
MONTH = "2026-07"

_FAKE_PACK = {
    "marks": [{"rationale": "A rising line.", "paths": [{"d": "M0 0 Z", "fill": "mark"}]}],
    "palettes": [
        {"name": "Sunrise", "primary": "#e11d48", "secondary": "#f97316", "accent": "#fbbf24", "ink": "#111827"}
    ],
    "tagline": "Breathe deeply.",
    "font_vibe": "Elegant",
}


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@brandpacktest.com",
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
    # PlatformPlan/Subscription/User are public-schema; create them under the
    # public schema explicitly so the subscription's user FK resolves (this
    # fixture runs inside tenant_ctx, which would otherwise write the user to
    # the tenant schema and break the cross-schema FK — see the identical
    # pattern in apps/mailbox/tests/test_platform_address.py).
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name="Brand Pack Test Paid", price_monthly=19, transaction_fee_pct=5)
        owner = User.objects.create_user(
            email="brandpack-owner@x.com",
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
        # Run inside the tenant schema (not "public"): deleting
        # PlatformSubscription cascades into tenant-only tables (e.g.
        # billing_payment), which are only visible with the tenant on the
        # search path — same gotcha documented in
        # apps/mailbox/tests/test_platform_address.py.
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Brand Pack Test Paid").delete()
            User.objects.filter(email="brandpack-owner@x.com").delete()
            LogoAiUsage.objects.all().delete()

    _scrub()
    yield
    _scrub()


def _mock_success(monkeypatch, cost_usd=Decimal("0.05"), pack=None):
    calls = []

    def fake(*args, **kwargs):
        calls.append((args, kwargs))
        return logo_ai.BrandPackResult(pack or _FAKE_PACK, cost_usd)

    monkeypatch.setattr(logo_ai, "generate_brand_pack", fake)
    return calls


class TestBrandPackStatus:
    def test_upgrade_required_for_free_tenant(self, coach_client, tenant_ctx, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.status_code == 200
        assert resp.data["eligible"] is False
        assert resp.data["reason"] == "upgrade_required"

    def test_disabled_without_api_key_even_when_paid(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = ""
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.data["eligible"] is True
        assert resp.data["enabled"] is False
        assert resp.data["reason"] == "disabled"

    def test_full_quota_for_fresh_paid_tenant(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.data == {
            "enabled": True,
            "eligible": True,
            "remaining": 5,
            "reason": None,
            "refine_remaining": 20,
        }

    def test_quota_exhausted(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        for _ in range(5):
            logo_ai.record_successful_pack(paid_tenant.schema_name, month=logo_ai._current_month())
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.data["remaining"] == 0
        assert resp.data["reason"] == "quota_exhausted"


class TestBrandPackGenerate:
    def test_disabled_without_api_key(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = ""
        calls = _mock_success(monkeypatch)
        resp = coach_client.post("/api/v1/admin/config/logo-brand-pack/", {"niche": "yoga"}, format="json")
        assert resp.status_code == 200
        assert resp.data == {"pack": None, "source": "disabled", "remaining": 0}
        assert calls == []

    def test_upgrade_required_for_free_tenant(self, coach_client, tenant_ctx, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        calls = _mock_success(monkeypatch)
        resp = coach_client.post("/api/v1/admin/config/logo-brand-pack/", {"niche": "yoga"}, format="json")
        assert resp.data["source"] == "upgrade_required"
        assert calls == []

    def test_success_records_quota_and_cost_and_returns_pack(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        _mock_success(monkeypatch, cost_usd=Decimal("0.05"))
        resp = coach_client.post(
            "/api/v1/admin/config/logo-brand-pack/",
            {"niche": "yoga", "vibe": "calm and grounded"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.data["source"] == "ai"
        assert resp.data["pack"] == _FAKE_PACK
        assert resp.data["remaining"] == 4

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.packs_used == 1
        assert row.usd_spent == Decimal("0.05")

    def test_cache_hit_is_free_and_does_not_call_anthropic_again(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        calls = _mock_success(monkeypatch)
        body = {"niche": "yoga", "style_chips": ["Minimal"], "vibe": "calm"}
        first = coach_client.post("/api/v1/admin/config/logo-brand-pack/", body, format="json")
        assert first.data["source"] == "ai"
        assert len(calls) == 1

        second = coach_client.post("/api/v1/admin/config/logo-brand-pack/", body, format="json")
        assert second.data["source"] == "cache"
        assert second.data["pack"] == _FAKE_PACK
        assert len(calls) == 1  # no second Anthropic call

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.packs_used == 1  # cache hit didn't consume quota

    def test_quota_exhausted_blocks_new_generation(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        for _ in range(5):
            logo_ai.record_successful_pack(paid_tenant.schema_name, month=logo_ai._current_month())
        calls = _mock_success(monkeypatch)
        resp = coach_client.post("/api/v1/admin/config/logo-brand-pack/", {"niche": "a brand new brief"}, format="json")
        assert resp.data == {"pack": None, "source": "quota_exhausted", "remaining": 0}
        assert calls == []

    def test_error_records_cost_but_not_quota(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"

        def raise_error(*args, **kwargs):
            raise logo_ai.BrandPackError("nothing usable", cost_usd=Decimal("0.02"))

        monkeypatch.setattr(logo_ai, "generate_brand_pack", raise_error)
        resp = coach_client.post("/api/v1/admin/config/logo-brand-pack/", {"niche": "yoga"}, format="json")
        assert resp.data["source"] == "error"
        assert resp.data["pack"] is None

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.packs_used == 0
        assert row.usd_spent == Decimal("0.02")

    def test_generic_exception_records_zero_cost_and_does_not_propagate(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"

        def raise_generic(*args, **kwargs):
            raise RuntimeError("network blip")

        monkeypatch.setattr(logo_ai, "generate_brand_pack", raise_generic)
        resp = coach_client.post("/api/v1/admin/config/logo-brand-pack/", {"niche": "yoga"}, format="json")
        assert resp.status_code == 200
        assert resp.data["source"] == "error"

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.packs_used == 0
        assert row.usd_spent == 0

    def test_global_budget_kill_switch_blocks_new_generation(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        settings.LOGO_AI_MONTHLY_BUDGET_USD = 1.0
        logo_ai.record_attempt_cost(paid_tenant.schema_name, Decimal("1.5"), month=logo_ai._current_month())
        calls = _mock_success(monkeypatch)
        resp = coach_client.post("/api/v1/admin/config/logo-brand-pack/", {"niche": "a fresh brief"}, format="json")
        assert resp.data["source"] == "disabled"
        assert calls == []
