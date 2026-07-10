"""Public student-assistant endpoints (status + SSE chat) on the tenant host.
Anonymous/student-facing — mirrors test_help_bot_views.py's view-test pattern
and test_student_bot.py's paid_tenant fixture (PlatformPlan/Subscription/User
are public-schema, so they're created under schema_context("public") while
tenant_ctx has activated the tenant schema)."""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import assistant
from apps.core.models import AiTranscript, PlatformPlan, PlatformSubscription, StudentBotUsage
from apps.tenant_config import student_bot
from apps.tenant_config.models import AssistantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"


# ── Fixtures ──────────────────────────────────────────────────────────────
# tenant_client/paid_tenant aren't shared conftest fixtures (checked: every
# test module that needs them defines its own, e.g. test_logo_ai_views.py /
# test_student_bot.py) — composed locally here from the same pattern.


@pytest.fixture()
def tenant_client(tenant_ctx):
    return APIClient(HTTP_HOST=HOST)


@pytest.fixture()
def paid_tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Assistant Public API Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="assistant-public-owner@x.com",
            name="Owner",
            password="x",  # noqa: S106
            role="owner",
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
            PlatformPlan.objects.filter(name="Assistant Public API Test Paid").delete()
            User.objects.filter(email__in=["assistant-public-owner@x.com"]).delete()
            StudentBotUsage.objects.all().delete()
            AiTranscript.objects.all().delete()

    _scrub()
    yield
    _scrub()


def _sse_body(response):
    return b"".join(response.streaming_content).decode()


# ── Tests ─────────────────────────────────────────────────────────────────


def test_status_disabled_by_default(tenant_client):
    res = tenant_client.get("/api/v1/assistant/status/")
    assert res.status_code == 200
    assert res.json()["enabled"] is False and res.json()["reason"] in ("disabled", "upgrade_required")


def test_status_ok_when_enabled_paid(tenant_client, paid_tenant):
    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.greeting = "Hi!"
    cfg.suggested_questions = ["What fits beginners?"]
    cfg.save()
    with patch.object(student_bot.core_ai, "available", return_value=(True, "ok")):
        data = tenant_client.get("/api/v1/assistant/status/").json()
    assert (
        data["enabled"] is True
        and data["greeting"] == "Hi!"
        and data["suggested_questions"] == ["What fits beginners?"]
    )
    assert data["brand"]


def test_chat_gated_returns_json_not_stream(tenant_client):
    res = tenant_client.post("/api/v1/assistant/chat/", {"messages": [{"role": "user", "content": "q"}]}, format="json")
    assert res.status_code == 200 and res.json()["enabled"] is False


def test_chat_streams_and_counts(tenant_client, paid_tenant):
    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.save()

    def fake(**kwargs):
        yield ("delta", "hello")
        yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "claude-haiku-4-5"})

    with (
        patch.object(student_bot.core_ai, "available", return_value=(True, "ok")),
        patch.object(assistant.core_ai, "stream_text", fake),
    ):
        res = tenant_client.post(
            "/api/v1/assistant/chat/",
            {"messages": [{"role": "user", "content": "q"}], "session_id": "s"},
            format="json",
        )
        assert res["Content-Type"] == "text/event-stream"
        body = _sse_body(res)
    assert '"type": "delta"' in body and '"type": "done"' in body
    assert student_bot.tenant_usage(paid_tenant.schema_name).questions == 1


def test_chat_bad_history_400(tenant_client, paid_tenant):
    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.save()
    with patch.object(student_bot.core_ai, "available", return_value=(True, "ok")):
        res = tenant_client.post("/api/v1/assistant/chat/", {"messages": []}, format="json")
    assert res.status_code == 400
