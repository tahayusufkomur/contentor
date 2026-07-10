"""Public marketing-site Ask Contentor endpoints (apps.core.help): anonymous
access, visitor persona wiring, the dedicated __marketing__ spend bucket, and
its caps. The provider is always mocked — no network or subprocess."""

import json
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.core.help.views import MARKETING_BUCKET
from apps.core.models import HelpBotUsage
from apps.tenant_config import help_bot

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def anon_client(tenant_ctx):
    return APIClient(HTTP_HOST=HOST)


@pytest.fixture()
def enabled(monkeypatch, tmp_path, settings):
    kb = tmp_path / "help_kb.md"
    kb.write_text("## Plans\nStarter 8%, Pro 6%.\n")
    monkeypatch.setattr(help_bot, "KB_PATH", kb)
    help_bot.system_prompt.cache_clear()
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-test"
    yield
    help_bot.system_prompt.cache_clear()


def _sse_events(response):
    body = b"".join(response.streaming_content).decode()
    return [json.loads(line[6:]) for line in body.split("\n") if line.startswith("data: ")]


def test_public_chat_streams_without_auth(anon_client, enabled, monkeypatch):
    seen = {}

    def fake_stream(history, audience="coach"):
        seen["audience"] = audience
        seen["first"] = history[0]["content"]
        yield ("delta", "Starter takes 8%. ")
        yield ("delta", "[See pricing](/pricing)")
        yield ("done", {"cost_usd": Decimal("0.0050"), "provider": "anthropic"})

    monkeypatch.setattr(help_bot, "stream_answer", fake_stream)

    response = anon_client.post(
        "/api/v1/help/chat/",
        {"messages": [{"role": "user", "content": "What is the commission?"}]},
        format="json",
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "text/event-stream"
    events = _sse_events(response)
    assert events[0]["type"] == "delta"
    assert events[-1] == {"type": "done"}

    # Visitor persona + visitor context, never tenant data.
    assert seen["audience"] == "visitor"
    assert seen["first"].startswith("<visitor_context>")

    row = HelpBotUsage.objects.get(tenant_schema=MARKETING_BUCKET, month=help_bot.current_month())
    assert row.questions == 1
    assert row.usd_spent == Decimal("0.0050")


def test_public_chat_has_own_quota(anon_client, enabled, settings):
    settings.HELP_BOT_PUBLIC_MONTHLY_QUESTIONS = 2
    HelpBotUsage.objects.create(tenant_schema=MARKETING_BUCKET, month=help_bot.current_month(), questions=2)
    response = anon_client.post(
        "/api/v1/help/chat/",
        {"messages": [{"role": "user", "content": "hi"}]},
        format="json",
    )
    assert response.json() == {"enabled": False, "reason": "quota"}


def test_public_bucket_counts_into_global_kill_switch(anon_client, enabled, settings):
    settings.HELP_BOT_GLOBAL_MONTHLY_USD = 1.0
    HelpBotUsage.objects.create(
        tenant_schema=MARKETING_BUCKET, month=help_bot.current_month(), usd_spent=Decimal("1.5")
    )
    response = anon_client.post(
        "/api/v1/help/chat/",
        {"messages": [{"role": "user", "content": "hi"}]},
        format="json",
    )
    assert response.json() == {"enabled": False, "reason": "budget"}


def test_public_chat_rejects_malformed_transcript(anon_client, enabled):
    response = anon_client.post("/api/v1/help/chat/", {"messages": "nope"}, format="json")
    assert response.status_code == 400


def test_public_status_reports_enabled(anon_client, enabled):
    response = anon_client.get("/api/v1/help/status/")
    assert response.status_code == 200
    assert response.json() == {"enabled": True, "reason": "ok"}


def test_visitor_system_prompt_has_marketing_links_not_admin():
    assert "/signup" in help_bot._VISITOR_PERSONA
    assert "/pricing" in help_bot._VISITOR_PERSONA
    assert "never /admin" in help_bot._VISITOR_PERSONA or "never link" in help_bot._VISITOR_PERSONA.lower()
