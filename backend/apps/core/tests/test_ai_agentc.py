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
        self.create_urls = []
        self.cancelled = []
        self.events_error = None
        self.polls = 0
        self.active = []  # what GET /runs lists
        self.effective_priority = None  # set: the hub's own rule for the run type, as its reply carries it

    def post(self, url, json=None, timeout=None):
        assert timeout is not None
        if url.endswith("/cancel"):
            self.cancelled.append(url.split("/")[-2])
            return _Resp({})
        run_id = f"run-{len(self.created) + 1}"
        self.created.append(json)
        self.create_urls.append(url)
        rule = {"priority": self.effective_priority} if self.effective_priority else {}
        return _Resp({"id": run_id, "state": self.create_state, **rule})

    def get(self, url, params=None, timeout=None, stream=False):
        assert timeout is not None
        if url.endswith("/runs"):
            return _Resp(self.active)
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
    settings.AGENTC_LANE = "studio"
    settings.AGENTC_MODEL = "gemini-3.8-flash-high"
    settings.AGENTC_MODEL_LOW = "gemini-3.8-flash-low"
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
    assert len(hub.created) == 1  # the hub already tried every account in the lane


def test_runs_go_to_the_studio_lane_never_an_account_or_the_ws_pool(hub):
    hub.results = ['{"greeting": "hi"}'] * 2
    _call()
    _call()
    assert hub.create_urls == ["http://hub:39300/lanes/studio/runs"] * 2


def test_no_lane_configured_fails(hub, settings):
    settings.AGENTC_LANE = ""
    with pytest.raises(ai.AiError, match="AGENTC_LANE is empty"):
        _call()


def test_low_effort_runs_the_low_variant(hub, settings):
    hub.results = ['{"greeting": "hi"}'] * 2
    _parsed, _cost, model = _call(effort="low")
    assert hub.created[0]["model"] == model == settings.AGENTC_MODEL_LOW
    _call(effort="medium")
    assert hub.created[1]["model"] == settings.AGENTC_MODEL


def test_create_http_error(hub, monkeypatch):
    monkeypatch.setattr(ai.requests, "post", lambda *a, **k: _Resp({"error": "no accounts"}, status=503))
    with pytest.raises(ai.AiError, match="503"):
        _call()


def test_failed_state(hub):
    hub.final = "failed"
    with pytest.raises(ai.AiError, match="failed: boom"):
        _call()


def test_a_hub_hold_fails_fast_and_cancels(hub, monkeypatch):
    real_get = hub.get

    def get(url, params=None, timeout=None, stream=False):
        if "/runs/run-" in url and not url.endswith("/events"):
            return _Resp(
                {
                    "id": "run-1",
                    "state": "queued",
                    "waitReason": 'quota floor 10% for "contentor": no gemini studio account above it',
                }
            )
        return real_get(url, params=params, timeout=timeout, stream=stream)

    monkeypatch.setattr(ai.requests, "get", get)
    with pytest.raises(ai.AiError, match="held by the hub: quota floor 10%"):
        _call()
    assert hub.cancelled == ["run-1"]


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


# ---- what the coach does not wait for runs as background ------------------------


def test_site_composition_and_turns_written_ahead_are_asked_as_background(hub):
    hub.results *= 4
    for label in ("contentor:compose-plan", "contentor:compose-page", "contentor:interview-ahead"):
        _call(label=label)
    _call(label="contentor:interview")
    assert [body["priority"] for body in hub.created] == ["background"] * 3 + ["interactive"]


def test_blog_autopilot_rides_as_background_and_the_admin_assistant_as_interactive(hub):
    from apps.blog import ai as blog_ai

    hub.results *= 2
    _call(label=blog_ai.AUTOPILOT_LABEL)
    _call(label="contentor:copilot")
    assert [body["priority"] for body in hub.created] == ["background", "interactive"]


def test_a_hub_rule_that_overrides_the_priority_is_logged(hub, monkeypatch):
    """2026-10-12: the hub's rules ran every compose type as interactive, so two
    site plans held both accounts and the coach's own turns were cancelled."""
    said = []
    monkeypatch.setattr(ai.logger, "warning", lambda message, *args: said.append(message % args))
    hub.results *= 2
    hub.effective_priority = "interactive"
    _call(label="contentor:interview")  # asked and run as interactive: nothing to say
    assert said == []
    _call(label="contentor:compose-plan")
    assert "was asked as background and the hub runs it as interactive" in said[0]


def test_a_look_downloads_the_pictures_and_may_use_tools(hub):
    """agentc_look: the agent fetches the links and opens them, so a tool event is expected, not refused."""
    hub.events = ("tool", "text")
    parsed, cost, model = ai.agentc_look(
        system="sys",
        user="usr",
        urls=["https://storage.example/a.jpg", "https://storage.example/b.jpg"],
        output_model=_Greeting,
        label="contentor:reels-ahead-covers",
    )
    assert (parsed.greeting, cost) == ("hi", Decimal("0"))
    body = hub.created[0]
    assert "Image 1: https://storage.example/a.jpg\nImage 2: https://storage.example/b.jpg" in body["prompt"]
    assert "Do not use any tools" not in body["prompt"]
    assert body["priority"] == "background"
