# AI Assistants v2 — Conversations, Takeover & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three v1 AI bots a production support channel: persistent session-grouped conversations, human takeover over DB polling (coach→student bot, superadmin→help bot), same-call follow-up suggestion chips, viewer-aware student context, a coach link registry, and abuse/cost hardening (real client-IP throttling, IP blocklist + auto-block, answer cache, session caps) — per `docs/superpowers/specs/2026-07-10-ai-assistants-v2-design.md`.

**Architecture:** Everything extends the v1 stack. Two new public-schema models (`AiConversation`, `AiMessage`) sit beside `AiTranscript`; the kernel `apps/core/assistant.py` gains conversation helpers, a suggestion tail-parser inside `run_chat`, and cache replay. Chat views resolve the conversation first and short-circuit to stored-message mode when a human has taken over (no model call). Widgets persist `session_id` in localStorage and poll thread endpoints (5s/3s). Hardening lives in `apps/core/net.py` + `apps/core/throttling.py` + `apps/core/ipblock.py`.

**Tech Stack:** Django 5.1 + DRF (function views, SSE via `StreamingHttpResponse`), django-tenants, django-redis cache, Celery beat, Next.js 14 App Router + next-intl, pytest, vitest (frontend-customer only), Playwright e2e.

## Global Constraints

- Repo rules (CLAUDE.md): pre-commit must pass with zero issues; public endpoints MUST set `@authentication_classes([])` (AllowAny alone is not enough); never create new `.md` files; verify with `make dev` running.
- Prompt-caching contract: `system` strings passed to `core_ai.stream_text` stay byte-stable; all volatile/viewer state travels in the first user turn.
- Test hermeticity: always mock `apps.core.ai.stream_text` / `core_ai.available` at the boundaries shown in existing tests; never invoke real providers.
- Usage accounting invariant: USD accrues on EVERY model attempt. Human-mode messages and cache hits never touch the model → no USD, no question count (cache hits still write an audit transcript with `provider="cache"`).
- Migrations: use the next free number at implementation time (core is at `0021_platformkbentry`, tenant_config at `0018_assistantconfig_assistantknowledgeentry` as of planning). After adding migrations run `make test-fresh` once, thereafter `make test`.
- Docker: `docker compose restart <svc>` does NOT reload `.env`; celery workers don't autoreload code — `docker compose restart celery-worker celery-beat` after task changes.
- Frontend: pre-commit does not lint the frontends — run `npx prettier --write` + `npx tsc --noEmit` in each touched frontend; `npm run build` at the verification task. frontend-main has NO vitest (build is its check).
- Coach-facing copy: non-technical (coach-non-technical-UX rule). All new user-facing strings in BOTH `messages/en/*.json` and `messages/tr/*.json`.
- Working tree is SHARED with other agents: before any checkout/commit verify `git status -sb`; never rewrite refs; STOP if the tree contains modified files another session owns.
- Commit after every task.

**Fixed vocabularies:**
- Conversation `status`: `ai | human`. Message `role`: `user | assistant | agent | system`.
- System-message content tokens (machine-readable, widgets translate): `agent_joined:{label}` · `assistant_resumed` · `human_requested`.
- `reason` values: v1's `ok | disabled | upgrade_required | budget | quota` plus new `session_limit`.
- New throttle scopes: `ai_thread: 30/min`, `ai_human_message: 20/min`, `ai_human_request: 2/hour`.
- localStorage session keys: student widget `contentor.ai.session.assistant`; coach help chat `contentor.ai.session.help` (tenant origin); marketing bubble `contentor.ai.session.help` (marketing origin — different origin, no clash).

---

### Task 1: Verify tree state, cut the feature branch

**Files:** none — git only.

**Interfaces:**
- Produces: branch `feat/ai-assistants-v2` cut from `main` (which contains the merged v1 at `524d307` or later) for all later tasks.

- [ ] **Step 1: Verify tree state (shared-tree guardrail)**

Run: `git -C ~/ws/projects-active/home-server/contentor status -sb && git log --oneline -3 main`
Expected: `main` log contains the v1 assistants merge (`524d307` or later). Known leftovers from another session may appear as modified `backend/apps/core/ai.py`, `docker-compose.yml`, `docker-compose.prod.yml`, `docs/PRODUCT.md` (Logo Studio timeout fixes). If those exact files are dirty, STOP and ask the owner to disposition them first (they belong to another branch); if any OTHER tracked file is dirty, STOP and report.

- [ ] **Step 2: Cut the branch from main**

```bash
git checkout main && git checkout -b feat/ai-assistants-v2
```

- [ ] **Step 3: Baseline suite**

Run: `make test`
Expected: full backend suite green (v1 count ≥ 945 passing, 0 failures). Record the passing count for later comparison.

---

### Task 2: Conversation models — `AiConversation` + `AiMessage` (+ purge extension)

**Files:**
- Modify: `backend/apps/core/models.py` (append after `PlatformKbEntry`, ~line 547)
- Modify: `backend/apps/core/tasks.py:134-148` (`purge_ai_transcripts`)
- Create: `backend/apps/core/migrations/00XX_aiconversation_aimessage.py` (generated)
- Create: `backend/apps/core/tests/test_ai_conversations.py`
- Modify: `backend/apps/core/tests/test_ai_rate_and_purge.py` (purge coverage)

**Interfaces:**
- Produces (used by Tasks 3–8, 13):
  - `AiConversation` — public-schema model; fields `feature` (char 20), `audience` (char 10), `tenant_schema` (char 63), `session_id` (char 36), `status` (char 8, `"ai"|"human"`, default `"ai"`, constants `STATUS_AI`/`STATUS_HUMAN`), `agent_user_id` (int null), `agent_label` (char 60 blank), `user_id` (int null), `user_label` (char 60 blank), `human_requested` (bool), `human_requested_at`/`taken_over_at`/`last_user_message_at`/`last_agent_message_at` (datetime null), `created_at`/`updated_at`. UniqueConstraint on `(session_id, feature, tenant_schema)`.
  - `AiMessage` — `conversation` FK (CASCADE, related_name `"messages"`), `role` (char 10), `content` (Text), `transcript_id` (int null), `created_at`; `ordering = ["id"]`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/core/tests/test_ai_conversations.py
"""Conversation substrate: models + kernel helpers (kernel half arrives in
the next task — this file starts with the model contract)."""

from datetime import timedelta

import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.core.models import AiConversation, AiMessage

pytestmark = pytest.mark.django_db


def _convo(**kw):
    defaults = dict(
        feature="student_bot", audience="student", tenant_schema="t1", session_id="s-1"
    )
    defaults.update(kw)
    return AiConversation.objects.create(**defaults)


class TestConversationModel:
    def test_defaults(self):
        c = _convo()
        assert c.status == AiConversation.STATUS_AI
        assert c.human_requested is False
        assert c.agent_user_id is None and c.user_id is None

    def test_session_unique_per_feature_and_tenant(self):
        _convo()
        # same session id is fine for a different tenant or feature…
        _convo(tenant_schema="t2")
        _convo(feature="help_bot", tenant_schema="t1")
        # …but a duplicate triple collides
        with pytest.raises(IntegrityError):
            _convo()

    def test_messages_ordered_and_cascade(self):
        c = _convo()
        AiMessage.objects.create(conversation=c, role="user", content="q")
        AiMessage.objects.create(conversation=c, role="assistant", content="a", transcript_id=7)
        assert [m.role for m in c.messages.all()] == ["user", "assistant"]
        c.delete()
        assert AiMessage.objects.count() == 0
```

Purge test (append to `backend/apps/core/tests/test_ai_rate_and_purge.py`):

```python
def test_purge_covers_conversations(db):
    from apps.core.models import AiConversation, AiMessage
    from apps.core.tasks import purge_ai_transcripts

    old = AiConversation.objects.create(
        feature="student_bot", audience="student", tenant_schema="t", session_id="old"
    )
    AiMessage.objects.create(conversation=old, role="user", content="q")
    AiConversation.objects.filter(pk=old.pk).update(
        updated_at=timezone.now() - timedelta(days=settings.AI_TRANSCRIPT_RETENTION_DAYS + 1)
    )
    fresh = AiConversation.objects.create(
        feature="student_bot", audience="student", tenant_schema="t", session_id="new"
    )
    purge_ai_transcripts()
    assert not AiConversation.objects.filter(pk=old.pk).exists()
    assert AiMessage.objects.count() == 0
    assert AiConversation.objects.filter(pk=fresh.pk).exists()
```

(Add `from datetime import timedelta`, `from django.conf import settings`, `from django.utils import timezone` to that file's imports if missing.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_conversations.py apps/core/tests/test_ai_rate_and_purge.py -v`
Expected: FAIL — `ImportError: cannot import name 'AiConversation'`.

- [ ] **Step 3: Implement the models + purge extension**

Append to `backend/apps/core/models.py` (after `PlatformKbEntry`):

```python
class AiConversation(models.Model):
    """One chat session (any of the three bots). Public schema, loose-coupled
    like AiTranscript: tenant_schema is a string, agent/user ids are plain
    ints (public-schema User ids for agents, tenant-schema ids for students).
    The session_id is the client's bearer token — unguessable UUID."""

    STATUS_AI = "ai"
    STATUS_HUMAN = "human"

    feature = models.CharField(max_length=20)  # help_bot | student_bot
    audience = models.CharField(max_length=10)  # coach | visitor | student
    tenant_schema = models.CharField(max_length=63)  # or "__marketing__"
    session_id = models.CharField(max_length=36)
    status = models.CharField(
        max_length=8, default=STATUS_AI, choices=[(STATUS_AI, STATUS_AI), (STATUS_HUMAN, STATUS_HUMAN)]
    )
    agent_user_id = models.IntegerField(null=True, blank=True)
    agent_label = models.CharField(max_length=60, blank=True, default="")
    user_id = models.IntegerField(null=True, blank=True)
    user_label = models.CharField(max_length=60, blank=True, default="")
    human_requested = models.BooleanField(default=False)
    human_requested_at = models.DateTimeField(null=True, blank=True)
    taken_over_at = models.DateTimeField(null=True, blank=True)
    last_user_message_at = models.DateTimeField(null=True, blank=True)
    last_agent_message_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["session_id", "feature", "tenant_schema"], name="uniq_ai_conversation_session"
            )
        ]
        indexes = [
            models.Index(fields=["feature", "tenant_schema", "updated_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.feature}/{self.tenant_schema}/{self.session_id[:8]}"


class AiMessage(models.Model):
    """The thread behind a conversation. Assistant rows link back to their
    AiTranscript audit row via transcript_id (plain int — transcripts are
    purged independently)."""

    conversation = models.ForeignKey(AiConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10)  # user | assistant | agent | system
    content = models.TextField()
    transcript_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["conversation", "id"])]
```

Extend `purge_ai_transcripts` in `backend/apps/core/tasks.py` — after the existing transcript delete, add:

```python
    from apps.core.models import AiConversation

    convos, _ = AiConversation.objects.filter(updated_at__lt=cutoff).delete()
    logger.info("purge_ai_transcripts: deleted %s conversations", convos)
```

- [ ] **Step 4: Generate the migration, run tests**

```bash
make makemigrations
make migrate
docker compose exec -T django pytest apps/core/tests/test_ai_conversations.py apps/core/tests/test_ai_rate_and_purge.py -v
```
Expected: migration `apps/core/migrations/00XX_aiconversation_aimessage.py` created (public schema — SHARED_APPS); all tests PASS. Then `make test-fresh` (new migration) — full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/tasks.py backend/apps/core/migrations backend/apps/core/tests
git commit -m "feat(assistant): AiConversation + AiMessage models, retention purge covers threads"
```

---

### Task 3: Kernel conversation helpers

**Files:**
- Modify: `backend/apps/core/assistant.py` (append after `log_transcript`)
- Modify: `backend/config/settings/base.py` (new settings block)
- Modify: `backend/apps/core/tests/test_ai_conversations.py` (add kernel classes)

**Interfaces:**
- Consumes: Task 2 models.
- Produces (used by Tasks 4–8):
  - `assistant.get_or_create_conversation(*, feature, audience, tenant_schema, session_id, user=None) -> AiConversation | None` — returns `None` for blank session_id; stamps `user_id`/`user_label` (first name, fallback email local-part) once for authenticated users. Never raises.
  - `assistant.append_message(conversation, role, content, transcript_id=None) -> AiMessage | None` — truncates content to 8000 chars; bumps `last_user_message_at`/`last_agent_message_at` + `updated_at`. Never raises.
  - `assistant.maybe_auto_release(conversation) -> AiConversation` — lazy auto-release after `settings.ASSISTANT_HUMAN_IDLE_RELEASE_MIN` minutes of agent idle (anchor: `last_agent_message_at or taken_over_at`); appends system `assistant_resumed`.
  - `assistant.thread_payload(conversation, after_id=0) -> dict` — `{session_id, status, agent_label, human_requested, messages: [{id, role, content, created_at}]}`, capped at 200 messages, ISO timestamps.
- Settings: `ASSISTANT_HUMAN_IDLE_RELEASE_MIN = 30`.

- [ ] **Step 1: Write the failing tests** (append to `test_ai_conversations.py`)

```python
from datetime import timedelta
from django.utils import timezone

from apps.core import assistant


class _User:
    def __init__(self, pk=5, name="Ada Lovelace", email="ada@x.com"):
        self.id = pk
        self.name = name  # accounts.User has `name`, not first_name
        self.email = email
        self.is_authenticated = True


class TestKernelHelpers:
    def test_get_or_create_roundtrip_and_user_stamp(self):
        c1 = assistant.get_or_create_conversation(
            feature="student_bot", audience="student", tenant_schema="t1", session_id="s-9", user=_User()
        )
        c2 = assistant.get_or_create_conversation(
            feature="student_bot", audience="student", tenant_schema="t1", session_id="s-9"
        )
        assert c1.pk == c2.pk
        assert c1.user_id == 5 and c1.user_label == "Ada"

    def test_blank_session_returns_none(self):
        assert (
            assistant.get_or_create_conversation(
                feature="student_bot", audience="student", tenant_schema="t1", session_id=""
            )
            is None
        )

    def test_append_message_bumps_timestamps(self):
        c = _convo()
        assistant.append_message(c, "user", "hello")
        c.refresh_from_db()
        assert c.last_user_message_at is not None
        assistant.append_message(c, "agent", "hi", transcript_id=None)
        c.refresh_from_db()
        assert c.last_agent_message_at is not None
        assert c.messages.count() == 2

    def test_auto_release_boundary(self, settings):
        settings.ASSISTANT_HUMAN_IDLE_RELEASE_MIN = 30
        c = _convo(status="human")
        AiConversation.objects.filter(pk=c.pk).update(
            taken_over_at=timezone.now() - timedelta(minutes=29)
        )
        c.refresh_from_db()
        assert assistant.maybe_auto_release(c).status == "human"
        AiConversation.objects.filter(pk=c.pk).update(
            taken_over_at=timezone.now() - timedelta(minutes=31)
        )
        c.refresh_from_db()
        released = assistant.maybe_auto_release(c)
        assert released.status == "ai"
        assert list(c.messages.values_list("content", flat=True)) == ["assistant_resumed"]

    def test_thread_payload_incremental(self):
        c = _convo()
        m1 = assistant.append_message(c, "user", "q")
        m2 = assistant.append_message(c, "assistant", "a")
        full = assistant.thread_payload(c)
        assert [m["id"] for m in full["messages"]] == [m1.id, m2.id]
        assert full["status"] == "ai" and full["session_id"] == "s-1"
        tail = assistant.thread_payload(c, after_id=m1.id)
        assert [m["id"] for m in tail["messages"]] == [m2.id]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_conversations.py -v`
Expected: FAIL — `AttributeError: module 'apps.core.assistant' has no attribute 'get_or_create_conversation'`.

- [ ] **Step 3: Implement** (append to `backend/apps/core/assistant.py`)

```python
# ── Conversations (v2 spec §5) ───────────────────────────────────────────────


def get_or_create_conversation(*, feature, audience, tenant_schema, session_id, user=None):
    """Resolve the session's conversation, creating it on first contact.
    Blank session_id → None (no thread; v1 behavior). Stamps user identity
    once for authenticated viewers. Best-effort: never raises."""
    from apps.core.models import AiConversation

    sid = (session_id or "").strip()[:36]
    if not sid:
        return None
    try:
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
            {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in msgs
        ],
    }
