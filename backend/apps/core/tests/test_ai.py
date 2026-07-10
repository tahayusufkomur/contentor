"""apps.core.ai — the shared AI provider layer
(docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md)."""

import json as _json
import subprocess as _subprocess
from decimal import Decimal

import pytest
from pydantic import BaseModel

from apps.core import ai


class _Usage:
    def __init__(self, inp=0, out=0, cache_read=0, cache_write=0):
        self.input_tokens = inp
        self.output_tokens = out
        self.cache_read_input_tokens = cache_read
        self.cache_creation_input_tokens = cache_write


def test_estimate_cost_sonnet():
    # 1M input @ $2 + 1M output @ $10
    assert ai.estimate_cost(_Usage(inp=1_000_000, out=1_000_000), "claude-sonnet-5") == Decimal("12")


def test_estimate_cost_unknown_model_uses_default_prices():
    assert ai.estimate_cost(_Usage(inp=1_000_000), "claude-nonexistent") == Decimal("2")


def test_ai_error_carries_cost():
    exc = ai.AiError("boom", cost_usd=Decimal("0.5"))
    assert exc.cost_usd == Decimal("0.5")
    assert ai.AiError("boom").cost_usd == Decimal("0")


def test_available_anthropic_requires_key(settings):
    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = ""
    assert ai.available() == (False, "no_api_key")
    settings.ANTHROPIC_API_KEY = "sk-ant-x"
    assert ai.available() == (True, "ok")


