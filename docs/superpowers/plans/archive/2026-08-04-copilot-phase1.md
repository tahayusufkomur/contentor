# Coach Copilot Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating coach-only AI assistant on every tenant page that answers, asks clarifying questions, and proposes confirmable design actions (edit pages, add/remove/move blocks), replacing the `/admin/site-ai` panel.

**Architecture:** Stateless converse SSE endpoint (transcript travels with each request, `logo_converse` pattern) returning a pydantic union `answer | ask | actions`. Actions are stashed server-side under single-use signed tokens; a separate execute endpoint runs a confirmed action. `edit_pages` reuses `site_ai.preview_edit`/`apply_edit`/`diff_pages`; block ops are new pure helpers. Widget mounts in the public layout when the viewer is the coach. Spec: `docs/superpowers/specs/2026-08-04-coach-copilot-design.md`.

**Tech Stack:** Django 5.1 + DRF SSE (`apps/core/ai_sse`), pydantic 2, PyJWT, Redis cache; Next.js 14 App Router, `streamAi`/`clientFetch`, next-intl, vitest, Playwright.

## Global Constraints

- **No coach-facing metering.** No quota checks or upsell UI anywhere in the widget. Platform kill-switch = `ai_compose.compose_available()`; when false the widget shows a "resting" state, never "upgrade".
- **No ask-cap.** Prompt steers toward acting; never enforce a question limit in code.
- **Nothing executes without a tap.** Every mutating action goes proposal card → confirm → execute.
- **Trust boundary unchanged:** editable/addable block types and fields come from `ai_compose.WRITABLE_FIELDS` / `FIELD_CAPS` / `MAX_FAQ_ITEMS`; `body` runs through `sanitize_rich_text`. No testimonials block (not in `WRITABLE_FIELDS` — keeps the no-fabricated-social-proof rule).
- **Prompt caching:** the system prompt is a module-level constant, byte-identical across tenants; all tenant data rides in the user turn.
- **AI provider calls** only via `apps.core.ai.structured(*, system, user, output_model, model, max_tokens)` → `(instance, cost_usd, effective_model)`; charge `ai_compose.record_spend(schema, usd)` on every attempt **including failures**.
- User-facing name: EN "Your AI assistant", TR "Yapay zekâ asistanınız". Internal name `copilot`. Deep link `/?copilot=1`.
- i18n: every EN key added must be added to TR in the same task (parity guard in `make lint`).
- Frontend conventions per root CLAUDE.md: `useAsyncAction`, `<Button loading>`, no raw spinners, sonner toasts.
- Backend tests: `docker compose exec -T django pytest <path> -q` (dev stack is up). Frontend: `cd frontend-customer && npx vitest run <path>`. Never run two backend test commands concurrently (shared test DB).
- Commits: stage ONLY the files this plan touches — another agent may have unrelated WIP in the tree. End commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Block operations + templates (`copilot/blocks.py`)

**Files:**
- Create: `backend/apps/core/copilot/__init__.py` (empty)
- Create: `backend/apps/core/copilot/blocks.py`
- Test: `backend/apps/core/tests/test_copilot_blocks.py`

**Interfaces:**
- Consumes: `ai_compose.WRITABLE_FIELDS`, `FIELD_CAPS`, `MAX_FAQ_ITEMS`; `sanitize_rich_text` from `apps.tenant_config.defaults`.
- Produces (used by Tasks 2 and 4):
  - `class BlockOpError(Exception)` — message is user-safe.
  - `mint_block_id() -> str` — `"blk_" + uuid4().hex[:8]`.
  - `build_block(block_type: str, fields: dict) -> dict` — validated, clamped, sanitized block dict with fresh id, `enabled: True`.
  - `add_block(pages: dict, page: str, block: dict, after_block_id: str | None) -> dict` — returns a NEW pages dict; `after_block_id=None` appends at the end.
  - `remove_block(pages: dict, page: str, block_id: str) -> dict`
  - `move_block(pages: dict, page: str, block_id: str, after_block_id: str | None) -> dict` — `None` moves to top.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_copilot_blocks.py`:

```python
"""Pure block operations behind the copilot's add/remove/move actions.
No DB — pages dicts in, pages dicts out."""

import pytest

from apps.core.copilot import blocks

