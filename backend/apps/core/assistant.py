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


RATE_SALT = "ai-rate"


def rate_token(transcript_id):
    """Signed capability to rate one transcript — handed out in the done
    event, verified by the public rate endpoint."""
    from django.core import signing

    return signing.dumps(transcript_id, salt=RATE_SALT)


def log_transcript(
    *,
    feature,
    audience,
    tenant_schema,
    session_id,
    question,
    answer,
    cost_usd,
    provider,
    model,
    prompt_version,
    kb_hash="",
    is_preview=False,
):
    """Best-effort audit write. Returns the row or None — never raises (the
    user already has their answer; auditing must not break the stream)."""
    from apps.core.models import AiTranscript

    try:
        return AiTranscript.objects.create(
            feature=feature,
            audience=audience,
            tenant_schema=tenant_schema,
            session_id=(session_id or "")[:36],
            question=question[:8000],
            answer=answer,
            cost_usd=cost_usd,
            provider=provider,
            model=model,
            prompt_version=prompt_version,
            kb_hash=kb_hash,
            is_preview=is_preview,
        )
    except Exception:
        logger.exception("assistant: transcript write failed")
        return None


# ── Conversations (v2 spec §5) ───────────────────────────────────────────────


def get_or_create_conversation(*, feature, audience, tenant_schema, session_id, user=None):
    """Resolve the session's conversation, creating it on first contact.
    Blank session_id → None (no thread; v1 behavior). Stamps user identity
    once for authenticated viewers. Best-effort: never raises."""
    from apps.core.models import AiConversation

    try:
        sid = (session_id or "").strip()[:36]
        if not sid:
            return None
        convo, _ = AiConversation.objects.get_or_create(
            session_id=sid,
            feature=feature,
            tenant_schema=tenant_schema,
            defaults={"audience": audience},
        )
        if user is not None and getattr(user, "is_authenticated", False) and convo.user_id is None:
            # D8: first name only (accounts.User has a single `name` field)
            label = ((getattr(user, "name", "") or "").split(" ")[0]) or user.email.split("@")[0]
            convo.user_id = user.id
            convo.user_label = label[:60]
            convo.save(update_fields=["user_id", "user_label", "updated_at"])
        return convo
    except Exception:
        logger.exception("assistant: conversation resolve failed")
        return None


def append_message(conversation, role, content, transcript_id=None):
    """Best-effort thread write; bumps the conversation's activity stamps."""
    from django.utils import timezone

    from apps.core.models import AiMessage

    if conversation is None:
        return None
    try:
        msg = AiMessage.objects.create(
            conversation=conversation,
            role=role,
            content=(content or "")[:8000],
            transcript_id=transcript_id,
        )
        fields = ["updated_at"]
        if role == "user":
            conversation.last_user_message_at = msg.created_at
            fields.append("last_user_message_at")
        elif role == "agent":
            conversation.last_agent_message_at = msg.created_at
            fields.append("last_agent_message_at")
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=fields)
        return msg
    except Exception:
        logger.exception("assistant: message write failed")
        return None


def maybe_auto_release(conversation):
    """Human mode lapses back to AI after ASSISTANT_HUMAN_IDLE_RELEASE_MIN
    minutes without an agent message (lazy — called from chat/thread views;
    no celery job)."""
    from datetime import timedelta

    from django.conf import settings
    from django.utils import timezone

    from apps.core.models import AiConversation

    if conversation is None or conversation.status != AiConversation.STATUS_HUMAN:
        return conversation
    anchor = conversation.last_agent_message_at or conversation.taken_over_at
    idle = timedelta(minutes=settings.ASSISTANT_HUMAN_IDLE_RELEASE_MIN)
    if anchor is None or timezone.now() - anchor > idle:
        conversation.status = AiConversation.STATUS_AI
        conversation.save(update_fields=["status", "updated_at"])
        append_message(conversation, "system", "assistant_resumed")
    return conversation


THREAD_PAGE = 200


def thread_payload(conversation, after_id=0):
    msgs = conversation.messages.filter(id__gt=after_id).order_by("id")[:THREAD_PAGE]
    return {
        "session_id": conversation.session_id,
        "status": conversation.status,
        "agent_label": conversation.agent_label,
        "human_requested": conversation.human_requested,
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs
        ],
    }
