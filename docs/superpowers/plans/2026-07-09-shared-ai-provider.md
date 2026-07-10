# Shared AI Provider Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared provider module (`apps/core/ai.py`) puts every AI feature (help bot, blog AI, logo Brand Pack) behind a single `AI_PROVIDER` switch — `anthropic` (prod, API key) or `cli` (local dev, developer's Claude subscription via the `claude` CLI) — so dev never bills API tokens.

**Architecture:** Plain functions in `apps/core/ai.py` exposing the two call shapes that exist in the codebase: `stream_text` (help bot chat) and `structured` (blog + brand pack, pydantic-validated). Feature modules keep all prompts, quotas, budgets, and view contracts; only their provider plumbing is replaced. Spec: `docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md`.

**Tech Stack:** Django 5.1 settings-driven config, `anthropic` SDK (messages.stream / messages.parse), `claude` CLI subprocess (stream-json / json envelopes), pydantic v2, pytest (run inside the django container).

## Global Constraints

- Prod behavior must be byte-identical: `AI_PROVIDER` defaults to `"anthropic"`; `.env.prod` needs no change.
- `config/settings/prod.py` must raise `ImproperlyConfigured` on `AI_PROVIDER == "cli"`.
- CLI subprocess env must strip `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` (subscription-only billing).
- CLI cost is always `Decimal("0")` — never accrues against USD budget caps.
- `AI_CLI_MODEL` defaults to `"haiku"` (dev tests plumbing, not quality).
- The `system` argument is byte-frozen per feature — never interpolate tenant data into it (prompt-cache contract).
- The CLI structured path retries ONCE on JSON/schema-validation failure before raising.
- No model/DB changes → no migrations; `make test` (not `test-fresh`) suffices.
- Tests run inside the container: `docker compose exec django pytest <path> -v`.
- Pre-commit must pass with zero issues (`make lint`).
- Work on branch `feat/shared-ai-provider`. The working tree is shared with concurrent agents — verify `git status` is clean and `HEAD` is the expected base before `checkout -b`, before every commit, and before any ref move.

---

### Task 1: Settings + prod guard

**Files:**
- Modify: `backend/config/settings/base.py:216-252` (the AI settings block)
- Modify: `backend/config/settings/prod.py` (add guard after the base import)
- Test: `backend/apps/core/tests/test_prod_settings_ai_guard.py` (create)

**Interfaces:**
- Produces: `settings.AI_PROVIDER` (`"anthropic"`|`"cli"`), `settings.AI_CLI_BIN` (default `"claude"`), `settings.AI_CLI_MODEL` (default `"haiku"`). All later tasks read these.
- Old per-feature vars (`HELP_BOT_PROVIDER`, `BLOG_AI_PROVIDER`, `*_CLI_BIN`, `*_CLI_MODEL`) are NOT removed here — they go away in Tasks 5-6 when their modules migrate.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_prod_settings_ai_guard.py`, mirroring the existing `test_prod_settings_bypass_guard.py` pattern:

```python
"""Production settings refuse AI_PROVIDER=cli (a local-dev-only provider:
developer subscription, no CLI binary in the prod image, $0 cost would
blind the budget kill-switches)."""

from __future__ import annotations

import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _fresh_prod(monkeypatch, provider):
    sys.modules.pop("config.settings.prod", None)
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("BILLING_BYPASS_ENABLED", "false")
    monkeypatch.setenv("LIVE_FAKE_ENABLED", "false")
    monkeypatch.setenv("EMAIL_SINK_ENABLED", "false")
    monkeypatch.setenv("AI_PROVIDER", provider)
    return importlib.import_module("config.settings.prod")


def test_prod_settings_refuses_cli_provider(monkeypatch):
    with pytest.raises(ImproperlyConfigured) as excinfo:
        _fresh_prod(monkeypatch, "cli")
    assert "AI_PROVIDER" in str(excinfo.value)


def test_prod_settings_accepts_anthropic_provider(monkeypatch):
    mod = _fresh_prod(monkeypatch, "anthropic")
    assert mod.AI_PROVIDER == "anthropic"


def test_ai_cli_model_defaults_to_haiku(monkeypatch):
    monkeypatch.delenv("AI_CLI_MODEL", raising=False)
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    mod = _fresh_prod(monkeypatch, "anthropic")
    assert mod.AI_CLI_MODEL == "haiku"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_prod_settings_ai_guard.py -v`
Expected: FAIL — `AttributeError`/no guard raised (settings don't exist yet).

- [ ] **Step 3: Add the settings block to base.py**

In `backend/config/settings/base.py`, directly ABOVE the `# --- Logo Studio AI Brand Pack ...` comment (line ~216), insert:

```python
# --- AI provider (apps.core.ai) ---
# "anthropic" (prod: API key + prompt caching) or "cli" (local dev: the
# developer's Claude subscription via the `claude` CLI; needs the binary in
# the container — dev compose builds with INSTALL_CLAUDE_CLI=1 — and
# CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
AI_PROVIDER = os.environ.get("AI_PROVIDER", "anthropic")
AI_CLI_BIN = os.environ.get("AI_CLI_BIN", "claude")
# Dev default is haiku: local runs test plumbing/UI, not output quality, and
# it's faster + lighter on the developer's subscription quota. Set
# AI_CLI_MODEL=sonnet when a dev session needs prod-quality output.
AI_CLI_MODEL = os.environ.get("AI_CLI_MODEL", "haiku")
```

Leave every existing `HELP_BOT_*` / `BLOG_AI_*` / `LOGO_AI_*` var untouched in this task.

- [ ] **Step 4: Add the prod guard**

