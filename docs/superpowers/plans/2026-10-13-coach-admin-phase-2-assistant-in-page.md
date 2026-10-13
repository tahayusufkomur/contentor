# Coach Admin Phase 2 (Assistant in the page) Implementation Plan

**Goal:** The admin's assistant knows which page and record the coach is on, offers that page's
starter prompts, drafts a course or a class series from one sentence beside the manual form, can
change a course's curriculum, and lets her undo a draft it created. Its runs carry a hub label and
a per-coach throttle.

**Spec:** `docs/superpowers/specs/2026-10-13-coach-admin-refactor-design.md` (§5.2, §5.3, §5.5, §6
Phase 2, §7). Executed inline; one commit per task.

## Global constraints

- The system prompt stays byte-identical across tenants: page, record and intent ride in the user
  turn, and nothing the client sends is copied into it verbatim. The client sends a path and an
  intent key; the server maps both through its own tables (unknown values are dropped).
- No plan check and no monthly cap (D1). One `availability()` seam in `copilot/views.py`.
- Every page keeps working by hand (D3): "Describe it" sits beside the manual entry, never in
  front of it, and no form waits on AI.
- A hub turn takes 5–15 s (D2): "Describe it" shows a waiting state and review cards, never a chat.
- New strings go through `messages/en/admin.json` (D6).
- Shared checkout: commit only the files a task names; `pre-commit run --files …` then
  `git commit --no-verify`.

## Decisions taken while planning

- **The record comes from the path, not a client field.** `/admin/courses/<slug>` and
  `/admin/blog/<id>` name their record; the server looks it up. The spec's `record?: {kind, id}`
  body field is not added: nothing needs it yet (an open event panel is a query string, and the
  events digest already lists every upcoming event).
- **Curriculum removals refuse to lose work.** `edit_curriculum` removes a lesson only when it has
  no video and no student progress, and a module only when all its lessons pass that test.
- **Undo of a created draft is exempt from "latest change only".** That rule protects page
  snapshots, which are order-dependent; deleting an untouched draft is not. A weekly series of
  eight classes can be undone card by card in any order.
- **"Unmodified" is a fingerprint,** taken after the cover is attached and compared at undo: the
  row's own fields plus, for a course, its modules and lessons. An event has no `updated_at`, so
  its fingerprint is its editable fields and it must still be `scheduled`.
- **Hub rules probed 2026-10-13** (`GET /rules`): no rule exists for `contentor:copilot` or
  `contentor:compose-blog`, so both run at the priority the app asks (interactive, background).
  Every existing `contentor:compose-*` type still has an `interactive` rule there; that is the
  owner's to change in the hub UI and is out of this plan.

## Tasks

### 1. Page context on converse (backend)

`backend/apps/core/copilot/context.py` (new), `engine.py`, `views.py`,
`tests/test_copilot_context.py` (new).

- `context.clean(tenant, raw) -> {"page": label, "path": path, "record": digest | None,
  "intent": key | None}` or `None`. Longest-prefix match of the path against a static
  `ADMIN_PAGES` table (the nav's pages); intent from `INTENTS = {"draft_course", "draft_event"}`.
- Record digest for a course: title, status, price, description (500 chars), modules and lessons
  with their ids. For a blog post: title, status, excerpt.
- `_user_turn` appends "The coach is on: …", the record digest and the intent's steer text just
  before the transcript. `SYSTEM_PROMPT` gains one static paragraph about that line.
- Tests: unknown path dropped; a path with injected text never reaches the turn; course digest
  lists module and lesson ids; unknown intent dropped; no context → turn unchanged.

### 2. Curriculum door (backend)

`engine.py` (`EditCurriculumAction`, card), `content.py` (`edit_curriculum`), `views.py`
(`_CREATORS`, audit summary), `tests/test_copilot_content.py`, `tests/test_copilot_engine.py`.

- Ops: `add_module` (title + lesson titles), `add_lesson` (module_id + title), `rename_module`,
  `rename_lesson`, `remove_module`, `remove_lesson`. At most 20 per card. Adds and renames go
  through `ModuleCreateSerializer` / `LessonCreateSerializer`.
- The card lists each op in plain words; an op naming an id that is not in that course drops the
  card with a reason.
- Tests: each op; a foreign module id is refused; a lesson with a video is not removed.

### 3. Streams and Zoom (backend)

`content.py` (one `EVENT_MODELS` table replacing the scattered `OnsiteEvent if … else LiveClass`),
`engine.py`, `views.py`, tests.

- `create_event` / `edit_event` / `set_event_cover` accept `event_kind` `stream` and `zoom`
  (`zoom_link` on create); the events digest lists all four kinds; admin and site links follow.
- Tests: create a stream and a Zoom class through their serializers; the digest shows them.

### 4. Undo for created drafts (backend)

`content.py` (fingerprints, `delete_created`), `views.py` (inverse on create, `_apply_inverse`,
undo rule, audit feed `undoable`), tests.

- Tests: undo deletes an untouched draft course / event / post / announcement; refuses after an
  edit, after publish, after a lesson is added; works when it is not the latest change; the feed
  marks what can still be undone.

### 5. Label, throttle, availability (backend)

`engine.py` (`label="contentor:copilot"`), `throttling.py` (`CopilotThrottle`, per user and
schema), `settings/base.py` (`copilot: 15/min`), `views.py` (`availability()`), `blog/ai.py` +
`blog/tasks.py` (autopilot asks as `contentor:compose-blog`), tests.

### 6. Assistant panel (frontend)

`lib/copilot/{types,api,state}.ts`, `lib/copilot/starters.ts` (new),
`components/copilot/{copilot-bubble,audit-list}.tsx`, `components/admin/{assistant-dock,
admin-shell,command-palette}.tsx`, `messages/en/admin.json`, vitest.

- `ActionKind` lists the backend's kinds; a unit test reads `engine.py` and fails when they drift.
- Converse sends `context: {path}`.
- Starters: route → three or four prompts, shown in the docked chat while it is empty or she has
  just arrived on another page. No model call.
- `dock.ask(text)`: the search box's "Ask the assistant: …" row opens the chat with her words sent.
- History rows get Undo where the server says it is still possible.

### 7. "Describe it" (frontend)

`components/admin/describe-it.tsx` (new), `components/copilot/action-card.tsx` (`onApplied`),
`app/admin/courses/page.tsx`, `app/admin/courses/new/page.tsx`, `app/admin/live/page.tsx`,
`app/admin/courses/[slug]/page.tsx` (reload after the assistant changes the course).

- One line + "Draft it"; cards render under it with Apply all; a single created course opens in
  its editor; a class series reloads the list. A reply that is a question shows inline and her
  next line answers it.

### 8. Verification and wrap-up

- `make test-changed`, `make test-frontend`, `make typecheck`, `make lint`.
- Dev stack at desktop and 375 px: context line on a course page, starters per page, a course
  drafted from one sentence and undone, a weekly class series, a curriculum change, the palette's
  ask row. One real hub turn per door.
- e2e: `25`/`27` still pass; `28-admin-assistant` covers starters and the ask row with converse
  stubbed.
- Spec status line, `help_kb.md` (what the assistant can do from a page), delete this plan.