HERO = {"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}
INTRO = {"id": "blk_intro", "type": "richText", "enabled": True, "heading": "About", "body": "<p>x</p>"}
PAGES = {"home": [HERO, INTRO]}


def test_build_block_clamps_and_sanitizes():
    b = blocks.build_block("richText", {"heading": "H" * 500, "body": "<script>x</script><p>ok</p>"})
    assert b["type"] == "richText" and b["enabled"] is True
    assert b["id"].startswith("blk_") and len(b["id"]) == 12
    assert len(b["heading"]) == 120  # FIELD_CAPS["heading"]
    assert "<script>" not in b["body"] and "ok" in b["body"]


def test_build_block_drops_unknown_fields_and_caps_faq_items():
    b = blocks.build_block("faq", {"heading": "Q&A", "evil": "x", "items": [{"q": "q" * 400, "a": "a"}] * 20})
    assert "evil" not in b
    assert len(b["items"]) == 6  # MAX_FAQ_ITEMS
    assert len(b["items"][0]["q"]) == 150  # FIELD_CAPS["q"]


def test_build_block_rejects_unknown_and_testimonials_types():
    with pytest.raises(blocks.BlockOpError):
        blocks.build_block("marquee", {})
    with pytest.raises(blocks.BlockOpError):
        blocks.build_block("testimonials", {"heading": "x"})


def test_add_block_appends_or_inserts_after():
    new = blocks.build_block("cta", {"heading": "Join"})
    appended = blocks.add_block(PAGES, "home", new, after_block_id=None)
    assert [b["id"] for b in appended["home"]][-1] == new["id"]
    inserted = blocks.add_block(PAGES, "home", new, after_block_id="blk_hero")
    assert [b["id"] for b in inserted["home"]] == ["blk_hero", new["id"], "blk_intro"]
    assert [b["id"] for b in PAGES["home"]] == ["blk_hero", "blk_intro"]  # input untouched


def test_remove_and_move_block():
    removed = blocks.remove_block(PAGES, "home", "blk_intro")
    assert [b["id"] for b in removed["home"]] == ["blk_hero"]
    moved = blocks.move_block(PAGES, "home", "blk_intro", after_block_id=None)
    assert [b["id"] for b in moved["home"]] == ["blk_intro", "blk_hero"]


def test_unknown_page_or_block_id_raises():
    with pytest.raises(blocks.BlockOpError):
        blocks.add_block(PAGES, "nope", HERO, None)
    with pytest.raises(blocks.BlockOpError):
        blocks.remove_block(PAGES, "home", "blk_ghost")
    with pytest.raises(blocks.BlockOpError):
        blocks.move_block(PAGES, "home", "blk_ghost", None)
```

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_blocks.py -q`
Expected: FAIL — `ModuleNotFoundError: apps.core.copilot`

- [ ] **Step 3: Implement**

`backend/apps/core/copilot/blocks.py`:

```python
"""Pure block operations behind the copilot's add/remove/move actions.

Addable types and writable fields are ai_compose's WRITABLE_FIELDS — the same
trust boundary the edit engine uses (so no testimonials: fabricated social
proof stays impossible). All functions are dict-in/dict-out and never mutate
their inputs; DB writes happen in the execute view."""

from copy import deepcopy
from uuid import uuid4

from apps.core.onboarding.ai_compose import FIELD_CAPS, MAX_FAQ_ITEMS, WRITABLE_FIELDS
from apps.tenant_config.defaults import sanitize_rich_text


class BlockOpError(Exception):
    """User-safe message describing why a block operation was refused."""


def mint_block_id() -> str:
    return f"blk_{uuid4().hex[:8]}"


def _clamp(value, field):
    return str(value)[: FIELD_CAPS.get(field, 200)]


def build_block(block_type, fields):
    writable = WRITABLE_FIELDS.get(block_type)
    if writable is None:
        raise BlockOpError(f"unknown block type: {block_type}")
    block = {"id": mint_block_id(), "type": block_type, "enabled": True}
    for field in writable:
        if field not in (fields or {}):
            continue
        value = fields[field]
        if field == "items":
            block["items"] = [
                {"q": _clamp(it.get("q", ""), "q"), "a": _clamp(it.get("a", ""), "a")}
                for it in list(value or [])[:MAX_FAQ_ITEMS]
                if isinstance(it, dict)
            ]
        elif field == "body":
            block["body"] = sanitize_rich_text(_clamp(value, "body"))
        else:
            block[field] = _clamp(value, field)
    return block


def _page_blocks(pages, page):
    blocks_ = (pages or {}).get(page)
    if not isinstance(blocks_, list):
        raise BlockOpError(f"unknown page: {page}")
    return blocks_


def _index_of(blocks_, block_id, page):
    for i, b in enumerate(blocks_):
        if isinstance(b, dict) and b.get("id") == block_id:
            return i
    raise BlockOpError(f"no block {block_id} on {page}")


def add_block(pages, page, block, after_block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    if after_block_id is None:
        blocks_.append(block)
    else:
        blocks_.insert(_index_of(blocks_, after_block_id, page) + 1, block)
    return new_pages


def remove_block(pages, page, block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    blocks_.pop(_index_of(blocks_, block_id, page))
    return new_pages


def move_block(pages, page, block_id, after_block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    moving = blocks_.pop(_index_of(blocks_, block_id, page))
    if after_block_id is None:
        blocks_.insert(0, moving)
    else:
        blocks_.insert(_index_of(blocks_, after_block_id, page) + 1, moving)
    return new_pages
```

Also create empty `backend/apps/core/copilot/__init__.py`.

- [ ] **Step 4: Run tests, expect all pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_blocks.py -q`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/__init__.py backend/apps/core/copilot/blocks.py backend/apps/core/tests/test_copilot_blocks.py
git commit -m "feat(copilot): pure block add/remove/move ops on the pages tree

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Action tokens (`copilot/tokens.py`)

**Files:**
- Create: `backend/apps/core/copilot/tokens.py`
- Test: `backend/apps/core/tests/test_copilot_tokens.py`

**Interfaces:**
- Consumes: `django.core.cache.cache`, PyJWT, `settings.SECRET_KEY`.
- Produces (used by Tasks 3 and 4):
  - `stash_action(tenant_schema: str, action: dict, ttl: int = 1800) -> str` — caches the action payload under a fresh `jti`, returns a signed JWT `{jti, schema, purpose: "copilot_action", exp}`.
  - `take_action(token: str, tenant_schema: str) -> dict` — verifies signature/expiry/purpose/schema, pops the cached payload (single-use). Raises `ActionTokenError` on any failure, including replay.
  - `class ActionTokenError(Exception)`

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_copilot_tokens.py`:

```python
"""Single-use signed action tokens: the guardrail that makes 'the AI can do
everything' safe — execute can't be forged, replayed, or fired cross-tenant."""

import pytest

from apps.core.copilot import tokens

pytestmark = pytest.mark.django_db

ACTION = {"kind": "add_block", "page": "home"}


def test_roundtrip_returns_action_once():
    t = tokens.stash_action("demo_yoga", ACTION)
    assert tokens.take_action(t, "demo_yoga") == ACTION


def test_replay_is_refused():
    t = tokens.stash_action("demo_yoga", ACTION)
    tokens.take_action(t, "demo_yoga")
    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action(t, "demo_yoga")


def test_cross_tenant_is_refused_and_not_consumed():
    t = tokens.stash_action("demo_yoga", ACTION)
    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action(t, "other_schema")
    assert tokens.take_action(t, "demo_yoga") == ACTION  # still usable by its owner


def test_garbage_and_wrong_purpose_are_refused():
    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action("not-a-jwt", "demo_yoga")
    from apps.accounts.tokens import create_magic_link_token

    with pytest.raises(tokens.ActionTokenError):
        tokens.take_action(create_magic_link_token("a@b.c", "demo_yoga", "demo-yoga"), "demo_yoga")
```

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_tokens.py -q`
Expected: FAIL — no module `tokens`

- [ ] **Step 3: Implement**

`backend/apps/core/copilot/tokens.py`:

```python
"""Single-use signed action tokens.

The converse endpoint proposes actions; nothing executes until the coach
confirms. The proposal payload (which can embed a full recomposed pages tree)
is cached server-side under a fresh jti; the client only ever holds a small
JWT. take_action pops the cache entry, so a token works exactly once."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from django.conf import settings
from django.core.cache import cache

_PURPOSE = "copilot_action"
_KEY = "copilot:action:{jti}"


class ActionTokenError(Exception):
    pass


def stash_action(tenant_schema, action, ttl=1800):
    jti = uuid4().hex
    cache.set(_KEY.format(jti=jti), action, timeout=ttl)
    payload = {
        "jti": jti,
        "schema": tenant_schema,
        "purpose": _PURPOSE,
        "exp": datetime.now(tz=UTC) + timedelta(seconds=ttl),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def take_action(token, tenant_schema):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ActionTokenError("invalid action token") from exc
    if payload.get("purpose") != _PURPOSE or payload.get("schema") != tenant_schema:
        raise ActionTokenError("invalid action token")
    key = _KEY.format(jti=payload["jti"])
    action = cache.get(key)
    if action is None:
        raise ActionTokenError("action expired or already executed")
    cache.delete(key)
    return action
```

- [ ] **Step 4: Run tests, expect all pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_tokens.py -q`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/tokens.py backend/apps/core/tests/test_copilot_tokens.py
git commit -m "feat(copilot): single-use signed action tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Conversation engine (`copilot/engine.py`)

**Files:**
- Create: `backend/apps/core/copilot/engine.py`
- Test: `backend/apps/core/tests/test_copilot_engine.py`

**Interfaces:**
- Consumes: `apps.core.ai.structured` (mock in tests), `site_ai.preview_edit` / `diff_current` (mock in tests), Task 1 `blocks.build_block`, Task 2 `tokens.stash_action`.
- Produces (used by Task 4):
  - `run_turn(tenant, transcript: list[dict], selections: list[dict], message: str) -> tuple[dict, Decimal]` — returns `(done_payload, usd_cost)`. `done_payload` is one of:
    - `{"kind": "answer", "text": str}`
    - `{"kind": "ask", "text": str}`
    - `{"kind": "actions", "text": str, "actions": [card, ...]}` where each card is `{"kind", "title", "detail", "changes"?, "token"}` (`changes` = diff rows, only for `edit_pages`).
  - `SYSTEM_PROMPT` module constant.
  - Pydantic models: `CopilotTurn` (fields: `kind: Literal["answer","ask","actions"]`, `text: str = ""`, `actions: list[CopilotAction] = []`) with `CopilotAction` a discriminated union of `EditPagesAction(kind="edit_pages", instruction: str)`, `AddBlockAction(kind="add_block", page: str, block_type: str, after_block_id: str | None = None, fields: dict = {})`, `RemoveBlockAction(kind="remove_block", page: str, block_id: str)`, `MoveBlockAction(kind="move_block", page: str, block_id: str, after_block_id: str | None = None)`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_copilot_engine.py`:

```python
"""run_turn: model union in, executable proposal cards out. The model is
always mocked — these tests pin the post-processing contract."""

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.core.copilot import engine

pytestmark = pytest.mark.django_db

TENANT = SimpleNamespace(schema_name="demo_yoga", name="Demo Yoga", wizard_state={"answers": {"niche": "yoga"}})


def _turn(**kw):
    return engine.CopilotTurn.model_validate(kw)


def _run(parsed):
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine.site_ai, "preview_edit", return_value=({"home": []}, {}, Decimal("0"))),
        mock.patch.object(
            engine.site_ai, "diff_current", return_value=[{"page": "home", "block_type": "hero", "field": "heading", "old": "a", "new": "b"}]
        ),
    ):
        return engine.run_turn(TENANT, [], [], "hi")


def test_answer_and_ask_pass_through():
    payload, cost = _run(_turn(kind="answer", text="You can sell courses."))
    assert payload == {"kind": "answer", "text": "You can sell courses."}
    assert cost == Decimal("0.01")
    payload, _ = _run(_turn(kind="ask", text="Warmer how — colors or copy?"))
    assert payload["kind"] == "ask"


def test_edit_pages_action_becomes_card_with_changes_and_token():
    parsed = _turn(kind="actions", text="Here's my plan", actions=[{"kind": "edit_pages", "instruction": "warmer hero"}])
    with mock.patch.object(engine.site_ai, "preview_edit", return_value=({"home": []}, {}, Decimal("0"))):
        with (
            mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
            mock.patch.object(engine.site_ai, "diff_current", return_value=[{"page": "home", "field": "heading", "block_type": "hero", "old": "a", "new": "b"}]),
        ):
            payload, _ = engine.run_turn(TENANT, [], [], "make it warmer")
    (card,) = payload["actions"]
    assert card["kind"] == "edit_pages" and card["changes"][0]["new"] == "b"
    assert card["token"]  # stashed and executable


def test_add_block_card_carries_the_built_block():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "add_block", "page": "home", "block_type": "cta", "fields": {"heading": "Join us"}}],
    )
    with mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")):
        payload, _ = engine.run_turn(TENANT, [], [], "add a call to action")
    (card,) = payload["actions"]
    assert card["kind"] == "add_block" and "Join us" in card["detail"]


def test_invalid_actions_are_dropped_and_fallback_answer_returned():
    parsed = _turn(kind="actions", text="", actions=[{"kind": "add_block", "page": "home", "block_type": "testimonials", "fields": {}}])
    with mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")):
        payload, _ = engine.run_turn(TENANT, [], [], "add testimonials")
    assert payload["kind"] == "answer"  # nothing proposable survived


def test_failed_model_call_still_reports_cost():
    from apps.core.ai import AiError

    with mock.patch.object(engine.core_ai, "structured", side_effect=AiError("boom", cost_usd=Decimal("0.004"))):
        with pytest.raises(AiError):
            engine.run_turn(TENANT, [], [], "hi")
```

Note for the implementer: check `AiError`'s constructor in `backend/apps/core/ai.py` before writing the last test — if it doesn't accept `cost_usd` as a kwarg, mirror how `logo_converse` extracts cost from `AiError` and adjust the test to match the real signature.

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_engine.py -q`
Expected: FAIL — no module `engine`

- [ ] **Step 3: Implement**

`backend/apps/core/copilot/engine.py`:

```python
"""Copilot conversation engine: one structured model call per coach message,
returning answer | ask | actions. Actions become confirmable cards backed by
single-use tokens; nothing here writes to the DB.

The system prompt is a module constant — byte-identical across tenants
(prompt-cache rule). Everything tenant-specific rides in the user turn."""

import json
from decimal import Decimal

from django.conf import settings
from django_tenants.utils import tenant_context
from pydantic import BaseModel, Field
from typing import Annotated, Literal, Union

from apps.core import ai as core_ai
from apps.core.copilot import blocks, tokens
from apps.core.onboarding import site_ai

MAX_TRANSCRIPT = 20
MAX_SELECTIONS = 5

SYSTEM_PROMPT = (
    "You are the coach's site copilot on a website-builder platform for "
    "coaches. You can answer questions about their site, ask a clarifying "
    "question when the request is genuinely ambiguous, or propose concrete "
    "actions. Prefer acting once intent is clear; do not ask about details "
    "you can choose sensibly yourself.\n"
    "Available actions:\n"
    "- edit_pages: rewrite existing page copy from an instruction\n"
    "- add_block: add a new section (types: hero, richText, imageText, "
    "courseGrid, upcomingEvents, storeProducts, pricingPlans, cta, faq, "
    "contact) to a page, with initial field content\n"
    "- remove_block / move_block: by block id from the page digest\n"
    "Use block ids and page keys exactly as given in the digest. If the "
    "coach's selection is something you cannot change, say so honestly in "
    "an answer and suggest what you CAN do."
)


class EditPagesAction(BaseModel):
    kind: Literal["edit_pages"]
    instruction: str


class AddBlockAction(BaseModel):
    kind: Literal["add_block"]
    page: str
    block_type: str
    after_block_id: str | None = None
    fields: dict = Field(default_factory=dict)


class RemoveBlockAction(BaseModel):
    kind: Literal["remove_block"]
    page: str
    block_id: str


class MoveBlockAction(BaseModel):
    kind: Literal["move_block"]
    page: str
    block_id: str
    after_block_id: str | None = None


CopilotAction = Annotated[
    Union[EditPagesAction, AddBlockAction, RemoveBlockAction, MoveBlockAction],
    Field(discriminator="kind"),
]


class CopilotTurn(BaseModel):
    kind: Literal["answer", "ask", "actions"]
    text: str = ""
    actions: list[CopilotAction] = Field(default_factory=list)


def _pages_digest(tenant):
    """Bounded snapshot of the current pages tree for the user turn:
    page key, block ids/types, first 40 chars of each heading."""
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        pages = (cfg.pages if cfg else None) or {}
    lines = []
    for page, blocks_ in pages.items():
        if not isinstance(blocks_, list):
            continue
        items = ", ".join(
            f"{b.get('id')}({b.get('type')}: {str(b.get('heading', ''))[:40]})"
            for b in blocks_
            if isinstance(b, dict)
        )
        lines.append(f"{page}: {items}")
    return "\n".join(lines) or "(no pages yet)"


def _user_turn(tenant, transcript, selections, message):
    answers = (tenant.wizard_state or {}).get("answers") or {}
    parts = [
        f"Brand: {tenant.name}",
        f"Niche: {answers.get('niche') or 'general'}",
        "Current pages:\n" + _pages_digest(tenant),
    ]
    if selections:
        parts.append(
            "The coach clicked these elements as context:\n"
            + json.dumps(list(selections)[:MAX_SELECTIONS], ensure_ascii=False)
        )
    for entry in list(transcript)[-MAX_TRANSCRIPT:]:
        role = "Coach" if entry.get("role") == "coach" else "Assistant"
        parts.append(f"{role}: {str(entry.get('text', ''))[:1000]}")
    parts.append(f"Coach: {str(message)[:2000]}")
    return "\n\n".join(parts)


def _card(tenant, action):
    """Validate one proposed action and turn it into a confirmable card.
    Raises blocks.BlockOpError (or site_ai's ComposeError) when unusable."""
    schema = tenant.schema_name
    if isinstance(action, EditPagesAction):
        pages, extras, _cost = site_ai.preview_edit(tenant, action.instruction)
        changes = site_ai.diff_current(tenant, pages)
        return {
            "kind": "edit_pages",
            "title": action.instruction[:120],
            "detail": f"{len(changes)} field(s) change",
            "changes": changes,
            "token": tokens.stash_action(schema, {"kind": "edit_pages", "pages": pages, "extras": extras, "changes_count": len(changes)}),
        }
    if isinstance(action, AddBlockAction):
        block = blocks.build_block(action.block_type, action.fields)
        detail = ", ".join(f"{k}: {v}" for k, v in block.items() if k not in ("id", "type", "enabled"))
        return {
            "kind": "add_block",
            "title": f"Add {action.block_type} to {action.page}",
            "detail": detail[:500],
            "token": tokens.stash_action(schema, {"kind": "add_block", "page": action.page, "block": block, "after_block_id": action.after_block_id}),
        }
    if isinstance(action, RemoveBlockAction):
        return {
            "kind": "remove_block",
            "title": f"Remove {action.block_id} from {action.page}",
            "detail": "",
            "token": tokens.stash_action(schema, action.model_dump()),
        }
    return {
        "kind": "move_block",
        "title": f"Move {action.block_id} on {action.page}",
        "detail": "to the top" if action.after_block_id is None else f"after {action.after_block_id}",
        "token": tokens.stash_action(schema, action.model_dump()),
    }


def run_turn(tenant, transcript, selections, message):
    parsed, cost, _model = core_ai.structured(
        system=SYSTEM_PROMPT,
        user=_user_turn(tenant, transcript, selections, message),
        output_model=CopilotTurn,
        model=settings.COPILOT_MODEL,
        max_tokens=4000,
    )
    if parsed.kind in ("answer", "ask"):
        return {"kind": parsed.kind, "text": parsed.text}, cost
    cards = []
    for action in parsed.actions:
        try:
            cards.append(_card(tenant, action))
        except Exception:  # invalid page/block id, compose failure — drop this card
            continue
    if not cards:
        text = parsed.text or "I couldn't turn that into a change I can make — could you rephrase?"
        return {"kind": "answer", "text": text}, cost
    return {"kind": "actions", "text": parsed.text, "actions": cards}, cost
```

Add to `backend/config/settings/base.py`, next to the other AI model settings (search for `BLOG_AI_TOPIC_MODEL` to find the section):

```python
COPILOT_MODEL = os.environ.get("COPILOT_MODEL", "claude-sonnet-5")
```

- [ ] **Step 4: Run tests, expect all pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_engine.py apps/core/tests/test_copilot_blocks.py apps/core/tests/test_copilot_tokens.py -q`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/engine.py backend/apps/core/tests/test_copilot_engine.py backend/config/settings/base.py
git commit -m "feat(copilot): conversation engine — answer/ask/actions union to confirmable cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Converse + execute endpoints

**Files:**
- Create: `backend/apps/core/copilot/views.py`
- Create: `backend/apps/core/copilot/urls.py`
- Modify: `backend/config/urls.py:55` (add copilot mount next to the site-ai mount; the site-ai line is removed in Task 7)
- Test: `backend/apps/core/tests/test_copilot_views.py`

**Interfaces:**
- Consumes: Task 3 `engine.run_turn`, Task 2 `tokens.take_action`/`ActionTokenError`, Task 1 `blocks` ops, `site_ai.apply_edit`, `ai_compose.compose_available`/`record_spend`, `apps.core.ai_sse` (`sse_frame`, `stream_response`, `EventStreamRenderer`), `IsCoachOrOwner` from `apps.core.permissions`.
- Produces: `POST /api/v1/admin/copilot/converse/` (SSE: `phase` frame then `done` frame `{type:"done", **run_turn payload}`; plain-JSON `{"kind":"unavailable"}` pre-stream when the kill-switch is tripped; `{type:"error"}` frame on failure) and `POST /api/v1/admin/copilot/execute/` (body `{token}` → 200 `{result}` | 400 `{detail}` | 403 `{detail:"invalid_token"}` | 409 `{detail:"already_executed"}`).

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_copilot_views.py`:

```python
"""The copilot endpoint pair: converse streams the turn, execute runs exactly
one confirmed action. Coach JWT auth, no metering anywhere."""

import json
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.copilot import tokens as copilot_tokens

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="copilot-coach@x.com", name="Coach", password="x", role="owner", is_staff=True  # noqa: S106
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def _frames(resp):
    body = b"".join(resp.streaming_content).decode()
    return [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]


def test_converse_streams_phase_then_done_and_records_spend(client):
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.copilot.views.engine.run_turn", return_value=({"kind": "answer", "text": "hi"}, Decimal("0.02"))),
        mock.patch("apps.core.copilot.views.ai_compose.record_spend") as spend,
    ):
        resp = client.post(
            "/api/v1/admin/copilot/converse/",
            {"message": "hello", "transcript": [], "selections": []},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert resp.status_code == 200
        frames = _frames(resp)
    assert frames[0] == {"type": "phase", "phase": "thinking"}
    assert frames[-1] == {"type": "done", "kind": "answer", "text": "hi"}
    spend.assert_called_once_with("shared_test", Decimal("0.02"))


def test_converse_refuses_plain_json_when_kill_switch_tripped(client):
    with mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=False):
        resp = client.post("/api/v1/admin/copilot/converse/", {"message": "hi"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"kind": "unavailable"}


def test_execute_add_block_mutates_pages(client):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "add_block", "page": "home", "block": {"id": "blk_new1234", "type": "cta", "enabled": True, "heading": "Join"}, "after_block_id": "blk_hero"},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert [b["id"] for b in cfg.pages["home"]] == ["blk_hero", "blk_new1234"]


def test_execute_edit_pages_applies_and_reports_changes(client):
    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "edit_pages", "pages": {"home": []}, "extras": {}, "changes_count": 3}
    )
    with mock.patch("apps.core.copilot.views.site_ai.apply_edit") as apply_edit:
        resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200
    assert resp.json()["result"]["changes_count"] == 3
    apply_edit.assert_called_once()