In `backend/config/settings/prod.py`, after the existing guard section (search for `BILLING_BYPASS_ENABLED` — place this guard adjacent to it, same style):

```python
# The CLI provider is local-dev only: it runs on the developer's Claude
# subscription, the prod image has no `claude` binary (INSTALL_CLAUDE_CLI is
# dev-only), and its $0 cost reporting would blind the USD kill-switches.
if AI_PROVIDER == "cli":  # noqa: F405
    raise ImproperlyConfigured("AI_PROVIDER=cli must never run in production; use 'anthropic'.")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_prod_settings_ai_guard.py apps/core/tests/test_prod_settings_bypass_guard.py -v`
Expected: all PASS (including the pre-existing bypass-guard tests — proves prod.py still imports cleanly).

- [ ] **Step 6: Commit**

```bash
git add backend/config/settings/base.py backend/config/settings/prod.py backend/apps/core/tests/test_prod_settings_ai_guard.py
git commit -m "feat(ai): AI_PROVIDER settings + prod guard against cli provider"
```

---

### Task 2: `apps/core/ai.py` — errors, pricing, preflight

**Files:**
- Create: `backend/apps/core/ai.py`
- Test: `backend/apps/core/tests/test_ai.py` (create)

**Interfaces:**
- Consumes: `settings.AI_PROVIDER`, `settings.AI_CLI_BIN`, `settings.ANTHROPIC_API_KEY` (Task 1).
- Produces (used by Tasks 3-8):
  - `class AiError(Exception)` with `.cost_usd: Decimal` (default `Decimal("0")`)
  - `estimate_cost(usage, model) -> Decimal`
  - `available() -> tuple[bool, str]` — reasons `"ok" | "no_api_key" | "cli_no_binary" | "cli_no_token"`
  - `_anthropic_client()` (module-private, `timeout=100.0, max_retries=1`)
  - `_cli_env()` (module-private, strips billing vars)
  - `CLI_TIMEOUT_SECONDS = 120`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_ai.py`:

```python
"""apps.core.ai — the shared AI provider layer
(docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md)."""

from decimal import Decimal

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.core.ai'` (or ImportError).

- [ ] **Step 3: Create the module**

Create `backend/apps/core/ai.py`. The price table is COPIED from `logo_ai._MODEL_PRICES` (logo_ai keeps its own copy until Task 7 deletes it — `blog/ai.py` and `help_bot.py` import from logo_ai until they migrate):

```python
"""Shared AI provider layer
(docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md).

Every AI feature calls Claude through this module. Two providers behind the
two call shapes in the codebase (stream_text for chat, structured for
schema-validated generation), selected by settings.AI_PROVIDER:

- "anthropic" (prod, and any env that should bill the API key): SDK calls
  with prompt caching on the system block.
- "cli" (local dev): the developer's Claude subscription via the ``claude``
  CLI. ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are stripped from the
  subprocess env so the CLI can never silently bill the key; cost is always
  Decimal("0") — subscription usage must not accrue against USD budget caps.

Prompt-caching contract: the ``system`` argument must be byte-frozen per
feature (persona / knowledge base / static prompt only). Tenant state
travels in the user turn — never interpolate it into ``system`` (it would
fragment the Anthropic cache per tenant).
"""

import json
import os
import shutil
import subprocess
import tempfile
from decimal import Decimal

from django.conf import settings

CLI_TIMEOUT_SECONDS = 120

# $ per 1M tokens: (input, output, cache_read, cache_write). Cache-write here
# assumes the 5-minute TTL (1.25x input), not the 1-hour tier.
_MODEL_PRICES = {
    "claude-sonnet-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00, "cache_read": 0.10, "cache_write": 1.25},
}
_DEFAULT_PRICES = _MODEL_PRICES["claude-sonnet-5"]


class AiError(Exception):
    """The provider failed before, during, or after a call (including
    schema-validation failure on a completed call). Carries the estimated
    cost of the (possibly billed) attempt so callers can still accrue it
    against their budget kill-switches."""

    def __init__(self, message, cost_usd=Decimal("0")):
        super().__init__(message)
        self.cost_usd = cost_usd


def estimate_cost(usage, model):
    """Anthropic usage object -> estimated USD."""
    prices = _MODEL_PRICES.get(model, _DEFAULT_PRICES)

    def per_m(tokens, price):
        return (Decimal(tokens or 0) / Decimal(1_000_000)) * Decimal(str(price))

    return (
        per_m(getattr(usage, "input_tokens", 0), prices["input"])
        + per_m(getattr(usage, "output_tokens", 0), prices["output"])
        + per_m(getattr(usage, "cache_read_input_tokens", 0), prices["cache_read"])
        + per_m(getattr(usage, "cache_creation_input_tokens", 0), prices["cache_write"])
    )


def available():
    """Provider preflight -> (ok, reason).
    Reasons: ok | no_api_key | cli_no_binary | cli_no_token."""
    if settings.AI_PROVIDER == "cli":
        if shutil.which(settings.AI_CLI_BIN) is None:
            return False, "cli_no_binary"
        if not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
            return False, "cli_no_token"
        return True, "ok"
    if not settings.ANTHROPIC_API_KEY:
        return False, "no_api_key"
    return True, "ok"


def _anthropic_client():
    from anthropic import Anthropic

    # timeout=100 covers the slowest call (brand pack, 6000 output tokens).
    return Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=100.0, max_retries=1)


def _cli_env():
    # Subscription auth only: with ANTHROPIC_API_KEY present the CLI would
    # bill the API key instead of the subscription.
    return {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
```

