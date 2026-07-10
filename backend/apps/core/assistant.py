"""Shared conversation kernel for the chat assistants (help bot coach/visitor,
student site assistant). Owns transcript-shaped plumbing only: history
validation, SSE framing, answer accumulation and the completion hook. Personas,
knowledge, gating and usage accounting stay in the feature modules."""

import json
import logging

from apps.core import ai as core_ai

logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 6
MAX_MESSAGE_CHARS = 2000


def prepare_history(messages, context_block, max_messages=MAX_HISTORY_MESSAGES, max_chars=MAX_MESSAGE_CHARS):
    """Validate + trim the client transcript and inject the context block into
    the first user turn. Returns Messages-API-shaped history ending in a user
    turn; raises ValueError on bad input."""
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages must be a non-empty list")
    clean = []
    for m in messages[-max_messages:]:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            raise ValueError("each message needs role user|assistant")
        content = str(m.get("content") or "").strip()[:max_chars]
        if not content:
            raise ValueError("empty message")
        clean.append({"role": m["role"], "content": content})
    while clean and clean[0]["role"] != "user":
        clean.pop(0)
    if not clean or clean[-1]["role"] != "user":
        raise ValueError("history must start and end with a user message")
    clean[0] = {"role": "user", "content": f"{context_block}\n\n{clean[0]['content']}"}
    return clean


def _event(payload):
    return f"data: {json.dumps(payload)}\n\n"


def run_chat(*, system, history, model, max_tokens, on_complete):
    """Yield SSE frames for one streamed answer. ``on_complete(info)`` runs
    once after a successful stream with info = {cost_usd, provider, model,
    answer}; whatever dict it returns is merged into the "done" event. Hook
    errors are logged, never surfaced — the coach/student already has their
    answer at that point."""
    parts = []
    done_info = None
    try:
        for kind, value in core_ai.stream_text(system=system, history=history, model=model, max_tokens=max_tokens):
            if kind == "delta":
                parts.append(value)
                yield _event({"type": "delta", "text": value})
            elif kind == "done":
                done_info = value
    except Exception:
        logger.exception("assistant: answer failed")
        yield _event({"type": "error", "message": "answer_failed"})
        return
    extras = None
    if on_complete is not None and done_info is not None:
        try:
            extras = on_complete({**done_info, "answer": "".join(parts)})
        except Exception:
            logger.exception("assistant: completion hook failed")
    yield _event({"type": "done", **(extras or {})})