```

Add to `backend/config/settings/base.py` after the student-bot block (~line 267):

```python
# --- AI assistants v2 ---
ASSISTANT_HUMAN_IDLE_RELEASE_MIN = int(os.environ.get("ASSISTANT_HUMAN_IDLE_RELEASE_MIN", "30"))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_conversations.py -v`
Expected: PASS (all classes). Then `make test` — green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/assistant.py backend/config/settings/base.py backend/apps/core/tests/test_ai_conversations.py
git commit -m "feat(assistant): kernel conversation helpers (resolve, append, lazy auto-release, thread payload)"
```

---

### Task 4: Student bot — conversation wiring + public thread endpoint

**Files:**
- Create: `backend/apps/core/throttling.py`
- Modify: `backend/apps/tenant_config/student_bot.py` (`sse_events` gains `conversation=None`)
- Modify: `backend/apps/tenant_config/assistant_views.py` (`assistant_chat` wiring, new `assistant_thread`)
- Modify: `backend/apps/tenant_config/urls_assistant.py` (thread route)
- Modify: `backend/config/settings/base.py` (`ai_thread` throttle rate)
- Create: `backend/apps/tenant_config/tests/test_assistant_thread_api.py`

**Interfaces:**
- Consumes: Task 3 helpers.
- Produces:
  - `student_bot.sse_events(history, tenant, month, question="", session_id="", is_preview=False, conversation=None)` — when `conversation` is set, the completion hook appends the `assistant` message (with `transcript_id`); the **view** appends the `user` message pre-stream (so the coach console sees questions immediately).
  - `GET /api/v1/assistant/thread/?session=<uuid>&after=<id>` → 200 `thread_payload` | 404 (unknown/blank session, wrong tenant/feature). Public, throttle scope `ai_thread`.
  - `apps/core/throttling.py`: `AiThreadThrottle(AnonRateThrottle)` scope `ai_thread` (Task 12 later re-keys the base class to the real client IP).

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/tenant_config/tests/test_assistant_thread_api.py
"""Conversation substrate over the public student endpoints: chat creates a
conversation + messages; the thread endpoint replays them incrementally.
Fixtures mirror test_assistant_public_api.py (paid tenant on the shared
test schema; provider mocked at the kernel boundary)."""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import connection
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.core import assistant
from apps.core.models import AiConversation, PlatformPlan, PlatformSubscription
from apps.tenant_config import student_bot
from apps.tenant_config.models import AssistantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _sse_body(response):
    return b"".join(response.streaming_content).decode()


def _fake_stream(**kwargs):
    yield ("delta", "hello")
    yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "claude-haiku-4-5"})


@pytest.fixture
def tenant_client(tenant_ctx):
    return APIClient(HTTP_HOST="shared-test.localhost")


@pytest.fixture
def paid_tenant(tenant_ctx):
    # Same pattern as test_assistant_public_api.py:38-56, unique names per module.
    from apps.accounts.models import User

    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Assistant Thread API Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="assistant-thread-owner@x.com", name="Owner", password="x", role="owner"  # noqa: S106
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _enabled_and_clean(paid_tenant):
    from apps.accounts.models import User
    from apps.core.models import AiTranscript, StudentBotUsage

    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.save()

    def _scrub():
        with schema_context("public"):
            AiConversation.objects.all().delete()
            AiTranscript.objects.all().delete()
            StudentBotUsage.objects.all().delete()
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Assistant Thread API Test Paid").delete()
            User.objects.filter(email="assistant-thread-owner@x.com").delete()

    yield
    _scrub()


def _chat(client, session_id="sess-abc", text="what courses?"):
    with (
        patch.object(student_bot.core_ai, "available", return_value=(True, "ok")),
        patch.object(assistant.core_ai, "stream_text", _fake_stream),
    ):
        return client.post(
            "/api/v1/assistant/chat/",
            {"messages": [{"role": "user", "content": text}], "session_id": session_id},
            format="json",
        )


class TestChatCreatesConversation:
    def test_chat_writes_user_and_assistant_messages(self, tenant_client, paid_tenant):
        res = _chat(tenant_client)
        assert res["Content-Type"] == "text/event-stream"
        _sse_body(res)
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="sess-abc")
            assert convo.feature == "student_bot"
            assert convo.tenant_schema == paid_tenant.schema_name
            roles = list(convo.messages.values_list("role", flat=True))
            assert roles == ["user", "assistant"]
            a = convo.messages.last()
            assert a.content == "hello" and a.transcript_id is not None

    def test_blank_session_streams_without_conversation(self, tenant_client, paid_tenant):
        res = _chat(tenant_client, session_id="")
        assert "delta" in _sse_body(res)
        with schema_context("public"):
            assert AiConversation.objects.count() == 0


class TestThreadEndpoint:
    def test_thread_roundtrip_and_incremental(self, tenant_client, paid_tenant):
        _sse_body(_chat(tenant_client))
        res = tenant_client.get("/api/v1/assistant/thread/?session=sess-abc")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ai" and len(body["messages"]) == 2
        last = body["messages"][-1]["id"]
        res2 = tenant_client.get(f"/api/v1/assistant/thread/?session=sess-abc&after={last}")
        assert res2.json()["messages"] == []

    def test_unknown_or_blank_session_404(self, tenant_client, paid_tenant):
        assert tenant_client.get("/api/v1/assistant/thread/?session=nope").status_code == 404
        assert tenant_client.get("/api/v1/assistant/thread/").status_code == 404

    def test_wrong_feature_session_404(self, tenant_client, paid_tenant):
        with schema_context("public"):
            AiConversation.objects.create(
                feature="help_bot", audience="coach",
                tenant_schema=paid_tenant.schema_name, session_id="other-feat",
            )
        assert tenant_client.get("/api/v1/assistant/thread/?session=other-feat").status_code == 404
```

(The `paid_tenant` fixture body is copied verbatim from `test_assistant_public_api.py:37-56` — same plan/user/subscription setup; do that copy in this step, the `...` above is only to avoid duplicating it in this plan.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_thread_api.py -v`
Expected: FAIL — 404 route for `/api/v1/assistant/thread/` missing and no conversation rows created.

- [ ] **Step 3: Implement**

Create `backend/apps/core/throttling.py`:

```python
"""Shared throttle classes for the AI endpoints. Task 12 (hardening) re-keys
these onto the real client IP; until then they behave like AnonRateThrottle."""

from rest_framework.throttling import AnonRateThrottle


class AiThreadThrottle(AnonRateThrottle):
    scope = "ai_thread"
```

`backend/config/settings/base.py` — add to `DEFAULT_THROTTLE_RATES`:

```python
        "ai_thread": "30/min",
```

`backend/apps/tenant_config/student_bot.py` — `sse_events` signature gains `conversation=None`; inside `on_complete`, after the `log_transcript` call and before the `if row is None` return, add:

```python
        assistant.append_message(
            conversation, "assistant", info["answer"], transcript_id=row.id if row else None
        )
```

`backend/apps/tenant_config/assistant_views.py`:

Add imports: `from apps.core.throttling import AiThreadThrottle` and `from apps.core.models import AiConversation`.

In `assistant_chat`, after `session_id = ...` (line ~76) insert the conversation resolve + user-message write, and pass `conversation=` through:

```python
    convo = assistant.get_or_create_conversation(
        feature="student_bot",
        audience="student",
        tenant_schema=tenant.schema_name,
        session_id=session_id,
        user=request.user if getattr(request.user, "is_authenticated", False) else None,
    )
    convo = assistant.maybe_auto_release(convo)
```

then after `history = assistant.prepare_history(...)` succeeds:

```python
    if convo is not None:
        assistant.append_message(convo, "user", question)
```

and change the stream call to `student_bot.sse_events(history, tenant, month, question=question, session_id=session_id, conversation=convo)`.

New view (below `assistant_chat`):

```python
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiThreadThrottle])
def assistant_thread(request):
    """Widget polling endpoint. The session UUID is the bearer token (v2 spec
    D5); mismatched feature/tenant simply doesn't exist here → 404."""
    session = str(request.query_params.get("session") or "").strip()[:36]
    try:
        after = int(request.query_params.get("after") or 0)
    except ValueError:
        after = 0
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="student_bot", tenant_schema=connection.tenant.schema_name
        ).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    return Response(assistant.thread_payload(convo, after_id=after))
```

`backend/apps/tenant_config/urls_assistant.py` — add:

```python
    path("thread/", assistant_thread, name="assistant-thread"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_thread_api.py apps/tenant_config/tests/test_assistant_public_api.py apps/tenant_config/tests/test_student_bot.py -v`
