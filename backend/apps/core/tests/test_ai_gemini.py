"""apps.core.ai — the gemini provider (Gemini API on an API key). HTTP is
faked at the ``requests`` boundary; Google is never contacted."""

from decimal import Decimal

import pytest
from pydantic import BaseModel

from apps.core import ai


class _Greeting(BaseModel):
    greeting: str


class _Resp:
    def __init__(self, body, status=200):
        self.status_code = status
        self.ok = status < 400
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


def _answer(text, *, thought=None, usage=None):
    parts = ([{"text": thought, "thought": True}] if thought else []) + [{"text": text}]
    return _Resp(
        {
            "candidates": [{"content": {"parts": parts}, "finishReason": "STOP"}],
            "usageMetadata": usage or {"promptTokenCount": 1_000_000, "candidatesTokenCount": 100_000},
        }
    )


@pytest.fixture()
def google(settings, monkeypatch):
    settings.AI_PROVIDER = "gemini"
    settings.GEMINI_API_KEY = "test-key"  # pragma: allowlist secret
    settings.GEMINI_MODEL = "gemini-test"
    settings.GEMINI_THINKING_LEVEL = "low"
    calls, replies = [], []

    def post(url, headers=None, json=None, timeout=None):
        assert timeout is not None
        calls.append({"url": url, "headers": headers, "json": json})
        return replies.pop(0)

    monkeypatch.setattr(ai.requests, "post", post)
    return calls, replies


def test_structured_sends_schema_and_thinking_and_bills_tokens(google):
    calls, replies = google
    replies.append(_answer('{"greeting": "hi"}', thought="planning…"))
    parsed, cost, model = ai.structured(
        system="sys", user="u", output_model=_Greeting, model="claude-sonnet-5", max_tokens=50
    )
    assert parsed.greeting == "hi" and model == "gemini-test"
    assert cost == Decimal("1.5") + Decimal("0.75")  # 1M in + 100k out at the conservative list price
    (call,) = calls
    assert call["url"].endswith("/models/gemini-test:generateContent")
    assert call["headers"] == {"x-goog-api-key": "test-key"}  # pragma: allowlist secret
    config = call["json"]["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["responseJsonSchema"]["properties"]["greeting"]["type"] == "string"
    assert config["thinkingConfig"] == {"thinkingLevel": "low"}
    assert call["json"]["systemInstruction"] == {"parts": [{"text": "sys"}]}


def test_one_retry_absorbs_an_overloaded_moment(google):
    calls, replies = google
    replies += [_Resp({"error": "overloaded"}, status=503), _answer('{"greeting": "hi"}')]
    parsed, _cost, _model = ai.structured(system="s", user="u", output_model=_Greeting, model="m", max_tokens=50)
    assert parsed.greeting == "hi" and len(calls) == 2


def test_invalid_output_twice_raises_with_the_spend(google):
    _calls, replies = google
    replies += [_answer("not json"), _answer('{"nope": 1}')]
    with pytest.raises(ai.AiError) as exc:
        ai.structured(system="s", user="u", output_model=_Greeting, model="m", max_tokens=50)
    assert exc.value.cost_usd == 2 * (Decimal("1.5") + Decimal("0.75"))


def test_empty_answer_is_an_error(google):
    _calls, replies = google
    blocked = _Resp({"candidates": [{"finishReason": "SAFETY"}], "usageMetadata": {}})
    replies += [blocked, blocked]
    with pytest.raises(ai.AiError, match="SAFETY"):
        ai.structured(system="s", user="u", output_model=_Greeting, model="m", max_tokens=50)


def test_stream_text_maps_roles_and_yields_one_delta(google):
    calls, replies = google
    replies.append(_answer("Hello there"))
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hey"},
        {"role": "user", "content": "how?"},
    ]
    events = list(ai.stream_text(system="s", history=history, model="m", max_tokens=50))
    assert events[0] == ("delta", "Hello there")
    assert events[1][0] == "done" and events[1][1]["provider"] == "gemini" and events[1][1]["cost_usd"] > 0
    assert [c["role"] for c in calls[0]["json"]["contents"]] == ["user", "model", "user"]
    assert "responseJsonSchema" not in calls[0]["json"]["generationConfig"]


def test_available_needs_the_key(settings):
    settings.AI_PROVIDER = "gemini"
    settings.GEMINI_API_KEY = ""
    assert ai.available() == (False, "no_gemini_key")
    settings.GEMINI_API_KEY = "k"  # pragma: allowlist secret
    assert ai.available() == (True, "ok")
    assert ai.supports_vision() is False
