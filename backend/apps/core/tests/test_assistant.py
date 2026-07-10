import json
from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.core import assistant


def _frames(gen):
    return [json.loads(f.removeprefix("data: ").strip()) for f in gen]


def _fake_stream(*deltas, cost=Decimal("0.01")):
    def fake(**kwargs):
        for d in deltas:
            yield ("delta", d)
        yield ("done", {"cost_usd": cost, "provider": "anthropic", "model": "m"})

    return fake


class TestPrepareHistory:
    def test_injects_context_into_first_user_turn(self):
        out = assistant.prepare_history([{"role": "user", "content": "hi"}], "<ctx/>")
        assert out == [{"role": "user", "content": "<ctx/>\n\nhi"}]

    def test_trims_to_max_and_reopens_on_user(self):
        # 8 raw messages ending on a user turn; trimming to the last 6 cuts
        # mid-pair (opens on assistant), so the window must drop that leading
        # assistant turn and still end on the original trailing user turn.
        msgs = [{"role": "assistant", "content": "a"}] + [
            {"role": "user" if i % 2 == 0 else "assistant", "content": str(i)} for i in range(7)
        ]
        out = assistant.prepare_history(msgs, "<c/>", max_messages=6)
        assert out[0]["role"] == "user" and out[-1]["role"] == "user"

    @pytest.mark.parametrize("bad", [None, [], [{"role": "system", "content": "x"}], [{"role": "user", "content": ""}]])
    def test_rejects_bad_input(self, bad):
        with pytest.raises(ValueError):
            assistant.prepare_history(bad, "<c/>")

    def test_caps_message_chars(self):
        out = assistant.prepare_history([{"role": "user", "content": "x" * 5000}], "<c/>", max_chars=100)
        # context + separator + 100 chars
        assert len(out[0]["content"]) == len("<c/>\n\n") + 100


class TestRunChat:
    def test_streams_deltas_then_done_with_hook_extras(self):
        captured = {}

        def hook(info):
            captured.update(info)
            return {"transcript_id": 7, "rate_token": "tok"}

        with patch.object(assistant.core_ai, "stream_text", _fake_stream("he", "llo")):
            events = _frames(
                assistant.run_chat(
                    system="s", history=[{"role": "user", "content": "q"}], model="m", max_tokens=64, on_complete=hook
                )
            )
        assert [e["type"] for e in events] == ["delta", "delta", "done"]
        assert events[-1]["transcript_id"] == 7 and events[-1]["rate_token"] == "tok"
        assert captured["answer"] == "hello" and captured["cost_usd"] == Decimal("0.01")

    def test_provider_error_yields_error_event_and_skips_hook(self):
        calls = []

        def boom(**kwargs):
            raise assistant.core_ai.AiError("nope")
            yield  # pragma: no cover

        with patch.object(assistant.core_ai, "stream_text", boom):
            events = _frames(
                assistant.run_chat(
                    system="s",
                    history=[{"role": "user", "content": "q"}],
                    model="m",
                    max_tokens=64,
                    on_complete=lambda i: calls.append(i),
                )
            )
        assert events == [{"type": "error", "message": "answer_failed"}]
        assert calls == []

    def test_hook_failure_does_not_break_done(self):
        def bad_hook(info):
            raise RuntimeError("db down")

        with patch.object(assistant.core_ai, "stream_text", _fake_stream("x")):
            events = _frames(
                assistant.run_chat(
                    system="s",
                    history=[{"role": "user", "content": "q"}],
                    model="m",
                    max_tokens=64,
                    on_complete=bad_hook,
                )
            )
        assert events[-1] == {"type": "done"}