(`json`, `subprocess`, `tempfile` are imported now because Tasks 3-4 add the provider bodies to this same file; if the linter flags them as unused at this commit, move those three imports into Task 3 instead.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai.py -v`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/ai.py backend/apps/core/tests/test_ai.py
git commit -m "feat(ai): core provider layer skeleton — AiError, pricing, preflight"
```

---

### Task 3: `core.ai.structured()` — both providers + one retry

**Files:**
- Modify: `backend/apps/core/ai.py` (append)
- Test: `backend/apps/core/tests/test_ai.py` (append)

**Interfaces:**
- Produces: `structured(*, system: str, user: str, output_model: type[pydantic.BaseModel], model: str, max_tokens: int) -> tuple[BaseModel, Decimal, str]` — returns `(parsed, cost_usd, effective_model)`. Raises `AiError`. Tasks 5, 7, 8 call this.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_ai.py`:

```python
import json as _json
import subprocess as _subprocess

import pytest
from pydantic import BaseModel


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
    parsed, cost, model = ai.structured(system="s", user="u", output_model=_Out, model="claude-sonnet-5", max_tokens=100)
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
    parsed, cost, model = ai.structured(system="s", user="u", output_model=_Out, model="claude-sonnet-5", max_tokens=100)
    assert parsed.title == "hi"
    assert cost == Decimal("2")
    assert model == "claude-sonnet-5"
    assert _Resp.kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert _Resp.kwargs["output_format"] is _Out


def test_structured_anthropic_wraps_sdk_errors(settings, monkeypatch):
    settings.AI_PROVIDER = "anthropic"

    class _Client:
        class messages:
            @staticmethod
            def parse(**kwargs):
                raise RuntimeError("network down")

    monkeypatch.setattr(ai, "_anthropic_client", lambda: _Client())
    with pytest.raises(ai.AiError, match="network down") as excinfo:
        ai.structured(system="s", user="u", output_model=_Out, model="m", max_tokens=100)
    assert excinfo.value.cost_usd == Decimal("0")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai.py -v -k structured`
Expected: FAIL — `AttributeError: module 'apps.core.ai' has no attribute 'structured'`.

- [ ] **Step 3: Implement**

Append to `backend/apps/core/ai.py`:

```python
# ── structured output (blog drafts/topics, brand pack) ──────────────────────


def structured(*, system, user, output_model, model, max_tokens):
    """One structured-output call -> (validated ``output_model`` instance,
    cost_usd, effective_model). Raises AiError on provider or schema
    failure."""
    if settings.AI_PROVIDER == "cli":
        return _cli_structured(system, user, output_model)
    return _anthropic_structured(system, user, output_model, model, max_tokens)


def _anthropic_structured(system, user, output_model, model, max_tokens):
    client = _anthropic_client()
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_format=output_model,
        )
    except Exception as exc:
        # No usage data on a failed call — nothing billable to estimate.
        raise AiError(f"anthropic call failed: {exc}") from exc
    return response.parsed_output, estimate_cost(response.usage, model), model


def _cli_structured(system, user, output_model):
    """Local-dev provider: blocking `claude -p` on the developer's
    subscription. The CLI has no parse-forced structured output, so the
    schema contract is appended to the system prompt and the result is
    validated with the SAME pydantic model as the anthropic path. Because
    nothing forces valid JSON, occasional invalid output is expected — one
    retry absorbs it (observed in the field 2026-07-09)."""
    from pydantic import ValidationError

    schema_note = (
        "\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON schema:\n"
        + json.dumps(output_model.model_json_schema())
    )
    cmd = [
        settings.AI_CLI_BIN,
        "-p",
        user,
        "--model",
        settings.AI_CLI_MODEL,
        "--system-prompt",
        system + schema_note,
        "--disallowedTools",
        "*",
        "--max-turns",
        "1",
        "--output-format",
        "json",
    ]
    last_error = None
    for _attempt in range(2):
        try:
            proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
                cmd,
                capture_output=True,
                text=True,
                timeout=CLI_TIMEOUT_SECONDS,
                env=_cli_env(),
                cwd=tempfile.gettempdir(),
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise AiError(f"claude CLI not runnable: {exc}") from exc
        if proc.returncode != 0:
            raise AiError(f"claude CLI failed (rc={proc.returncode}): {(proc.stderr or '')[:500]}")
        try:
            envelope = json.loads(proc.stdout)
            text = (envelope.get("result") or "").strip()
            if text.startswith("```"):
                text = text.strip("`\n")
                if text.startswith("json"):
                    text = text[4:].lstrip()
            # Subscription usage — nothing accrues against the USD caps.
            return output_model.model_validate_json(text), Decimal("0"), settings.AI_CLI_MODEL
        except (ValueError, ValidationError) as exc:
            last_error = exc
    raise AiError(f"claude CLI output did not match schema: {last_error}") from last_error
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/ai.py backend/apps/core/tests/test_ai.py
git commit -m "feat(ai): structured() — anthropic parse + cli schema-in-prompt with one retry"
```

---

### Task 4: `core.ai.stream_text()` — both providers

**Files:**
- Modify: `backend/apps/core/ai.py` (append)
- Test: `backend/apps/core/tests/test_ai.py` (append)

**Interfaces:**
- Produces: `stream_text(*, system: str, history: list[dict], model: str, max_tokens: int)` — generator yielding `("delta", str)` events then exactly one `("done", {"cost_usd": Decimal, "provider": str, "model": str})`. Raises `AiError` on CLI failure; anthropic streaming exceptions propagate unwrapped (today's behavior — `help_bot.sse_events` catches `Exception` broadly). Task 6 calls this.
- `history` is Messages-API-shaped: `[{"role": "user"|"assistant", "content": str}, ...]`, starting and ending with a user turn (callers validate — see `help_bot.prepare_history`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_ai.py`:

