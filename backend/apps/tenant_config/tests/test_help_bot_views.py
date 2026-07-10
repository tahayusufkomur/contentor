"""Ask Contentor endpoints: SSE streaming, availability gating, usage
accounting. The provider is always mocked at the kernel's boundary
(``assistant.core_ai.stream_text``) — no real network or subprocess."""

import json
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import assistant
from apps.core.models import HelpBotUsage
from apps.tenant_config import help_bot

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@helpbottest.com",
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
def enabled(monkeypatch, tmp_path, settings):
    """A fully-enabled help bot with a stub KB."""
    kb = tmp_path / "help_kb.md"
    kb.write_text("## Payouts\nStripe.\n")
    monkeypatch.setattr(help_bot, "KB_PATH", kb)
    help_bot.system_prompt.cache_clear()
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-test"
    yield
    help_bot.system_prompt.cache_clear()


def _sse_events(response):
    body = b"".join(response.streaming_content).decode()
    return [json.loads(line[6:]) for line in body.split("\n") if line.startswith("data: ")]


def test_chat_streams_deltas_and_records_usage(coach_client, enabled, monkeypatch):
    def fake_stream(**kwargs):
        # The tenant snapshot must have been injected server-side, and the
        # coach endpoint must never use the visitor persona.
        assert kwargs["history"][0]["content"].startswith("<tenant_context>")
        assert kwargs["system"] == help_bot.system_prompt("coach")
        yield ("delta", "Open ")
        yield ("delta", "Payouts.")
        yield ("done", {"cost_usd": Decimal("0.0100"), "provider": "anthropic", "model": "m"})

    monkeypatch.setattr(assistant.core_ai, "stream_text", fake_stream)

    response = coach_client.post(
        "/api/v1/admin/help-bot/chat/",
        {"messages": [{"role": "user", "content": "How do payouts work?"}]},
        format="json",
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "text/event-stream"
    events = _sse_events(response)
    assert events[0] == {"type": "delta", "text": "Open "}
    assert events[1] == {"type": "delta", "text": "Payouts."}
    assert events[-1]["type"] == "done"
    assert isinstance(events[-1]["transcript_id"], int)
    assert isinstance(events[-1]["rate_token"], str)

    row = HelpBotUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=help_bot.current_month())
    assert row.questions == 1
    assert row.usd_spent == Decimal("0.0100")


def test_chat_provider_failure_emits_error_and_skips_quota(coach_client, enabled, monkeypatch):
    def fake_stream(**kwargs):
        yield ("delta", "partial")
        raise assistant.core_ai.AiError("boom")

    monkeypatch.setattr(assistant.core_ai, "stream_text", fake_stream)

    response = coach_client.post(
        "/api/v1/admin/help-bot/chat/",
        {"messages": [{"role": "user", "content": "hi"}]},
        format="json",
    )
    events = _sse_events(response)
    assert events[-1]["type"] == "error"
    # availability() may have created the month row, but a failed answer
    # must not consume quota or accrue spend.
    row = HelpBotUsage.objects.filter(tenant_schema=SHARED_SCHEMA).first()
    assert row is None or (row.questions == 0 and row.usd_spent == 0)


def test_chat_disabled_without_configuration(coach_client, settings, monkeypatch, tmp_path):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = ""
    monkeypatch.setattr(help_bot, "KB_PATH", tmp_path / "missing.md")
    response = coach_client.post(
        "/api/v1/admin/help-bot/chat/",
        {"messages": [{"role": "user", "content": "hi"}]},
        format="json",
    )
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "reason": "disabled"}


def test_chat_quota_exhausted(coach_client, enabled, settings):
    settings.HELP_BOT_TENANT_MONTHLY_QUESTIONS = 1
    HelpBotUsage.objects.create(tenant_schema=SHARED_SCHEMA, month=help_bot.current_month(), questions=1)
    response = coach_client.post(
        "/api/v1/admin/help-bot/chat/",
        {"messages": [{"role": "user", "content": "hi"}]},
        format="json",
    )
    assert response.json() == {"enabled": False, "reason": "quota"}


def test_chat_rejects_malformed_transcript(coach_client, enabled):
    response = coach_client.post(
        "/api/v1/admin/help-bot/chat/",
        {"messages": [{"role": "assistant", "content": "not a user turn"}]},
        format="json",
    )
    assert response.status_code == 400


def test_chat_requires_coach(tenant_ctx, enabled):
    student = User.objects.create_user(
        email="student@helpbottest.com",
        name="Student",
        password="x",
        role="student",  # noqa: S106
    )
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=student)
    response = client.post(
        "/api/v1/admin/help-bot/chat/",
        {"messages": [{"role": "user", "content": "hi"}]},
        format="json",
    )
    assert response.status_code == 403


def test_status_reports_enabled(coach_client, enabled):
    response = coach_client.get("/api/v1/admin/help-bot/status/")
    assert response.status_code == 200
    assert response.json() == {"enabled": True, "reason": "ok"}
