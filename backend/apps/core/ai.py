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

# The logo Brand Pack (the longest structured call) measures ~106s on haiku
# in the dev container, so 120 was a coin-flip. A single attempt must stay
# under gunicorn's --timeout (300 dev) so provider failures degrade
# gracefully instead of killing the worker.
CLI_TIMEOUT_SECONDS = 240

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


# ── structured output (blog drafts/topics, brand pack) ──────────────────────


def structured(*, system, user, output_model, model, max_tokens):
    """One structured-output call -> (validated ``output_model`` instance,
    cost_usd, effective_model). Raises AiError on provider or schema
    failure."""
    if settings.AI_PROVIDER == "cli":
        return _cli_structured(system, user, output_model, model)
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


def _cli_structured(system, user, output_model, model):
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
        _cli_model_alias(model),
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
            # Return the requested model (not the CLI alias) so the audit
            # trail matches the anthropic path's shape.
            return output_model.model_validate_json(text), Decimal("0"), model
        except (ValueError, ValidationError) as exc:
            last_error = exc
    raise AiError(f"claude CLI output did not match schema: {last_error}") from last_error


# ── streaming chat (help bot) ────────────────────────────────────────────────


def stream_text(*, system, history, model, max_tokens):
    """Yield ("delta", text) events, then exactly one ("done", info) where
    info = {"cost_usd": Decimal, "provider": str, "model": str}."""
    if settings.AI_PROVIDER == "cli":
        yield from _stream_cli(system, history, model)
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
