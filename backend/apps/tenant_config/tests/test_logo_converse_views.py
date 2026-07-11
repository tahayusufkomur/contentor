"""Design-with-AI conversation endpoints: paid-tier gate, per-tenant monthly
turn quota, Redis draft cache + vision critique (finish), and the global
budget kill-switch. The AI passes are always monkeypatched via
``logo_converse.converse_turn`` / ``critique_turn`` — no real network access.
"""

import base64
from decimal import Decimal

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core.models import LogoAiUsage, PlatformPlan, PlatformSubscription
from apps.tenant_config import logo_ai, logo_converse

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"
MONTH = "2026-07"

URL = "/api/v1/admin/config/logo-converse/"
FINISH_URL = URL + "finish/"
PAYLOAD = {"stage": "icon", "brief": {}, "transcript": [], "pinned": {}, "message": "hi"}

_FAKE_TURN = logo_converse.TurnResult(
    "Here you go.",
    [
        {
            "concept": "c",
            "rationale": "r",
            "paths": [{"d": "M0 0 Z", "fill": "mark"}],
            "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 30}],
            "palette": {
                "name": "P",
                "primary": "#0f766e",
                "secondary": "#14b8a6",
                "accent": "#f59e0b",
                "ink": "#111827",
            },
            "color_roles": {"mark": "primary", "mark2": "secondary", "mark_accent": "accent"},
        }
    ],
    Decimal("0.02"),
)

PNG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()
DATA_URL = "data:image/png;base64," + PNG_B64
# A JPEG masquerading as a PNG data URL — must be rejected by the magic check.
JPEG_DATA_URL = "data:image/png;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 64).decode()


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@conversetest.com",
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
    # pattern in test_logo_ai_views.py).
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name="Converse Test Paid", price_monthly=19, transaction_fee_pct=5)
        owner = User.objects.create_user(
            email="converse-owner@x.com",
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
            PlatformPlan.objects.filter(name="Converse Test Paid").delete()
            User.objects.filter(email="converse-owner@x.com").delete()
            LogoAiUsage.objects.all().delete()

    _scrub()
    yield
    _scrub()


class TestConverse:
    def test_draft_phase_returns_token_and_counts_turn(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.status_code == 200, resp.content
        assert resp.data["phase"] == "draft"
        assert resp.data["token"]
        assert resp.data["source"] == "ai"
        assert resp.data["designs"] == _FAKE_TURN.designs
        assert resp.data["turns_remaining"] == settings.LOGO_AI_MONTHLY_TURN_LIMIT - 1
        usage = LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH)
        assert usage.turns_used == 1
        assert usage.usd_spent == Decimal("0.02")

    def test_cli_provider_returns_final_directly(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "cli"
        monkeypatch.setattr(core_ai, "available", lambda: (True, "ok"))
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["phase"] == "final"
        assert "token" not in resp.data or resp.data["token"] is None
        assert resp.data["source"] == "ai"

    def test_disabled_without_api_key(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = ""
        called = []
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: called.append(1) or _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["source"] == "disabled"
        assert called == []

    def test_unknown_stage_is_error(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        called = []
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: called.append(1) or _FAKE_TURN)
        resp = coach_client.post(URL, {**PAYLOAD, "stage": "bogus"}, format="json")
        assert resp.data["source"] == "error"
        assert called == []

    def test_quota_exhausted(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        settings.LOGO_AI_MONTHLY_TURN_LIMIT = 0
        called = []
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: called.append(1) or _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["source"] == "quota_exhausted"
        assert called == []

    def test_free_tenant_upgrade_required(self, coach_client, tenant_ctx, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        called = []
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: called.append(1) or _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["source"] == "upgrade_required"
        assert called == []

    def test_kill_switch_blocks(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        settings.LOGO_AI_MONTHLY_BUDGET_USD = 1.0
        logo_ai.record_attempt_cost(paid_tenant.schema_name, Decimal("1.5"), month=logo_ai._current_month())
        called = []
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: called.append(1) or _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["source"] == "disabled"
        assert called == []

    def test_turn_error_records_cost_but_not_a_turn(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"

        def raise_error(*a, **k):
            raise logo_converse.ConverseError("nothing usable", cost_usd=Decimal("0.03"))

        monkeypatch.setattr(logo_converse, "converse_turn", raise_error)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["source"] == "error"
        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.turns_used == 0
        assert row.usd_spent == Decimal("0.03")


class TestConverseFinish:
    def _make_draft(self, coach_client, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        return coach_client.post(URL, PAYLOAD, format="json").data

    def test_finish_critiques_cached_draft(self, coach_client, paid_tenant, settings, monkeypatch):
        draft = self._make_draft(coach_client, settings, monkeypatch)
        captured = {}

        def fake_critique(stage, cached, images):
            captured["stage"], captured["designs"], captured["n_images"] = stage, cached["designs"], len(images)
            return _FAKE_TURN

        monkeypatch.setattr(logo_converse, "critique_turn", fake_critique)
        resp = coach_client.post(FINISH_URL, {"token": draft["token"], "images": [DATA_URL]}, format="json")
        assert resp.data["phase"] == "final"
        assert resp.data["source"] == "ai"
        assert resp.data["designs"] == _FAKE_TURN.designs
        assert captured["stage"] == "icon" and captured["n_images"] == 1
        # the critiqued designs came from the SERVER cache, not the client
        assert captured["designs"] == _FAKE_TURN.designs

    def test_finish_failure_falls_back_to_draft(self, coach_client, paid_tenant, settings, monkeypatch):
        draft = self._make_draft(coach_client, settings, monkeypatch)

        def raise_error(stage, cached, images):
            raise logo_converse.ConverseError("critique failed", cost_usd=Decimal("0.01"))

        monkeypatch.setattr(logo_converse, "critique_turn", raise_error)
        resp = coach_client.post(FINISH_URL, {"token": draft["token"], "images": [DATA_URL]}, format="json")
        assert resp.data["source"] == "draft"
        assert resp.data["phase"] == "final"
        assert resp.data["designs"] == draft["designs"]

    def test_unknown_token_is_error(self, coach_client, paid_tenant, settings):
        resp = coach_client.post(FINISH_URL, {"token": "nope", "images": [DATA_URL]}, format="json")
        assert resp.data["source"] == "error"
        assert resp.data["designs"] == []

    def test_non_png_image_rejected(self, coach_client, paid_tenant, settings, monkeypatch):
        draft = self._make_draft(coach_client, settings, monkeypatch)
        called = []
        monkeypatch.setattr(logo_converse, "critique_turn", lambda *a, **k: called.append(1) or _FAKE_TURN)
        resp = coach_client.post(FINISH_URL, {"token": draft["token"], "images": [JPEG_DATA_URL]}, format="json")
        assert resp.data["source"] == "error"
        # falls back to serving the cached draft designs, critique never called
        assert resp.data["designs"] == draft["designs"]
        assert called == []

    def test_finish_does_not_count_a_second_turn(self, coach_client, paid_tenant, settings, monkeypatch):
        draft = self._make_draft(coach_client, settings, monkeypatch)
        monkeypatch.setattr(logo_converse, "critique_turn", lambda *a, **k: _FAKE_TURN)
        coach_client.post(FINISH_URL, {"token": draft["token"], "images": [DATA_URL]}, format="json")
        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.turns_used == 1
