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

    def post(self, url, json=None, timeout=None):
        assert timeout is not None
        if url.endswith("/cancel"):
            self.cancelled.append(url.split("/")[-2])
            return _Resp({})
        run_id = f"run-{len(self.created) + 1}"
        self.created.append(json)
        self.create_urls.append(url)
        return _Resp({"id": run_id, "state": self.create_state})

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


def test_max_effort_runs_the_pro_model(hub, settings):
    settings.AGENTC_PRO_MODEL = "gemini-3.1-pro-high"
    _call(effort="max")
    assert hub.created[0]["model"] == "gemini-3.1-pro-high"


def test_image_run_allows_tools_and_returns_the_run_id(hub, settings):
    settings.AGENTC_IMAGE_TIMEOUT_SECONDS = 420
    hub.results = ['{"file": "logo-candidates/t/b/cand_1.png", "image_model": "imagen-3"}']
    hub.events = ("tool", "text")  # the image subagent is a tool call
    run_id = ai.agentc_image_run("Design a logo.", "logo-candidates/t/b/cand_1.png", label="contentor:logo-gen")
    assert run_id == "run-1"
    body = hub.created[0]
    assert body["timeoutSec"] in (419, 420) and body["priority"] == "interactive"
    assert "Save the generated image as logo-candidates/t/b/cand_1.png" in body["prompt"]
    assert body["prompt"].startswith("Use your image generation tool")


def test_vision_run_uses_the_pro_model_and_tolerates_tools(hub, settings):
    settings.AGENTC_PRO_MODEL = "gemini-3.1-pro-high"
    hub.results = ['{"ranking": [1]}']
    hub.events = ("tool", "text")
    assert ai.agentc_vision_run("Open a.png and rank.", label="contentor:logo-judge") == '{"ranking": [1]}'
    assert hub.created[0]["model"] == "gemini-3.1-pro-high"


def test_run_file_fetches_through_the_hub(hub, monkeypatch, settings):
    settings.AGENTC_RUNS_DIR = ""
    seen = {}

    def get(url, params=None, timeout=None, stream=False):
        seen["url"], seen["params"] = url, params
        resp = _Resp({}, status=200)
        resp.content = b"\x89PNG"
        return resp

    monkeypatch.setattr(ai.requests, "get", get)
    assert ai.agentc_run_file("run-1", "logo-candidates/t/b/cand_1.png") == b"\x89PNG"
    assert seen["url"].endswith("/runs/run-1/file") and seen["params"] == {"path": "logo-candidates/t/b/cand_1.png"}


def test_run_file_missing_raises(hub, monkeypatch, settings):
    settings.AGENTC_RUNS_DIR = ""
    monkeypatch.setattr(ai.requests, "get", lambda *a, **k: _Resp({"error": "no such file"}, status=404))
    with pytest.raises(ai.AiError):
        ai.agentc_run_file("run-1", "nope.png")


def test_run_file_reads_the_local_mount_when_configured(hub, settings, tmp_path, monkeypatch):
    settings.AGENTC_RUNS_DIR = str(tmp_path)
    monkeypatch.setattr(ai, "AGENTC_FILE_POLL_SECONDS", 0)
    (tmp_path / "x").mkdir()
    (tmp_path / "x" / "cand_1.png").write_bytes(b"\x89PNGlocal")
    assert ai.agentc_run_file("run-1", "x/cand_1.png") == b"\x89PNGlocal"