def test_available_cli_no_binary(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert ai.available() == (False, "cli_no_binary")


def test_available_cli_no_token(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    assert ai.available() == (False, "cli_no_token")


def test_available_cli_ok(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-token")
    assert ai.available() == (True, "ok")


def test_cli_env_strips_billing_vars(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-be-stripped")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "also-stripped")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-kept")
    env = ai._cli_env()
    assert "ANTHROPIC_API_KEY" not in env
    assert "ANTHROPIC_AUTH_TOKEN" not in env
    assert env["CLAUDE_CODE_OAUTH_TOKEN"] == "oat-kept"


# ── structured() ──────────────────────────────────────────────────────────────


class _Out(BaseModel):
    title: str


def _completed(stdout="", rc=0, stderr=""):
    return _subprocess.CompletedProcess(args=[], returncode=rc, stdout=stdout, stderr=stderr)


def _cli_settings(settings):
    settings.AI_PROVIDER = "cli"
    settings.AI_CLI_BIN = "claude"
    settings.AI_CLI_MODEL = "haiku"


def test_structured_cli_parses_and_costs_zero(settings, monkeypatch):
    _cli_settings(settings)
    captured = {}

    def fake_run(cmd, **kw):
        captured["cmd"] = cmd
        captured["env"] = kw["env"]
        return _completed(stdout=_json.dumps({"result": '{"title": "hi"}'}))

    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-be-stripped")
    parsed, cost, model = ai.structured(
        system="s", user="u", output_model=_Out, model="claude-sonnet-5", max_tokens=100
    )
    assert parsed.title == "hi"
    assert cost == Decimal("0")
    assert model == "haiku"  # cli ignores the anthropic model name
    assert "ANTHROPIC_API_KEY" not in captured["env"]
    assert "--system-prompt" in captured["cmd"]
    # The pydantic JSON schema rides in the system prompt (schema-in-prompt).
    system_arg = captured["cmd"][captured["cmd"].index("--system-prompt") + 1]
    assert "JSON schema" in system_arg and "title" in system_arg


def test_structured_cli_strips_code_fences(settings, monkeypatch):
    _cli_settings(settings)
    fenced = '```json\n{"title": "hi"}\n```'
    monkeypatch.setattr("subprocess.run", lambda cmd, **kw: _completed(stdout=_json.dumps({"result": fenced})))
    parsed, _, _ = ai.structured(system="s", user="u", output_model=_Out, model="m", max_tokens=100)
    assert parsed.title == "hi"


def test_structured_cli_retries_once_on_bad_json(settings, monkeypatch):
    _cli_settings(settings)
    outs = [_json.dumps({"result": '{"title": broken'}), _json.dumps({"result": '{"title": "ok"}'})]
    calls = []

    def fake_run(cmd, **kw):
        calls.append(1)
        return _completed(stdout=outs[len(calls) - 1])

    monkeypatch.setattr("subprocess.run", fake_run)
    parsed, _, _ = ai.structured(system="s", user="u", output_model=_Out, model="m", max_tokens=100)
    assert parsed.title == "ok"
    assert len(calls) == 2


def test_structured_cli_raises_after_second_bad_json(settings, monkeypatch):
    _cli_settings(settings)
    calls = []

    def fake_run(cmd, **kw):
        calls.append(1)
        return _completed(stdout=_json.dumps({"result": "not json at all"}))

    monkeypatch.setattr("subprocess.run", fake_run)
    with pytest.raises(ai.AiError, match="did not match schema"):
        ai.structured(system="s", user="u", output_model=_Out, model="m", max_tokens=100)
    assert len(calls) == 2


def test_structured_cli_nonzero_rc_raises_without_retry(settings, monkeypatch):
    _cli_settings(settings)
    calls = []

    def fake_run(cmd, **kw):
        calls.append(1)
        return _completed(rc=1, stderr="auth broken")

    monkeypatch.setattr("subprocess.run", fake_run)
    with pytest.raises(ai.AiError, match="rc=1"):
        ai.structured(system="s", user="u", output_model=_Out, model="m", max_tokens=100)
    assert len(calls) == 1


def test_structured_anthropic_parses_and_costs(settings, monkeypatch):
    settings.AI_PROVIDER = "anthropic"

    class _Resp:
        parsed_output = _Out(title="hi")
        usage = _Usage(inp=1_000_000)

    class _Messages:
        def parse(self, **kwargs):
            _Resp.kwargs = kwargs
            return _Resp

    class _Client:
        messages = _Messages()

    monkeypatch.setattr(ai, "_anthropic_client", lambda: _Client())
    parsed, cost, model = ai.structured(
        system="s", user="u", output_model=_Out, model="claude-sonnet-5", max_tokens=100
    )
    assert parsed.title == "hi"
    assert cost == Decimal("2")
    assert model == "claude-sonnet-5"
    assert _Resp.kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert _Resp.kwargs["output_format"] is _Out


def test_structured_anthropic_wraps_sdk_errors(settings, monkeypatch):
    settings.AI_PROVIDER = "anthropic"

    class _FailingMessages:
        def parse(self, **kwargs):
            raise RuntimeError("network down")

    class _Client:
        messages = _FailingMessages()

    monkeypatch.setattr(ai, "_anthropic_client", lambda: _Client())
    with pytest.raises(ai.AiError, match="network down") as excinfo:
        ai.structured(system="s", user="u", output_model=_Out, model="m", max_tokens=100)
    assert excinfo.value.cost_usd == Decimal("0")


# ── stream_text() ─────────────────────────────────────────────────────────────


class _FakeProc:
    """Stands in for subprocess.Popen running `claude -p --output-format stream-json`."""

    def __init__(self, lines, returncode=0):
        import io

        self.stdout = io.StringIO("".join(line + "\n" for line in lines))
        self.stderr = io.StringIO("")
        self.returncode = returncode

    def wait(self, timeout=None):
        return self.returncode

    def poll(self):
        return self.returncode

    def kill(self):
        pass


def _delta_line(text):
    event = {"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}}
    return _json.dumps({"type": "stream_event", "event": event})


_HISTORY = [{"role": "user", "content": "hello"}]


def test_stream_cli_yields_deltas_then_done(settings, monkeypatch):
    _cli_settings(settings)
    lines = [_delta_line("Hel"), _delta_line("lo"), _json.dumps({"type": "result"})]
    captured = {}

    def fake_popen(cmd, **kw):
        captured["cmd"] = cmd
        captured["env"] = kw["env"]
        return _FakeProc(lines)

    monkeypatch.setattr("subprocess.Popen", fake_popen)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-be-stripped")
    events = list(ai.stream_text(system="persona", history=_HISTORY, model="claude-sonnet-5", max_tokens=64))
    assert events[:2] == [("delta", "Hel"), ("delta", "lo")]
    assert events[-1] == ("done", {"cost_usd": Decimal("0"), "provider": "cli", "model": "haiku"})
    assert "ANTHROPIC_API_KEY" not in captured["env"]
    assert captured["cmd"][captured["cmd"].index("--system-prompt") + 1] == "persona"


def test_stream_cli_serializes_prior_turns(settings, monkeypatch):
    _cli_settings(settings)
    captured = {}

    def fake_popen(cmd, **kw):
        captured["cmd"] = cmd
        return _FakeProc([_json.dumps({"type": "result"})])

    monkeypatch.setattr("subprocess.Popen", fake_popen)
    history = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "answer"},
        {"role": "user", "content": "second"},
    ]
    list(ai.stream_text(system="s", history=history, model="m", max_tokens=64))
    prompt = captured["cmd"][captured["cmd"].index("-p") + 1]
    assert "<conversation_so_far>" in prompt
    assert "User: first" in prompt and "You: answer" in prompt
    assert prompt.endswith("second")


def test_stream_cli_failure_raises_ai_error(settings, monkeypatch):
    _cli_settings(settings)
    monkeypatch.setattr("subprocess.Popen", lambda cmd, **kw: _FakeProc([], returncode=1))
    with pytest.raises(ai.AiError, match="rc=1"):
        list(ai.stream_text(system="s", history=_HISTORY, model="m", max_tokens=64))


def test_stream_anthropic_yields_deltas_then_done(settings, monkeypatch):
    settings.AI_PROVIDER = "anthropic"

    class _Final:
        usage = _Usage(inp=1_000_000)

    class _Stream:
        text_stream = iter(["Hel", "lo"])

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get_final_message(self):
            return _Final()

    class _Messages:
        def stream(self, **kwargs):
            _Stream.kwargs = kwargs
            return _Stream()

    class _Client:
        messages = _Messages()

    monkeypatch.setattr(ai, "_anthropic_client", lambda: _Client())
    events = list(ai.stream_text(system="persona", history=_HISTORY, model="claude-sonnet-5", max_tokens=64))
    assert events[:2] == [("delta", "Hel"), ("delta", "lo")]
    assert events[-1] == ("done", {"cost_usd": Decimal("2"), "provider": "anthropic", "model": "claude-sonnet-5"})
    assert _Stream.kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert _Stream.kwargs["messages"] == _HISTORY