```python
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
    return _json.dumps(
        {"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}}}
    )


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai.py -v -k stream`
Expected: FAIL — `AttributeError: module 'apps.core.ai' has no attribute 'stream_text'`.

- [ ] **Step 3: Implement**

Append to `backend/apps/core/ai.py` (bodies come from `help_bot._stream_anthropic` / `_stream_cli` / `_cli_prompt`, generalized: model/system/max_tokens are parameters; the history speaker label is "User" instead of "Coach"; done-dict gains `"model"`):

```python
# ── streaming chat (help bot) ────────────────────────────────────────────────


def stream_text(*, system, history, model, max_tokens):
    """Yield ("delta", text) events, then exactly one ("done", info) where
    info = {"cost_usd": Decimal, "provider": str, "model": str}."""
    if settings.AI_PROVIDER == "cli":
        yield from _stream_cli(system, history)
    else:
        yield from _stream_anthropic(system, history, model, max_tokens)


def _stream_anthropic(system, history, model, max_tokens):
    client = _anthropic_client()
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=history,
    ) as stream:
        for text in stream.text_stream:
            yield ("delta", text)
        final = stream.get_final_message()
    yield ("done", {"cost_usd": estimate_cost(final.usage, model), "provider": "anthropic", "model": model})


def _cli_prompt(history):
    """The CLI takes one prompt string: serialize prior turns, keep the
    (context-carrying) last user message verbatim."""
    *prior, last = history
    parts = []
    if prior:
        lines = [f"{'User' if m['role'] == 'user' else 'You'}: {m['content']}" for m in prior]
        parts.append("<conversation_so_far>\n" + "\n".join(lines) + "\n</conversation_so_far>")
    parts.append(last["content"])
    return "\n\n".join(parts)


def _stream_cli(system, history):
    """Local-dev provider: `claude -p` on the developer's subscription.
    Flag set verified against claude CLI 2026-07: --system-prompt replaces
    the Claude Code persona entirely; stream-json + --include-partial-messages
    emits Messages-API-shaped stream_event lines."""
    cmd = [
        settings.AI_CLI_BIN,
        "-p",
        _cli_prompt(history),
        "--model",
        settings.AI_CLI_MODEL,
        "--system-prompt",
        system,
        "--disallowedTools",
        "*",
        "--max-turns",
        "1",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
    ]
    try:
        proc = subprocess.Popen(  # noqa: S603 — fixed argv, no shell
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_cli_env(),
            cwd=tempfile.gettempdir(),
        )
    except OSError as exc:
        raise AiError(f"claude CLI not runnable: {exc}") from exc

    done = None
    try:
        for line in proc.stdout:
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if obj.get("type") == "stream_event":
                event = obj.get("event") or {}
                delta = event.get("delta") or {}
                if event.get("type") == "content_block_delta" and delta.get("type") == "text_delta":
                    yield ("delta", delta["text"])
            elif obj.get("type") == "result":
                # Subscription usage — nothing accrues against the USD caps.
                done = {"cost_usd": Decimal("0"), "provider": "cli", "model": settings.AI_CLI_MODEL}
        proc.wait(timeout=CLI_TIMEOUT_SECONDS)
    finally:
        if proc.poll() is None:
            proc.kill()
    if done is None or proc.returncode != 0:
        stderr = (proc.stderr.read() or "")[:500] if proc.stderr else ""
        raise AiError(f"claude CLI failed (rc={proc.returncode}): {stderr}")
    yield ("done", done)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/ai.py backend/apps/core/tests/test_ai.py
git commit -m "feat(ai): stream_text() — anthropic streaming + cli stream-json"
```

---

### Task 5: Migrate `apps/blog/ai.py`

**Files:**
- Modify: `backend/apps/blog/ai.py`
- Modify: `backend/config/settings/base.py` (remove `BLOG_AI_PROVIDER`, `BLOG_AI_CLI_MODEL`, `BLOG_AI_CLI_BIN`)
- Modify: `backend/apps/blog/tests/test_ai.py` (retarget provider config)

**Interfaces:**
- Consumes: `core.ai.structured(...)`, `core.ai.available()`, `core.ai.AiError` (Tasks 2-3).
- Produces: `blog.ai` public surface unchanged — `generate_post(brief, topic, instructions="") -> DraftResult`, `generate_topics(brief, existing_titles=()) -> (list[dict], Decimal)`, `availability(tenant, month=None) -> dict`, `BlogAiError(message, cost_usd=Decimal("0"))`. `apps/blog/views.py` and the autopilot task keep working untouched.

- [ ] **Step 1: Update the module**

In `backend/apps/blog/ai.py`:

1. Replace the import `from apps.tenant_config.logo_ai import _estimate_cost  # shared price table` with `from apps.core import ai as core_ai`.
2. Delete `CLI_TIMEOUT_SECONDS = 30`-style constant (line 30, `CLI_TIMEOUT_SECONDS = 120`) — it now lives in `core.ai`.
3. Replace the three provider functions (`_call_structured`, `_anthropic_structured`, `_cli_structured`, lines 155-238) with:

```python
def _call_structured(system_prompt, user_prompt, output_model, model, max_tokens):
    """One structured-output model call -> (validated output_model, cost,
    effective_model). Raises BlogAiError on any provider failure."""
    try:
        return core_ai.structured(
            system=system_prompt, user=user_prompt, output_model=output_model, model=model, max_tokens=max_tokens
        )
    except core_ai.AiError as exc:
        raise BlogAiError(str(exc), cost_usd=exc.cost_usd) from exc
```