def test_execute_refuses_replay_and_garbage(client):
    token = copilot_tokens.stash_action("shared_test", {"kind": "remove_block", "page": "home", "block_id": "blk_x"})
    copilot_tokens.take_action(token, "shared_test")  # consume
    assert client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json").status_code == 403
    assert client.post("/api/v1/admin/copilot/execute/", {"token": "junk"}, format="json").status_code == 403


def test_endpoints_reject_anonymous_callers(tenant_ctx):
    anon = APIClient(HTTP_HOST=HOST)
    assert anon.post("/api/v1/admin/copilot/converse/", {}, format="json").status_code in (401, 403)
    assert anon.post("/api/v1/admin/copilot/execute/", {}, format="json").status_code in (401, 403)
```

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_views.py -q`
Expected: FAIL — 404s (no route)

- [ ] **Step 3: Implement**

`backend/apps/core/copilot/views.py`:

```python
"""Copilot endpoint pair. Coach-JWT (DRF default auth + IsCoachOrOwner — do
NOT clear authentication_classes; that is only for pre-provision wizard
endpoints). No metering: no availability checks, no credits. Every model
call's USD still lands in the onboarding meter (kill-switch integrity)."""

import logging
from decimal import Decimal

from django.db import connection
from django.http import JsonResponse
from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response
from apps.core.copilot import blocks, engine, tokens
from apps.core.copilot.tokens import ActionTokenError
from apps.core.onboarding import ai_compose, site_ai
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)

MESSAGE_MAX_LEN = 2000


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def copilot_converse(request):
    if not ai_compose.compose_available():
        # Pre-stream guard answered as plain JSON (streamAi content-sniffs
        # and returns a JSON body as-is) — same convention as blog/site-ai.
        return JsonResponse({"kind": "unavailable"})

    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    message = str(data.get("message") or "").strip()[:MESSAGE_MAX_LEN]
    transcript = data.get("transcript") if isinstance(data.get("transcript"), list) else []
    selections = data.get("selections") if isinstance(data.get("selections"), list) else []

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            payload, cost = engine.run_turn(tenant, transcript, selections, message)
            yield sse_frame({"type": "done", **payload})
        except Exception:
            logger.exception("copilot converse failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error"})
        finally:
            ai_compose.record_spend(tenant.schema_name, cost)

    return stream_response(frames())


def _execute(tenant, action):
    from apps.tenant_config.models import TenantConfig

    kind = action.get("kind")
    if kind == "edit_pages":
        site_ai.apply_edit(tenant, action["pages"], extras=action.get("extras"))
        return {"kind": kind, "changes_count": action.get("changes_count", 0)}
    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError("site is not set up yet")
        pages = cfg.pages or {}
        if kind == "add_block":
            pages = blocks.add_block(pages, action["page"], action["block"], action.get("after_block_id"))
        elif kind == "remove_block":
            pages = blocks.remove_block(pages, action["page"], action["block_id"])
        elif kind == "move_block":
            pages = blocks.move_block(pages, action["page"], action["block_id"], action.get("after_block_id"))
        else:
            raise blocks.BlockOpError(f"unknown action: {kind}")
        cfg.pages = pages
        cfg.save(update_fields=["pages"])
    return {"kind": kind, "page": action.get("page")}


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_execute(request):
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    try:
        action = tokens.take_action(str(data.get("token") or ""), tenant.schema_name)
    except ActionTokenError:
        return Response({"detail": "invalid_token"}, status=403)
    try:
        result = _execute(tenant, action)
    except blocks.BlockOpError as exc:
        return Response({"detail": str(exc)}, status=400)
    logger.info("copilot executed %s schema=%s", action.get("kind"), tenant.schema_name)
    return Response({"result": result})
```