Expected: all PASS (existing suites unaffected — `conversation` defaults to `None`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/throttling.py backend/apps/tenant_config backend/config/settings/base.py
git commit -m "feat(assistant): student chat writes conversations; public thread polling endpoint"
```

### Task 5: Takeover backend — coach console endpoints + human-mode chat path

**Files:**
- Modify: `backend/apps/core/throttling.py` (add `AiHumanMessageThrottle`)
- Modify: `backend/apps/tenant_config/assistant_views.py` (rework `assistant_chat` order; add 6 views)
- Modify: `backend/apps/tenant_config/urls.py` + `urls_assistant.py`
- Modify: `backend/config/settings/base.py` (`ai_human_message` rate)
- Create: `backend/apps/tenant_config/tests/test_assistant_takeover.py`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces:
  - Coach (all `IsCoachOrOwner`, scoped `feature="student_bot"` + own schema, 404 otherwise):
    - `GET /api/v1/admin/assistant/conversations/?page=N` → `{results: [{id, session_id, status, user_label, human_requested, message_count, last_message, updated_at}], has_more}` (page size 20, `-updated_at`).
    - `GET /api/v1/admin/assistant/conversations/<pk>/thread/?after=` → `thread_payload`.
    - `POST .../<pk>/takeover/` → 200 `thread_payload` | 409 `{"error": "already_taken_over"}`.
    - `POST .../<pk>/message/` `{content, after?}` → 200 `thread_payload(after)` | 403 `{"error": "not_taken_over"}` | 400 empty.
    - `POST .../<pk>/release/` → 200 `thread_payload`.
  - Public: `POST /api/v1/assistant/chat/` returns `200 JSON {"mode": "human"}` (no SSE, no model, no quota) when the conversation is human; `POST /api/v1/assistant/human-message/` `{session_id, content}` → `{"mode": "human"}` | 409 `{"mode": "ai"}` | 404 — throttle scope `ai_human_message`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/tenant_config/tests/test_assistant_takeover.py
"""Human takeover: coach console endpoints, human-mode chat short-circuit,
auto-release. Fixtures follow test_assistant_thread_api.py (unique names:
plan "Assistant Takeover Test Paid", owner assistant-takeover-owner@x.com);
coach_client mirrors test_assistant_coach_api.py:31-42 (force_authenticate
a tenant-schema role="owner", is_staff user)."""
```

Copy the module scaffolding (imports, `_sse_body`, `_fake_stream`, `tenant_client`, `paid_tenant`, `_enabled_and_clean`) from Task 4's file with the unique names above, plus:

```python
@pytest.fixture
def coach_client(tenant_ctx):
    from apps.accounts.models import User

    coach = User.objects.create_user(
        email="takeover-coach@x.com", name="Cem Koç", password="x", role="owner"  # noqa: S106
    )
    coach.is_staff = True
    coach.save()
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=coach)
    return client


def _seed_convo(schema, status="ai", session_id="sess-t"):
    with schema_context("public"):
        return AiConversation.objects.create(
            feature="student_bot", audience="student", tenant_schema=schema,
            session_id=session_id, status=status,
            taken_over_at=timezone.now() if status == "human" else None,
        )


class TestTakeover:
    def test_takeover_flips_status_and_writes_system_line(self, coach_client, paid_tenant):
        convo = _seed_convo(paid_tenant.schema_name)
        res = coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "human" and body["agent_label"] == "Cem"
        assert body["messages"][-1]["content"] == "agent_joined:Cem"
        assert coach_client.post(
            f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/"
        ).status_code == 409

    def test_agent_message_requires_human_mode(self, coach_client, paid_tenant):
        convo = _seed_convo(paid_tenant.schema_name)
        res = coach_client.post(
            f"/api/v1/admin/assistant/conversations/{convo.id}/message/", {"content": "hi"}, format="json"
        )
        assert res.status_code == 403
        coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/")
        res = coach_client.post(
            f"/api/v1/admin/assistant/conversations/{convo.id}/message/", {"content": "hi"}, format="json"
        )
        assert res.status_code == 200
        with schema_context("public"):
            assert convo.messages.filter(role="agent", content="hi").exists()

    def test_release_and_auto_release(self, coach_client, paid_tenant, settings):
        convo = _seed_convo(paid_tenant.schema_name, status="human")
        coach_client.post(f"/api/v1/admin/assistant/conversations/{convo.id}/release/")
        with schema_context("public"):
            convo.refresh_from_db()
            assert convo.status == "ai"
            assert convo.messages.filter(content="assistant_resumed").exists()
        stale = _seed_convo(paid_tenant.schema_name, status="human", session_id="sess-stale")
        with schema_context("public"):
            AiConversation.objects.filter(pk=stale.pk).update(
                taken_over_at=timezone.now() - timedelta(minutes=31)
            )
        res = coach_client.get(f"/api/v1/admin/assistant/conversations/{stale.id}/thread/")
        assert res.json()["status"] == "ai"

    def test_scoping_and_permissions(self, coach_client, tenant_client, paid_tenant):
        with schema_context("public"):
            other = AiConversation.objects.create(
                feature="student_bot", audience="student", tenant_schema="someone_else", session_id="x1"
            )
        assert coach_client.get(
            f"/api/v1/admin/assistant/conversations/{other.id}/thread/"
        ).status_code == 404
        convo = _seed_convo(paid_tenant.schema_name)
        assert tenant_client.post(
            f"/api/v1/admin/assistant/conversations/{convo.id}/takeover/"
        ).status_code in (401, 403)


class TestHumanModeChat:
    def test_chat_short_circuits_without_model_or_quota(self, tenant_client, paid_tenant):
        _seed_convo(paid_tenant.schema_name, status="human", session_id="sess-h")
        # exhaust the quota to prove human mode ignores it
        usage = student_bot.tenant_usage(paid_tenant.schema_name)
        type(usage).objects.filter(pk=usage.pk).update(questions=10_000)
        res = tenant_client.post(
            "/api/v1/assistant/chat/",
            {"messages": [{"role": "user", "content": "help me"}], "session_id": "sess-h"},
            format="json",
        )
        assert res.status_code == 200 and res.json() == {"mode": "human"}
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="sess-h")
            assert convo.messages.filter(role="user", content="help me").exists()
            from apps.core.models import AiTranscript

            assert AiTranscript.objects.count() == 0

    def test_human_message_endpoint(self, tenant_client, paid_tenant):
        _seed_convo(paid_tenant.schema_name, status="human", session_id="sess-hm")
        res = tenant_client.post(
            "/api/v1/assistant/human-message/", {"session_id": "sess-hm", "content": "still there?"}, format="json"
        )
        assert res.status_code == 200 and res.json() == {"mode": "human"}
        _seed_convo(paid_tenant.schema_name, status="ai", session_id="sess-ai")
        assert tenant_client.post(
            "/api/v1/assistant/human-message/", {"session_id": "sess-ai", "content": "x"}, format="json"
        ).status_code == 409
        assert tenant_client.post(
            "/api/v1/assistant/human-message/", {"session_id": "nope", "content": "x"}, format="json"
        ).status_code == 404

    def test_conversation_list_shape(self, coach_client, tenant_client, paid_tenant):
        _sse_body(_chat(tenant_client, session_id="sess-list"))
        res = coach_client.get("/api/v1/admin/assistant/conversations/")
        assert res.status_code == 200
        row = res.json()["results"][0]
        assert row["session_id"] == "sess-list" and row["status"] == "ai"
        assert row["message_count"] == 2 and row["last_message"] == "hello"
```

(`_chat` is the same helper as Task 4's file — include it in the scaffolding copy. Add `from datetime import timedelta` and `from django.utils import timezone` imports.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_takeover.py -v`
Expected: FAIL — 404s on the new routes; chat streams SSE instead of returning `{"mode": "human"}`.

- [ ] **Step 3: Implement**

`backend/apps/core/throttling.py` — add:

```python
class AiHumanMessageThrottle(AnonRateThrottle):
    scope = "ai_human_message"
```

`backend/config/settings/base.py` `DEFAULT_THROTTLE_RATES` — add `"ai_human_message": "20/min",`.

`backend/apps/tenant_config/assistant_views.py` — replace `assistant_chat` with the final ordering (block → conversation → human short-circuit → gating → caps → stream; the ipblock guard arrives in Task 13):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes(
    [StudentBotBurstThrottle, StudentBotDayThrottle, StudentBotUserBurstThrottle, StudentBotUserDayThrottle]
)
def assistant_chat(request):
    """SSE chat for students/visitors. Human-mode conversations short-circuit
    BEFORE gating: a human can keep answering even when the AI is capped
    (v2 spec §6.2 — human messages cost nothing)."""
    tenant = connection.tenant
    month = student_bot.current_month()
    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if raw and isinstance(raw[-1], dict) else ""
    session_id = str(data.get("session_id") or "")[:36]

    user = request.user if getattr(request.user, "is_authenticated", False) else None
    convo = assistant.get_or_create_conversation(
        feature="student_bot",
        audience="student",
        tenant_schema=tenant.schema_name,
        session_id=session_id,
        user=user,
    )
    convo = assistant.maybe_auto_release(convo)
    if convo is not None and convo.status == AiConversation.STATUS_HUMAN:
        if question:
            assistant.append_message(convo, "user", question)
        return Response({"mode": "human"})

    cfg = AssistantConfig.load()
    enabled, reason = student_bot.availability(tenant, cfg, month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    try:
        history = assistant.prepare_history(data.get("messages"), student_bot.build_viewer_context(user))
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    if convo is not None:
        assistant.append_message(convo, "user", question)
    response = StreamingHttpResponse(
        student_bot.sse_events(
            history, tenant, month, question=question, session_id=session_id, conversation=convo
        ),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
```

Note: `student_bot.build_viewer_context(user)` doesn't exist until Task 10 — for THIS task keep the v1 context line (`f"<student_context>signed in: {'yes' if user else 'no'}</student_context>"`); Task 10 swaps it. Add the new views:

```python
def _own_conversation(pk):
    return AiConversation.objects.filter(
        pk=pk, feature="student_bot", tenant_schema=connection.tenant.schema_name
    ).first()


def _conversation_row(c):
    last = c.messages.exclude(role="system").order_by("-id").first()
    return {
        "id": c.id,
        "session_id": c.session_id,
        "status": c.status,
        "user_label": c.user_label,
        "human_requested": c.human_requested,
        "message_count": c.message_count,
        "last_message": (last.content[:140] if last else ""),
        "updated_at": c.updated_at,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def assistant_conversations(request):
    from django.db.models import Count

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    qs = (
        AiConversation.objects.filter(
            feature="student_bot", tenant_schema=connection.tenant.schema_name
        )
        .annotate(message_count=Count("messages"))
        .order_by("-updated_at")
    )
    start = (page - 1) * PAGE_SIZE
    rows = list(qs[start : start + PAGE_SIZE + 1])
    return Response({"results": [_conversation_row(c) for c in rows[:PAGE_SIZE]], "has_more": len(rows) > PAGE_SIZE})


def _int_param(request, name, source=None):
    try:
        return int((source or request.query_params).get(name) or 0)
    except (TypeError, ValueError):
        return 0


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_thread(request, pk):
    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    return Response(assistant.thread_payload(convo, after_id=_int_param(request, "after")))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_takeover(request, pk):
    from django.utils import timezone

    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    if convo.status == AiConversation.STATUS_HUMAN:
        return Response({"error": "already_taken_over"}, status=409)
    label = (((getattr(request.user, "name", "") or "").split(" ")[0]) or "Coach")[:60]
    convo.status = AiConversation.STATUS_HUMAN
    convo.agent_user_id = request.user.id
    convo.agent_label = label
    convo.taken_over_at = timezone.now()
    convo.human_requested = False
    convo.save(
        update_fields=["status", "agent_user_id", "agent_label", "taken_over_at", "human_requested", "updated_at"]
    )
    assistant.append_message(convo, "system", f"agent_joined:{label}")
    return Response(assistant.thread_payload(convo))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_message(request, pk):
    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    data = request.data if isinstance(request.data, dict) else {}
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = assistant.maybe_auto_release(convo)
    if convo.status != AiConversation.STATUS_HUMAN:
        return Response({"error": "not_taken_over"}, status=403)
    assistant.append_message(convo, "agent", content)
    return Response(assistant.thread_payload(convo, after_id=_int_param(request, "after", data)))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_release(request, pk):
    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    if convo.status == AiConversation.STATUS_HUMAN:
        convo.status = AiConversation.STATUS_AI
        convo.save(update_fields=["status", "updated_at"])
        assistant.append_message(convo, "system", "assistant_resumed")
    return Response(assistant.thread_payload(convo))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiHumanMessageThrottle])
def assistant_human_message(request):
    """Free human-mode sends from the widget (own throttle scope; the AI chat
    throttles stay reserved for model-bound traffic)."""
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="student_bot", tenant_schema=connection.tenant.schema_name
        ).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    if convo.status != AiConversation.STATUS_HUMAN:
        return Response({"mode": "ai"}, status=409)
    assistant.append_message(convo, "user", content)
    return Response({"mode": "human"})
```

Imports to add at the top of the module: `from apps.core.throttling import AiHumanMessageThrottle, AiThreadThrottle` (extend Task 4's import).

`backend/apps/tenant_config/urls.py` — add after the existing assistant lines:

```python
    path("assistant/conversations/", assistant_conversations, name="assistant-conversations"),
    path("assistant/conversations/<int:pk>/thread/", assistant_conversation_thread, name="assistant-conversation-thread"),
    path("assistant/conversations/<int:pk>/takeover/", assistant_conversation_takeover, name="assistant-conversation-takeover"),
    path("assistant/conversations/<int:pk>/message/", assistant_conversation_message, name="assistant-conversation-message"),
    path("assistant/conversations/<int:pk>/release/", assistant_conversation_release, name="assistant-conversation-release"),
```

`backend/apps/tenant_config/urls_assistant.py` — add `path("human-message/", assistant_human_message, name="assistant-human-message"),`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_takeover.py apps/tenant_config/tests/test_assistant_thread_api.py apps/tenant_config/tests/test_assistant_public_api.py -v`
Expected: PASS. Then `make test` — green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/throttling.py backend/apps/tenant_config backend/config/settings/base.py
git commit -m "feat(assistant): human takeover — coach console endpoints, human-mode chat path, auto-release"
```

---

### Task 6: "Talk to a human" — request endpoint, config flag, owner email

**Files:**
- Modify: `backend/apps/tenant_config/models.py` (`AssistantConfig.human_handoff_enabled`)
- Create: `backend/apps/tenant_config/migrations/00XX_assistantconfig_human_handoff_enabled.py` (generated)
- Modify: `backend/apps/core/throttling.py` (`AiHumanRequestThrottle`)
- Modify: `backend/apps/tenant_config/assistant_views.py` (`assistant_human_request`, status/config payloads)
- Modify: `backend/apps/tenant_config/urls_assistant.py`, `backend/config/settings/base.py`
- Modify: `backend/apps/tenant_config/tests/test_assistant_takeover.py` (new class)

**Interfaces:**
- Consumes: `apps.core.email.send_email(to, subject, html, ...)` (`apps/core/email.py:9`), `Tenant.owner_email` (`apps/core/models.py:12`).
- Produces:
  - `AssistantConfig.human_handoff_enabled` (bool, default True); `GET /api/v1/assistant/status/` payload gains `"human_handoff": bool`; coach `_config_payload` gains the same key (PUT accepts it).
  - `POST /api/v1/assistant/human-request/` `{session_id}` → `{"ok": true}`; sets `human_requested(+at)`, appends system `human_requested`, emails the tenant owner exactly once per conversation. 403 when the flag is off; 404 unknown session. Throttle scope `ai_human_request`.

- [ ] **Step 1: Write the failing tests** (append to `test_assistant_takeover.py`)

```python
class TestHumanRequest:
    def test_request_flags_and_emails_once(self, tenant_client, paid_tenant):
        _seed_convo(paid_tenant.schema_name, session_id="sess-r")
        with patch("apps.tenant_config.assistant_views.send_email") as mailer:
            r1 = tenant_client.post("/api/v1/assistant/human-request/", {"session_id": "sess-r"}, format="json")
            r2 = tenant_client.post("/api/v1/assistant/human-request/", {"session_id": "sess-r"}, format="json")
        assert r1.status_code == 200 and r2.status_code == 200
        assert mailer.call_count == 1
        assert mailer.call_args.kwargs["to"] == paid_tenant.owner_email
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="sess-r")
            assert convo.human_requested is True
            assert convo.messages.filter(role="system", content="human_requested").exists()

    def test_disabled_flag_hides_and_rejects(self, tenant_client, paid_tenant):
        cfg = AssistantConfig.load()
        cfg.human_handoff_enabled = False
        cfg.save()
        assert tenant_client.get("/api/v1/assistant/status/").json()["human_handoff"] is False
        _seed_convo(paid_tenant.schema_name, session_id="sess-r2")
        assert tenant_client.post(
            "/api/v1/assistant/human-request/", {"session_id": "sess-r2"}, format="json"
        ).status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_takeover.py::TestHumanRequest -v`
Expected: FAIL — no `human_handoff` key, 404 route.

- [ ] **Step 3: Implement**

`backend/apps/tenant_config/models.py` — add to `AssistantConfig` (after `suggested_questions`):

```python
    human_handoff_enabled = models.BooleanField(default=True)
```

Run `make makemigrations && make migrate` (tenant migration `00XX_assistantconfig_human_handoff_enabled`).

`backend/apps/core/throttling.py`:

```python
class AiHumanRequestThrottle(AnonRateThrottle):
    scope = "ai_human_request"
```

`base.py` rates: `"ai_human_request": "2/hour",`.

`assistant_views.py` — `_status_payload` gains `"human_handoff": cfg.human_handoff_enabled,`; `_config_payload` gains the same key; `assistant_config`'s PUT handler gains:

```python
        if "human_handoff_enabled" in data:
            cfg.human_handoff_enabled = bool(data["human_handoff_enabled"])
```

New view (import `from apps.core.email import send_email` at module top — patchable in tests):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiHumanRequestThrottle])
def assistant_human_request(request):
    """Student taps "Talk to a human": flag the conversation and email the
    coach once (v2 spec D9). Best-effort mail — the flag is the state."""
    from django.utils import timezone

    tenant = connection.tenant
    cfg = AssistantConfig.load()
    if not cfg.human_handoff_enabled:
        return Response(status=403)
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="student_bot", tenant_schema=tenant.schema_name
        ).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    if not convo.human_requested:
        convo.human_requested = True
        convo.human_requested_at = timezone.now()
        convo.save(update_fields=["human_requested", "human_requested_at", "updated_at"])
        assistant.append_message(convo, "system", "human_requested")
        try:
            domain = (
                tenant.domains.filter(is_primary=True).values_list("domain", flat=True).first()
                or tenant.domains.values_list("domain", flat=True).first()
                or ""
            )
            label = convo.user_label or "A visitor"
            send_email(
                to=tenant.owner_email,
                subject=f"{label} asked to talk to a human on your site",
                html=(
                    f"<p>{label} asked to talk to a human in your site assistant chat.</p>"
                    f'<p><a href="https://{domain}/admin/assistant">Open your conversations</a> '
                    f"to reply — the assistant pauses while you chat.</p>"
                ),
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception("assistant: human-request email failed")
    return Response({"ok": True})
```

`urls_assistant.py` — add `path("human-request/", assistant_human_request, name="assistant-human-request"),`.

- [ ] **Step 4: Run tests, migration check**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_takeover.py apps/tenant_config/tests/test_assistant_coach_api.py -v` → PASS. Then `make test-fresh` (new migration) — green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config backend/apps/core/throttling.py backend/config/settings/base.py
git commit -m "feat(assistant): talk-to-a-human request — config flag, system line, one owner email"
```

---

### Task 7: Help-bot flavors — conversations, threads, human mode (coach + marketing)

**Files:**
- Modify: `backend/apps/tenant_config/help_bot.py` (`sse_events` gains `conversation=None`)
- Modify: `backend/apps/tenant_config/views.py` (`help_bot_chat` wiring + 3 new views)
- Modify: `backend/apps/core/help/views.py` (same for the marketing flavor)
- Modify: `backend/apps/tenant_config/urls.py`, `backend/apps/core/help/urls.py`
- Modify: `backend/config/settings/base.py` (`HELP_BOT_ALERT_EMAIL`)
- Create: `backend/apps/tenant_config/tests/test_help_bot_conversations.py`

**Interfaces:**
- Consumes: Tasks 3–6 helpers/throttles.
- Produces:
  - `help_bot.sse_events(history, audience, bucket, month, question="", session_id="", conversation=None)` — hook appends the assistant message like the student bot.
  - Coach flavor (tenant host, `IsCoachOrOwner`): `GET /api/v1/admin/help-bot/thread/?session=&after=`, `POST /api/v1/admin/help-bot/human-message/` `{session_id, content}`, `POST /api/v1/admin/help-bot/human-request/` `{session_id}`. Conversations: `feature="help_bot"`, `audience="coach"`, `tenant_schema=<schema>`.
  - Marketing flavor (public, `@authentication_classes([])`): `GET /api/v1/help/thread/`, `POST /api/v1/help/human-message/`, `POST /api/v1/help/human-request/` — `tenant_schema="__marketing__"`, `audience="visitor"`; throttles `AiThreadThrottle`/`AiHumanMessageThrottle`/`AiHumanRequestThrottle`.
  - Human-request email recipient: `settings.HELP_BOT_ALERT_EMAIL or settings.RESEND_FROM_EMAIL`.
  - Setting: `HELP_BOT_ALERT_EMAIL = os.environ.get("HELP_BOT_ALERT_EMAIL", "")`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/tenant_config/tests/test_help_bot_conversations.py
"""Conversation substrate for both help-bot flavors. Coach flavor uses the
coach_client pattern (test_help_bot_views.py); marketing flavor posts to
/api/v1/help/* with a public-host APIClient."""
```

Scaffold with the same imports as Task 5's file plus `from apps.tenant_config import help_bot`. Coach fixture: `coach_client` as in Task 5 (email `helpconv-coach@x.com`, name `"Nur Ak"`). Marketing client: `APIClient()` (default host resolves the public schema). Fake stream identical. Tests:

```python
class TestCoachFlavor:
    def test_chat_creates_conversation_with_coach_label(self, coach_client, tenant_ctx):
        with (
            patch.object(help_bot.core_ai, "available", return_value=(True, "ok")),
            patch.object(assistant.core_ai, "stream_text", _fake_stream),
        ):
            res = coach_client.post(
                "/api/v1/admin/help-bot/chat/",
                {"messages": [{"role": "user", "content": "how do payouts work?"}], "session_id": "hb-1"},
                format="json",
            )
            b"".join(res.streaming_content)
        with schema_context("public"):
            convo = AiConversation.objects.get(session_id="hb-1")
            assert (convo.feature, convo.audience) == ("help_bot", "coach")
            assert convo.tenant_schema == tenant_ctx.schema_name
            assert convo.user_label == "Nur"
            assert list(convo.messages.values_list("role", flat=True)) == ["user", "assistant"]

    def test_thread_and_human_mode(self, coach_client, tenant_ctx):
        with schema_context("public"):
            convo = AiConversation.objects.create(
                feature="help_bot", audience="coach", tenant_schema=tenant_ctx.schema_name,
                session_id="hb-2", status="human", taken_over_at=timezone.now(),
            )
        res = coach_client.get("/api/v1/admin/help-bot/thread/?session=hb-2")
        assert res.status_code == 200 and res.json()["status"] == "human"
        res = coach_client.post(
            "/api/v1/admin/help-bot/chat/",
            {"messages": [{"role": "user", "content": "anyone?"}], "session_id": "hb-2"},
            format="json",
        )
        assert res.json() == {"mode": "human"}
        assert coach_client.post(
            "/api/v1/admin/help-bot/human-message/", {"session_id": "hb-2", "content": "ping"}, format="json"
        ).status_code == 200

    def test_human_request_emails_alert_address(self, coach_client, tenant_ctx, settings):
        settings.HELP_BOT_ALERT_EMAIL = "ops@contentor.app"
        with schema_context("public"):
            AiConversation.objects.create(
                feature="help_bot", audience="coach", tenant_schema=tenant_ctx.schema_name, session_id="hb-3"
            )
        with patch("apps.tenant_config.views.send_email") as mailer:
            coach_client.post("/api/v1/admin/help-bot/human-request/", {"session_id": "hb-3"}, format="json")
        assert mailer.call_args.kwargs["to"] == "ops@contentor.app"


class TestMarketingFlavor:
    def test_chat_buckets_to_marketing_and_thread_serves(self, db):
        client = APIClient()
        with (
            patch.object(help_bot.core_ai, "available", return_value=(True, "ok")),
            patch.object(assistant.core_ai, "stream_text", _fake_stream),
        ):
            res = client.post(
                "/api/v1/help/chat/",
                {"messages": [{"role": "user", "content": "pricing?"}], "session_id": "mk-1"},
                format="json",
            )
            b"".join(res.streaming_content)
        convo = AiConversation.objects.get(session_id="mk-1")
        assert convo.tenant_schema == "__marketing__" and convo.audience == "visitor"
        assert client.get("/api/v1/help/thread/?session=mk-1").status_code == 200
```

(Coach-flavor tests share the takeover-file cleanup discipline: an autouse fixture deleting `AiConversation`/`AiTranscript`/`HelpBotUsage` rows in `schema_context("public")` at teardown.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_help_bot_conversations.py -v`
Expected: FAIL — no conversations created, thread routes 404.

- [ ] **Step 3: Implement**

`help_bot.py` — `sse_events(history, audience, bucket, month, question="", session_id="", conversation=None)`; inside `on_complete` after `log_transcript`:

```python
        assistant.append_message(
            conversation, "assistant", info["answer"], transcript_id=row.id if row else None
        )
```

`base.py` (help-bot block): `HELP_BOT_ALERT_EMAIL = os.environ.get("HELP_BOT_ALERT_EMAIL", "")`.

`apps/tenant_config/views.py` (coach flavor) — in `help_bot_chat`, after parsing `session_id`/`question` and BEFORE the availability gate:

```python
    convo = assistant.get_or_create_conversation(
        feature="help_bot",
        audience="coach",
        tenant_schema=connection.tenant.schema_name,
        session_id=session_id,
        user=request.user,
    )
    convo = assistant.maybe_auto_release(convo)
    if convo is not None and convo.status == AiConversation.STATUS_HUMAN:
        if question:
            assistant.append_message(convo, "user", question)
        return Response({"mode": "human"})
```

then append the user message once history validates, and pass `conversation=convo` into `help_bot.sse_events(...)`. Add three views — copy `assistant_thread`, `assistant_human_message`, `assistant_human_request` from `apps/tenant_config/assistant_views.py` (in the repo since Tasks 4–6), changing the lookup filter to `feature="help_bot", tenant_schema=connection.tenant.schema_name`, permission to `IsCoachOrOwner` (no anon throttles needed — JWT-gated; drop the `human_handoff_enabled` gate), and the human-request email recipient to `settings.HELP_BOT_ALERT_EMAIL or settings.RESEND_FROM_EMAIL` with subject `f"{label} asked for a human in Ask Contentor"` and the coach's tenant schema in the body. Name them `help_bot_thread`, `help_bot_human_message`, `help_bot_human_request`; import `send_email` at module top.

`apps/core/help/views.py` (marketing flavor) — same three views as public endpoints (`@authentication_classes([])` + `AllowAny` + `AiThreadThrottle`/`AiHumanMessageThrottle`/`AiHumanRequestThrottle`), lookup filter `feature="help_bot", tenant_schema=MARKETING_BUCKET`; `help_bot_public_chat` gains the identical conversation resolve (audience `"visitor"`, `user=None`) + human short-circuit + pre-stream user append + `conversation=convo`. Names: `help_bot_public_thread`, `help_bot_public_human_message`, `help_bot_public_human_request`. The marketing human-request email label is `"A visitor on contentor.app"`; no `human_handoff` flag gate (always on, D9).

URLs — `apps/tenant_config/urls.py`:

```python
    path("help-bot/thread/", help_bot_thread, name="help-bot-thread"),
    path("help-bot/human-message/", help_bot_human_message, name="help-bot-human-message"),
    path("help-bot/human-request/", help_bot_human_request, name="help-bot-human-request"),
```

`apps/core/help/urls.py`:

```python
    path("thread/", help_bot_public_thread, name="help-public-thread"),
    path("human-message/", help_bot_public_human_message, name="help-public-human-message"),
    path("human-request/", help_bot_public_human_request, name="help-public-human-request"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_help_bot_conversations.py apps/tenant_config/tests/test_help_bot_views.py apps/core/tests -v`
Expected: PASS (existing help-bot suites unaffected).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config backend/apps/core/help backend/config/settings/base.py
git commit -m "feat(help-bot): conversations + threads + human mode for coach and marketing flavors"
```

---

### Task 8: Superadmin console endpoints — `/api/v1/platform/ai-conversations/`

**Files:**
- Modify: `backend/apps/core/platform/views.py`
- Modify: `backend/apps/core/platform/urls.py`
- Create: `backend/apps/core/tests/test_platform_ai_conversations.py`

**Interfaces:**
- Consumes: Task 3 helpers; `IsSuperUser` (`apps/core/permissions.py:14`).
- Produces (all `IsSuperUser`, queryset hard-scoped `feature="help_bot"` — superadmin never touches student-tenant chats, spec D6):
  - `GET /api/v1/platform/ai-conversations/?page=&audience=&tenant=` → `{results: [conversation rows + "tenant_schema" and "audience"], has_more}`.
  - `GET /api/v1/platform/ai-conversations/<pk>/thread/?after=` → `thread_payload`.
  - `POST .../<pk>/takeover/` (agent_label `"Contentor support"`), `POST .../<pk>/message/`, `POST .../<pk>/release/` — same contracts as Task 5's coach versions.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/core/tests/test_platform_ai_conversations.py
"""Superadmin conversation console: list/thread/takeover/message/release over
help_bot conversations (both audiences); student_bot rows are invisible."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AiConversation

pytestmark = pytest.mark.django_db


@pytest.fixture
def superadmin_client():
    admin = User.objects.create_superuser(email="root@x.com", name="Root", password="x")  # noqa: S106
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def coach_convo(db):
    return AiConversation.objects.create(
        feature="help_bot", audience="coach", tenant_schema="yoga", session_id="pc-1"
    )


def test_requires_superuser(db):
    user = User.objects.create_user(email="pleb@x.com", name="P", password="x", role="coach")  # noqa: S106
    client = APIClient()
    client.force_authenticate(user=user)
    assert client.get("/api/v1/platform/ai-conversations/").status_code == 403


def test_list_filters_and_hides_student_bot(superadmin_client, coach_convo):
    AiConversation.objects.create(
        feature="help_bot", audience="visitor", tenant_schema="__marketing__", session_id="pc-2"
    )
    AiConversation.objects.create(
        feature="student_bot", audience="student", tenant_schema="yoga", session_id="pc-3"
    )
    body = superadmin_client.get("/api/v1/platform/ai-conversations/").json()
    assert {r["session_id"] for r in body["results"]} == {"pc-1", "pc-2"}
    only_marketing = superadmin_client.get("/api/v1/platform/ai-conversations/?audience=visitor").json()
    assert [r["tenant_schema"] for r in only_marketing["results"]] == ["__marketing__"]


def test_takeover_message_release_roundtrip(superadmin_client, coach_convo):
    res = superadmin_client.post(f"/api/v1/platform/ai-conversations/{coach_convo.id}/takeover/")
    assert res.status_code == 200 and res.json()["agent_label"] == "Contentor support"
    res = superadmin_client.post(
        f"/api/v1/platform/ai-conversations/{coach_convo.id}/message/", {"content": "hi!"}, format="json"
    )
    assert res.status_code == 200
    superadmin_client.post(f"/api/v1/platform/ai-conversations/{coach_convo.id}/release/")
    coach_convo.refresh_from_db()
    assert coach_convo.status == "ai"
    roles = list(coach_convo.messages.values_list("role", flat=True))
    assert roles == ["system", "agent", "system"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_platform_ai_conversations.py -v`
Expected: FAIL — 404 routes.

- [ ] **Step 3: Implement**

Append to `backend/apps/core/platform/views.py` (reuse the module's existing imports style; add `from apps.core import assistant` and `from apps.core.models import AiConversation`):

```python
PLATFORM_AGENT_LABEL = "Contentor support"
_CONVO_PAGE = 20


def _help_conversation(pk):
    return AiConversation.objects.filter(pk=pk, feature="help_bot").first()


def _platform_conversation_row(c):
    last = c.messages.exclude(role="system").order_by("-id").first()
    return {
        "id": c.id,
        "session_id": c.session_id,
        "audience": c.audience,
        "tenant_schema": c.tenant_schema,
        "status": c.status,
        "user_label": c.user_label,
        "human_requested": c.human_requested,
        "message_count": c.message_count,
        "last_message": (last.content[:140] if last else ""),
        "updated_at": c.updated_at,
    }


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_ai_conversations(request):
    from django.db.models import Count

    qs = AiConversation.objects.filter(feature="help_bot")
    audience = request.query_params.get("audience")
    if audience in ("coach", "visitor"):
        qs = qs.filter(audience=audience)
    tenant = request.query_params.get("tenant")
    if tenant:
        qs = qs.filter(tenant_schema=tenant)
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    qs = qs.annotate(message_count=Count("messages")).order_by("-updated_at")
    start = (page - 1) * _CONVO_PAGE
    rows = list(qs[start : start + _CONVO_PAGE + 1])
    return Response(
        {"results": [_platform_conversation_row(c) for c in rows[:_CONVO_PAGE]], "has_more": len(rows) > _CONVO_PAGE}
    )
```

The four detail views (`platform_ai_conversation_thread` / `_takeover` / `_message` / `_release`) are byte-level copies of `assistant_conversation_thread` / `_takeover` / `_message` / `_release` in `apps/tenant_config/assistant_views.py` (in the repo since Task 5) with three substitutions: lookup `_help_conversation(pk)`, permission `IsSuperUser`, and takeover label fixed to `PLATFORM_AGENT_LABEL` (no name derivation). Write them out fully in the module.

`backend/apps/core/platform/urls.py`:

```python
    path("ai-conversations/", views.platform_ai_conversations, name="platform-ai-conversations"),
    path("ai-conversations/<int:pk>/thread/", views.platform_ai_conversation_thread, name="platform-ai-conversation-thread"),
    path("ai-conversations/<int:pk>/takeover/", views.platform_ai_conversation_takeover, name="platform-ai-conversation-takeover"),
    path("ai-conversations/<int:pk>/message/", views.platform_ai_conversation_message, name="platform-ai-conversation-message"),
    path("ai-conversations/<int:pk>/release/", views.platform_ai_conversation_release, name="platform-ai-conversation-release"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_platform_ai_conversations.py -v` → PASS. `make test` — green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/platform backend/apps/core/tests/test_platform_ai_conversations.py
git commit -m "feat(platform): superadmin AI-conversation console endpoints with takeover"
```

### Task 9: Follow-up suggestions — kernel tail parser + persona contracts

**Files:**
- Modify: `backend/apps/core/assistant.py` (`run_chat` rewrite + `_parse_suggestions`)
- Modify: `backend/apps/tenant_config/help_bot.py` (both personas, `PROMPT_VERSION = 3`)
- Modify: `backend/apps/tenant_config/student_bot.py` (persona, `PROMPT_VERSION = 2`)
- Modify: `backend/config/settings/base.py` (`STUDENT_BOT_MAX_OUTPUT_TOKENS` default 600 → 700)
- Create: `backend/apps/core/tests/test_assistant_suggestions.py`

**Interfaces:**
- Produces:
  - `assistant.TAIL_DELIMITER = "|||SUGGESTIONS"`, `assistant.MAX_SUGGESTIONS = 3`, `assistant.MAX_SUGGESTION_CHARS = 80`.
  - `run_chat` — same signature; the SSE `done` event ALWAYS carries `"suggestions": [str]` (empty on no/malformed tail); deltas never contain the tail; `on_complete(info)` receives the CLEAN `answer` plus `info["suggestions"]` (Task 14 caches them).
- Wire-contract note: existing widgets ignore unknown `done` keys — nothing breaks before Tasks 15–18 render chips.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/core/tests/test_assistant_suggestions.py
"""run_chat tail parsing: the |||SUGGESTIONS block is stripped from the delta
stream, parsed into the done event, and hidden from on_complete's answer."""

import json
from decimal import Decimal

from apps.core import assistant


def _run(deltas, on_complete=None):
    def fake(**kwargs):
        for d in deltas:
            yield ("delta", d)
        yield ("done", {"cost_usd": Decimal("0"), "provider": "anthropic", "model": "m"})

    original = assistant.core_ai.stream_text
    assistant.core_ai.stream_text = fake
    try:
        frames = [
            json.loads(f.removeprefix("data: ").strip())
            for f in assistant.run_chat(system="s", history=[], model="m", max_tokens=10, on_complete=on_complete)
        ]
    finally:
        assistant.core_ai.stream_text = original
    text = "".join(f.get("text", "") for f in frames if f["type"] == "delta")
    return text, frames[-1]


def test_tail_split_across_deltas_is_stripped():
    text, done = _run(["The course costs $10.", "\n||", '|SUGGESTIONS ["What about refunds?","Is it live?"]'])
    assert "SUGGESTIONS" not in text and text.startswith("The course costs $10.")
    assert done["suggestions"] == ["What about refunds?", "Is it live?"]


def test_no_tail_yields_empty_suggestions_and_full_text():
    text, done = _run(["plain answer"])
    assert text == "plain answer" and done["suggestions"] == []


def test_malformed_tail_fails_soft():
    text, done = _run(["hi", "\n|||SUGGESTIONS [not json"])
    assert text.startswith("hi") and done["suggestions"] == []


def test_clamps_count_and_length():
    tail = json.dumps(["q" * 200, "a", "b", "c", "d"])
    _, done = _run(["x\n|||SUGGESTIONS " + tail])
    assert len(done["suggestions"]) == 3
    assert len(done["suggestions"][0]) == assistant.MAX_SUGGESTION_CHARS


def test_on_complete_gets_clean_answer_and_suggestions():
    seen = {}

    def hook(info):
        seen.update(info)
        return {"transcript_id": 1}

    text, done = _run(["ans", '\n|||SUGGESTIONS ["next?"]'], on_complete=hook)
    assert seen["answer"] == "ans" and seen["suggestions"] == ["next?"]
    assert done["transcript_id"] == 1 and done["suggestions"] == ["next?"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_assistant_suggestions.py -v`
Expected: FAIL — `KeyError: 'suggestions'` / tail text leaks into deltas.

- [ ] **Step 3: Implement**

Replace `run_chat` in `backend/apps/core/assistant.py` and add the constants/parser above it:

```python
TAIL_DELIMITER = "|||SUGGESTIONS"
MAX_SUGGESTIONS = 3
MAX_SUGGESTION_CHARS = 80


def _parse_suggestions(tail):
    try:
        data = json.loads(tail.strip())
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    for s in data:
        if isinstance(s, str) and s.strip():
            out.append(s.strip()[:MAX_SUGGESTION_CHARS])
        if len(out) >= MAX_SUGGESTIONS:
            break
    return out


def run_chat(*, system, history, model, max_tokens, on_complete):
    """Yield SSE frames for one streamed answer. The persona appends a
    |||SUGGESTIONS ["…"] tail; we hold back the last len(delimiter)-1 chars
    while streaming so a tail split across deltas never leaks, then ship the
    parsed list in the done event. on_complete(info) gets the CLEAN answer
    plus info["suggestions"]; its return dict merges into the done event."""
    parts = []
    emitted = 0
    done_info = None
    hold = len(TAIL_DELIMITER) - 1
    try:
        for kind, value in core_ai.stream_text(system=system, history=history, model=model, max_tokens=max_tokens):
            if kind == "delta":
                parts.append(value)
                full = "".join(parts)
                cut = full.find(TAIL_DELIMITER)
                safe = max(emitted, (len(full) - hold) if cut == -1 else cut)
                if safe > emitted:
                    yield _event({"type": "delta", "text": full[emitted:safe]})
                    emitted = safe
            elif kind == "done":
                done_info = value
    except Exception:
        logger.exception("assistant: answer failed")
        yield _event({"type": "error", "message": "answer_failed"})
        return
    full = "".join(parts)
    cut = full.find(TAIL_DELIMITER)
    answer = (full[:cut] if cut != -1 else full).rstrip()
    suggestions = _parse_suggestions(full[cut + len(TAIL_DELIMITER) :]) if cut != -1 else []
    if len(answer) > emitted:
        yield _event({"type": "delta", "text": answer[emitted:]})
    extras = None
    if on_complete is not None and done_info is not None:
        try:
            extras = on_complete({**done_info, "answer": answer, "suggestions": suggestions})
        except Exception:
            logger.exception("assistant: completion hook failed")
    yield _event({"type": "done", "suggestions": suggestions, **(extras or {})})
```

Persona additions — append this exact block (as a continuation of the Rules list) to `_PERSONA` and `_VISITOR_PERSONA` in `help_bot.py` and `_PERSONA_TEMPLATE` in `student_bot.py`:

```
- After your answer, output on a new line exactly this format:
|||SUGGESTIONS ["question 1","question 2"]
with 2-3 short follow-up questions (under 60 characters each) the user \
would plausibly ask next, in the user's language, answerable from the \
knowledge above. Output nothing after that line.
```

Bump `PROMPT_VERSION = 3` in `help_bot.py:26` and `PROMPT_VERSION = 2` in `student_bot.py:21`. In `base.py`, change the student-bot default: `STUDENT_BOT_MAX_OUTPUT_TOKENS = int(os.environ.get("STUDENT_BOT_MAX_OUTPUT_TOKENS", "700"))` (tail headroom — a truncated tail degrades to no chips).

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_assistant_suggestions.py apps/core/tests/test_assistant.py apps/tenant_config/tests -v`
Expected: PASS — including v1 kernel tests (`done` gaining `suggestions` must not break them; if a v1 test asserts the exact done payload, extend its expectation to include `"suggestions": []`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core backend/apps/tenant_config backend/config/settings/base.py
git commit -m "feat(assistant): same-call follow-up suggestions — kernel tail parser, persona contracts"
```

---

### Task 10: Viewer-aware student context

**Files:**
- Modify: `backend/apps/tenant_config/student_bot.py` (add `build_viewer_context`, persona rule)
- Modify: `backend/apps/tenant_config/assistant_views.py` (`assistant_chat` uses it — swap the v1 context line left in Task 5)
- Create: `backend/apps/tenant_config/tests/test_student_bot_viewer_context.py`

**Interfaces:**
- Consumes: `Enrollment` (`apps/courses/models.py:104`, has `is_active`), `PaymentItem`/`Payment`/`Subscription` (`apps/billing/models/core.py`), the four live models (`apps/live/models.py`).
- Produces: `student_bot.build_viewer_context(user) -> str` — `<student_context>` block; anonymous → v1's flag-only line. Caps: 10 course titles, 10 download titles, 1 plan name, 5 upcoming live titles. Titles only — never emails/names/prices.
- `PROMPT_VERSION` stays 2 (bumped in Task 9; this ships in the same release).

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/tenant_config/tests/test_student_bot_viewer_context.py
"""Viewer context: signed-in students get owned-item titles in the first
user turn; anonymous viewers keep the v1 flag-only block."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Payment, PaymentItem, Subscription, SubscriptionPlan
from apps.courses.models import Course, Enrollment
from apps.downloads.models import DownloadFile
from apps.tenant_config import student_bot

pytestmark = pytest.mark.django_db


@pytest.fixture
def student(tenant_ctx):
    return User.objects.create_user(
        email="viewer@x.com", name="Vera Viewer", password="x", role="student"  # noqa: S106
    )


def _own(user, obj):
    payment = Payment.objects.create(
        student=user, payment_type="one_time", status="completed",
        amount=Decimal("10"), platform_fee=Decimal("1"), submerchant_payout=Decimal("9"),
        currency="USD", provider="bypass",
    )
    PaymentItem.objects.create(
        payment=payment, content_type=ContentType.objects.get_for_model(type(obj)),
        object_id=obj.id, item_price=Decimal("10"), submerchant_payout=Decimal("9"),
    )


def test_anonymous_keeps_flag_only(tenant_ctx):
    assert student_bot.build_viewer_context(None) == "<student_context>signed in: no</student_context>"


def test_owned_items_listed_without_pii(tenant_ctx, student):
    course = Course.objects.create(title="Yoga Basics", slug="yoga-basics", is_published=True)
    Enrollment.objects.create(user=student, course=course)
    dl = DownloadFile.objects.create(title="Meal Plan PDF", price=Decimal("5"), pricing_type="paid")
    _own(student, dl)
    plan = SubscriptionPlan.objects.create(name="Pro Monthly", price=Decimal("20"), billing_interval_months=1)
    Subscription.objects.create(
        student=student, plan=plan, status="active",
        current_period_start=timezone.now(), current_period_end=timezone.now() + timedelta(days=30),
    )
    ctx = student_bot.build_viewer_context(student)
    assert "signed in: yes" in ctx
    assert "enrolled courses: Yoga Basics" in ctx
    assert "owned downloads: Meal Plan PDF" in ctx
    assert "membership: Pro Monthly" in ctx
    assert "viewer@x.com" not in ctx and "Vera" not in ctx


def test_caps_at_ten_courses(tenant_ctx, student):
    for i in range(12):
        c = Course.objects.create(title=f"C{i}", slug=f"c-{i}", is_published=True)
        Enrollment.objects.create(user=student, course=c)
    ctx = student_bot.build_viewer_context(student)
    assert ctx.count("C1") >= 1 and len(ctx.split("enrolled courses: ")[1].split("\n")[0].split("; ")) == 10


def test_inactive_enrollment_and_refund_excluded(tenant_ctx, student):
    c = Course.objects.create(title="Gone", slug="gone", is_published=True)
    Enrollment.objects.create(user=student, course=c, is_active=False)
    ctx = student_bot.build_viewer_context(student)
    assert "Gone" not in ctx
```

(If `Course.objects.create` needs more required fields at implementation time, mirror the factory usage in `apps/courses/tests/` — adjust the fixture, not the assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_student_bot_viewer_context.py -v`
Expected: FAIL — `AttributeError: build_viewer_context`.

- [ ] **Step 3: Implement** (append to `student_bot.py`)

```python
VIEWER_MAX_COURSES = 10
VIEWER_MAX_DOWNLOADS = 10
VIEWER_MAX_LIVE = 5


def _owned_ids(user, model):
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import PaymentItem

    return PaymentItem.objects.filter(
        content_type=ContentType.objects.get_for_model(model),
        payment__student=user,
        payment__status__in=("completed", "partially_refunded"),
        is_refunded=False,
    ).values_list("object_id", flat=True)


def build_viewer_context(user):
    """First-user-turn context block (v2 spec §8). Titles only — the system
    prompt stays byte-stable; per-viewer state must never enter it."""
    if user is None or not getattr(user, "is_authenticated", False):
        return "<student_context>signed in: no</student_context>"
    from apps.billing.models import Subscription
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

    lines = ["<student_context>", "signed in: yes"]
    courses = list(
        Course.objects.filter(enrollments__user=user, enrollments__is_active=True)
        .values_list("title", flat=True)
        .order_by("title")[:VIEWER_MAX_COURSES]
    )
    if courses:
        lines.append("enrolled courses: " + "; ".join(courses))
    downloads = list(
        DownloadFile.objects.filter(pk__in=_owned_ids(user, DownloadFile))
        .values_list("title", flat=True)
        .order_by("title")[:VIEWER_MAX_DOWNLOADS]
    )
    if downloads:
        lines.append("owned downloads: " + "; ".join(downloads))
    plan = (
        Subscription.objects.filter(student=user, status="active", current_period_end__gt=timezone.now())
        .values_list("plan__name", flat=True)
        .first()
    )
    if plan:
        lines.append(f"membership: {plan}")
    upcoming = []
    now = timezone.now()
    for model in (LiveClass, LiveStream, ZoomClass, OnsiteEvent):
        for e in model.objects.filter(pk__in=_owned_ids(user, model), scheduled_at__gte=now):
            upcoming.append((e.scheduled_at, e.title))
    for when, title in sorted(upcoming)[:VIEWER_MAX_LIVE]:
        lines.append(f"upcoming live session: {title} ({when:%Y-%m-%d %H:%M} UTC)")
    lines.append("</student_context>")
    return "\n".join(lines)
```

Persona rule — append to `_PERSONA_TEMPLATE`'s Rules (before the suggestions rule added in Task 9):

```
- If <student_context> lists items the person already owns, don't sell \
those again — help them use what they own and point them to /dashboard or \
the item's page.
```

In `assistant_views.py:assistant_chat`, replace the v1 context expression with `student_bot.build_viewer_context(user)` (Task 5's listing already shows the final form). The preview endpoint keeps `"<student_context>signed in: no</student_context>"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_student_bot_viewer_context.py apps/tenant_config/tests/test_student_bot.py apps/tenant_config/tests/test_assistant_public_api.py -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config
git commit -m "feat(student-bot): viewer-aware context — owned items in the first user turn, no PII"
```

---

### Task 11: Coach link registry — `AssistantLink`

**Files:**
- Modify: `backend/apps/tenant_config/models.py` (`AssistantLink`)
- Create: `backend/apps/tenant_config/migrations/00XX_assistantlink.py` (generated)
- Modify: `backend/apps/tenant_config/student_bot.py` (LINKS pack section + persona whitelist rule)
- Modify: `backend/apps/tenant_config/assistant_views.py` (status `link_whitelist`, links CRUD)
- Modify: `backend/apps/tenant_config/urls.py`
- Create: `backend/apps/tenant_config/tests/test_assistant_links.py`

**Interfaces:**
- Produces:
  - `AssistantLink` (tenant schema): `label` (char 60), `url` (char 500 — `/path` or `https://…` only), `note` (char 160 blank), `enabled` (default True), `position` (int default 0), timestamps; `MAX_LINKS = 20`; `ordering = ["position", "id"]`.
  - Knowledge pack gains a `LINKS` section (enabled rows) → `kb_hash` changes when links change (auto cache-invalidation, Task 14).
  - `GET /api/v1/assistant/status/` gains `"link_whitelist": [absolute https URLs of enabled links]` (same-site paths need no whitelist — widgets already allow them).
  - `GET/POST /api/v1/admin/assistant/links/`, `PATCH/DELETE /api/v1/admin/assistant/links/<pk>/` (`IsCoachOrOwner`) — payload `{id, label, url, note, enabled, position}`; validation errors 400 `{field: message}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/tenant_config/tests/test_assistant_links.py
"""Coach link registry: validation, knowledge-pack LINKS section, status
whitelist. Reuses the coach_client/tenant_client/paid_tenant scaffolding
from test_assistant_takeover.py (unique names: plan "Assistant Links Test
Paid", owner assistant-links-owner@x.com, coach links-coach@x.com)."""
```

Tests (full bodies):

```python
class TestLinkCrud:
    def test_create_valid_and_reject_bad_schemes(self, coach_client):
        ok = coach_client.post(
            "/api/v1/admin/assistant/links/",
            {"label": "My Instagram", "url": "https://instagram.com/coach", "note": "social"},
            format="json",
        )
        assert ok.status_code == 201
        for bad in ("http://x.com", "javascript:alert(1)", "//evil.com", "ftp://x", "instagram.com"):
            res = coach_client.post(
                "/api/v1/admin/assistant/links/", {"label": "x", "url": bad}, format="json"
            )
            assert res.status_code == 400, bad

    def test_same_site_path_allowed(self, coach_client):
        assert coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "Store", "url": "/store"}, format="json"
        ).status_code == 201

    def test_cap_of_20(self, coach_client):
        for i in range(20):
            coach_client.post(
                "/api/v1/admin/assistant/links/", {"label": f"L{i}", "url": f"https://x.com/{i}"}, format="json"
            )
        assert coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "over", "url": "https://x.com/over"}, format="json"
        ).status_code == 400


