"""Conversation substrate over the public student endpoints: chat creates a
conversation + messages; the thread endpoint replays them incrementally.
Fixtures mirror test_assistant_public_api.py (paid tenant on the shared
test schema; provider mocked at the kernel boundary)."""

from decimal import Decimal
from unittest.mock import patch

import pytest
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
            name="Assistant Thread API Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="assistant-thread-owner@x.com",
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
            PlatformPlan.objects.filter(name="Assistant Thread API Test Paid").delete()
            User.objects.filter(email="assistant-thread-owner@x.com").delete()

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


class TestChatCreatesConversation:
    def test_chat_writes_user_and_assistant_messages(self, tenant_client, paid_tenant):
        res = _chat(tenant_client)
        assert res["Content-Type"] == "text/event-stream"
        _sse_body(res)
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="sess-abc")
            assert convo.feature == "student_bot"
            assert convo.tenant_schema == paid_tenant.schema_name
            roles = list(convo.messages.values_list("role", flat=True))
            assert roles == ["user", "assistant"]
            a = convo.messages.last()
            assert a.content == "hello" and a.transcript_id is not None

    def test_blank_session_streams_without_conversation(self, tenant_client, paid_tenant):
        res = _chat(tenant_client, session_id="")
        assert "delta" in _sse_body(res)
        with schema_context("public"):
            assert AiConversation.objects.count() == 0


class TestThreadEndpoint:
    def test_thread_roundtrip_and_incremental(self, tenant_client, paid_tenant):
        _sse_body(_chat(tenant_client))
        res = tenant_client.get("/api/v1/assistant/thread/?session=sess-abc")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ai" and len(body["messages"]) == 2
        last = body["messages"][-1]["id"]
        res2 = tenant_client.get(f"/api/v1/assistant/thread/?session=sess-abc&after={last}")
        assert res2.json()["messages"] == []

    def test_unknown_or_blank_session_404(self, tenant_client, paid_tenant):
        assert tenant_client.get("/api/v1/assistant/thread/?session=nope").status_code == 404
        assert tenant_client.get("/api/v1/assistant/thread/").status_code == 404

    def test_wrong_feature_session_404(self, tenant_client, paid_tenant):
        with schema_context("public"):
            AiConversation.objects.create(
                feature="help_bot",
                audience="coach",
                tenant_schema=paid_tenant.schema_name,
                session_id="other-feat",
            )
        assert tenant_client.get("/api/v1/assistant/thread/?session=other-feat").status_code == 404
