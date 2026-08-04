"""Design-with-AI conversation endpoints: paid-tier gate, per-tenant monthly
turn quota, Redis draft cache + vision critique (finish), the global budget
kill-switch, and the streamed-progress shape. The AI passes are always
monkeypatched via ``logo_converse.converse_turn`` / ``converse_turn_stream``
/ ``critique_turn`` — no real network access.
"""

import base64
import contextlib
import json as _json
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
# Mirror the engine's own month key (logo_ai._current_month) — a hardcoded
# month broke all usage assertions at the first calendar rollover.
MONTH = logo_ai._current_month()

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

    def test_icon_turn_records_image_cost_in_logo_ai_usage(self, coach_client, paid_tenant, settings, monkeypatch):
        """End-to-end Pass A: real converse_turn + validators, mocked
        provider + Gemini. The recorded spend must include image cost (the
        kill-switch covers Gemini) and the response must carry traced paths."""
        from apps.tenant_config import logo_image, logo_trace

        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        parsed = logo_converse._IconTurn.model_validate(
            {
                "message": "Here.",
                "designs": [
                    {
                        "concept": "c",
                        "rationale": "r",
                        "image_prompt": "flat vector leaf mark",
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
            }
        )
        monkeypatch.setattr(logo_converse.core_ai, "structured", lambda **kwargs: (parsed, Decimal("0.02"), "m"))
        monkeypatch.setattr(logo_image, "enabled", lambda: True)
        monkeypatch.setattr(logo_image, "generate_mark_images", lambda prompts: ([b"png"], Decimal("0.067")))
        traced = [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]
        monkeypatch.setattr(logo_trace, "trace_mark", lambda png: traced)

        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.status_code == 200, resp.content
        assert resp.data["designs"][0]["paths"] == traced
        assert "image_prompt" not in resp.data["designs"][0]
        usage = LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH)
        assert usage.usd_spent == Decimal("0.087")


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


# ── Streamed turns (Accept: text/event-stream) ──────────────────────────────
# The blocking shape above stays the wizard's contract; these cover the
# progress stream and when the turn meter commits.


def _sse_frames(response):
    body = b"".join(response.streaming_content).decode()
    return [_json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]


def _stream_post(coach_client, payload=None):
    return coach_client.post(URL, payload or PAYLOAD, format="json", HTTP_ACCEPT="text/event-stream")


def _fake_turn_stream(*, previews=(), result=_FAKE_TURN, error=None):
    def _gen(*args, **kwargs):
        yield ("phase", "designing")
        for p in previews:
            yield ("preview", p)
        if error is not None:
            raise error
        yield ("phase", "illustrating")
        yield ("phase", "tracing")
        yield ("result", result)

    return _gen


class TestConverseStream:
    def _anthropic(self, settings):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"

    def test_emits_phases_previews_then_done(self, coach_client, paid_tenant, settings, monkeypatch):
        self._anthropic(settings)
        previews = [{"message": "Trying a leaf mark", "concepts": ["Minimal leaf"]}]
        monkeypatch.setattr(logo_converse, "converse_turn_stream", _fake_turn_stream(previews=previews))
        frames = _sse_frames(_stream_post(coach_client))

        assert [f["type"] for f in frames] == ["phase", "preview", "phase", "phase", "done"]
        assert [f.get("phase") for f in frames if f["type"] == "phase"] == [
            "designing",
            "illustrating",
            "tracing",
        ]
        assert frames[1]["concepts"] == ["Minimal leaf"]
        done = frames[-1]
        assert done["source"] == "ai" and done["phase"] == "draft" and done["token"]
        assert done["designs"] == _FAKE_TURN.designs
        usage = LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH)
        assert usage.turns_used == 1 and usage.usd_spent == Decimal("0.02")

    def test_charges_turn_on_first_preview_not_completion(self, coach_client, paid_tenant, settings, monkeypatch):
        """Abuse guard: on the icon stage the costly image+trace work happens
        AFTER the preview, so bailing once the concepts look wrong has already
        spent real money. It must still cost a turn."""
        self._anthropic(settings)

        def _abandon(*a, **k):
            yield ("phase", "designing")
            yield ("preview", {"message": "hm", "concepts": ["Nope"]})
            raise GeneratorExit

        monkeypatch.setattr(logo_converse, "converse_turn_stream", _abandon)
        with contextlib.suppress(GeneratorExit):
            _sse_frames(_stream_post(coach_client))

        assert LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH).turns_used == 1

    def test_failure_before_output_charges_cost_not_turn(self, coach_client, paid_tenant, settings, monkeypatch):
        self._anthropic(settings)
        err = logo_converse.ConverseError("provider down", cost_usd=Decimal("0.01"))
        monkeypatch.setattr(logo_converse, "converse_turn_stream", _fake_turn_stream(error=err))
        frames = _sse_frames(_stream_post(coach_client))

        assert frames[-1]["type"] == "error" and frames[-1]["source"] == "error"
        usage = LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH)
        assert usage.turns_used == 0 and usage.usd_spent == Decimal("0.01")

    def test_gating_streams_a_done_frame(self, coach_client, paid_tenant, settings, monkeypatch):
        """Guards run before any model call. Unlike blog (which answers plain
        JSON), the studio chat always reads a stream here, so the gated body
        rides in a done frame — one shape for the client to handle."""
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = ""
        called = []
        monkeypatch.setattr(logo_converse, "converse_turn_stream", lambda *a, **k: called.append(1) or iter(()))
        frames = _sse_frames(_stream_post(coach_client))

        assert frames == [
            {
                "type": "done",
                "phase": "final",
                "message": "",
                "designs": [],
                "turns_remaining": 0,
                "source": "disabled",
            }
        ]
        assert called == []

    def test_sets_no_buffering_headers(self, coach_client, paid_tenant, settings, monkeypatch):
        self._anthropic(settings)
        monkeypatch.setattr(logo_converse, "converse_turn_stream", _fake_turn_stream())
        res = _stream_post(coach_client)
        assert res["Content-Type"] == "text/event-stream"
        assert res["X-Accel-Buffering"] == "no" and res["Cache-Control"] == "no-cache"
        b"".join(res.streaming_content)