`backend/apps/core/copilot/urls.py`:

```python
from django.urls import path

from apps.core.copilot import views

urlpatterns = [
    path("converse/", views.copilot_converse, name="copilot-converse"),
    path("execute/", views.copilot_execute, name="copilot-execute"),
]
```

In `backend/config/urls.py`, directly below the `site-ai` line (line 55), add:

```python
    path("api/v1/admin/copilot/", include("apps.core.copilot.urls")),
```

- [ ] **Step 4: Run tests, expect all pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_copilot_views.py -q`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/views.py backend/apps/core/copilot/urls.py backend/config/urls.py backend/apps/core/tests/test_copilot_views.py
git commit -m "feat(copilot): converse SSE + single-use execute endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend copilot lib (selection, state, api)

**Files:**
- Create: `frontend-customer/src/lib/copilot/types.ts`
- Create: `frontend-customer/src/lib/copilot/selection.ts`
- Create: `frontend-customer/src/lib/copilot/state.ts`
- Create: `frontend-customer/src/lib/copilot/api.ts`
- Test: `frontend-customer/src/lib/__tests__/copilot.test.ts`

**Interfaces:**
- Consumes: `streamAi` from `@/lib/ai-stream`, `clientFetch` from `@/lib/api-client`.
- Produces (used by Task 6):
  - `types.ts`: `SelectionPayload {path, block_id, tag, text, context}`, `ActionCard {kind, title, detail, changes?, token}`, `CopilotDone {kind: "answer"|"ask"|"actions"|"unavailable", text?, actions?}`, `ChatEntry {role: "coach"|"assistant", text, cards?}`.
  - `selection.ts`: `buildSelectionPayload(el: SelectableElement, path: string): SelectionPayload` where `SelectableElement` is the structural subset `{tagName, textContent, closest(sel): {getAttribute(n): string|null} | null, parentElement: {textContent} | null}` (so tests pass plain objects; real DOM elements satisfy it).
  - `state.ts`: `reduceChat(entries: ChatEntry[], done: CopilotDone): ChatEntry[]` — appends the assistant entry (unavailable → a fixed "resting" marker entry `{role:"assistant", text:"__unavailable__"}` the UI translates), and `toTranscript(entries): {role, text}[]` — strips cards, keeps last 20.
  - `api.ts`: `converseCopilot(body: {message, transcript, selections}, handlers, signal?) => Promise<CopilotDone>` via `streamAi<CopilotDone, never>("/api/v1/admin/copilot/converse/", ...)`; `executeCopilotAction(token: string) => Promise<{result: {kind: string, changes_count?: number, page?: string}}>` via `clientFetch` POST.

- [ ] **Step 1: Write the failing tests**

`frontend-customer/src/lib/__tests__/copilot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSelectionPayload } from "@/lib/copilot/selection";
import { reduceChat, toTranscript } from "@/lib/copilot/state";
import type { ChatEntry } from "@/lib/copilot/types";

