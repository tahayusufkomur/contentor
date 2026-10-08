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
- "agentc": the Agent Container hub (settings.AGENTC_HUB), which runs the
  Gemini CLI headless on subscription accounts. Cost is Decimal("0") like
  "cli". The hub's agent HAS tools and our prompts carry untrusted coach
  text, so any run whose event log shows a tool call is discarded
  (_agentc_run). No vision, no token streaming.
- "gemini": the Gemini API directly on settings.GEMINI_API_KEY — no queue,
  no CLI start-up, schema-constrained JSON. Billed per token, so its cost
  is real and accrues against the budget kill-switches. No vision, no token
  streaming.

Prompt-caching contract: the ``system`` argument must be byte-frozen per
feature (persona / knowledge base / static prompt only). Tenant state
travels in the user turn — never interpolate it into ``system`` (it would
fragment the Anthropic cache per tenant).
"""

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from decimal import Decimal

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# The logo Brand Pack (the longest structured call) measures ~106s on haiku
# in the dev container, so 120 was a coin-flip. A single attempt must stay
# under gunicorn's --timeout (300 dev) so provider failures degrade
# gracefully instead of killing the worker.
CLI_TIMEOUT_SECONDS = 240

# $ per 1M tokens: (input, output, cache_read, cache_write). Cache-write here
# assumes the 5-minute TTL (1.25x input), not the 1-hour tier.
_MODEL_PRICES = {
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-sonnet-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00, "cache_read": 0.10, "cache_write": 1.25},
}
_DEFAULT_PRICES = _MODEL_PRICES["claude-sonnet-5-5"]


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
    Reasons: ok | no_api_key | cli_no_binary | cli_no_token | agentc_unreachable
    | no_gemini_key."""
    if settings.AI_PROVIDER == "gemini":
        return (True, "ok") if settings.GEMINI_API_KEY else (False, "no_gemini_key")
    if settings.AI_PROVIDER == "agentc":
        try:
            ok = requests.get(_agentc_url("/health"), timeout=2).json().get("ok") is True
        except Exception:  # any probe failure means the hub is not usable
            ok = False
        return (True, "ok") if ok else (False, "agentc_unreachable")
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


# The CLI's --model flag takes only these short aliases, not the full
# "claude-sonnet-5"-style IDs the anthropic path bills against. Map each
# feature's configured model onto the alias sharing its family name; a
# family with no CLI alias yet (e.g. a newer model) falls back to
# AI_CLI_MODEL so the dev provider keeps working instead of passing an
# unrecognized value straight through to the CLI.
_CLI_MODEL_ALIASES = ("opus", "sonnet", "haiku")


def _cli_model_alias(model):
    lowered = (model or "").lower()
    for alias in _CLI_MODEL_ALIASES:
        if alias in lowered:
            return alias
    return settings.AI_CLI_MODEL


# Prompt-only JSON contract for providers without parse-forced output (cli,
# agentc).
def _schema_note(output_model):
    return "\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON schema:\n" + json.dumps(
        output_model.model_json_schema()
    )


# The system-prompt note alone is not enough: chatty inputs (a greeting to
# the copilot) reliably pull the model into prose, and the identical retry
# fails the same way (observed 2026-08-06, 2/2 prose without this line,
# 2/2 valid JSON with it). The user-turn reminder is the last thing the
# model reads, so it survives long system prompts.
_JSON_USER_NOTE = "\n\n(Reply with ONLY the JSON object matching the schema — no prose.)"