4. In `generate_post`, the call site and the provider-conditional `ai_model` become:

```python
    parsed, cost, effective_model = _call_structured(
        BLOG_STATIC_PROMPT, user_prompt, _BlogDraft, settings.BLOG_AI_MODEL, MAX_OUTPUT_TOKENS
    )
```

and in the returned fields dict:

```python
            "ai_model": effective_model,
```

5. In `generate_topics`:

```python
    parsed, cost, _ = _call_structured(
        TOPIC_STATIC_PROMPT, user_prompt, _TopicBatch, settings.BLOG_AI_TOPIC_MODEL, TOPIC_MAX_OUTPUT_TOKENS
    )
```

6. Replace `_provider_configured` (lines 322-327) with:

```python
def _provider_configured():
    return core_ai.available()[0]
```

7. Update the module docstring's provider paragraph (lines 12-15) to:

```
Provider plumbing lives in apps.core.ai (AI_PROVIDER: "anthropic" in prod,
"cli" for local dev on the developer's Claude subscription); this module
owns only prompts, validation, budgets and quotas.
```

- [ ] **Step 2: Remove the dead settings**

In `backend/config/settings/base.py`, delete these three lines (keep `BLOG_AI_MODEL`, `BLOG_AI_TOPIC_MODEL`, `BLOG_AI_MONTHLY_BUDGET_USD`):

```python
BLOG_AI_PROVIDER = os.environ.get("BLOG_AI_PROVIDER", "anthropic")
BLOG_AI_CLI_MODEL = os.environ.get("BLOG_AI_CLI_MODEL", "sonnet")
BLOG_AI_CLI_BIN = os.environ.get("BLOG_AI_CLI_BIN", "claude")
```

and rewrite that block's comment to:

```python
# --- AI blog generation (apps.blog.ai; provider comes from AI_PROVIDER) ---
```

- [ ] **Step 3: Retarget the blog AI tests**

In `backend/apps/blog/tests/test_ai.py`: every `settings.BLOG_AI_PROVIDER = ...` override becomes `settings.AI_PROVIDER = ...`; overrides of `BLOG_AI_CLI_BIN`/`BLOG_AI_CLI_MODEL` become `AI_CLI_BIN`/`AI_CLI_MODEL`. Global patches (`subprocess.run`, `shutil.which`, `monkeypatch.setenv("ANTHROPIC_API_KEY", ...)`) keep working because `core.ai` uses the same module-level calls. Tests asserting on `_cli_structured`/`_anthropic_structured` directly (now deleted) retarget the same behavior through `blog.ai._call_structured` or mock `core_ai.structured`; drop tests that duplicate what `apps/core/tests/test_ai.py` now covers (CLI env-stripping, fence-stripping, schema-failure) and keep the blog-level contracts (BlogAiError cost carry-through, `ai_model` recording, availability reasons).

- [ ] **Step 4: Run the affected suites**

Run: `docker compose exec django pytest apps/blog/tests/ apps/core/tests/test_ai.py apps/core/tests/test_blog_ai_usage.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/ai.py backend/config/settings/base.py backend/apps/blog/tests/test_ai.py
git commit -m "refactor(blog): route AI calls through core.ai; drop BLOG_AI provider vars"
```

---

### Task 6: Migrate `apps/tenant_config/help_bot.py`

**Files:**
- Modify: `backend/apps/tenant_config/help_bot.py`
- Modify: `backend/config/settings/base.py` (remove `HELP_BOT_PROVIDER`, `HELP_BOT_CLI_MODEL`, `HELP_BOT_CLI_BIN`)
- Modify: `backend/apps/tenant_config/tests/test_help_bot.py` + `backend/apps/core/tests/test_help_public.py` (retarget provider config)

**Interfaces:**
- Consumes: `core.ai.stream_text(...)`, `core.ai.available()`, `core.ai.AiError` (Tasks 2, 4).
- Produces: `help_bot` public surface unchanged — `stream_answer(history, audience="coach")` (same event shapes), `sse_events(...)`, `availability(tenant_schema, ...) -> (bool, reason)` with the same reason strings (`ok|disabled|budget|quota`), `HelpBotError`. `apps/tenant_config/views.py` and `apps/core` help endpoints keep working untouched.

- [ ] **Step 1: Update the module**

In `backend/apps/tenant_config/help_bot.py`:

1. Replace `from .logo_ai import _estimate_cost` with `from apps.core import ai as core_ai`.
2. Delete `CLI_TIMEOUT_SECONDS = 120` (line 35) — it lives in `core.ai` now. Keep `MAX_OUTPUT_TOKENS` (this feature's output budget) and `MAX_HISTORY_MESSAGES`/`MAX_MESSAGE_CHARS` (history validation stays here).
3. Replace `stream_answer`, `_stream_anthropic`, `_cli_prompt`, `_stream_cli` (lines 179-278) with:

```python
def stream_answer(history, audience="coach"):
    """Yield ("delta", text) events, then exactly one ("done", info).
    Raises HelpBotError on provider failure."""
    try:
        yield from core_ai.stream_text(
            system=system_prompt(audience),
            history=history,
            model=settings.HELP_BOT_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        raise HelpBotError(str(exc)) from exc
```

4. In `availability` (lines 344-367), replace the provider checks:

```python
    if not KB_PATH.exists():
        return False, "disabled"
    if not core_ai.available()[0]:
        return False, "disabled"
```

(delete the `import shutil` line and the `HELP_BOT_PROVIDER`/`ANTHROPIC_API_KEY` branches it replaced).
5. Update the module docstring's two-provider paragraph (lines 10-15) to point at `apps.core.ai`, same wording pattern as Task 5 step 7.
6. `sse_events` logs `settings.HELP_BOT_PROVIDER` in its exception handler — change that to `settings.AI_PROVIDER`.

- [ ] **Step 2: Remove the dead settings**

In `backend/config/settings/base.py`, delete:

```python
HELP_BOT_PROVIDER = os.environ.get("HELP_BOT_PROVIDER", "anthropic")
HELP_BOT_CLI_MODEL = os.environ.get("HELP_BOT_CLI_MODEL", "sonnet")
HELP_BOT_CLI_BIN = os.environ.get("HELP_BOT_CLI_BIN", "claude")
```

(keep `HELP_BOT_MODEL` and all `HELP_BOT_*_USD`/`*_QUESTIONS` caps) and trim the block comment to:

```python
# --- Ask Contentor help bot (apps.tenant_config.help_bot; provider from AI_PROVIDER) ---
```

- [ ] **Step 3: Retarget the help bot tests**

In `backend/apps/tenant_config/tests/test_help_bot.py` and `backend/apps/core/tests/test_help_public.py`: `settings.HELP_BOT_PROVIDER` overrides → `settings.AI_PROVIDER`; `HELP_BOT_CLI_BIN`/`HELP_BOT_CLI_MODEL` overrides → `AI_CLI_BIN`/`AI_CLI_MODEL`. The existing `subprocess.Popen`/`shutil.which` monkeypatches keep working (module-level patches; `core.ai` calls the same names). Tests that assert `_cli_prompt`'s "Coach:" speaker label update to "User:" (the shared layer is feature-agnostic). Tests importing deleted private functions retarget `core_ai` equivalents or assert through `stream_answer`. `availability` tests that relied on `AI_PROVIDER=cli` + missing binary keep the same `"disabled"` expectation; add one assertion that an empty `CLAUDE_CODE_OAUTH_TOKEN` (with binary present) also yields `"disabled"`:

```python
def test_availability_disabled_when_cli_token_missing(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    enabled, reason = help_bot.availability("tenant_x")
    assert (enabled, reason) == (False, "disabled")
```

- [ ] **Step 4: Run the affected suites**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_help_bot.py apps/core/tests/test_help_public.py apps/core/tests/test_ai.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/help_bot.py backend/config/settings/base.py backend/apps/tenant_config/tests/test_help_bot.py backend/apps/core/tests/test_help_public.py
git commit -m "refactor(help-bot): route streaming through core.ai; drop HELP_BOT provider vars"
```

---

### Task 7: Migrate `apps/tenant_config/logo_ai.py` (Brand Pack gains the CLI provider)

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py`
- Modify: `backend/apps/tenant_config/views.py:230,258` (availability checks)
- Modify: `backend/apps/tenant_config/tests/test_logo_ai.py`

**Interfaces:**
- Consumes: `core.ai.structured(...)`, `core.ai.available()`, `core.ai.AiError`, `core.ai.estimate_cost` (Tasks 2-3).
- Produces: `logo_ai` public surface unchanged — `generate_brand_pack(brand_name, niche, primary_hex, style_chips=(), vibe="") -> BrandPackResult`, `BrandPackError(message, cost_usd=0.0)`; view responses (`_brand_pack_status`, `logo_brand_pack`) keep their exact shapes.

- [ ] **Step 1: Update the module**

In `backend/apps/tenant_config/logo_ai.py`:

1. Add `from apps.core import ai as core_ai` to the imports.
2. Delete `_MODEL_PRICES`, `_DEFAULT_PRICES`, `_estimate_cost`, and `_anthropic_client` (lines 156-182) — Tasks 5-6 already removed the external imports of `_estimate_cost`, so nothing references them anymore. (Verify: `grep -rn "_estimate_cost\|_anthropic_client" backend/apps | grep -v core/ai` must return only this file's definitions before deleting.)
3. In `generate_brand_pack` (lines 228-264), replace the client call block:

```python
def generate_brand_pack(brand_name, niche, primary_hex, style_chips=(), vibe=""):
    """One structured AI call -> a validated Brand Pack. Raises BrandPackError
    (carrying the estimated cost) on provider failure or if the response
    parses but nothing usable survives validation."""
    chips = ", ".join(style_chips) if style_chips else "no strong preference"
    user_content = (
        f'Brand name: "{brand_name}"\n'
        f'Niche: "{niche or "general coaching"}"\n'
        f"Style preferences: {chips}\n"
        f'Their vibe, in their own words: "{vibe or "-"}"\n'
        f"Brand's existing theme color: {primary_hex}\n"
    )
    try:
        parsed, cost, _ = core_ai.structured(
            system=STATIC_PROMPT,
            user=user_content,
            output_model=_BrandPack,
            model=settings.LOGO_AI_MODEL,
            max_tokens=6000,
        )
    except core_ai.AiError as exc:
        raise BrandPackError(str(exc), cost_usd=exc.cost_usd) from exc
```

The validation tail (`marks = [...]` through `return BrandPackResult(pack, cost)`) is unchanged.

Behavior note (this preserves the view's accounting exactly): previously SDK/network exceptions propagated unwrapped and `logo_brand_pack`'s `except Exception` recorded `$0`; now they arrive as `BrandPackError` with `cost_usd=0` and the `except BrandPackError` branch records that same `$0`.

- [ ] **Step 2: Update the two view checks**

In `backend/apps/tenant_config/views.py`, add `from apps.core import ai as core_ai` to the imports, then:

Line 230 (`_brand_pack_status`):
```python
    enabled = core_ai.available()[0] and budget_ok
```

Line 258 (`logo_brand_pack`):
```python
    if not core_ai.available()[0]:
        return Response({"pack": None, "source": "disabled", "remaining": 0})
```

- [ ] **Step 3: Update + extend the logo tests**

In `backend/apps/tenant_config/tests/test_logo_ai.py`:

- Tests that patch `logo_ai._anthropic_client` retarget `core_ai._anthropic_client` (`monkeypatch.setattr("apps.core.ai._anthropic_client", lambda: fake_client)`) with `settings.AI_PROVIDER = "anthropic"` and a fake `ANTHROPIC_API_KEY`.
- Tests importing `logo_ai._estimate_cost` switch to `core_ai.estimate_cost`.
- Status-endpoint tests that set `settings.ANTHROPIC_API_KEY = ""` to get `"disabled"` keep working (anthropic provider default) — leave them.
- ADD the feature win — brand pack over the CLI provider:

```python
def test_generate_brand_pack_via_cli_provider(settings, monkeypatch):
    settings.AI_PROVIDER = "cli"
    settings.AI_CLI_BIN = "claude"
    settings.AI_CLI_MODEL = "haiku"
    pack_json = json.dumps(
        {
            "marks": [
                {"rationale": "A ring.", "paths": [{"d": "M50 8 A42 42 0 1 1 49.9 8 Z", "fill": "mark"}]}
            ],
            "palettes": [
                {"name": "Deep", "primary": "#1a56db", "secondary": "#93c5fd", "accent": "#f59e0b", "ink": "#111827"}
            ],
            "tagline": "",
            "font_vibe": "Modern",
        }
    )
    completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=json.dumps({"result": pack_json}), stderr="")
    monkeypatch.setattr("subprocess.run", lambda cmd, **kw: completed)
    result = logo_ai.generate_brand_pack("Acme Coaching", "yoga", "#1a56db")
    assert result.cost_usd == Decimal("0")
    assert len(result.pack["marks"]) == 1
    assert result.pack["palettes"][0]["primary"] == "#1a56db"
```

- [ ] **Step 4: Run the affected suites**

Run: `docker compose exec django pytest apps/tenant_config/tests/ apps/core/tests/test_ai.py -v`
Expected: all PASS.

- [ ] **Step 5: Full backend suite (first all-features-migrated checkpoint)**

Run: `make test`
Expected: entire suite green (was 919+ tests as of 2026-07-09).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/views.py backend/apps/tenant_config/tests/test_logo_ai.py
git commit -m "feat(logo): brand pack gains the cli dev provider via core.ai; single price table"
```

---

### Task 8: `ai_check` management command + `make ai-check`

**Files:**
- Create: `backend/apps/core/management/commands/ai_check.py`
- Modify: `Makefile` (add `ai-check` target + `.PHONY`)
- Test: `backend/apps/core/tests/test_ai_check.py` (create)

**Interfaces:**
- Consumes: `core.ai.available()`, `core.ai.structured(...)`, `core.ai.AiError` (Tasks 2-3).
- Produces: `python manage.py ai_check` — exit 0 only when preflight AND one tiny end-to-end call succeed; `make ai-check` wraps it.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_ai_check.py`:

```python
"""`manage.py ai_check` — provider preflight + one tiny end-to-end call."""

from decimal import Decimal

import pytest
from django.core.management import call_command
from pydantic import BaseModel


def test_ai_check_fails_fast_on_missing_token(settings, monkeypatch, capsys):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
    with pytest.raises(SystemExit) as excinfo:
        call_command("ai_check")
    assert excinfo.value.code == 1
    err = capsys.readouterr().err
    assert "cli_no_token" in err
    assert "claude setup-token" in err  # the fix-it message


def test_ai_check_succeeds_end_to_end(settings, monkeypatch, capsys):
    settings.AI_PROVIDER = "cli"
    monkeypatch.setattr("shutil.which", lambda name: "/usr/local/bin/claude")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oat-token")

    def fake_structured(*, system, user, output_model, model, max_tokens):
        return output_model(ok=True), Decimal("0"), "haiku"

    monkeypatch.setattr("apps.core.ai.structured", fake_structured)
    call_command("ai_check")
    out = capsys.readouterr().out
    assert "preflight: ok" in out
    assert "end-to-end: ok" in out


def test_ai_check_reports_failed_call(settings, monkeypatch, capsys):
    from apps.core import ai

    settings.AI_PROVIDER = "anthropic"
    settings.ANTHROPIC_API_KEY = "sk-ant-x"

    def fake_structured(**kwargs):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr("apps.core.ai.structured", fake_structured)
    with pytest.raises(SystemExit) as excinfo:
        call_command("ai_check")
    assert excinfo.value.code == 1
    assert "model unavailable" in capsys.readouterr().err
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai_check.py -v`
Expected: FAIL — `CommandError: Unknown command: 'ai_check'`.

- [ ] **Step 3: Implement the command**

Create `backend/apps/core/management/commands/ai_check.py`:

```python
"""One-command answer to "is my AI provider working?" — prints the active
provider, runs the core.ai preflight with a fix-it message on failure, then
fires ONE tiny end-to-end structured call (~10 output tokens). With
AI_PROVIDER=anthropic that call bills a fraction of a cent and says so."""

from django.conf import settings
from django.core.management.base import BaseCommand
from pydantic import BaseModel

from apps.core import ai


class _Ping(BaseModel):
    ok: bool


_FIXES = {
    "cli_no_binary": (
        "claude CLI not found in this container — the dev compose must build "
        "the django image with INSTALL_CLAUDE_CLI=1 (rebuild with `make dev`)."
    ),
    "cli_no_token": (
        "CLAUDE_CODE_OAUTH_TOKEN is empty — run `claude setup-token` on the "
        "host, paste the token into .env, then restart django + celery-worker."
    ),
    "no_api_key": "ANTHROPIC_API_KEY is empty — set it in the environment.",
}


class Command(BaseCommand):
    help = "Verify the AI provider end-to-end (fires ONE tiny model call)."

    def handle(self, *args, **options):
        provider = settings.AI_PROVIDER
        self.stdout.write(f"AI_PROVIDER={provider}")
        if provider == "cli":
            self.stdout.write(f"AI_CLI_BIN={settings.AI_CLI_BIN}  AI_CLI_MODEL={settings.AI_CLI_MODEL}")
        ok, reason = ai.available()
        if not ok:
            self.stderr.write(self.style.ERROR(f"preflight failed: {reason}"))
            self.stderr.write(_FIXES.get(reason, ""))
            raise SystemExit(1)
        self.stdout.write("preflight: ok")
        if provider == "anthropic":
            self.stdout.write("firing one ~10-token call against the BILLED API key...")
        try:
            parsed, cost, model = ai.structured(
                system="You are a health check. Follow the instruction exactly.",
                user='Return {"ok": true}',
                output_model=_Ping,
                model=settings.HELP_BOT_MODEL,
                max_tokens=32,
            )
        except ai.AiError as exc:
            self.stderr.write(self.style.ERROR(f"end-to-end call failed: {exc}"))
            raise SystemExit(1) from exc
        self.stdout.write(self.style.SUCCESS(f"end-to-end: ok (model={model}, ok={parsed.ok}, cost=${cost})"))
```

- [ ] **Step 4: Add the Makefile target**

In `Makefile`: append `ai-check` to the `.PHONY` line (line 1), and add next to `health-check`:

```make
ai-check: ## Verify the AI provider (cli subscription / anthropic key) end-to-end
	docker compose exec django python manage.py ai_check
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai_check.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/management/commands/ai_check.py backend/apps/core/tests/test_ai_check.py Makefile
git commit -m "feat(ai): ai_check management command + make ai-check"
```

---

### Task 9: Env files, lint, full verification

**Files:**
- Modify: `.env` (local, gitignored — not committed)
- Modify: `.env.prod.example`

**Interfaces:**
- Consumes: everything above.
- Produces: a running dev stack on `AI_PROVIDER=cli`, all three features verified live.

- [ ] **Step 1: Update the dev `.env`**

Replace the lines `HELP_BOT_PROVIDER=cli` and `BLOG_AI_PROVIDER=cli` (lines ~87 and ~91) with a single `AI_PROVIDER=cli`. Keep `CLAUDE_CODE_OAUTH_TOKEN=<token>` as-is (it was filled 2026-07-09). Remove any `HELP_BOT_CLI_*`/`BLOG_AI_CLI_*` lines if present.

- [ ] **Step 2: Document the new vars in `.env.prod.example`**

Add to `.env.prod.example` (values commented — prod uses the defaults):

```bash
# --- AI provider ---
# anthropic (default; bills ANTHROPIC_API_KEY) | cli (LOCAL DEV ONLY — prod refuses it)
# AI_PROVIDER=anthropic
# AI_CLI_BIN=claude
# AI_CLI_MODEL=haiku
ANTHROPIC_API_KEY=sk-ant-...
```

(If `ANTHROPIC_API_KEY` already appears in the file, only add the commented block above it.)

- [ ] **Step 3: Confirm the compose env plumbing**

Run: `grep -n "CLAUDE_CODE_OAUTH_TOKEN\|AI_PROVIDER\|env_file" docker-compose.yml`
Expected: the django and celery-worker services receive the `.env` values (via `env_file` or explicit `environment` entries). If `CLAUDE_CODE_OAUTH_TOKEN`/`AI_PROVIDER` are listed explicitly per-service, keep that pattern: replace the `HELP_BOT_PROVIDER`/`BLOG_AI_PROVIDER` entries with `AI_PROVIDER` on BOTH services and commit the compose change with a matching message.

- [ ] **Step 4: Restart + lint + full suite**

```bash
docker compose restart django celery-worker
make lint
make test
```
Expected: lint zero issues; full backend suite green.

- [ ] **Step 5: Live verification (the point of the whole feature)**

```bash
make ai-check
```
Expected: `AI_PROVIDER=cli`, `preflight: ok`, `end-to-end: ok (model=haiku, ok=True, cost=$0)`.

Then in the browser against the dev stack (use the `verify` skill / flowmap consult for routes):
1. Coach admin → help bot: ask a question, confirm a streamed answer.
2. Coach admin → blog: generate a post from a topic, confirm a draft appears.
3. Coach admin → Logo Studio → Brand Pack: generate, confirm marks + palettes render (first-ever CLI brand pack).

Confirm `docker compose logs django --since 5m` shows no AI errors, and the usage rows recorded `$0` (`make shell` → `HelpBotUsage.objects.all()`, `BlogAiUsage.objects.all()`, `LogoAiUsage.objects.all()`).

- [ ] **Step 6: Commit**

```bash
git add .env.prod.example  # plus docker-compose.yml if Step 3 changed it
git commit -m "docs(env): document AI_PROVIDER vars; dev .env switched locally"
```

---

## Post-plan

- Merge per `superpowers:finishing-a-development-branch` (user decides merge/PR).
- Prod deploy needs no env change (`AI_PROVIDER` defaults to `anthropic`); the prod guard makes a mistaken `cli` setting fail loudly at boot.
- Convention for future AI features: call `core.ai.stream_text`/`core.ai.structured` — never the SDK or the CLI directly. The spec is the reference: `docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md`.