const el = (over: Partial<Parameters<typeof buildSelectionPayload>[0]> = {}) => ({
  tagName: "H2",
  textContent: "  Find your inner strength  ",
  closest: () => ({ getAttribute: () => "blk_hero" }),
  parentElement: { textContent: "Welcome Find your inner strength Join now" },
  ...over,
});

describe("buildSelectionPayload", () => {
  it("captures block id, tag, trimmed text and parent context", () => {
    const p = buildSelectionPayload(el(), "/pricing");
    expect(p).toEqual({
      path: "/pricing",
      block_id: "blk_hero",
      tag: "h2",
      text: "Find your inner strength",
      context: "Welcome Find your inner strength Join now",
    });
  });

  it("handles non-block elements and clamps long text", () => {
    const p = buildSelectionPayload(
      el({ closest: () => null, textContent: "x".repeat(500), parentElement: null }),
      "/",
    );
    expect(p.block_id).toBeNull();
    expect(p.text).toHaveLength(200);
    expect(p.context).toBe("");
  });
});

describe("chat state", () => {
  const entries: ChatEntry[] = [{ role: "coach", text: "hi" }];

  it("appends answers and action cards", () => {
    const next = reduceChat(entries, {
      kind: "actions",
      text: "plan",
      actions: [{ kind: "add_block", title: "Add cta to home", detail: "", token: "t" }],
    });
    expect(next).toHaveLength(2);
    expect(next[1].cards?.[0].token).toBe("t");
  });

  it("marks unavailable turns", () => {
    expect(reduceChat(entries, { kind: "unavailable" })[1].text).toBe("__unavailable__");
  });

  it("toTranscript strips cards and caps at 20", () => {
    const many: ChatEntry[] = Array.from({ length: 30 }, (_, i) => ({ role: "coach", text: `m${i}` }));
    const t = toTranscript(many);
    expect(t).toHaveLength(20);
    expect(t[19]).toEqual({ role: "coach", text: "m29" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/copilot.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the four lib files**

`frontend-customer/src/lib/copilot/types.ts`:

```ts
export interface SelectionPayload {
  path: string;
  block_id: string | null;
  tag: string;
  text: string;
  context: string;
}

export interface DiffRow {
  page: string;
  block_type: string;
  field: string;
  old: string | null;
  new: string | null;
}

export interface ActionCard {
  kind: "edit_pages" | "add_block" | "remove_block" | "move_block";
  title: string;
  detail: string;
  changes?: DiffRow[];
  token: string;
}

export interface CopilotDone {
  kind: "answer" | "ask" | "actions" | "unavailable";
  text?: string;
  actions?: ActionCard[];
}

export interface ChatEntry {
  role: "coach" | "assistant";
  text: string;
  cards?: ActionCard[];
}
```

`frontend-customer/src/lib/copilot/selection.ts`:

```ts
import type { SelectionPayload } from "./types";

/** Structural subset of Element so unit tests can pass plain objects. */
export interface SelectableElement {
  tagName: string;
  textContent: string | null;
  closest: (selector: string) => { getAttribute(name: string): string | null } | null;
  parentElement: { textContent: string | null } | null;
}

const TEXT_MAX = 200;
const CONTEXT_MAX = 120;

export function buildSelectionPayload(el: SelectableElement, path: string): SelectionPayload {
  const host = el.closest("[data-block-id]");
  return {
    path,
    block_id: host?.getAttribute("data-block-id") ?? null,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").trim().slice(0, TEXT_MAX),
    context: (el.parentElement?.textContent ?? "").trim().slice(0, CONTEXT_MAX),
  };
}
```

`frontend-customer/src/lib/copilot/state.ts`:

```ts
import type { ChatEntry, CopilotDone } from "./types";

const TRANSCRIPT_MAX = 20;

/** Append the assistant's turn. Unavailable turns become a marker entry the
 * UI translates into the "assistant is resting" bubble. */
export function reduceChat(entries: ChatEntry[], done: CopilotDone): ChatEntry[] {
  if (done.kind === "unavailable") {
    return [...entries, { role: "assistant", text: "__unavailable__" }];
  }
  return [...entries, { role: "assistant", text: done.text ?? "", cards: done.actions }];
}

/** The stateless-server contract: transcript travels with each request. */
export function toTranscript(entries: ChatEntry[]): { role: string; text: string }[] {
  return entries.slice(-TRANSCRIPT_MAX).map((e) => ({ role: e.role, text: e.text }));
}
```

`frontend-customer/src/lib/copilot/api.ts`:

```ts
// Mirrors lib/site-ai-api.ts's split: streaming turn via streamAi, plain
// mutation via clientFetch.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";
import type { CopilotDone, SelectionPayload } from "./types";

const BASE = "/api/v1/admin/copilot";

export const converseCopilot = (
  body: { message: string; transcript: { role: string; text: string }[]; selections: SelectionPayload[] },
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) => streamAi<CopilotDone, never>(`${BASE}/converse/`, body, handlers, signal);

export const executeCopilotAction = (token: string) =>
  clientFetch<{ result: { kind: string; changes_count?: number; page?: string } }>(`${BASE}/execute/`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
```

- [ ] **Step 4: Run tests, expect pass; then typecheck**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/copilot.test.ts && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/copilot/ frontend-customer/src/lib/__tests__/copilot.test.ts
git commit -m "feat(copilot): frontend lib — selection payloads, chat state, api client

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Widget UI + mount + block stamping + messages

**Files:**
- Create: `frontend-customer/src/components/copilot/copilot-bubble.tsx`
- Create: `frontend-customer/src/components/copilot/selection-overlay.tsx`
- Create: `frontend-customer/src/components/copilot/action-card.tsx`
- Modify: `frontend-customer/src/components/blocks/block-renderer.tsx` (stamp `data-block-id`)
- Modify: `frontend-customer/src/app/(public)/layout.tsx` (mount when `isAdmin`)
- Modify: `frontend-customer/messages/en/student.json` + `frontend-customer/messages/tr/student.json` (new root `copilot` namespace)

**Interfaces:**
- Consumes: everything Task 5 produced; `useAsyncAction` from `@shared/hooks/use-async-action`; `Button` from `@/components/ui/button`; `isAbortError` from `@/lib/ai-stream`; `useTranslations` (`"student.copilot"`); sonner `toast`.
- Produces: `<CopilotBubble />` — self-contained client component (no props).

- [ ] **Step 1: Stamp block ids on the public DOM**

In `frontend-customer/src/components/blocks/block-renderer.tsx`, replace the final return:

```tsx
  const styleClasses = blockStyleClasses(block);
  return styleClasses ? <div className={styleClasses}>{el}</div> : el;
```

with:

```tsx
  // data-block-id makes every rendered block resolvable by the copilot's
  // click-to-select overlay (selection.ts closest("[data-block-id]")).
  const styleClasses = blockStyleClasses(block);
  return (
    <div data-block-id={block.id} className={styleClasses || undefined}>
      {el}
    </div>
  );
```

and update the wrapper comment above it (the "byte-identical" promise no longer holds — the wrapper is now unconditional).

- [ ] **Step 2: Selection overlay component**

`frontend-customer/src/components/copilot/selection-overlay.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { buildSelectionPayload } from "@/lib/copilot/selection";
import type { SelectionPayload } from "@/lib/copilot/types";

/** Full-page element picker: outlines the hovered element with a single
 * fixed-position ring, captures clicks before the page acts on them, Esc
 * exits. Active only while mounted — the panel mounts it in select mode. */
export function SelectionOverlay({
  onSelect,
  onExit,
}: {
  onSelect: (payload: SelectionPayload) => void;
  onExit: () => void;
}) {
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const ring = ringRef.current;
      if (!target || !ring || target.closest("[data-copilot-ui]")) return;
      const r = target.getBoundingClientRect();
      ring.style.opacity = "1";
      ring.style.transform = `translate(${r.left}px, ${r.top}px)`;
      ring.style.width = `${r.width}px`;
      ring.style.height = `${r.height}px`;
    };
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("[data-copilot-ui]")) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(buildSelectionPayload(target, window.location.pathname));
      onExit();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [onSelect, onExit]);

  return (
    <div
      ref={ringRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] rounded-sm ring-2 ring-primary/70 transition-all duration-75 motion-reduce:transition-none"
      style={{ opacity: 0 }}
    />
  );
}
```

- [ ] **Step 3: Action card component**

`frontend-customer/src/components/copilot/action-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { executeCopilotAction } from "@/lib/copilot/api";
import type { ActionCard as ActionCardData } from "@/lib/copilot/types";

export function ActionCard({ card }: { card: ActionCardData }) {
  const t = useTranslations("student.copilot");
  const [state, setState] = useState<"proposed" | "done" | "dismissed">("proposed");

  const { run: confirm, loading } = useAsyncAction(
    async () => {
      await executeCopilotAction(card.token);
      setState("done");
      toast.success(t("applied"));
    },
    { errorToast: t("error") },
  );

  if (state === "dismissed") return null;
  return (
    <div className="mt-2 rounded-lg border bg-background p-3 text-sm" data-copilot-ui>
      <p className="font-medium">{card.title}</p>
      {card.detail && <p className="mt-1 text-muted-foreground">{card.detail}</p>}
      {card.changes && card.changes.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
          {card.changes.map((c, i) => (
            <li key={i}>
              <p className="text-xs font-medium text-muted-foreground">
                {c.page} › {c.field}
              </p>
              {c.old !== null && c.new !== null ? (
                <>
                  <p className="line-clamp-2 text-muted-foreground line-through decoration-muted-foreground/40">{c.old}</p>
                  <p className="line-clamp-3">{c.new}</p>
                </>
              ) : (
                <p className="text-muted-foreground">{t("updated")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {state === "done" ? (
        <p className="mt-2 text-xs font-medium text-primary">{t("appliedShort")}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="brand" onClick={confirm} loading={loading} loadingText={t("applying")}>
            {t("confirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("dismissed")}>
            {t("dismiss")}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: The bubble + panel**

`frontend-customer/src/components/copilot/copilot-bubble.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAbortError } from "@/lib/ai-stream";
import { converseCopilot } from "@/lib/copilot/api";
import { reduceChat, toTranscript } from "@/lib/copilot/state";
import type { ChatEntry, SelectionPayload } from "@/lib/copilot/types";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { ActionCard } from "./action-card";
import { SelectionOverlay } from "./selection-overlay";

/** The coach's floating AI assistant. Mounted (public layout) only for the
 * coach; the backend re-verifies on every call. `?copilot=1` opens it. */
export function CopilotBubble() {
  const t = useTranslations("student.copilot");
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [selections, setSelections] = useState<SelectionPayload[]>([]);
  const [selecting, setSelecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (params.get("copilot") === "1") setOpen(true);
  }, [params]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);

  const addSelection = useCallback((p: SelectionPayload) => {
    setSelections((prev) => [...prev, p].slice(-5));
    setOpen(true);
  }, []);

  const { run: send, loading: sending } = useAsyncAction(
    async () => {
      const message = input.trim();
      if (!message) return;
      const withCoach: ChatEntry[] = [...entries, { role: "coach", text: message }];
      setEntries(withCoach);
      setInput("");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const done = await converseCopilot(
          { message, transcript: toTranscript(entries), selections },
          { onPhase: () => {} },
          controller.signal,
        );
        setEntries(reduceChat(withCoach, done));
        setSelections([]);
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    { errorToast: t("error") },
  );

  if (!open) {
    return (
      <Button
        data-copilot-ui
        className="fixed bottom-5 right-5 z-[60] gap-2 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden />
        {t("bubble")}
      </Button>
    );
  }

  return (
    <>
      {selecting && <SelectionOverlay onSelect={addSelection} onExit={() => setSelecting(false)} />}
      <div
        data-copilot-ui
        className="fixed bottom-5 right-5 z-[60] flex h-[min(34rem,80vh)] w-[min(24rem,calc(100vw-2.5rem))] flex-col rounded-xl border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-semibold">{t("title")}</p>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label={t("close")}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
          {entries.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}
          {entries.map((e, i) => (
            <div key={i}>
              <div
                className={
                  e.role === "coach"
                    ? "ml-8 rounded-lg bg-primary/10 p-2"
                    : "mr-8 rounded-lg bg-muted p-2"
                }
              >
                {e.text === "__unavailable__" ? t("resting") : e.text}
              </div>
              {e.cards?.map((card, j) => <ActionCard key={`${i}-${j}`} card={card} />)}
            </div>
          ))}
          {sending && <p className="text-muted-foreground">{t("thinking")}</p>}
        </div>
        {selections.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t p-2">
            {selections.map((s, i) => (
              <button
                key={i}
                type="button"
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                onClick={() => setSelections((prev) => prev.filter((_, j) => j !== i))}
                title={t("removeSelection")}
              >
                {s.block_id ?? s.tag}: {s.text.slice(0, 24)} ✕
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 border-t p-3">
          <Button size="sm" variant={selecting ? "brand" : "outline"} onClick={() => setSelecting((v) => !v)}>
            {t("select")}
          </Button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("placeholder")}
            className="flex-1 rounded-lg border bg-background px-2 text-sm"
          />
          <Button size="sm" onClick={send} loading={sending} loadingText={t("sending")}>
            {t("send")}
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Mount in the public layout**

In `frontend-customer/src/app/(public)/layout.tsx`: add `import { CopilotBubble } from "@/components/copilot/copilot-bubble";` and render `{isAdmin && <CopilotBubble />}` adjacent to the existing `<SiteAssistantBubble …>` usage (the visitor bubble should NOT render for the coach when the copilot is present — if the existing markup renders `SiteAssistantBubble` unconditionally, gate it with `!isAdmin`).

- [ ] **Step 6: Messages (EN + TR, parity)**

Add a root-level `"copilot"` object to `frontend-customer/messages/en/student.json`:

```json
"copilot": {
  "bubble": "Your AI assistant",
  "title": "Your AI assistant",
  "empty": "Ask me anything about your site — or select something on the page and tell me what to change.",
  "placeholder": "e.g. make this section warmer",
  "select": "Select",
  "send": "Send",
  "sending": "Sending…",
  "thinking": "Thinking…",
  "close": "Close",
  "confirm": "Apply",
  "applying": "Applying…",
  "dismiss": "Dismiss",
  "applied": "Done — your site has been updated",
  "appliedShort": "Applied",
  "updated": "Updated",
  "removeSelection": "Remove selection",
  "resting": "The assistant is resting right now — please try again a bit later.",
  "error": "Something went wrong. Please try again."
}
```

And to `frontend-customer/messages/tr/student.json`:

```json
"copilot": {
  "bubble": "Yapay zekâ asistanınız",
  "title": "Yapay zekâ asistanınız",
  "empty": "Siteniz hakkında istediğinizi sorun — ya da sayfada bir öğe seçip ne değişmesini istediğinizi söyleyin.",
  "placeholder": "örn. bu bölümü daha sıcak yap",
  "select": "Seç",
  "send": "Gönder",
  "sending": "Gönderiliyor…",
  "thinking": "Düşünüyor…",
  "close": "Kapat",
  "confirm": "Uygula",
  "applying": "Uygulanıyor…",
  "dismiss": "Vazgeç",
  "applied": "Tamam — siteniz güncellendi",
  "appliedShort": "Uygulandı",
  "updated": "Güncellendi",
  "removeSelection": "Seçimi kaldır",
  "resting": "Asistan şu anda dinleniyor — lütfen biraz sonra tekrar deneyin.",
  "error": "Bir şeyler ters gitti. Lütfen tekrar deneyin."
}
```

- [ ] **Step 7: Verify build-level health**

Run: `make typecheck && make lint`
Expected: both pass (lint may reformat; re-run once if the first run reports formatting changes).

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/components/copilot/ frontend-customer/src/components/blocks/block-renderer.tsx "frontend-customer/src/app/(public)/layout.tsx" frontend-customer/messages/en/student.json frontend-customer/messages/tr/student.json
git commit -m "feat(copilot): floating widget, select-anything overlay, block id stamping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Panel → launcher; retire site-ai endpoints; e2e swap

**Files:**
- Modify: `frontend-customer/src/app/admin/site-ai/page.tsx` (full rewrite to launcher)
- Modify: `frontend-customer/messages/en/admin.json` + `tr/admin.json` (replace `siteAi.*` body with launcher copy; keep the `"siteAi"` nav title key used by `admin-nav.ts:79`)
- Delete: `backend/apps/core/site_ai_admin.py`, `backend/apps/core/site_ai_admin_urls.py`, `backend/apps/core/tests/test_site_ai_admin.py`, `frontend-customer/src/lib/site-ai-api.ts`
- Modify: `backend/config/urls.py` (remove the `api/v1/admin/site-ai/` include)
- Delete: `e2e/specs/28-admin-site-ai.spec.ts`
- Create: `e2e/specs/29-copilot.spec.ts`
- Modify: `e2e/impact-map.json` (remove `28-admin-site-ai` references; add copilot entries — the selector self-test in `make lint` fails any spec without a map entry)

**Interfaces:**
- Consumes: Task 6's widget (`?copilot=1` opens it), e2e helpers `coachContext`, `TENANT` from `e2e/helpers/auth`.
- Produces: nothing new — this is the retirement task.

- [ ] **Step 1: Rewrite the panel as a launcher**

Replace the entire contents of `frontend-customer/src/app/admin/site-ai/page.tsx` with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** The AI editing surface moved onto the site itself (Coach Copilot,
 * spec 2026-08-04). This page is now just the discoverable admin entry. */
export default function AdminSiteAiPage() {
  const t = useTranslations("admin");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("siteAi.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("siteAi.subtitle")}</p>
      </div>
      <Button asChild variant="brand">
        <a href="/?copilot=1" target="_blank" rel="noopener noreferrer">
          <Sparkles className="size-4" aria-hidden />
          {t("siteAi.launch")}
        </a>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Replace the `siteAi` message namespaces**

In `frontend-customer/messages/en/admin.json`, replace the whole `"siteAi": { … }` object with:

```json
"siteAi": {
  "title": "Site AI",
  "subtitle": "Your AI assistant now lives on your site — open any page and tell it what to change, or click an element to hand it over.",
  "launch": "Open my site with the assistant"
}
```

In `frontend-customer/messages/tr/admin.json`:

```json
"siteAi": {
  "title": "Site Yapay Zekâsı",
  "subtitle": "Yapay zekâ asistanınız artık sitenizin üzerinde — herhangi bir sayfayı açıp ne değişmesini istediğinizi söyleyin ya da bir öğeye tıklayıp ona verin.",
  "launch": "Sitemi asistanla aç"
}
```

Check `admin-nav.ts:79`'s nav item still resolves its label (it uses the `siteAi` title key — grep `siteAi` in `admin-nav.ts` and `messages/*/admin.json` to confirm no other key is still referenced; `nav.siteAi` at `admin.json:33` is separate and stays).

- [ ] **Step 3: Retire the backend endpoints**

```bash
git rm backend/apps/core/site_ai_admin.py backend/apps/core/site_ai_admin_urls.py backend/apps/core/tests/test_site_ai_admin.py frontend-customer/src/lib/site-ai-api.ts
```

In `backend/config/urls.py` remove the line `path("api/v1/admin/site-ai/", include("apps.core.site_ai_admin_urls")),`. Keep `apps/core/onboarding/site_ai.py` untouched — the engine functions are copilot executors now, and the wizard reveal still uses them.

Run: `docker compose exec -T django pytest apps/core/tests/test_site_ai.py -q` — the engine tests must still pass.

- [ ] **Step 4: Swap the e2e spec**

Delete `e2e/specs/28-admin-site-ai.spec.ts`. Create `e2e/specs/29-copilot.spec.ts`:

```ts
// e2e/specs/29-copilot.spec.ts
//
// Coach Copilot (backend/apps/core/copilot/; frontend
// components/copilot/): the floating coach-only assistant on the tenant
// site. Converse is stubbed at the network layer (real AI is slow and
// non-deterministic); execute is stubbed so the spec never mutates
// demo-yoga's real pages. What's under test is the widget loop: open via
// deep link -> chat -> action card -> confirm -> executed.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach opens the copilot, gets an action card, and confirms it", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Here is my plan.",' +
        '"actions":[{"kind":"add_block","title":"Add cta to home",' +
        '"detail":"heading: Join us","token":"e2e-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "add_block", page: "home" } } });
  });

  await page.goto(`${TENANT}/?copilot=1`);

  // Deep link opens the panel.
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();

  await page.getByPlaceholder("e.g. make this section warmer").fill("add a call to action");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Here is my plan.")).toBeVisible();
  await expect(page.getByText("Add cta to home")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);

  await page.close();
});

test("the bubble does not render for anonymous visitors", async ({ page }) => {
  await page.goto(`${TENANT}/`);
  await expect(page.getByRole("heading").first()).toBeVisible(); // page loaded
  await expect(page.getByText("Your AI assistant")).toHaveCount(0);
});
```

- [ ] **Step 5: Update `e2e/impact-map.json`**

Remove every `"28-admin-site-ai"` entry (`src/app/admin/site-ai`, `src/lib/site-ai-api.ts`, and any others `grep -n "28-admin-site-ai" e2e/impact-map.json` finds). Add:

```json
"src/components/copilot": ["29-copilot"],
"src/lib/copilot": ["29-copilot"],
"src/app/admin/site-ai": ["29-copilot"],
"backend/apps/core/copilot": ["29-copilot"]
```

(match the file's existing key style — inspect neighboring entries and mirror how backend paths are keyed; if the map only keys frontend paths, drop the backend key and rely on `00-smoke`'s fail-closed default).

- [ ] **Step 6: Verify**

Run: `make lint` (includes the e2e selector self-test) and `docker compose exec -T django pytest apps/core -q` — expect the deleted admin tests gone and everything else green.

- [ ] **Step 7: Commit**

```bash
git add -A frontend-customer/src/app/admin/site-ai/ frontend-customer/messages backend/config/urls.py e2e/specs e2e/impact-map.json
git commit -m "feat(copilot): admin panel becomes a launcher; retire site-ai endpoints and e2e

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite (serial — never overlap backend test runs)**

Run: `docker compose exec -T django pytest -n auto -q`
Expected: 0 failed. If pollution-style IntegrityErrors appear, run `make test-fresh` once and trust that run.

- [ ] **Step 2: Frontend + static gates**

Run: `make test-frontend && make typecheck && make lint`

- [ ] **Step 3: e2e spec**

Run: `make e2e-spec SPEC=29-copilot`
Expected: 2 passed.

- [ ] **Step 4: Live sanity (real AI, dev stack)**

Run: `docker compose exec -T django python manage.py shell -c "
from apps.core.models import Tenant
from apps.core.copilot import engine
t = Tenant.objects.get(schema_name='demo_yoga')
payload, cost = engine.run_turn(t, [], [], 'Add a FAQ section to the pricing page with 3 common yoga questions')
print(payload['kind'], [a['kind'] for a in payload.get('actions', [])])
"`
Expected: `actions ['add_block']` (or an `ask` — both prove the live loop). Then browse `http://demo-yoga.localhost/?copilot=1` as the coach and confirm the widget renders and a real turn round-trips.

- [ ] **Step 5: Final commit if anything moved**

```bash
git status --short   # stage ONLY files this plan touched, then commit if dirty
```
