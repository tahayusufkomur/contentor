"""Conversation substrate for both help-bot flavors. Coach flavor uses the
coach_client pattern (test_help_bot_views.py); marketing flavor posts to
/api/v1/help/* with a public-host APIClient."""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.core import assistant
from apps.core.models import AiConversation, AiTranscript, HelpBotUsage
from apps.tenant_config import help_bot

pytestmark = pytest.mark.django_db(transaction=True)


def _fake_stream(**kwargs):
    yield ("delta", "hello")
    yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "claude-haiku-4-5"})


@pytest.fixture
def coach_client(tenant_ctx):
    from apps.accounts.models import User

    coach = User.objects.create_user(
        email="helpconv-coach@x.com",
        name="Nur Ak",
        password="x",
        role="owner",  # noqa: S106
    )
    coach.is_staff = True
    coach.save()
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=coach)
    return client


@pytest.fixture(autouse=True)
def _clean_conversations():
    yield
    with schema_context("public"):
        AiConversation.objects.all().delete()
        AiTranscript.objects.all().delete()
        HelpBotUsage.objects.all().delete()


class TestCoachFlavor:
    def test_chat_creates_conversation_with_coach_label(self, coach_client, tenant_ctx):
        with (
            patch.object(help_bot.core_ai, "available", return_value=(True, "ok")),
            patch.object(assistant.core_ai, "stream_text", _fake_stream),
        ):
            res = coach_client.post(
                "/api/v1/admin/help-bot/chat/",
                {"messages": [{"role": "user", "content": "how do payouts work?"}], "session_id": "hb-1"},
                format="json",
            )
            b"".join(res.streaming_content)
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="hb-1")
            assert (convo.feature, convo.audience) == ("help_bot", "coach")
            assert convo.tenant_schema == tenant_ctx.schema_name
            assert convo.user_label == "Nur"
            assert list(convo.messages.values_list("role", flat=True)) == ["user", "assistant"]

    def test_thread_and_human_mode(self, coach_client, tenant_ctx):
        with schema_context("public"):
            AiConversation.objects.create(
                feature="help_bot",
                audience="coach",
                tenant_schema=tenant_ctx.schema_name,
                session_id="hb-2",
                status="human",
                taken_over_at=timezone.now(),
            )
        res = coach_client.get("/api/v1/admin/help-bot/thread/?session=hb-2")
        assert res.status_code == 200 and res.json()["status"] == "human"
        res = coach_client.post(
            "/api/v1/admin/help-bot/chat/",
            {"messages": [{"role": "user", "content": "anyone?"}], "session_id": "hb-2"},
            format="json",
        )
        assert res.json() == {"mode": "human"}
        assert (
            coach_client.post(
                "/api/v1/admin/help-bot/human-message/", {"session_id": "hb-2", "content": "ping"}, format="json"
            ).status_code
            == 200
        )

    def test_human_request_emails_alert_address(self, coach_client, tenant_ctx, settings):
        settings.HELP_BOT_ALERT_EMAIL = "ops@contentor.app"
        with schema_context("public"):
            AiConversation.objects.create(
                feature="help_bot", audience="coach", tenant_schema=tenant_ctx.schema_name, session_id="hb-3"
            )
        with patch("apps.tenant_config.views.send_email") as mailer:
            coach_client.post("/api/v1/admin/help-bot/human-request/", {"session_id": "hb-3"}, format="json")
        assert mailer.call_args.kwargs["to"] == "ops@contentor.app"


class TestMarketingFlavor:
    def test_chat_buckets_to_marketing_and_thread_serves(self, tenant_ctx):
        # Plain APIClient() sends Host: testserver, which this repo's
        # TenantMainMiddleware 404s on (no Domain row for it, no
        # SHOW_PUBLIC_IF_NO_TENANT_FOUND) — mirrors the working anon_client
        # pattern in apps/core/tests/test_help_public.py. The marketing views
        # are host-agnostic (always bucket to MARKETING_BUCKET), so this
        # doesn't change what's under test.
        client = APIClient(HTTP_HOST="shared-test.localhost")
        with (
            patch.object(help_bot.core_ai, "available", return_value=(True, "ok")),
            patch.object(assistant.core_ai, "stream_text", _fake_stream),
        ):
            res = client.post(
                "/api/v1/help/chat/",
                {"messages": [{"role": "user", "content": "pricing?"}], "session_id": "mk-1"},
                format="json",
            )
            b"".join(res.streaming_content)
        convo = AiConversation.objects.get(session_id="mk-1")
        assert convo.tenant_schema == "__marketing__" and convo.audience == "visitor"
        assert client.get("/api/v1/help/thread/?session=mk-1").status_code == 200