class TestPackAndWhitelist:
    def test_links_enter_pack_and_hash(self, tenant_ctx, coach_client):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        before, hash_before = student_bot.build_system_prompt(tenant_ctx, config)
        coach_client.post(
            "/api/v1/admin/assistant/links/",
            {"label": "Book a call", "url": "https://calendly.com/coach", "note": "1:1 intro"},
            format="json",
        )
        after, hash_after = student_bot.build_system_prompt(tenant_ctx, config)
        assert "LINKS (approved extra links" in after
        assert "Book a call: https://calendly.com/coach — 1:1 intro" in after
        assert hash_before != hash_after

    def test_status_whitelist_only_external_enabled(self, tenant_client, coach_client, paid_tenant):
        coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "IG", "url": "https://instagram.com/c"}, format="json"
        )
        coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "Store", "url": "/store"}, format="json"
        )
        off = coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "Off", "url": "https://off.com"}, format="json"
        ).json()
        coach_client.patch(
            f"/api/v1/admin/assistant/links/{off['id']}/", {"enabled": False}, format="json"
        )
        wl = tenant_client.get("/api/v1/assistant/status/").json()["link_whitelist"]
        assert wl == ["https://instagram.com/c"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_links.py -v`
Expected: FAIL — 404 routes / missing model.

- [ ] **Step 3: Implement**

`models.py` (after `AssistantKnowledgeEntry`):

```python
class AssistantLink(models.Model):
    """Coach-approved links the site assistant may offer (v2 spec §9).
    External https URLs allowed (D4) — the coach already controls every
    link on their own site; widgets still hard-validate against the
    status endpoint's whitelist."""

    MAX_LINKS = 20

    label = models.CharField(max_length=60)
    url = models.CharField(max_length=500)
    note = models.CharField(max_length=160, blank=True, default="")
    enabled = models.BooleanField(default=True)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]
