"""Coach-admin assistant endpoints: config, knowledge CRUD, transcripts,
preview chat. Mirrors test_help_bot_views.py's coach_client fixture pattern
and test_assistant_public_api.py's paid_tenant fixture (PlatformPlan /
PlatformSubscription / User are public-schema, so they're created under
schema_context("public") while tenant_ctx has activated the tenant schema).
Plain ``pytest.mark.django_db`` (not transaction=True) — everything here runs
inside one rolled-back test transaction, so no manual cross-test cleanup of
the public-schema rows is needed."""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import assistant
from apps.core.models import AiTranscript, PlatformPlan, PlatformSubscription
from apps.tenant_config import student_bot
from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry

pytestmark = pytest.mark.django_db

HOST = "shared-test.localhost"


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture()
def coach_client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@assistantcoachtest.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture()
def student_client(tenant_ctx):
    student = User.objects.create_user(
        email="student@assistantcoachtest.com",
        name="Student",
        password="x",  # noqa: S106
        role="student",
    )
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=student)
    return client


@pytest.fixture()
def paid_tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Assistant Coach API Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="assistant-coach-owner@x.com",
            name="Owner",
            password="x",  # noqa: S106
            role="owner",
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


# ── Tests ─────────────────────────────────────────────────────────────────


def test_config_roundtrip_and_validation(coach_client, paid_tenant):
    res = coach_client.get("/api/v1/admin/assistant/config/")
    assert res.status_code == 200 and res.json()["enabled"] is False
    ok = coach_client.put(
        "/api/v1/admin/assistant/config/",
        {"enabled": True, "greeting": "Welcome!", "suggested_questions": ["A?", "B?"]},
        format="json",
    )
    assert ok.status_code == 200 and ok.json()["enabled"] is True
    assert ok.json()["usage"]["questions_cap"] == student_bot.plan_question_limit(paid_tenant)
    bad = coach_client.put("/api/v1/admin/assistant/config/", {"suggested_questions": ["x" * 81]}, format="json")
    assert bad.status_code == 400
    bad2 = coach_client.put(
        "/api/v1/admin/assistant/config/", {"suggested_questions": ["a", "b", "c", "d"]}, format="json"
    )
    assert bad2.status_code == 400


def test_config_exactly_three_suggested_questions_succeeds(coach_client, paid_tenant):
    ok = coach_client.put(
        "/api/v1/admin/assistant/config/",
        {"suggested_questions": ["A?", "B?", "C?"]},
        format="json",
    )
    assert ok.status_code == 200
    assert ok.json()["suggested_questions"] == ["A?", "B?", "C?"]


def test_knowledge_crud_and_caps(coach_client):
    r = coach_client.post(
        "/api/v1/admin/assistant/knowledge/", {"title": "Refunds", "content": "14 days."}, format="json"
    )
    assert r.status_code == 201
    pk = r.json()["id"]
    assert (
        coach_client.patch(f"/api/v1/admin/assistant/knowledge/{pk}/", {"enabled": False}, format="json").status_code
        == 200
    )
    assert (
        coach_client.post(
            "/api/v1/admin/assistant/knowledge/", {"title": "L", "content": "x" * 1501}, format="json"
        ).status_code
        == 400
    )
    for i in range(AssistantKnowledgeEntry.MAX_ENTRIES - 1):
        AssistantKnowledgeEntry.objects.create(title=f"t{i}", content="c")
    assert (
        coach_client.post(
            "/api/v1/admin/assistant/knowledge/", {"title": "over", "content": "c"}, format="json"
        ).status_code
        == 400
    )
    assert coach_client.delete(f"/api/v1/admin/assistant/knowledge/{pk}/").status_code == 204


def test_knowledge_create_coerces_non_string_title_without_crashing(coach_client):
    # Regression: _validate_entry coerces via str() before length-checking, so a
    # truthy non-string title (e.g. an int) passes validation. The create() call
    # must coerce the same way (matching assistant_knowledge_detail's PATCH
    # handler) or it raises AttributeError('int' object has no attribute
    # 'strip') -> unhandled 500 instead of a clean response.
    r = coach_client.post("/api/v1/admin/assistant/knowledge/", {"title": 12345, "content": "ok"}, format="json")
    assert r.status_code == 201
    assert r.json()["title"] == "12345"


def test_knowledge_exactly_at_cap_succeeds(coach_client):
    for i in range(AssistantKnowledgeEntry.MAX_ENTRIES - 1):
        AssistantKnowledgeEntry.objects.create(title=f"t{i}", content="c")
    assert AssistantKnowledgeEntry.objects.count() == AssistantKnowledgeEntry.MAX_ENTRIES - 1
    r = coach_client.post("/api/v1/admin/assistant/knowledge/", {"title": "last", "content": "c"}, format="json")
    assert r.status_code == 201
    assert AssistantKnowledgeEntry.objects.count() == AssistantKnowledgeEntry.MAX_ENTRIES
    r2 = coach_client.post("/api/v1/admin/assistant/knowledge/", {"title": "over", "content": "c"}, format="json")
    assert r2.status_code == 400


def test_transcripts_scoped_to_own_tenant(coach_client, paid_tenant):
    AiTranscript.objects.create(
        feature="student_bot",
        audience="student",
        tenant_schema=paid_tenant.schema_name,
        question="q1",
        answer="a1",
        provider="cli",
        model="m",
    )
    AiTranscript.objects.create(
        feature="student_bot",
        audience="student",
        tenant_schema="other_tenant",
        question="q2",
        answer="a2",
        provider="cli",
        model="m",
    )
    AiTranscript.objects.create(
        feature="help_bot",
        audience="visitor",
        tenant_schema="__marketing__",
        question="q3",
        answer="a3",
        provider="cli",
        model="m",
    )
    data = coach_client.get("/api/v1/admin/assistant/transcripts/").json()
    assert [r["question"] for r in data["results"]] == ["q1"]


def test_preview_streams_without_enabling_or_quota(coach_client, paid_tenant):
    # bot NOT enabled; preview must still answer for the coach
    def fake(**kwargs):
        yield ("delta", "prev")
        yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "claude-haiku-4-5"})

    with (
        patch.object(student_bot.core_ai, "available", return_value=(True, "ok")),
        patch.object(assistant.core_ai, "stream_text", fake),
    ):
        res = coach_client.post(
            "/api/v1/admin/assistant/preview-chat/", {"messages": [{"role": "user", "content": "q"}]}, format="json"
        )
        assert res["Content-Type"] == "text/event-stream"
        # StreamingHttpResponse.streaming_content is a lazy generator — it must
        # be drained (running the SSE completion hook: usage + transcript
        # writes) WHILE the provider mock is still active, or the generator's
        # deferred `core_ai.stream_text` call falls through to the real
        # (unconfigured) Anthropic client once the patch context exits.
        b"".join(res.streaming_content)
    assert AssistantConfig.load().enabled is False
    assert student_bot.tenant_usage(paid_tenant.schema_name).questions == 0
    assert student_bot.tenant_usage(paid_tenant.schema_name).usd_spent == Decimal("0.001")
    assert AiTranscript.objects.get().is_preview is True


def test_coach_endpoints_forbidden_for_students(student_client):
    assert student_client.get("/api/v1/admin/assistant/config/").status_code in (401, 403)
