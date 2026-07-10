"""Human takeover: coach console endpoints, human-mode chat short-circuit,
auto-release. Fixtures follow test_assistant_thread_api.py (unique names:
plan "Assistant Takeover Test Paid", owner assistant-takeover-owner@x.com);
coach_client mirrors test_assistant_coach_api.py:31-42 (force_authenticate
a tenant-schema role="owner", is_staff user)."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.core import assistant
from apps.core.models import AiConversation, PlatformPlan, PlatformSubscription
from apps.tenant_config import student_bot
from apps.tenant_config.models import AssistantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _sse_body(response):
    # StreamingHttpResponse.streaming_content is a lazy generator that Django's
    # test client does not eagerly drain; _chat() below pre-drains it while its
    # provider mocks are still active and caches the text here so callers can
    # consume it afterwards without hitting the real (unmocked) provider.
    cached = getattr(response, "_cached_sse_body", None)
    if cached is not None:
        return cached
    return b"".join(response.streaming_content).decode()


def _fake_stream(**kwargs):
    yield ("delta", "hello")
    yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "claude-haiku-4-5"})


@pytest.fixture
def tenant_client(tenant_ctx):
    return APIClient(HTTP_HOST="shared-test.localhost")


@pytest.fixture
def paid_tenant(tenant_ctx):
    # Same pattern as test_assistant_public_api.py:38-56, unique names per module.
    from apps.accounts.models import User

    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Assistant Takeover Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="assistant-takeover-owner@x.com",
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
def _enabled_and_clean(paid_tenant):
    from apps.accounts.models import User
    from apps.core.models import AiTranscript, StudentBotUsage

    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.save()

    def _scrub():
        # schema_context(tenant schema), not "public": billing_payment (a
        # tenant-app table, FK'd from Payment to PlatformSubscription) isn't
        # visible in a bare "public" search_path and the cascading SET_NULL
        # errors on delete. Same fix as test_assistant_public_api.py's
        # _clean_shared(), which scrubs under schema_context(SHARED_SCHEMA).
        with schema_context(paid_tenant.schema_name):
            AiConversation.objects.all().delete()
            AiTranscript.objects.all().delete()
            StudentBotUsage.objects.all().delete()
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Assistant Takeover Test Paid").delete()
            User.objects.filter(email="assistant-takeover-owner@x.com").delete()

    yield
    _scrub()


def _chat(client, session_id="sess-abc", text="what courses?"):
    with (
        patch.object(student_bot.core_ai, "available", return_value=(True, "ok")),
        patch.object(assistant.core_ai, "stream_text", _fake_stream),
    ):
        res = client.post(
            "/api/v1/assistant/chat/",
            {"messages": [{"role": "user", "content": text}], "session_id": session_id},
            format="json",
        )
        res._cached_sse_body = _sse_body(res)
    return res


@pytest.fixture
def coach_client(tenant_ctx):
    from apps.accounts.models import User

    coach = User.objects.create_user(
        email="takeover-coach@x.com",
        name="Cem Koç",
        password="x",
        role="owner",  # noqa: S106
    )
    coach.is_staff = True
    coach.save()
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=coach)
    return client


def _seed_convo(schema, status="ai", session_id="sess-t"):
    with schema_context("public"):
        return AiConversation.objects.create(
            feature="student_bot",
            audience="student",
            tenant_schema=schema,
            session_id=session_id,
            status=status,
            taken_over_at=timezone.now() if status == "human" else None,
        )


class TestTakeover:
    def test_takeover_flips_status_and_writes_system_line(self, coach_client, paid_tenant):
        convo = _seed_convo(paid_tenant.schema_name)
        res = coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "human" and body["agent_label"] == "Cem"
        assert body["messages"][-1]["content"] == "agent_joined:Cem"
        assert coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/").status_code == 409

    def test_agent_message_requires_human_mode(self, coach_client, paid_tenant):
        convo = _seed_convo(paid_tenant.schema_name)
        res = coach_client.post(
            f"/api/v1/admin/assistant/conversations/{convo.id}/message/", {"content": "hi"}, format="json"
        )
        assert res.status_code == 403
        coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/")
        res = coach_client.post(
            f"/api/v1/admin/assistant/conversations/{convo.id}/message/", {"content": "hi"}, format="json"
        )
        assert res.status_code == 200
        with schema_context("public"):
            assert convo.messages.filter(role="agent", content="hi").exists()

    def test_release_and_auto_release(self, coach_client, paid_tenant, settings):
        convo = _seed_convo(paid_tenant.schema_name, status="human")
        coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/release/")
        with schema_context("public"):
            convo.refresh_from_db()
            assert convo.status == "ai"
            assert convo.messages.filter(content="assistant_resumed").exists()
        stale = _seed_convo(paid_tenant.schema_name, status="human", session_id="sess-stale")
        with schema_context("public"):
            AiConversation.objects.filter(pk=stale.pk).update(taken_over_at=timezone.now() - timedelta(minutes=31))
        res = coach_client.get(f"/api/v1/admin/assistant/conversations/{stale.id}/thread/")
        assert res.json()["status"] == "ai"

    def test_scoping_and_permissions(self, coach_client, tenant_client, paid_tenant):
        with schema_context("public"):
            other = AiConversation.objects.create(
                feature="student_bot", audience="student", tenant_schema="someone_else", session_id="x1"
            )
        assert coach_client.get(f"/api/v1/admin/assistant/conversations/{other.id}/thread/").status_code == 404
        convo = _seed_convo(paid_tenant.schema_name)
        assert tenant_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/").status_code in (
            401,
            403,
        )


class TestHumanModeChat:
    def test_chat_short_circuits_without_model_or_quota(self, tenant_client, paid_tenant):
        _seed_convo(paid_tenant.schema_name, status="human", session_id="sess-h")
        # exhaust the quota to prove human mode ignores it
        usage = student_bot.tenant_usage(paid_tenant.schema_name)
        type(usage).objects.filter(pk=usage.pk).update(questions=10_000)
        res = tenant_client.post(
            "/api/v1/assistant/chat/",
            {"messages": [{"role": "user", "content": "help me"}], "session_id": "sess-h"},
            format="json",
        )
        assert res.status_code == 200 and res.json() == {"mode": "human"}
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="sess-h")
            assert convo.messages.filter(role="user", content="help me").exists()
            from apps.core.models import AiTranscript

            assert AiTranscript.objects.count() == 0

    def test_human_message_endpoint(self, tenant_client, paid_tenant):
        _seed_convo(paid_tenant.schema_name, status="human", session_id="sess-hm")
        res = tenant_client.post(
            "/api/v1/assistant/human-message/", {"session_id": "sess-hm", "content": "still there?"}, format="json"
        )
        assert res.status_code == 200 and res.json() == {"mode": "human"}
        _seed_convo(paid_tenant.schema_name, status="ai", session_id="sess-ai")
        assert (
            tenant_client.post(
                "/api/v1/assistant/human-message/", {"session_id": "sess-ai", "content": "x"}, format="json"
            ).status_code
            == 409
        )
        assert (
            tenant_client.post(
                "/api/v1/assistant/human-message/", {"session_id": "nope", "content": "x"}, format="json"
            ).status_code
            == 404
        )

    def test_conversation_list_shape(self, coach_client, tenant_client, paid_tenant):
        _sse_body(_chat(tenant_client, session_id="sess-list"))
        res = coach_client.get("/api/v1/admin/assistant/conversations/")
        assert res.status_code == 200
        row = res.json()["results"][0]
        assert row["session_id"] == "sess-list" and row["status"] == "ai"
        assert row["message_count"] == 2 and row["last_message"] == "hello"