```

`make makemigrations && make migrate`.

`student_bot.py` — in `build_system_prompt`, after the CATALOG lines and before the coach-notes block:

```python
    from .models import AssistantLink

    links = list(AssistantLink.objects.filter(enabled=True)[: AssistantLink.MAX_LINKS])
    if links:
        parts.append("LINKS (approved extra links you may share when relevant):")
        for link in links:
            parts.append(f"- {link.label}: {link.url}" + (f" — {link.note}" if link.note else ""))
```

Persona whitelist rule — extend the existing link rule in `_PERSONA_TEMPLATE` to: `…whose target appears in site_knowledge's PAGES list, item URLs, or LINKS entries, e.g. [See the course](/courses/yoga-basics). LINKS targets may be external websites; never link anywhere else.` (`PROMPT_VERSION` stays 2.)

`assistant_views.py` — `_status_payload` gains:

```python
        "link_whitelist": [
            link.url
            for link in AssistantLink.objects.filter(enabled=True).order_by("position", "id")[
                : AssistantLink.MAX_LINKS
            ]
            if link.url.startswith("https://")
        ],
```

Validation helper + CRUD views (mirror the knowledge pair):

```python
def _validate_link(data, partial=False):
    from urllib.parse import urlparse

    errors = {}
    if not partial or "label" in data:
        label = str(data.get("label") or "").strip()
        if not label or len(label) > 60:
            errors["label"] = "1-60 characters"
    if not partial or "url" in data:
        url = str(data.get("url") or "").strip()
        if len(url) > 500:
            errors["url"] = "at most 500 characters"
        elif url.startswith("/") and not url.startswith("//"):
            pass  # same-site path
        else:
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc:
                errors["url"] = "must be a same-site path (/…) or an https:// URL"
    if "note" in data and len(str(data.get("note") or "")) > 160:
        errors["note"] = "at most 160 characters"
    return errors
```

`assistant_links` (GET list / POST create with the `MAX_LINKS` cap check) and `assistant_link_detail` (PATCH fields `label|url|note|enabled|position`, DELETE) follow `assistant_knowledge`/`assistant_knowledge_detail` line for line (payload helper `_link_payload(link) = {"id", "label", "url", "note", "enabled", "position"}`). URLs:

```python
    path("assistant/links/", assistant_links, name="assistant-links"),
    path("assistant/links/<int:pk>/", assistant_link_detail, name="assistant-link-detail"),
```

- [ ] **Step 4: Run tests, migration check**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_assistant_links.py apps/tenant_config/tests/test_student_bot.py -v` → PASS. `make test-fresh` — green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config
git commit -m "feat(assistant): coach link registry — LINKS pack section, status whitelist, CRUD"
```

---

### Task 12: Real client IP — `client_ip()` + throttle re-key

**Files:**
- Create: `backend/apps/core/net.py`
- Modify: `backend/apps/core/throttling.py` (`ClientIpAnonThrottle` base; existing classes re-based)
- Modify: `backend/apps/tenant_config/assistant_views.py`, `backend/apps/core/help/views.py`, `backend/apps/core/assistant_views.py` (AI anon throttles inherit the new base)
- Create: `backend/apps/core/tests/test_client_ip.py`