def _strip_fences(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`\n")
        if text.startswith("json"):
            text = text[4:].lstrip()
    return text


# ── structured output (blog drafts/topics, brand pack) ──────────────────────


def structured(*, system, user, output_model, model, max_tokens, label=None, timeout_seconds=None, effort=None):
    """One structured-output call -> (validated ``output_model`` instance,
    cost_usd, effective_model). Raises AiError on provider or schema
    failure. ``label`` tags the run on the agentc hub; other providers
    ignore it. ``timeout_seconds`` caps an interactive caller's wait (the
    whole call, retries included) below the provider default. ``effort``
    (low | medium | high | xhigh | max) sets how much the model thinks on
    the anthropic and cli providers; None keeps the model default (high on
    Sonnet 5.5). Thinking counts toward ``max_tokens``, so size it for both.
    Haiku 4.5 rejects effort: pass None for haiku models."""
    if settings.AI_PROVIDER == "gemini":
        return _gemini_structured(system, user, output_model, timeout_seconds)
    if settings.AI_PROVIDER == "agentc":
        return _agentc_structured(system, user, output_model, label, timeout_seconds)
    if settings.AI_PROVIDER == "cli":
        return _cli_structured(system, user, output_model, model, effort)
    return _anthropic_structured(system, user, output_model, model, max_tokens, timeout_seconds, effort)


def _anthropic_structured(system, user, output_model, model, max_tokens, timeout_seconds=None, effort=None):
    client = _anthropic_client()
    if timeout_seconds is not None:
        client = client.with_options(timeout=float(timeout_seconds), max_retries=0)
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_format=output_model,
            **({"output_config": {"effort": effort}} if effort else {}),
        )
    except Exception as exc:
        # No usage data on a failed call — nothing billable to estimate.
        raise AiError(f"anthropic call failed: {exc}") from exc
    cost = estimate_cost(response.usage, model)
    if response.parsed_output is None:
        # A refusal (or a reply cut off at max_tokens) is billed but carries
        # no object; callers fall back exactly as on a failed call.
        raise AiError(f"anthropic returned no parsed output (stop_reason={response.stop_reason})", cost_usd=cost)
    return response.parsed_output, cost, model


def _cli_structured(system, user, output_model, model, effort=None):
    """Local-dev provider: blocking `claude -p` on the developer's
    subscription. The CLI has no parse-forced structured output, so the
    schema contract is appended to the system prompt and the result is
    validated with the SAME pydantic model as the anthropic path. Because
    nothing forces valid JSON, occasional invalid output is expected — one
    retry absorbs it (observed in the field 2026-07-09)."""
    from pydantic import ValidationError

    cmd = [
        settings.AI_CLI_BIN,
        "-p",
        user + _JSON_USER_NOTE,
        "--model",
        _cli_model_alias(model),
        "--system-prompt",
        system + _schema_note(output_model),
        "--disallowedTools",
        "*",
        "--max-turns",
        "1",
        "--output-format",
        "json",
        *(["--effort", effort] if effort else []),
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
            text = _strip_fences(envelope.get("result") or "")
            # Subscription usage — nothing accrues against the USD caps.
            # Return the requested model (not the CLI alias) so the audit
            # trail matches the anthropic path's shape.
            return output_model.model_validate_json(text), Decimal("0"), model
        except (ValueError, ValidationError) as exc:
            last_error = exc
    raise AiError(f"claude CLI output did not match schema: {last_error}") from last_error


# ── agentc provider (Agent Container hub) ───────────────────────────────────
# The hub runs `agy -p <prompt> --dangerously-skip-permissions`: the agent has
# file and shell tools and there is no flag to take them away. The prompt
# forbids tools; the event-log check in _agentc_run enforces it.

AGENTC_POLL_SECONDS = 1.5
# Per HTTP call; the run as a whole is bounded by AGENTC_TIMEOUT_SECONDS.
_AGENTC_HTTP_TIMEOUT = 10
_AGENTC_TERMINAL = frozenset({"succeeded", "failed", "timed_out", "cancelled", "rejected"})
_AGENTC_RULES = (
    "\n\nHard rules: Do not use any tools. Do not read, write or list files. Do not run commands. "
    "Reply with ONLY {reply}.\n\n"
)


def _agentc_url(path):
    return settings.AGENTC_HUB.rstrip("/") + path


# Runs nobody is waiting on (whole-site composition) queue behind a coach's
# interactive requests on the shared 3-slot hub.
_AGENTC_BACKGROUND_LABELS = ("contentor:compose",)


def _agentc_run(prompt, label, deadline=None):
    """Run one prompt on the hub -> its resultText. Raises AiError on any
    failure, including a run whose event log shows a tool call (fail closed:
    an unreadable event log counts as a failure too). ``deadline`` is a
    time.monotonic() instant; default: AGENTC_TIMEOUT_SECONDS from now."""
    label = label or "contentor"
    if deadline is None:
        deadline = time.monotonic() + settings.AGENTC_TIMEOUT_SECONDS
    budget = max(int(deadline - time.monotonic()), 0)
    body = {
        "prompt": prompt,
        "cwd": settings.AGENTC_CWD,
        "model": settings.AGENTC_MODEL,
        "timeoutSec": budget,
        "worktree": False,
        "requireSyncFresh": False,
        "priority": "background" if label.startswith(_AGENTC_BACKGROUND_LABELS) else "interactive",
        "label": label,
    }
    try:
        resp = requests.post(_agentc_url("/vendors/gemini/runs"), json=body, timeout=_AGENTC_HTTP_TIMEOUT)
        if not resp.ok:
            raise AiError(f"agentc run create failed ({resp.status_code}): {resp.text[:500]}")
        run = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise AiError(f"agentc run create failed: {exc}") from exc
    run_id = run.get("id")
    try:
        while run.get("state") not in _AGENTC_TERMINAL:
            if time.monotonic() >= deadline:
                raise AiError(f"agentc run {run_id} exceeded its {budget}s budget")
            time.sleep(AGENTC_POLL_SECONDS)
            resp = requests.get(_agentc_url(f"/runs/{run_id}"), timeout=_AGENTC_HTTP_TIMEOUT)
            resp.raise_for_status()
            run = resp.json()
    except (AiError, requests.RequestException, ValueError) as exc:
        _agentc_cancel(run_id)
        if isinstance(exc, AiError):
            raise
        raise AiError(f"agentc run {run_id} poll failed: {exc}") from exc
    if run["state"] != "succeeded":
        raise AiError(f"agentc run {run_id} {run['state']}: {str(run.get('error') or '')[:500]}")
    if _agentc_used_tool(run_id):
        logger.warning("agentc run %s (label=%s) used a tool; output discarded", run_id, label)
        raise AiError("agent used a tool")
    return run.get("resultText") or ""


def _agentc_cancel(run_id):
    try:
        requests.post(_agentc_url(f"/runs/{run_id}/cancel"), timeout=_AGENTC_HTTP_TIMEOUT)
    except requests.RequestException:
        logger.warning("agentc cancel of run %s failed", run_id)


def _agentc_used_tool(run_id):
    """Scan the run's event log (NDJSON; the hub closes the stream once the
    run is terminal) for a ``tool`` event. Raises AiError if unreadable."""
    try:
        with requests.get(
            _agentc_url(f"/runs/{run_id}/events"), params={"since": 0}, timeout=_AGENTC_HTTP_TIMEOUT, stream=True
        ) as resp:
            resp.raise_for_status()
            return any(json.loads(line).get("type") == "tool" for line in resp.iter_lines() if line.strip())
    except (requests.RequestException, ValueError, AttributeError) as exc:
        raise AiError(f"agentc run {run_id} events unreadable: {exc}") from exc


def _agentc_structured(system, user, output_model, label, timeout_seconds=None):
    """One retry (a fresh run) absorbs invalid JSON, like the cli path. A
    tool-use AiError is not retried. Both attempts share one deadline."""
    from pydantic import ValidationError

    prompt = (
        system + _schema_note(output_model) + _AGENTC_RULES.format(reply="the JSON object") + user + _JSON_USER_NOTE
    )
    seconds = settings.AGENTC_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    deadline = time.monotonic() + seconds
    last_error = None
    for _attempt in range(2):
        text = _strip_fences(_agentc_run(prompt, label, deadline))
        try:
            return output_model.model_validate_json(text), Decimal("0"), settings.AGENTC_MODEL
        except (ValueError, ValidationError) as exc:
            last_error = exc
    raise AiError(f"agentc output did not match schema: {last_error}") from last_error


# ── gemini provider (Gemini API on an API key) ──────────────────────────────

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# $ per 1M tokens for gemini-3.8-flash at its 2027 list price (2026's is
# half): a kill-switch may over-count, never under-count. Thinking tokens
# bill as output. Re-check https://ai.google.dev/pricing when changing
# GEMINI_MODEL.
_GEMINI_PRICES = {"input": 1.50, "output": 7.50, "cache_read": 0.15}


def _gemini_cost(usage):
    usage = usage or {}

    def per_m(tokens, price):
        return (Decimal(tokens or 0) / Decimal(1_000_000)) * Decimal(str(price))

    cached = usage.get("cachedContentTokenCount") or 0
    output = (usage.get("candidatesTokenCount") or 0) + (usage.get("thoughtsTokenCount") or 0)
    return (
        per_m((usage.get("promptTokenCount") or 0) - cached, _GEMINI_PRICES["input"])
        + per_m(cached, _GEMINI_PRICES["cache_read"])
        + per_m(output, _GEMINI_PRICES["output"])
    )


def _gemini_call(system, contents, deadline, schema=None):
    """One generateContent call -> (text, cost_usd). Raises AiError."""
    config = {}
    if settings.GEMINI_THINKING_LEVEL:
        config["thinkingConfig"] = {"thinkingLevel": settings.GEMINI_THINKING_LEVEL}
    if schema is not None:
        config["responseMimeType"] = "application/json"
        config["responseJsonSchema"] = schema
    timeout = max(deadline - time.monotonic(), 1)
    try:
        resp = requests.post(
            _GEMINI_URL.format(model=settings.GEMINI_MODEL),
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json={"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": config},
            timeout=timeout,
        )
        if not resp.ok:
            raise AiError(f"gemini call failed ({resp.status_code}): {resp.text[:500]}")
        payload = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise AiError(f"gemini call failed: {exc}") from exc
    cost = _gemini_cost(payload.get("usageMetadata"))
    candidate = (payload.get("candidates") or [{}])[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not text:
        reason = candidate.get("finishReason") or payload.get("promptFeedback")
        raise AiError(f"gemini returned no text ({reason})", cost_usd=cost)
    return text, cost


def _gemini_structured(system, user, output_model, timeout_seconds=None):
    """JSON constrained to the output model's schema, validated with the same
    pydantic model as the other providers. One retry, sharing the deadline,
    absorbs an overloaded or rate-limited moment as well as invalid output."""
    from pydantic import ValidationError

    seconds = settings.GEMINI_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    deadline = time.monotonic() + seconds
    contents = [{"role": "user", "parts": [{"text": user}]}]
    schema = output_model.model_json_schema()
    spent = Decimal("0")
    last_error = None
    for _attempt in range(2):
        if time.monotonic() >= deadline:
            break
        try:
            text, cost = _gemini_call(system, contents, deadline, schema)
        except AiError as exc:
            spent += exc.cost_usd
            last_error = exc
            continue
        spent += cost
        try:
            return output_model.model_validate_json(_strip_fences(text)), spent, settings.GEMINI_MODEL
        except (ValueError, ValidationError) as exc:
            last_error = exc
    raise AiError(f"gemini structured call failed: {last_error}", cost_usd=spent) from last_error


# ── streamed structured output (progress UI for the long calls) ─────────────
# structured() blocks for the whole generation — 45s+ for a blog draft — which
# reads as a hang. structured_stream() is the same call with the intermediate
# state exposed so the UI can show the artifact forming.
#
# With output_format= the model emits ONE text block containing JSON (not a
# tool_use block), so the SDK fires TextEvent — never InputJsonEvent — and the
# snapshot is the accumulated JSON *string*, not a parsed object. Partials are
# therefore repaired-and-parsed here (_partial_json). The final value never
# comes from that repair: it is the provider's own validated parse.

# Repairing + re-parsing a growing document on every delta is wasted work at
# 60fps, and the UI cannot use it that fast either.
PARTIAL_MIN_INTERVAL_SECONDS = 0.4

# A truncated object often ends mid-key (`…, "slug":`), which no amount of
# bracket-closing makes parseable — drop the dangling pair instead.
_DANGLING_KEY_RE = re.compile(r',?\s*"(?:[^"\\]|\\.)*"\s*:\s*$')


def _partial_json(text):
    """Best-effort parse of a truncated JSON object -> dict (``{}`` when the
    fragment is not yet parseable). Closes an open string, drops a dangling
    key or trailing comma, then closes open containers.

    Progress display only. The authoritative value is the provider's parse."""
    text = text.strip()
    if not text.startswith("{"):
        return {}
    stack = []
    in_string = False
    escaped = False
    for ch in text:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]" and stack:
            stack.pop()
    # A trailing backslash is the start of an escape whose payload has not
    # arrived — it would make the closing quote below escape itself.
    body = text[:-1] if escaped else text
    if in_string:
        body += '"'
    body = _DANGLING_KEY_RE.sub("", body.rstrip()).rstrip().rstrip(",")
    try:
        return json.loads(body + "".join(reversed(stack)))
    except ValueError:
        return {}


def structured_stream(*, system, user, output_model, model, max_tokens, label=None):
    """Streaming twin of structured(). Yields ("partial", dict) as the output
    forms, then exactly one ("done", (parsed, cost_usd, effective_model)).
    Raises AiError on provider or schema failure, like structured().

    The cli, agentc and gemini providers do not stream (blocking), so they
    yield no partials and go straight to ("done", …) — callers degrade to an
    indeterminate wait rather than breaking."""
    if settings.AI_PROVIDER == "gemini":
        yield ("done", _gemini_structured(system, user, output_model))
        return
    if settings.AI_PROVIDER == "agentc":
        yield ("done", _agentc_structured(system, user, output_model, label))
        return
    if settings.AI_PROVIDER == "cli":
        yield ("done", _cli_structured(system, user, output_model, model))
        return
    yield from _anthropic_structured_stream(system, user, output_model, model, max_tokens)


def _anthropic_structured_stream(system, user, output_model, model, max_tokens):
    client = _anthropic_client()
    last_emit = 0.0
    try:
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_format=output_model,
        ) as stream:
            for event in stream:
                if event.type != "text":
                    continue
                now = time.monotonic()
                if now - last_emit < PARTIAL_MIN_INTERVAL_SECONDS:
                    continue
                last_emit = now
                snapshot = _partial_json(event.snapshot)
                if snapshot:
                    yield ("partial", snapshot)
            final = stream.get_final_message()
    except Exception as exc:
        # Mid-stream failures carry no usage object, so nothing billable is
        # estimable here — same as the non-streaming path.
        raise AiError(f"anthropic stream failed: {exc}") from exc
    cost = estimate_cost(final.usage, model)
    parsed = next((b.parsed_output for b in final.content if getattr(b, "parsed_output", None) is not None), None)
    if parsed is None:
        raise AiError("anthropic stream returned no parsed output", cost_usd=cost)
    yield ("done", (parsed, cost, model))


def supports_vision():
    """Whether the active provider can take image inputs. The cli (claude -p),
    agentc and gemini providers have no image path here — callers skip the
    critique pass."""
    return settings.AI_PROVIDER == "anthropic"


def structured_messages(*, system, messages, output_model, model, max_tokens):
    """Structured output over a full messages array (content blocks may
    include base64 images) -> (validated instance, cost_usd, model).
    Anthropic provider only; raises AiError on the others."""
    if settings.AI_PROVIDER != "anthropic":
        raise AiError(f"{settings.AI_PROVIDER} provider does not support vision calls")
    client = _anthropic_client()
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=messages,
            output_format=output_model,
        )
    except Exception as exc:
        raise AiError(f"anthropic call failed: {exc}") from exc
    return response.parsed_output, estimate_cost(response.usage, model), model


# ── streaming chat (help bot) ────────────────────────────────────────────────


def stream_text(*, system, history, model, max_tokens, label=None):
    """Yield ("delta", text) events, then exactly one ("done", info) where
    info = {"cost_usd": Decimal, "provider": str, "model": str}. ``label``
    tags the run on the agentc hub; other providers ignore it."""
    if settings.AI_PROVIDER == "gemini":
        yield from _stream_gemini(system, history)
    elif settings.AI_PROVIDER == "agentc":
        yield from _stream_agentc(system, history, label)
    elif settings.AI_PROVIDER == "cli":
        yield from _stream_cli(system, history, model)
    else:
        yield from _stream_anthropic(system, history, model, max_tokens)


def _stream_agentc(system, history, label):
    """Not a real stream: the whole answer arrives as one delta."""
    prompt = system + _AGENTC_RULES.format(reply="your answer text") + _cli_prompt(history)
    yield ("delta", _agentc_run(prompt, label))
    yield ("done", {"cost_usd": Decimal("0"), "provider": "agentc", "model": settings.AGENTC_MODEL})


def _stream_gemini(system, history):
    """Not a real stream: the whole answer arrives as one delta."""
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in history
    ]
    text, cost = _gemini_call(system, contents, time.monotonic() + settings.GEMINI_TIMEOUT_SECONDS)
    yield ("delta", text)
    yield ("done", {"cost_usd": cost, "provider": "gemini", "model": settings.GEMINI_MODEL})


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


def _stream_cli(system, history, model):
    """Local-dev provider: `claude -p` on the developer's subscription.
    Flag set verified against claude CLI 2026-07: --system-prompt replaces
    the Claude Code persona entirely; stream-json + --include-partial-messages
    emits Messages-API-shaped stream_event lines."""
    cmd = [
        settings.AI_CLI_BIN,
        "-p",
        _cli_prompt(history),
        "--model",
        _cli_model_alias(model),
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
                # Report the requested model (not the CLI alias), matching
                # the anthropic path's shape.
                done = {"cost_usd": Decimal("0"), "provider": "cli", "model": model}
        proc.wait(timeout=CLI_TIMEOUT_SECONDS)
    finally:
        if proc.poll() is None:
            proc.kill()
    if done is None or proc.returncode != 0:
        stderr = (proc.stderr.read() or "")[:500] if proc.stderr else ""
        raise AiError(f"claude CLI failed (rc={proc.returncode}): {stderr}")
    yield ("done", done)
