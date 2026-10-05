"""apps.core.ai — the agentc provider (Agent Container hub). HTTP is faked at
the ``requests`` boundary; no hub is contacted."""

import json
from decimal import Decimal

import pytest
import requests
from pydantic import BaseModel

from apps.core import ai


class _Greeting(BaseModel):
    greeting: str


class _Resp:
    def __init__(self, body=None, status=200, lines=None):
        self.status_code = status
        self.ok = status < 400
        self._body = body
        self.text = json.dumps(body)
        self._lines = lines or []

    def json(self):
        return self._body

    def raise_for_status(self):
        if not self.ok:
            raise requests.HTTPError(f"{self.status_code}")

    def iter_lines(self):
        return iter(self._lines)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _events(*types):
    return [json.dumps({"seq": i, "type": t}).encode() for i, t in enumerate(types, 1)]


class _Hub:
    """Fake hub: each created run walks through ``states`` on successive
    polls and ends with the next entry of ``results``."""

    def __init__(self, *, results=("{}",), final="succeeded", create_state="queued", events=("text",)):
        self.results = list(results)
        self.final = final
        self.create_state = create_state
        self.events = events
        self.created = []
        self.cancelled = []
        self.events_error = None
        self.polls = 0

    def post(self, url, json=None, timeout=None):
        assert timeout is not None
        if url.endswith("/cancel"):
            self.cancelled.append(url.split("/")[-2])
            return _Resp({})
        run_id = f"run-{len(self.created) + 1}"
        self.created.append(json)
        return _Resp({"id": run_id, "state": self.create_state})

    def get(self, url, params=None, timeout=None, stream=False):
        assert timeout is not None
        if url.endswith("/events"):
            if self.events_error:
                raise self.events_error
            return _Resp(lines=_events(*self.events))
        self.polls += 1
        idx = int(url.rsplit("-", 1)[1]) - 1
        if self.polls % 2:  # one "running" poll before the terminal state
            return _Resp({"id": f"run-{idx + 1}", "state": "running"})
        return _Resp({"id": f"run-{idx + 1}", "state": self.final, "resultText": self.results[idx], "error": "boom"})


@pytest.fixture
def hub(settings, monkeypatch):
    settings.AI_PROVIDER = "agentc"
    settings.AGENTC_HUB = "http://hub:39300/"
    settings.AGENTC_TIMEOUT_SECONDS = 60
    monkeypatch.setattr(ai, "AGENTC_POLL_SECONDS", 0)
    fake = _Hub(results=['```json\n{"greeting": "hi"}\n```'])
    monkeypatch.setattr(ai.requests, "post", lambda *a, **k: fake.post(*a, **k))
    monkeypatch.setattr(ai.requests, "get", lambda *a, **k: fake.get(*a, **k))
    return fake


def _call(**kw):
    return ai.structured(system="sys", user="usr", output_model=_Greeting, model="claude-sonnet-5", max_tokens=9, **kw)


def test_success_strips_fences_and_reports_agentc_model(hub, settings):
    parsed, cost, model = _call()
    assert parsed.greeting == "hi"
    assert cost == Decimal("0")
    assert model == settings.AGENTC_MODEL
    body = hub.created[0]
    assert body["model"] == settings.AGENTC_MODEL  # the Anthropic model arg is ignored
    assert body["cwd"] == settings.AGENTC_CWD
    assert body["worktree"] is False
    assert body["priority"] == "interactive"
    assert body["label"] == "contentor"
    assert "Do not use any tools" in body["prompt"]
    assert body["prompt"].index("sys") < body["prompt"].index("Do not use any tools") < body["prompt"].index("usr")
    assert body["prompt"].endswith(ai._JSON_USER_NOTE)


def test_label_passthrough(hub):
    _call(label="wizard-compose")
    assert hub.created[0]["label"] == "wizard-compose"


def test_rejected_on_create(hub):
    hub.create_state = "rejected"
    with pytest.raises(ai.AiError, match="rejected"):
        _call()
    assert len(hub.created) == 1


def test_create_http_error(hub, monkeypatch):
    monkeypatch.setattr(ai.requests, "post", lambda *a, **k: _Resp({"error": "no accounts"}, status=503))
    with pytest.raises(ai.AiError, match="503"):
        _call()


def test_failed_state(hub):
    hub.final = "failed"
    with pytest.raises(ai.AiError, match="failed: boom"):
        _call()


def test_deadline_cancels_run(hub, settings):
    settings.AGENTC_TIMEOUT_SECONDS = 0
    with pytest.raises(ai.AiError, match="exceeded"):
        _call()
    assert hub.cancelled == ["run-1"]


def test_invalid_json_then_valid_on_retry(hub):
    hub.results = ["not json", '{"greeting": "second"}']
    parsed, _, _ = _call()
    assert parsed.greeting == "second"
    assert len(hub.created) == 2


def test_invalid_json_twice_raises(hub):
    hub.results = ["nope", "still nope"]
    with pytest.raises(ai.AiError, match="did not match schema"):
        _call()


def test_tool_event_discards_output_and_does_not_retry(hub, monkeypatch):
    warnings = []
    monkeypatch.setattr(ai.logger, "warning", lambda msg, *args: warnings.append(msg % args))
    hub.events = ("hub", "tool", "text")
    with pytest.raises(ai.AiError, match="agent used a tool"):
        _call(label="copilot")
    assert len(hub.created) == 1
    assert "run-1" in warnings[0] and "copilot" in warnings[0]


def test_unreadable_events_fail_closed(hub):
    hub.events_error = requests.ConnectionError("down")
    with pytest.raises(ai.AiError, match="events unreadable"):
        _call()


def test_stream_text_yields_one_delta_then_done(hub, settings):
    hub.results = ["Hello coach"]
    events = list(
        ai.stream_text(
            system="sys", history=[{"role": "user", "content": "q"}], model="x", max_tokens=9, label="help_bot"
        )
    )
    assert events[0] == ("delta", "Hello coach")
    assert events[1] == ("done", {"cost_usd": Decimal("0"), "provider": "agentc", "model": settings.AGENTC_MODEL})
    assert hub.created[0]["label"] == "help_bot"


def test_stream_text_tool_guard(hub):
    hub.events = ("tool",)
    with pytest.raises(ai.AiError, match="agent used a tool"):
        list(ai.stream_text(system="s", history=[{"role": "user", "content": "q"}], model="x", max_tokens=9))


def test_available_up(settings, monkeypatch):
    settings.AI_PROVIDER = "agentc"
    monkeypatch.setattr(ai.requests, "get", lambda url, timeout: _Resp({"ok": True}))
    assert ai.available() == (True, "ok")


def test_available_down(settings, monkeypatch):
    settings.AI_PROVIDER = "agentc"

    def boom(url, timeout):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(ai.requests, "get", boom)
    assert ai.available() == (False, "agentc_unreachable")


def test_no_vision_on_agentc(settings):
    settings.AI_PROVIDER = "agentc"
    assert ai.supports_vision() is False
    with pytest.raises(ai.AiError):
        ai.structured_messages(system="s", messages=[], output_model=_Greeting, model="m", max_tokens=1)


def test_per_call_timeout_beats_the_global_one(hub, settings):
    """Interactive callers (the /setup interview) cap their wait well under
    the proxy's ~100s cut-off, independent of the background default."""
    settings.AGENTC_TIMEOUT_SECONDS = 600
    with pytest.raises(ai.AiError, match="exceeded"):
        _call(timeout_seconds=0)
    assert hub.created[0]["timeoutSec"] == 0
    assert hub.cancelled == ["run-1"]
