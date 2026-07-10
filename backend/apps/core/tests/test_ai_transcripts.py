import json
from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.core import assistant
from apps.core.models import AiTranscript
from apps.tenant_config import help_bot

pytestmark = pytest.mark.django_db


def _fake_stream(*deltas, cost=Decimal("0.02")):
    def fake(**kwargs):
        for d in deltas:
            yield ("delta", d)
        yield ("done", {"cost_usd": cost, "provider": "anthropic", "model": "claude-sonnet-5"})

    return fake


def test_log_transcript_swallow_errors():
    with patch.object(AiTranscript.objects, "create", side_effect=RuntimeError("db")):
        assert (
            assistant.log_transcript(
                feature="help_bot",
                audience="coach",
                tenant_schema="t",
                session_id="s",
                question="q",
                answer="a",
                cost_usd=Decimal("0"),
                provider="cli",
                model="haiku",
                prompt_version=1,
            )
            is None
        )


def test_help_bot_sse_writes_transcript_with_raw_question():
    history = help_bot.prepare_history(
        [{"role": "user", "content": "how do payouts work?"}], "<tenant_context>x</tenant_context>"
    )
    with patch.object(assistant.core_ai, "stream_text", _fake_stream("ans")):
        frames = list(
            help_bot.sse_events(
                history, "coach", "demo_yoga", "2026-07", question="how do payouts work?", session_id="abc"
            )
        )
    row = AiTranscript.objects.get()
    assert row.feature == "help_bot" and row.audience == "coach"
    assert row.tenant_schema == "demo_yoga" and row.session_id == "abc"
    assert row.question == "how do payouts work?"  # context block NOT stored
    assert row.answer == "ans" and row.cost_usd == Decimal("0.02")
    done = json.loads(frames[-1].removeprefix("data: "))
    assert done["transcript_id"] == row.id and isinstance(done["rate_token"], str)


def test_no_transcript_on_provider_error():
    def boom(**kwargs):
        raise assistant.core_ai.AiError("x")
        yield  # pragma: no cover

    history = [{"role": "user", "content": "q"}]
    with patch.object(assistant.core_ai, "stream_text", boom):
        list(help_bot.sse_events(history, "visitor", "__marketing__", "2026-07", question="q"))
    assert AiTranscript.objects.count() == 0


def test_usage_still_recorded_on_success():
    history = [{"role": "user", "content": "q"}]
    with patch.object(assistant.core_ai, "stream_text", _fake_stream("a")):
        list(help_bot.sse_events(history, "coach", "demo_yoga", "2026-07", question="q"))
    usage = help_bot.tenant_usage("demo_yoga", month="2026-07")
    assert usage.questions == 1 and usage.usd_spent == Decimal("0.02")