**Interfaces:**
- Produces:
  - `apps.core.net.client_ip(request) -> str` — `CF-Connecting-IP` → first `X-Forwarded-For` hop → `REMOTE_ADDR`. Trusted because the prod origin is only reachable through the Cloudflare tunnel (no published ports).
  - `apps.core.throttling.ClientIpAnonThrottle(AnonRateThrottle)` — `get_ident` returns `client_ip(request)`; ALL AI anon throttles re-base onto it: `AiThreadThrottle`, `AiHumanMessageThrottle`, `AiHumanRequestThrottle` (throttling.py), `StudentBotBurstThrottle`, `StudentBotDayThrottle` (assistant_views.py), `HelpPublicBurstThrottle`, `HelpPublicDayThrottle` (help/views.py), `AiRateThrottle` (assistant_views.py in core). User-keyed throttles are untouched.
  - Fixes the latent prod bug: behind Cloudflare→tunnel→Caddy every anon requester shared one `REMOTE_ADDR` bucket.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/core/tests/test_client_ip.py
"""client_ip precedence + throttle identity keying."""

from django.test import RequestFactory

from apps.core.net import client_ip
from apps.core.throttling import AiThreadThrottle


def test_precedence_cf_then_xff_then_remote():
    rf = RequestFactory()
    r = rf.get("/", HTTP_CF_CONNECTING_IP="1.2.3.4", HTTP_X_FORWARDED_FOR="9.9.9.9, 8.8.8.8", REMOTE_ADDR="10.0.0.1")
    assert client_ip(r) == "1.2.3.4"
    r = rf.get("/", HTTP_X_FORWARDED_FOR="9.9.9.9, 8.8.8.8", REMOTE_ADDR="10.0.0.1")
    assert client_ip(r) == "9.9.9.9"
    r = rf.get("/", REMOTE_ADDR="10.0.0.1")
    assert client_ip(r) == "10.0.0.1"


def test_throttle_ident_uses_client_ip():
    rf = RequestFactory()
    r = rf.get("/", HTTP_CF_CONNECTING_IP="1.2.3.4", REMOTE_ADDR="10.0.0.1")
    r.user = None
    assert AiThreadThrottle().get_ident(r) == "1.2.3.4"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_client_ip.py -v`
Expected: FAIL — `ModuleNotFoundError: apps.core.net`.

- [ ] **Step 3: Implement**

`backend/apps/core/net.py`:

```python
"""Client-IP resolution behind the Cloudflare tunnel.

Prod topology: Cloudflare edge → cloudflared tunnel → Caddy → Django, with
no published origin ports — so CF-Connecting-IP cannot be spoofed end-to-end.
Dev hits REMOTE_ADDR directly."""


def client_ip(request):
    cf = request.META.get("HTTP_CF_CONNECTING_IP")
    if cf:
        return cf.strip()
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")
```

`backend/apps/core/throttling.py` — add the base and re-base the three local classes:

```python
from apps.core.net import client_ip


class ClientIpAnonThrottle(AnonRateThrottle):
    """AnonRateThrottle keyed on the REAL client IP (CF-Connecting-IP aware).
    Behind the tunnel every request shares REMOTE_ADDR — without this, all
    anonymous users share one rate bucket."""

    def get_ident(self, request):
        return client_ip(request) or super().get_ident(request)
```

Change `AiThreadThrottle`/`AiHumanMessageThrottle`/`AiHumanRequestThrottle` to inherit `ClientIpAnonThrottle`. In `assistant_views.py` (tenant_config), `help/views.py`, and `assistant_views.py` (core): change each `AnonRateThrottle` AI subclass listed in Interfaces to inherit `ClientIpAnonThrottle` (import from `apps.core.throttling`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_client_ip.py apps/tenant_config/tests apps/core/tests -v` → PASS (throttle scopes/rates unchanged, only identity keying).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core backend/apps/tenant_config
git commit -m "fix(throttling): key anonymous AI throttles on the real client IP (CF-Connecting-IP)"
```

### Task 13: IP blocklist — `AiIpBlock`, guard, auto-block, adminkit

**Files:**
- Modify: `backend/apps/core/models.py` (`AiIpBlock`)
- Create: `backend/apps/core/migrations/00XX_aiipblock.py` (generated)
- Create: `backend/apps/core/ipblock.py`
- Modify: `backend/apps/core/throttling.py` (denial counting in `ClientIpAnonThrottle`)
- Modify: `backend/apps/core/admin_panels.py` (+ expected-keys test `backend/apps/adminkit/tests/test_adminkit.py:258-276`)
- Modify: `backend/apps/tenant_config/assistant_views.py`, `backend/apps/core/help/views.py`, `backend/apps/core/assistant_views.py` (guards)
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/core/tests/test_ai_ip_block.py`

**Interfaces:**
- Produces:
  - `AiIpBlock` (public): `ip` (GenericIPAddressField unique), `reason` (char 200 blank), `source` (char 8, `manual|auto`, default manual), `expires_at` (null = forever), `created_at`.
  - `apps.core.ipblock.blocked_response(request) -> Response | None` — 403 `{"detail": "blocked"}` when `client_ip` is actively blocked; 60s cached blocklist set (key `"ai-ip-blocklist"`).
  - `apps.core.ipblock.record_throttle_denial(ip)` — Redis counter (24h TTL, key `f"aiblock:{ip}"`); at `AI_IP_AUTOBLOCK_THRESHOLD` creates an auto block expiring in `AI_IP_AUTOBLOCK_DAYS` days and invalidates the blocklist cache.
  - `ClientIpAnonThrottle.allow_request` counts every denial — auto-block piggybacks on ALL AI anon throttles.
  - Guard line at the top of every public AI view: `assistant_status`, `assistant_chat`, `assistant_thread`, `assistant_human_message`, `assistant_human_request`, `help_bot_public_*` (all five), `rate_answer`.
  - Settings: `AI_IP_AUTOBLOCK_THRESHOLD = 5`, `AI_IP_AUTOBLOCK_DAYS = 7`.
  - Adminkit: writable registration key `"ai-ip-blocks"` (PlatformKbEntry pattern) — the expected-keys set in `test_adminkit.py` gains `"ai-ip-blocks"`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/core/tests/test_ai_ip_block.py
"""IP blocklist: guard 403s, expiry, auto-block threshold."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core import ipblock
from apps.core.models import AiIpBlock

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.delete(ipblock.BLOCKLIST_CACHE_KEY)
    yield
    cache.clear()


def test_blocked_ip_gets_403_everywhere():
    AiIpBlock.objects.create(ip="6.6.6.6", source="manual")
    client = APIClient(REMOTE_ADDR="6.6.6.6")
    assert client.get("/api/v1/help/status/").status_code == 403
    assert client.post("/api/v1/help/chat/", {"messages": []}, format="json").status_code == 403
    assert client.post("/api/v1/ai/rate/", {}, format="json").status_code == 403


def test_expired_block_is_ignored():
    AiIpBlock.objects.create(ip="6.6.6.7", expires_at=timezone.now() - timedelta(hours=1))
    assert APIClient(REMOTE_ADDR="6.6.6.7").get("/api/v1/help/status/").status_code == 200


def test_auto_block_after_threshold(settings):
    settings.AI_IP_AUTOBLOCK_THRESHOLD = 5
    for _ in range(4):
        ipblock.record_throttle_denial("7.7.7.7")
    assert not AiIpBlock.objects.filter(ip="7.7.7.7").exists()
    ipblock.record_throttle_denial("7.7.7.7")
    row = AiIpBlock.objects.get(ip="7.7.7.7")
    assert row.source == "auto" and row.expires_at is not None


def test_cf_header_beats_remote_addr():
    AiIpBlock.objects.create(ip="1.2.3.4")
    client = APIClient(REMOTE_ADDR="10.0.0.1", HTTP_CF_CONNECTING_IP="1.2.3.4")
    assert client.get("/api/v1/help/status/").status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_ip_block.py -v`
Expected: FAIL — `ImportError` / 200s where 403 expected.

- [ ] **Step 3: Implement**

`models.py`:

```python
class AiIpBlock(models.Model):
    """Per-IP ban for the public AI endpoints (v2 spec §10.2). Manual rows
    via the superadmin panel; auto rows from repeated throttle denials."""

    ip = models.GenericIPAddressField(unique=True)
    reason = models.CharField(max_length=200, blank=True, default="")
    source = models.CharField(max_length=8, choices=[("manual", "manual"), ("auto", "auto")], default="manual")
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.ip
```

`make makemigrations && make migrate`.

`backend/apps/core/ipblock.py`:

```python
"""IP blocklist enforcement for the public AI endpoints."""

import logging

from django.core.cache import cache

from apps.core.net import client_ip

logger = logging.getLogger(__name__)

BLOCKLIST_CACHE_KEY = "ai-ip-blocklist"
BLOCKLIST_TTL = 60
DENIAL_KEY = "aiblock:{ip}"
DENIAL_TTL = 60 * 60 * 24


def _active_blocklist():
    blocklist = cache.get(BLOCKLIST_CACHE_KEY)
    if blocklist is None:
        from django.db.models import Q
        from django.utils import timezone

        from apps.core.models import AiIpBlock

        blocklist = set(
            AiIpBlock.objects.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())).values_list(
                "ip", flat=True
            )
        )
        cache.set(BLOCKLIST_CACHE_KEY, blocklist, timeout=BLOCKLIST_TTL)
    return blocklist


def blocked_response(request):
    """One cache hit per request; returns the 403 to short-circuit with, or
    None. Call first thing in every public AI view."""
    from rest_framework.response import Response

    ip = client_ip(request)
    if ip and ip in _active_blocklist():
        return Response({"detail": "blocked"}, status=403)
    return None


def record_throttle_denial(ip):
    """Redis counter per denied IP; trips an auto-block at the threshold."""
    from datetime import timedelta

    from django.conf import settings
    from django.utils import timezone

    if not ip:
        return
    key = DENIAL_KEY.format(ip=ip)
    cache.add(key, 0, timeout=DENIAL_TTL)
    try:
        count = cache.incr(key)
    except ValueError:
        count = 1
    if count >= settings.AI_IP_AUTOBLOCK_THRESHOLD:
        from apps.core.models import AiIpBlock

        AiIpBlock.objects.get_or_create(
            ip=ip,
            defaults={
                "reason": "auto: repeated throttle denials",
                "source": "auto",
                "expires_at": timezone.now() + timedelta(days=settings.AI_IP_AUTOBLOCK_DAYS),
            },
        )
        cache.delete(key)
        cache.delete(BLOCKLIST_CACHE_KEY)
        logger.warning("ai ipblock: auto-blocked %s", ip)
```

`throttling.py` — add to `ClientIpAnonThrottle`:

```python
    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        if not allowed:
            from apps.core.ipblock import record_throttle_denial

            record_throttle_denial(client_ip(request))
        return allowed
```

Guards — first line of each view body listed in Interfaces:

```python
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
```

(with `from apps.core import ipblock` imported per module).

`admin_panels.py` (import `AiIpBlock`; after the `PlatformKbEntryAdmin` block):

```python
@platform_site.register(AiIpBlock)
class AiIpBlockAdmin(ModelAdmin):
    key = "ai-ip-blocks"
    icon = "ban"
    description = "IPs banned from the AI endpoints — manual rows here, auto rows from repeated throttle denials."
    list_display = ("ip", "source", "reason", "expires_at", "created_at")
    search_fields = ("ip", "reason")
    list_filters = ("source",)
    ordering = ("-created_at",)
    fields = ("ip", "reason", "source", "expires_at")
```

Update the expected-keys assertion in `apps/adminkit/tests/test_adminkit.py:258-276`: add `"ai-ip-blocks"` to the set. Settings:

```python
AI_IP_AUTOBLOCK_THRESHOLD = int(os.environ.get("AI_IP_AUTOBLOCK_THRESHOLD", "5"))
AI_IP_AUTOBLOCK_DAYS = int(os.environ.get("AI_IP_AUTOBLOCK_DAYS", "7"))
```

- [ ] **Step 4: Run tests, migration check**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_ip_block.py apps/adminkit/tests/test_adminkit.py apps/core/tests/test_ai_admin_registrations.py -v` → PASS. `make test-fresh` — green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core backend/apps/adminkit backend/apps/tenant_config backend/config/settings/base.py
git commit -m "feat(hardening): AI IP blocklist with auto-block on repeated throttle denials"
```

---

### Task 14: Answer cache + per-session daily cap

**Files:**
- Modify: `backend/apps/core/assistant.py` (`answer_cache_key`, `replay_cached`, `session_over_daily_cap`)
- Modify: `backend/apps/tenant_config/student_bot.py`, `backend/apps/tenant_config/help_bot.py` (cache in `sse_events`)
- Modify: `backend/apps/tenant_config/assistant_views.py`, `backend/apps/core/help/views.py` (session cap check)
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/core/tests/test_ai_cost_guards.py`

**Interfaces:**
- Produces:
  - `assistant.answer_cache_key(feature, audience, prompt_version, kb_fingerprint, question) -> str` — `"ai-answer:" + sha256("feature|audience|version|fingerprint|normalized")`, normalization = whitespace-collapse + casefold.
  - `assistant.replay_cached(cached, on_complete) -> Iterator[str]` — replays `{"answer", "suggestions", "model"}` as one delta + done; calls `on_complete({"cost_usd": Decimal("0"), "provider": "cache", "model": …, "answer": …, "suggestions": …})` (same contract as `run_chat`).
  - `assistant.session_over_daily_cap(session_id) -> bool` — Redis counter `f"ai-sess:{session_id}:{YYYYMMDD}"`, increments per call, True when over `settings.ASSISTANT_SESSION_DAILY_QUESTIONS`.
  - Both bots' `sse_events`: on a FIRST-TURN question (`len(history) == 1`) consult the cache — hit replays with a transcript row (`provider="cache"`, cost 0, **no** usage accrual, **no** question count) + thread messages; miss populates after success. Student fingerprint = `kb_hash`; help fingerprint = `_addenda_state(audience)[0]`.
  - Chat views: order becomes human short-circuit → **session cap** (`{"enabled": False, "reason": "session_limit"}`) → availability → stream. Cap applies to `assistant_chat` + `help_bot_public_chat` (anon-facing) only.
  - Settings: `AI_ANSWER_CACHE_TTL = 60*60*24`, `ASSISTANT_SESSION_DAILY_QUESTIONS = 40`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/core/tests/test_ai_cost_guards.py
"""Answer cache (free repeat first-turn answers) + per-session daily cap."""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache

from apps.core import assistant

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.clear()
    yield
    cache.clear()


def test_cache_key_normalizes_and_fingerprints():
    a = assistant.answer_cache_key("student_bot", "student", 2, "abc", "  What   COURSES? ")
    b = assistant.answer_cache_key("student_bot", "student", 2, "abc", "what courses?")
    c = assistant.answer_cache_key("student_bot", "student", 2, "OTHER", "what courses?")
    assert a == b != c and a.startswith("ai-answer:")


def test_replay_cached_contract():
    seen = {}
    frames = list(
        assistant.replay_cached(
            {"answer": "cached!", "suggestions": ["more?"], "model": "m"},
            lambda info: seen.update(info) or {"transcript_id": 9},
        )
    )
    assert seen["provider"] == "cache" and seen["cost_usd"] == Decimal("0")
    assert '"cached!"' in frames[0] and '"transcript_id": 9' in frames[-1]


def test_session_daily_cap(settings):
    settings.ASSISTANT_SESSION_DAILY_QUESTIONS = 3
    assert not any(assistant.session_over_daily_cap("s1") for _ in range(3))
    assert assistant.session_over_daily_cap("s1") is True
    assert assistant.session_over_daily_cap("other") is False
    assert assistant.session_over_daily_cap("") is False
```

End-to-end cache test (append to `apps/tenant_config/tests/test_assistant_thread_api.py`):

```python
class TestAnswerCache:
    def test_second_identical_question_serves_from_cache(self, tenant_client, paid_tenant):
        _sse_body(_chat(tenant_client, session_id="c-1", text="what courses?"))
        before = student_bot.tenant_usage(paid_tenant.schema_name).questions

        def explode(**kwargs):
            raise AssertionError("model must not be called on a cache hit")

        with (
            patch.object(student_bot.core_ai, "available", return_value=(True, "ok")),
            patch.object(assistant.core_ai, "stream_text", explode),
        ):
            res = tenant_client.post(
                "/api/v1/assistant/chat/",
                {"messages": [{"role": "user", "content": "what courses?"}], "session_id": "c-2"},
                format="json",
            )
            body = _sse_body(res)
        assert "hello" in body  # the cached answer
        from apps.core.models import AiTranscript

        with schema_context("public"):
            assert AiTranscript.objects.filter(provider="cache").count() == 1
            assert student_bot.tenant_usage(paid_tenant.schema_name).questions == before
```

Session-cap test (same file):

```python
    def test_session_limit_reason(self, tenant_client, paid_tenant, settings):
        settings.ASSISTANT_SESSION_DAILY_QUESTIONS = 0
        res = _chat(tenant_client, session_id="cap-1")
        assert res.status_code == 200 and res.json() == {"enabled": False, "reason": "session_limit"}
```

(Add `from django.core.cache import cache` + a `cache.clear()` line to that file's autouse fixture so cache state never leaks between tests.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_cost_guards.py apps/tenant_config/tests/test_assistant_thread_api.py -v`
Expected: FAIL — missing kernel functions; second question hits the model.

- [ ] **Step 3: Implement**

Kernel (append to `assistant.py`; `import hashlib` at top):

```python
# ── Cost guards (v2 spec §10.3-10.4) ────────────────────────────────────────


def answer_cache_key(feature, audience, prompt_version, kb_fingerprint, question):
    norm = " ".join(str(question or "").split()).casefold()
    digest = hashlib.sha256(f"{feature}|{audience}|{prompt_version}|{kb_fingerprint}|{norm}".encode()).hexdigest()
    return f"ai-answer:{digest}"


def replay_cached(cached, on_complete):
    """Serve a cached first-turn answer over the same SSE wire — zero model
    cost, still audited (the hook writes a provider="cache" transcript)."""
    from decimal import Decimal

    yield _event({"type": "delta", "text": cached["answer"]})
    extras = None
    if on_complete is not None:
        try:
            extras = on_complete(
                {
                    "cost_usd": Decimal("0"),
                    "provider": "cache",
                    "model": cached.get("model", ""),
                    "answer": cached["answer"],
                    "suggestions": cached.get("suggestions") or [],
                }
            )
        except Exception:
            logger.exception("assistant: cached completion hook failed")
    yield _event({"type": "done", "suggestions": cached.get("suggestions") or [], **(extras or {})})


def session_over_daily_cap(session_id):
    from datetime import UTC, datetime

    from django.conf import settings
    from django.core.cache import cache

    sid = (session_id or "").strip()[:36]
    if not sid:
        return False
    key = f"ai-sess:{sid}:{datetime.now(UTC):%Y%m%d}"
    cache.add(key, 0, timeout=60 * 60 * 24)
    try:
        count = cache.incr(key)
    except ValueError:
        count = 1
    return count > settings.ASSISTANT_SESSION_DAILY_QUESTIONS
```

`student_bot.sse_events` — restructure to:

```python
def sse_events(history, tenant, month, question="", session_id="", is_preview=False, conversation=None):
    from django.conf import settings as dj_settings
    from django.core.cache import cache

    from .models import TenantConfig

    config = TenantConfig.objects.first()
    system, kb_hash = build_system_prompt(tenant, config)
    cache_key = (
        assistant.answer_cache_key("student_bot", "student", PROMPT_VERSION, kb_hash, question)
        if len(history) == 1 and not is_preview
        else None
    )

    def on_complete(info):
        cached_hit = info["provider"] == "cache"
        if not cached_hit:
            try:
                record_question(tenant.schema_name, info["cost_usd"], month=month, count_question=not is_preview)
            except Exception:
                import logging

                logging.getLogger(__name__).exception("student bot: usage recording failed")
            if cache_key:
                cache.set(
                    cache_key,
                    {"answer": info["answer"], "suggestions": info.get("suggestions") or [], "model": info["model"]},
                    timeout=dj_settings.AI_ANSWER_CACHE_TTL,
                )
        row = assistant.log_transcript(
            feature="student_bot",
            audience="student",
            tenant_schema=tenant.schema_name,
            session_id=session_id,
            question=question,
            answer=info["answer"],
            cost_usd=info["cost_usd"],
            provider=info["provider"],
            model=info["model"],
            prompt_version=PROMPT_VERSION,
            kb_hash=kb_hash,
            is_preview=is_preview,
        )
        assistant.append_message(conversation, "assistant", info["answer"], transcript_id=row.id if row else None)
        if row is None:
            return None
        return {"transcript_id": row.id, "rate_token": assistant.rate_token(row.id)}

    if cache_key:
        cached = cache.get(cache_key)
        if cached is not None:
            return assistant.replay_cached(cached, on_complete)
    return assistant.run_chat(
        system=system,
        history=history,
        model=dj_settings.STUDENT_BOT_MODEL,
        max_tokens=dj_settings.STUDENT_BOT_MAX_OUTPUT_TOKENS,
        on_complete=on_complete,
    )
```

`help_bot.sse_events` — same pattern: `fingerprint, _ = _addenda_state(audience)`; `cache_key = assistant.answer_cache_key("help_bot", audience, PROMPT_VERSION, fingerprint, question) if len(history) == 1 else None`; skip `record_question` + population on `provider == "cache"`.

Views — in `assistant_chat` and `help_bot_public_chat`, directly after the human short-circuit:

```python
    if assistant.session_over_daily_cap(session_id):
        return Response({"enabled": False, "reason": "session_limit"}, status=200)
```

Settings:

```python
AI_ANSWER_CACHE_TTL = int(os.environ.get("AI_ANSWER_CACHE_TTL", str(60 * 60 * 24)))
ASSISTANT_SESSION_DAILY_QUESTIONS = int(os.environ.get("ASSISTANT_SESSION_DAILY_QUESTIONS", "40"))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_ai_cost_guards.py apps/tenant_config/tests -v` → PASS (existing chat tests unaffected: their sessions are unique per test and the default cap is 40; watch for tests that reuse one session_id > 40 times — none exist today).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core backend/apps/tenant_config backend/config/settings/base.py
git commit -m "feat(hardening): first-turn answer cache + per-session daily question cap"
```

---

### Task 15: Student widget v2 — persistent session, polling, human mode, chips, external links

**Files:**
- Modify: `frontend-customer/src/lib/assistant.ts`
- Modify: `frontend-customer/src/components/assistant/site-assistant-bubble.tsx`
- Create: `frontend-customer/src/lib/__tests__/assistant-session.test.ts`
- Modify: `frontend-customer/messages/en/student.json`, `frontend-customer/messages/tr/student.json`

**Interfaces:**
- Consumes: Tasks 4–6, 9, 11, 14 endpoints.
- Produces (lib exports used by the bubble and tested by vitest):
  - `resolveSession(raw: string | null, now: number): { id: string; fresh: boolean }` (pure), `getSessionId(): string`, `touchSession(): void` — localStorage key `contentor.ai.session.assistant`, 24h idle rotation.
  - `ThreadMessage { id; role: "user"|"assistant"|"agent"|"system"; content; created_at }`, `ThreadPayload { session_id; status: "ai"|"human"; agent_label; human_requested; messages: ThreadMessage[] }`.
  - `fetchThread(after?: number): Promise<ThreadPayload | null>`, `sendHumanMessage(content: string): Promise<boolean>`, `requestHuman(): Promise<boolean>`.
  - `decideLink(href: string, origin: string, whitelist: string[]): "internal" | "external" | null` (pure).
  - `AnswerMeta` gains `suggestions?: string[]`; `AssistantStatus` gains `human_handoff: boolean`, `link_whitelist: string[]`, reason `"session_limit"`; `streamAssistantChat` returns `Promise<"ai" | "human">` (`"human"` = JSON `{"mode":"human"}` race response, message stored server-side).

- [ ] **Step 1: Write the failing vitest**

```ts
// frontend-customer/src/lib/__tests__/assistant-session.test.ts
import { describe, expect, it } from "vitest";

import { decideLink, resolveSession } from "@/lib/assistant";

const HOUR = 60 * 60 * 1000;

describe("resolveSession", () => {
  it("keeps a fresh stored id", () => {
    const raw = JSON.stringify({ id: "abc", ts: 1000 });
    expect(resolveSession(raw, 1000 + HOUR)).toEqual({ id: "abc", fresh: false });
  });
  it("rotates after 24h idle", () => {
    const raw = JSON.stringify({ id: "abc", ts: 0 });
    const out = resolveSession(raw, 25 * HOUR);
    expect(out.fresh).toBe(true);
    expect(out.id).not.toBe("abc");
  });
  it("survives garbage", () => {
    expect(resolveSession("{not json", 0).fresh).toBe(true);
    expect(resolveSession(null, 0).fresh).toBe(true);
  });
});

describe("decideLink", () => {
  const ORIGIN = "https://coach.contentor.app";
  const WL = ["https://instagram.com/coach"];
  it("same-site paths are internal", () => {
    expect(decideLink("/store", ORIGIN, WL)).toBe("internal");
  });
  it("whitelisted https is external", () => {
    expect(decideLink("https://instagram.com/coach", ORIGIN, WL)).toBe("external");
  });
  it("everything else is dropped", () => {
    expect(decideLink("https://evil.com", ORIGIN, WL)).toBeNull();
    expect(decideLink("//evil.com", ORIGIN, WL)).toBeNull();
    expect(decideLink("/\\evil.com", ORIGIN, WL)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend-customer && npm run test`
Expected: FAIL — `resolveSession`/`decideLink` not exported.

- [ ] **Step 3: Implement the lib**

In `frontend-customer/src/lib/assistant.ts` — replace the `sessionId` const (line ~27) with:

```ts
const SESSION_KEY = "contentor.ai.session.assistant";
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

/** Pure so vitest can cover rotation without a DOM. */
export function resolveSession(raw: string | null, now: number): { id: string; fresh: boolean } {
  try {
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; ts?: number };
      if (parsed.id && typeof parsed.ts === "number" && now - parsed.ts < SESSION_IDLE_MS) {
        return { id: parsed.id, fresh: false };
      }
    }
  } catch {
    // fall through to a fresh session
  }
  return { id: globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2), fresh: true };
}

let sessionId = "";

export function getSessionId(): string {
  if (sessionId) return sessionId;
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(SESSION_KEY);
  sessionId = resolveSession(raw, Date.now()).id;
  touchSession();
  return sessionId;
}

export function touchSession(): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: sessionId, ts: Date.now() }));
  } catch {
    // storage unavailable — session stays in-memory
  }
}
```

(Every existing `sessionId` reference in the file becomes `getSessionId()`.) Extend the types:

```ts
export interface AssistantStatus {
  enabled: boolean;
  reason: "ok" | "disabled" | "upgrade_required" | "budget" | "quota" | "session_limit";
  greeting: string;
  suggested_questions: string[];
  brand: string;
  human_handoff: boolean;
  link_whitelist: string[];
}

export interface AnswerMeta {
  transcriptId?: number;
  rateToken?: string;
  suggestions?: string[];
}

export interface ThreadMessage {
  id: number;
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  created_at: string;
}

export interface ThreadPayload {
  session_id: string;
  status: "ai" | "human";
  agent_label: string;
  human_requested: boolean;
  messages: ThreadMessage[];
}
```

New client functions:

```ts
export async function fetchThread(after = 0): Promise<ThreadPayload | null> {
  try {
    const res = await fetch(`/api/v1/assistant/thread/?session=${getSessionId()}&after=${after}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return (await res.json()) as ThreadPayload;
  } catch {
    return null;
  }
}

export async function sendHumanMessage(content: string): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/assistant/human-message/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ session_id: getSessionId(), content }),
    });
    touchSession();
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestHuman(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/assistant/human-request/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ session_id: getSessionId() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isSameOriginPath(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

/** Hard client-side link containment (v2 spec §9): same-origin paths render
 * as internal links; absolute URLs only when exactly whitelisted. */
export function decideLink(href: string, origin: string, whitelist: string[]): "internal" | "external" | null {
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) {
    return isSameOriginPath(href, origin) ? "internal" : null;
  }
  return whitelist.includes(href) ? "external" : null;
}
```

`streamAssistantChat` changes: return type `Promise<"ai" | "human">`; the JSON branch first checks `data.mode === "human"` → `touchSession(); return "human";` (before the existing gating throw); the `done` handler passes `suggestions: event.suggestions` into `onDone` (extend the parsed event type with `suggestions?: string[]`); the success path ends `touchSession(); return "ai";`.

- [ ] **Step 4: Rework the bubble**

`site-assistant-bubble.tsx` — targeted changes:

1. `type Msg = { role: "user" | "assistant" | "agent" | "system"; content: string; meta?: AnswerMeta; rated?: "up" | "down" }` (replaces the `ChatMessage &` intersection). New state: `mode: "ai" | "human"`, `agentLabel: string`, `humanRequested: boolean`, `followUps: string[]`; ref `lastIdRef = useRef(0)`; `LINK_RE` widened to `/\[([^\]]+)\]\((\/(?!\/)[^)\s]*|https:\/\/[^)\s]+)\)/g`; `AnswerBody` takes `whitelist: string[]` and uses `decideLink` — `"internal"` → `<Link>` pill (as today), `"external"` → `<a target="_blank" rel="noopener noreferrer">` pill with an `ExternalLink` icon, `null` → drop.

2. Hydration + polling effect:

```tsx
useEffect(() => {
  if (!open) return;
  let cancelled = false;
  const tick = async () => {
    const t = await fetchThread(lastIdRef.current);
    if (cancelled || !t) return;
    setMode(t.status);
    setAgentLabel(t.agent_label);
    setHumanRequested(t.human_requested);
    const incoming = t.messages.filter((m) => m.id > lastIdRef.current);
    if (!incoming.length) return;
    lastIdRef.current = incoming[incoming.length - 1].id;
    const initial = messagesRef.current.length === 0;
    const fresh = incoming
      .filter((m) => (initial ? true : m.role === "agent" || m.role === "system"))
      .map((m) => ({ role: m.role, content: m.content }) as Msg);
    if (fresh.length) setMessages((cur) => [...cur, ...fresh]);
  };
  void tick();
  const iv = setInterval(tick, mode === "human" || humanRequested ? 3000 : 5000);
  return () => {
    cancelled = true;
    clearInterval(iv);
  };
}, [open, mode, humanRequested]);
```

(`messagesRef` mirrors `messages` via a second effect — the standard ref-mirror pattern; on the initial hydration ALL roles replay the stored thread, on live ticks only `agent`/`system` rows append, because `user`/`assistant` are already local echoes.)

3. `send()` gains the human branch and chips wiring:

```tsx
if (mode === "human") {
  setMessages((cur) => [...cur, { role: "user", content: text }]);
  setFollowUps([]);
  if (!(await sendHumanMessage(text))) setError(t("error"));
  return;
}
```

AI branch: `setFollowUps([])` on send; `onDone` sets `meta` on the last message AND `setFollowUps(meta.suggestions ?? [])`; if `streamAssistantChat` resolves `"human"`, drop the assistant placeholder and `setMode("human")` (the poll will deliver replies).

4. Rendering additions: `system` messages render as centered muted text via a token map (`agent_joined:X` → `t("agentJoined", {name: X})`, `assistant_resumed` → `t("assistantResumed")`, `human_requested` → `t("humanRequestedLine")`, unknown tokens render nothing); `agent` messages render like assistant bubbles but prefixed with `agentLabel`; a human-mode notice bar under the header when `mode === "human"` (`t("humanModeNotice", {name: agentLabel})`); follow-up chips reuse the suggestion-pill JSX fed by `followUps` (rendered under the last assistant message when not `busy`, each with `data-testid="assistant-suggestion"` — the e2e spec selects on it); a "Talk to a human" text button above the input when `status.human_handoff && mode === "ai" && !humanRequested && messages.length > 0` — onClick: `requestHuman()` then `setHumanRequested(true)`; `reason === "session_limit"` from a chat send renders `t("sessionLimit")` like the other unavailable states.

5. i18n — add to `messages/en/student.json` under `student.assistant` (mirror in TR):

```json
"talkToHuman": "Talk to a human",
"humanRequestedLine": "You asked to talk to a human — {brand} has been notified.",
"agentJoined": "{name} joined the chat",
"assistantResumed": "The assistant is back",
"humanModeNotice": "You're chatting with {name}",
"sessionLimit": "You've reached today's chat limit. Come back tomorrow or use the contact page."
```

- [ ] **Step 5: Verify**

```bash
cd frontend-customer && npm run test && npx prettier --write src messages && npx tsc --noEmit
```
Expected: vitest green, tsc clean. Manual smoke with `make dev`: open a seeded paid tenant site → widget chats, reload page → history persists, chips appear after an answer.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src frontend-customer/messages
git commit -m "feat(widget): student assistant v2 — persistent session, polling, human mode, chips, external links"
```

### Task 16: Coach admin — Conversations tab, Links card, handoff toggle, preview chips

**Files:**
- Modify: `frontend-customer/src/lib/assistant.ts` (admin half)
- Create: `frontend-customer/src/components/admin/assistant/conversations-card.tsx`
- Create: `frontend-customer/src/components/admin/assistant/links-card.tsx`
- Delete: `frontend-customer/src/components/admin/assistant/transcripts-card.tsx`
- Modify: `frontend-customer/src/components/admin/assistant/enable-card.tsx`, `preview-chat-card.tsx`, `frontend-customer/src/app/admin/assistant/page.tsx`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: Tasks 5, 6, 11 endpoints; existing `clientFetch`, `KnowledgePrefill` wiring, `parseAnswer` (`format-answer.ts` — stays).
- Produces (lib, all via `clientFetch`):

```ts
export interface ConversationRow {
  id: number;
  session_id: string;
  status: "ai" | "human";
  user_label: string;
  human_requested: boolean;
  message_count: number;
  last_message: string;
  updated_at: string;
}

export interface AssistantLinkRow {
  id: number;
  label: string;
  url: string;
  note: string;
  enabled: boolean;
  position: number;
}

export const listConversations = (page = 1) =>
  clientFetch<{ results: ConversationRow[]; has_more: boolean }>(
    `/api/v1/admin/assistant/conversations/?page=${page}`,
  );
export const getConversationThread = (id: number, after = 0) =>
  clientFetch<ThreadPayload>(`/api/v1/admin/assistant/conversations/${id}/thread/?after=${after}`);
export const takeoverConversation = (id: number) =>
  clientFetch<ThreadPayload>(`/api/v1/admin/assistant/conversations/${id}/takeover/`, { method: "POST" });
export const releaseConversation = (id: number) =>
  clientFetch<ThreadPayload>(`/api/v1/admin/assistant/conversations/${id}/release/`, { method: "POST" });
export const sendAgentMessage = (id: number, content: string, after = 0) =>
  clientFetch<ThreadPayload>(`/api/v1/admin/assistant/conversations/${id}/message/`, {
    method: "POST",
    body: JSON.stringify({ content, after }),
  });
export const listLinks = () => clientFetch<AssistantLinkRow[]>("/api/v1/admin/assistant/links/");
export const createLink = (body: Pick<AssistantLinkRow, "label" | "url" | "note">) =>
  clientFetch<AssistantLinkRow>("/api/v1/admin/assistant/links/", { method: "POST", body: JSON.stringify(body) });
export const updateLink = (id: number, body: Partial<Omit<AssistantLinkRow, "id">>) =>
  clientFetch<AssistantLinkRow>(`/api/v1/admin/assistant/links/${id}/`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteLink = (id: number) =>
  clientFetch<void>(`/api/v1/admin/assistant/links/${id}/`, { method: "DELETE" });
```

  `AssistantAdminConfig` gains `human_handoff_enabled: boolean` (and `putAssistantConfig`'s `Pick` gains it). `streamAssistantPreview` gains an optional `onDone?: (meta: AnswerMeta) => void` third parameter wired exactly like `streamAssistantChat`'s.

- [ ] **Step 1: Build `ConversationsCard`**

Props `{ onAddToKnowledge: (question: string) => void }`. Structure (follow `transcripts-card.tsx`'s Card scaffolding, which this file replaces):

- List state: `rows/page/hasMore/loading` from `listConversations` with the exact fetch/pagination pattern of the old TranscriptsCard; a 10s `setInterval` refresh of page 1 while no thread is open. Each row: `user_label || t("assistant.convVisitor")`, status dot (`human` → brand badge `t("assistant.convLive")`), `human_requested` → amber badge `t("assistant.convWantsHuman")`, `last_message` snippet, `message_count`, relative timestamp; clicking expands the thread inline.
- Thread state: `active: number | null`, `thread: ThreadMessage[]`, `status/agentLabel`, `lastId` ref; on open fetch `getConversationThread(id)`, then poll every 3s with `after=lastId` appending ALL roles (the console shows everything, including `user`/`assistant`). System tokens render muted/centered with the same token map as Task 15 (add it to `format-answer.ts` as `export function systemLine(content: string, t: (k: string, v?: object) => string): string | null` so both surfaces share it). Assistant messages render via `parseAnswer` + get an "Add to knowledge" button passing the PRECEDING user message's content (walk the array backwards) — preserving the v1 teach loop.
- Actions row: `status === "ai"` → Take over button (`takeoverConversation` → replace thread state); `status === "human"` → reply `<Input>` + send (`sendAgentMessage(id, text, lastId)` → append returned messages) and a Release button (`releaseConversation`). Errors → `toast.error(t("assistant.loadFailed"))`.

- [ ] **Step 2: Build `LinksCard` + handoff toggle + preview chips + page wiring**

- `LinksCard`: mirror `knowledge-card.tsx` line for line with fields `label` (Input, 60), `url` (Input, placeholder `https://instagram.com/you`), `note` (Input, 160), the same optimistic enable toggle / delete-with-confirm / cap handling (`MAX_LINKS = 20`), i18n keys below. No prefill plumbing.
- `EnableCard`: add a second `Switch` row — label `t("assistant.handoff")`, hint `t("assistant.handoffHint")`, checked `config.human_handoff_enabled`, onChange → `putAssistantConfig({ human_handoff_enabled: next })` with the same optimistic/rollback pattern as the enable switch (extend the card's props with `onToggleHandoff`).
- `PreviewChatCard`: pass an `onDone` to `streamAssistantPreview`; render returned `suggestions` as disabled-style pills under the answer (visual QA of the tail contract; clicking one fills the preview input).
- `page.tsx`: replace `TranscriptsCard` import/usage with `ConversationsCard` (same `onAddToKnowledge` prop), add `<LinksCard />` between `KnowledgeCard` and `PreviewChatCard`, pass the handoff handler to `EnableCard`. Delete `transcripts-card.tsx`.

- [ ] **Step 3: i18n** — add under `admin.assistant` (EN shown; mirror TR):

```json
"convTitle": "Conversations",
"convHint": "Watch what visitors ask your assistant — and step in when a human answer is better.",
"convVisitor": "Visitor",
"convLive": "You're chatting",
"convWantsHuman": "Wants a human",
"convEmpty": "No conversations yet — they appear as soon as someone talks to your assistant.",
"takeOver": "Take over",
"release": "Hand back to assistant",
"replyPlaceholder": "Write your reply…",
"replySend": "Send",
"agentJoined": "{name} joined the chat",
"assistantResumed": "The assistant is back",
"humanRequestedLine": "Asked to talk to a human",
"linksTitle": "Links",
"linksHint": "Places the assistant may send people — your booking page, Instagram, WhatsApp…",
"linkLabel": "Name",
"linkUrl": "Address",
"linkNote": "When to suggest it",
"linkAdd": "Add link",
"linkLimit": "You can add up to 20 links.",
"linksEmpty": "No links yet.",
"handoff": "Let visitors ask for you",
"handoffHint": "Shows a \"Talk to a human\" button; you get an email when someone taps it."
```

- [ ] **Step 4: Verify**

```bash
cd frontend-customer && npm run test && npx prettier --write src messages && npx tsc --noEmit
```
Manual smoke (`make dev`, seeded paid tenant): student chats → coach `/admin/assistant` Conversations tab shows the thread → Take over → reply lands in the student widget within ~5s → Release. Links card CRUD round-trips; preview shows chips.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer
git commit -m "feat(admin): assistant conversations tab with takeover, links card, handoff toggle"
```

---

### Task 17: Coach help chat — sessions, polling, superadmin-takeover handling

**Files:**
- Modify: `frontend-customer/src/lib/help-bot.ts`
- Modify: `frontend-customer/src/components/setup/help-chat.tsx`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: Task 7 coach-flavor endpoints (`/api/v1/admin/help-bot/thread|human-message|human-request/`).
- Produces: `help-bot.ts` exports `getHelpSessionId()`/`touchHelpSession()` (localStorage key `contentor.ai.session.help`, same `resolveSession` import from `@/lib/assistant`), `fetchHelpThread(after = 0)` (via `clientFetch`, returns `ThreadPayload | null`), `sendHelpHumanMessage(content)`, `requestHelpHuman()`; `streamHelpBotChat` returns `Promise<"ai" | "human">` and surfaces `suggestions` through `onDone` — identical contracts to Task 15's student lib.

- [ ] **Step 1: Implement the lib**

Mirror Task 15's lib additions in `help-bot.ts` with the endpoint/key substitutions above (import `resolveSession`, `ThreadMessage`, `ThreadPayload`, `AnswerMeta` from `@/lib/assistant` — do NOT redeclare them). `streamHelpBotChat`'s JSON branch: `data.mode === "human"` → return `"human"` (checked before the `HelpBotUnavailable` throw).

- [ ] **Step 2: Rework `HelpChat`**

Apply Task 15's component changes 2–4 to `help-chat.tsx` with these deltas: poll while the component is mounted (the setup panel controls visibility); `Msg` role union gains `agent`/`system`; system-token map keys come from `admin.setup.help.*`; the "Talk to a human" button is ALWAYS eligible (no flag — D9) when `mode === "ai" && !humanRequested && messages.length > 0`, calling `requestHelpHuman()`; human-mode notice uses `agentLabel` (arrives as `"Contentor support"`); chips reuse the existing suggestion-pill styles feeding `send()`; link rendering is unchanged (`/admin/` regex — no external links in this surface).

- [ ] **Step 3: i18n** — add under `admin.setup.help` (EN; mirror TR):

```json
"talkToHuman": "Talk to a human",
"humanRequestedLine": "You asked for a human — the Contentor team has been notified.",
"agentJoined": "{name} joined the chat",
"assistantResumed": "The assistant is back",
"humanModeNotice": "You're chatting with {name}"
```

- [ ] **Step 4: Verify + commit**

```bash
cd frontend-customer && npm run test && npx prettier --write src messages && npx tsc --noEmit
git add frontend-customer
git commit -m "feat(help-chat): persistent sessions, polling, human-takeover handling, follow-up chips"
```

---

### Task 18: frontend-main — HelpBubble v2 + superadmin conversation console

**Files:**
- Modify: `frontend-main/src/components/shared/help-bubble.tsx`
- Modify: `frontend-main/src/app/admin/ai/page.tsx`
- Modify: `frontend-main/messages/en/marketing.json`, `frontend-main/messages/tr/marketing.json`

**Interfaces:**
- Consumes: Task 7 marketing endpoints (`/api/v1/help/thread|human-message|human-request/`), Task 8 platform endpoints.
- Produces: marketing widget with the full v2 behavior; superadmin Conversations section on `/admin/ai`. frontend-main has no vitest — `npm run build` is the check.

- [ ] **Step 1: HelpBubble v2**

The bubble is self-contained — inline the additions (copy the bodies from Task 15, adjusting endpoints): `resolveSession` + `getSessionId`/`touchSession` on key `contentor.ai.session.help`; `fetchThread` → `/api/v1/help/thread/`; `sendHumanMessage` → `/api/v1/help/human-message/`; `requestHuman` → `/api/v1/help/human-request/`; `streamChat` JSON-branch returns `"human"`, `onDone` carries `suggestions`. Component: same state/polling/human-branch/system-lines/chips/talk-to-human changes as Task 15 items 2–4 (no external links — `LINK_RE` keeps its four marketing targets; no handoff flag — always eligible). New `marketing.helpBot` keys (EN; mirror TR):

```json
"talkToHuman": "Talk to a human",
"humanRequestedLine": "You asked for a human — we've been notified and will jump in here.",
"agentJoined": "{name} joined the chat",
"assistantResumed": "The assistant is back",
"humanModeNotice": "You're chatting with {name}"
```

- [ ] **Step 2: Superadmin Conversations section**

In `admin/ai/page.tsx` (hardcoded EN like the rest of the page), add a "Conversations" `Card` between the feature grid and the top-tenants table:

- Types: reuse the `ConversationRow` shape (inline interface + `tenant_schema`, `audience`). Fetch `/api/v1/platform/ai-conversations/?audience=${audienceFilter}` (`credentials: "same-origin"`, same error handling as the page's existing fetch), audience `<select>` (All / Coaches / Visitors), 10s refresh interval.
- Row click → thread drawer (right-side fixed panel, matching the page's Card styling): fetch `/api/v1/platform/ai-conversations/{id}/thread/`, poll 3s with `after`; message list renders all roles (system tokens → plain text: `agent_joined:X` → `"X joined"`, `assistant_resumed` → `"Assistant resumed"`, `human_requested` → `"Asked for a human"`).
- Actions: "Take over" (POST `…/takeover/`), reply input + "Send" (POST `…/message/` with `{content, after}`), "Release" (POST `…/release/`) — buttons enabled per `status` exactly like Task 16's card.

- [ ] **Step 3: Verify + commit**

```bash
cd frontend-main && npx prettier --write src messages && npx tsc --noEmit && npm run build
git add frontend-main
git commit -m "feat(main): marketing help bubble v2 + superadmin AI conversation console with takeover"
```

---

### Task 19: E2E capstone + full verification

**Files:**
- Create: `e2e/specs/22-assistant-takeover.spec.ts`

**Interfaces:**
- Consumes: everything. Helpers: `coachContext`/`superadminContext`/`TENANT` (`e2e/helpers/auth.ts`), `manage` (`e2e/helpers/compose.ts`); the seeding/cleanup pattern of `e2e/specs/16-site-assistant.spec.ts` (`setupPaidTenant`/`cleanupPaidTenant` via `manage(["shell","-c",…])`).

- [ ] **Step 1: Write the spec**

`test.setTimeout(180_000)`. Structure (mirror spec 16's seeding; provider-gated live-answer steps use `test.skip(reason !== "ok", …)`):

1. **Seed**: promote `demo-yoga` to paid, reset `AssistantConfig` (enabled + handoff on), wipe `AiConversation`/`AiTranscript`/`StudentBotUsage`.
2. **Student asks** (provider-gated): anonymous page on the tenant host → open bubble → send "What courses do you have?" → non-empty streamed answer; assert follow-up chips render (`[data-testid="assistant-suggestion"]` — add the test id in Task 15's chip JSX). Reload the page → prior messages still visible (session persistence).
3. **Takeover без provider dependency**: coach page (`coachContext`) → `/admin/assistant` → Conversations card shows the row → "Take over" → student page shows "joined the chat" system line within 10s (`expect.poll`) → coach sends "Merhaba! I'm here." → student sees the agent bubble within 10s → student replies (human mode — no SSE) → coach thread shows it → "Hand back to assistant" → student sees "The assistant is back".
4. **Human request + email**: student clicks "Talk to a human" → `GET /api/v1/dev/emails/latest/?to=<owner_email>` (email sink) contains "asked to talk to a human"; coach list shows the "Wants a human" badge.
5. **Superadmin console**: seed a help-bot conversation directly via `manage(["shell","-c", …])` — in the shell snippet resolve the schema from the tenant (`Tenant.objects.get(schema_name__startswith="demo").schema_name` or the `TENANT` helper's slug with `-`→`_`), then create `AiConversation(feature="help_bot", audience="coach", tenant_schema=<that>, session_id="e2e-help")` + one user `AiMessage`; `superadminContext` → `/admin/ai` → Conversations card lists it → Take over → Send reply → row shows status human. (Pure DB + console — runs without any AI provider.)
6. **Cleanup** in `finally`: restore Free plan, delete seeded conversations.

- [ ] **Step 2: Run the suite**

```bash
make e2e
```
Expected: 22-assistant-takeover green (live-answer steps may skip without a provider; takeover + superadmin steps must PASS regardless). Existing specs stay green — 16-site-assistant exercises the same widget, so watch it for selector drift from Task 15's rework.

- [ ] **Step 3: Full verification sweep**

```bash
make test-fresh                          # full backend suite
cd frontend-customer && npm run test && npx tsc --noEmit && npm run build
cd ../frontend-main && npx tsc --noEmit && npm run build
cd .. && make lint                       # pre-commit, zero issues
```
Expected: everything green; backend count strictly above Task 1's baseline.

- [ ] **Step 4: Commit + wrap up**

```bash
git add e2e
git commit -m "test(e2e): assistant takeover capstone — student↔coach + superadmin console"
```

Do NOT merge or push — invoke superpowers:finishing-a-development-branch and let the owner choose (shared tree: re-verify `git status -sb` first).

---

## Task → spec traceability

| Spec section | Tasks |
|---|---|
| §5 conversation layer | 2, 3, 4, 7, 15 |
| §6 takeover (coach/superadmin/human-request) | 5, 6, 7, 8, 15, 16, 17, 18 |
| §7 follow-up suggestions | 9, 15, 16, 17, 18 |
| §8 viewer context | 10 |
| §9 link registry | 11, 15, 16 |
| §10 hardening (client_ip, ipblock, cache, caps) | 12, 13, 14 |
| §12 frontend matrix | 15, 16, 17, 18 |
| §14 testing / e2e | every task + 19 |
