# Focus mode, stage 1: the foundation with the course — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "New course" opens focus mode: the guide asks one question at a time in the docked assistant while the course page on the left takes shape, from a draft created at her first answer to an outline written live, then publish or keep, behind `FOCUS_MODE_ENABLED` (off by default).

**Architecture:** A backend recipe (the course's questions, in `/setup`'s `Field` shape) drives a small synchronous flow stored per creation (`FocusCreation`, tenant schema); taps never call a model. The outline is a copilot run on the `agents` worker that writes the course in one atomic step and then emits fine-grained `step`/`field`/`row` events; the course page replays them over the saved data through one shared hook. The dock renders the guide instead of its tabs while a creation is open; the shell tucks the side menu away.

**Tech Stack:** Django 5.1 + DRF + Celery (`agents` queue) + Pydantic structured output (`apps.core.ai.structured`); Next.js 14 client components, module-level stores with `useSyncExternalStore`, vitest (pure functions only: no testing-library in this repo), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-focus-mode-design.md` (decisions F1–F13). Stage 1 = spec §8 row 1: §4, §5 steps 1–3 and 6 without the announcement, §6 items 1 and 3–6. Not in stage 1: the cover step and the Designer (stage 2), price and access, the announcement offer, follow-ups, the assistant's "Start it" entry (F7, stage 3), and "Continue your course" on Home (spec §4.2; in stage 1 she resumes by opening the course, which reopens focus mode).

## Global Constraints

- Switch: `FOCUS_MODE_ENABLED = _env_bool("FOCUS_MODE_ENABLED", False)` in `backend/config/settings/base.py`; off means every focus endpoint answers 404 except the overview (which says `enabled: false`) and the studio behaves exactly as today.
- Specialists and colours come from `frontend-customer/src/lib/copilot/team.ts` (`content` #0e8f7e for steps 1–3, `marketing` #d9622b for the finish step); names spelled exactly "Content Creating Specialist", "Marketing Specialist".
- A tap never waits on a model: start, answer, finish and leave make no model call; only the outline job does (spec §6.1).
- The outline call uses hub label `contentor:copilot` (she is watching it at step 3), `effort="medium"`, `model=settings.COPILOT_MODEL`, `max_tokens=12000`, and records spend with `ai_compose.record_spend` as `setup_flow.create_draft` does.
- The course is unpublished from creation (`content.create_course` already saves `is_published=False`); only "Publish now" publishes it (`content.publish_course`).
- Frontend conventions from root `CLAUDE.md` "Loading & feedback": `<Button loading>`, `useAsyncAction`, `<NavLink>`/`useNavigate()` (never raw `next/link` in new code), `<Spinner>`, sonner toasts, motion `motion-safe:`-gated, and `prefers-reduced-motion` shows text at once.
- Every endpoint: `@permission_classes([IsCoachOrOwner])`; a creation is only visible to its `actor` (404 otherwise).
- Shared checkout: a peer has uncommitted work in `interview.py`, `interview_milestones.py`, `cover-art.*`, `content-picker.tsx`, `store/bundles/*`. Never edit or stage those files; commit only this plan's files.
- Copy (exact): questions "What will your students learn?", "Who is it for?", "How big should it be?", "Here's your outline. Does it fit?", "Ready. Publish it now?"; buttons "You decide", "Just draft it", "Looks good, continue", "Publish now", "Keep as a draft", "Save & leave", "Fill it in myself", "All details"; answer box placeholder "Or say it your way…".

## Review Focus

1. **She edits the title (or adds her own modules) while the outline is drafting** → her title stays and her modules are never doubled; the outline only fills what is still empty. (Task 3 test.)
2. **A double tap, a second tab, or a stale answer for a question that is no longer current** → no second outline run, no 400 storm: the API returns the current state unchanged. (Task 4 test.)
3. **The outline run dies or the model fails** → the course still gets an honest fallback outline, or the guide shows "Try again", which starts one new run and never duplicates modules. (Task 3 and Task 4 tests.)
4. **The draft course is deleted while its creation is open** (by hand, or by an Undo) → the creation closes as `left` and the page shows the normal editor/list, never a 500. (Task 4 test.)
5. **The switch is turned off while a creation is open** → the course page is the plain editor, nothing breaks, the open creation is simply ignored. (Task 4 test; Task 9 manual check.)

---

### Task 1: The creation store and the switch

**Files:**
- Modify: `backend/apps/tenant_config/models.py` (after `CopilotRunEvent`)
- Create: `backend/apps/tenant_config/migrations/0032_focuscreation.py` (via `makemigrations`)
- Modify: `backend/config/settings/base.py` (next to `CURATED_IMAGE_API_FAKE`)
- Modify: `.env.example` (document `FOCUS_MODE_ENABLED=false`)
- Test: `backend/apps/core/tests/test_focus_flow.py` (created here, grows in Task 2)

**Interfaces:**
- Produces: `FocusCreation` with fields `kind: CharField(20)` ("course"), `mode: CharField(8, default="focus")` ("focus" | "form"), `actor: FK(AUTH_USER_MODEL, SET_NULL, null)`, `chat: FK(CopilotChat, SET_NULL, null)`, `record_id: IntegerField(null)`, `answers: JSONField(dict)`, `status: CharField(8, default="active")` ("active" | "done" | "left"), `outline_run: FK(CopilotRun, SET_NULL, null)`, `active_ms: PositiveIntegerField(default=0)` (her total active time; reports are added, Task 2), `created_at` (auto_now_add), `updated_at` (auto_now), `finished_at: DateTimeField(null)`; `Meta: app_label="tenant_config", ordering=["-created_at"]`. `settings.FOCUS_MODE_ENABLED: bool`.

- [ ] **Step 1: Write the failing test** `test_a_creation_starts_active_and_empty(tenant_ctx)`: create `FocusCreation(kind="course")`; assert `status == "active"`, `answers == {}`, `active_ms == 0`, `mode == "focus"`, `outline_run is None`.
- [ ] **Step 2: Run it:** `docker compose exec -T django pytest apps/core/tests/test_focus_flow.py -q -p no:cacheprovider` → FAIL (ImportError).
- [ ] **Step 3: Add the model, the setting, `.env.example` line; `docker compose exec -T django python manage.py makemigrations tenant_config -n focuscreation`.**
- [ ] **Step 4: Migrate dev (`make migrate`) and re-run** → PASS. New migration: run `make test-fresh` once before the next full suite (xdist DBs).
- [ ] **Step 5: Commit** `feat(focus): the creation store and the FOCUS_MODE_ENABLED switch`.

### Task 2: The course recipe and the flow

**Files:**
- Create: `backend/apps/core/focus/__init__.py` (empty), `backend/apps/core/focus/recipes.py`, `backend/apps/core/focus/flow.py`
- Test: `backend/apps/core/tests/test_focus_flow.py`

**Interfaces:**
- Consumes: `FocusCreation` (Task 1); `apps.tenant_config.interview_brief.Field` (reused as the question schema: `id, label, question, options, hints, delegable, starter, why, kind`); `content.create_course(user, params)`, `content.publish_course(course_id)`; `CopilotChat`.
- Produces (`recipes.py`):
  - `Recipe` frozen dataclass: `kind: str`, `questions: tuple[Field, ...]`, `specialists: dict[str, str]` (field id → specialist key).
  - `COURSE: Recipe` with, in order: `topic` (kind "text", `starter=True`, option `"A course on "`, delegable), `level` (kind "choice", options beginners/some/advanced labelled "Complete beginners"/"Some experience"/"Advanced", delegable), `size` (kind "choice", options quick/short/full labelled "Quick win"/"Short course"/"Full program", hints "1 module · 3–4 lessons"/"3 modules · about 12 lessons"/"6 modules", delegable), `outline_review` (kind "review"), `finish` (kind "finish", options publish/draft labelled "Publish now"/"Keep as a draft"). Specialists: `content` for the first four, `marketing` for `finish`.
  - `RECIPES: dict[str, Recipe] = {"course": COURSE}`.
  - `SIZES: dict[str, tuple[int, int]] = {"quick": (1, 4), "short": (3, 4), "full": (6, 4)}` (modules, lessons per module).
- Produces (`flow.py`), all called inside her tenant's context:
  - `start(user, kind: str, *, value: str | None = None, text: str | None = None, delegate: bool = False, active_ms: int = 0) -> FocusCreation` — the first answer is the topic; creates the draft course with a working title, a `CopilotChat` (title `"New course: <working title>"`[:120]), and the creation; appends the question and her answer to `chat.entries`.
  - `working_title(topic: str) -> str` — strips the starter "A course on ", capitalises the first letter, trims to 80 chars; empty → "New course".
  - `answer(creation, field: str, *, value: str | list[str] | None = None, text: str | None = None, delegate: bool = False, rest: bool = False, active_ms: int | None = None) -> FocusCreation` — ignores (returns unchanged) an answer whose `field` is not the current question; `rest=True` ("Just draft it") delegates every unanswered question before `outline_review`; once `topic`, `level` and `size` are settled and no outline run exists it calls `outline.start(creation)` (Task 3); on `outline_review`: value "ok" approves, `text` starts a redraft (`outline.start(creation, instruction=text)`), `value="retry"` after a failed run starts a new run.
  - `finish(creation, *, publish: bool, active_ms: int | None = None) -> FocusCreation` — publishes when asked, `status="done"`, `finished_at=now`, appends a closing chat line.
  - `leave(creation, *, abandon: bool = False, active_ms: int | None = None) -> FocusCreation` — records time; `abandon=True` ("Fill it in myself") sets `status="left"`.
  - `state(creation) -> dict` — `{"id", "kind", "status", "chat": int | None, "record": {"id", "slug", "title"} | None, "question": <question dict> | None, "answered": [{"field", "label"}], "outline": {"status": "idle"|"building"|"ready"|"failed", "run": int | None}, "steps": [{"id", "done"}]}`; `outline.status` comes from the run: none → idle, queued/thinking/working → building, done → ready, stopped/failed → failed; a question dict is `{"field", "kind", "question", "why", "options": [{"value", "label", "hint"}], "starter": str | None, "can_delegate": bool, "specialist": str}`. A missing course (deleted) closes the creation as `left` and returns `record: None`.
  - `current_field(creation) -> str | None` — the first recipe question not yet answered, where `outline_review` is current only once an outline run exists, and `None` when the creation is not active.
  - `active_ms` everywhere is the active time since her previous report: added to the stored total, each report capped at 600000 (ten minutes), so a double post adds nothing twice and a bogus number cannot inflate it.

- [ ] **Step 1: Write the failing tests** in `test_focus_flow.py` (owner `User` fixture as in `test_setup_status.py`; `outline.start` patched to a stub returning a `CopilotRun`):
  - `test_start_makes_an_unpublished_draft_titled_from_her_topic`: `start(user, "course", text="A course on desk yoga for office workers")` → course exists, `is_published is False`, `title == "Desk yoga for office workers"`, `creation.chat.entries[-1] == {"role": "coach", "text": "A course on desk yoga for office workers"}`.
  - `test_questions_come_in_recipe_order`: after start, `current_field == "level"`; after `answer(level, value="beginners")` → `"size"`.
  - `test_the_outline_starts_once_when_topic_level_and_size_are_settled`: answering `size` calls the stubbed `outline.start` exactly once; answering `size` again (not current) does not call it again and leaves `answers["size"]` unchanged.
  - `test_just_draft_it_delegates_the_rest`: right after start, `answer(c, "level", rest=True)` → `answers["level"] == answers["size"] == "delegate"`, outline started, `current_field == "outline_review"`.
  - `test_a_typed_review_answer_redrafts_with_her_words`: at `outline_review`, `answer(c, "outline_review", text="make module 2 about breathing")` → `outline.start` called with `instruction="make module 2 about breathing"`; `value="ok"` → `current_field == "finish"`.
  - `test_finish_publishes_only_when_asked`: `finish(c, publish=False)` → course unpublished, `status == "done"`; a second creation with `publish=True` → published.
  - `test_abandon_leaves_the_draft`: `leave(c, abandon=True)` → `status == "left"`, course still exists, `current_field(c) is None`.
  - `test_a_deleted_course_closes_the_creation` (Review Focus 4): delete the course, `state(c)["record"] is None` and `c.status == "left"`.
  - `test_active_time_adds_reported_spans`: `answer(..., active_ms=5000)` then `active_ms=3000` → stored `8000`; a report of `10**9` adds only `600000`.
- [ ] **Step 2: Run** `docker compose exec -T django pytest apps/core/tests/test_focus_flow.py -q -p no:cacheprovider` → FAIL.
- [ ] **Step 3: Implement `recipes.py` and `flow.py`** with the signatures above. Writes to a creation use `select_for_update` inside `transaction.atomic()` (two tabs). The course's own `options` for `topic`: her `/setup` course topic (`interview_brief.answers_of(tenant).get("course_topic")`) as a tile when present.
- [ ] **Step 4: Re-run** → PASS.
- [ ] **Step 5: Commit** `feat(focus): the course recipe and the question flow`.

### Task 3: The outline, written then replayed

**Files:**
- Create: `backend/apps/core/focus/outline.py`
- Modify: `backend/apps/core/copilot/runs.py` (two public helpers), `backend/apps/core/tasks.py` (one task)
- Test: `backend/apps/core/tests/test_focus_outline.py`

**Interfaces:**
- Consumes: `FocusCreation`, `RECIPES`/`SIZES` (Task 2); `runs.emit(run_id, kind, data)`; `setup_flow._DRAFT_RULES` (the shared drafting rules string); `core_ai.structured(...)`.
- Produces:
  - `runs.claim(run_id) -> bool` — `queued` → `working` (atomic update, like `execute`'s claim); False when already claimed, stopped or swept.
  - `runs.finish(run_id, ok: bool, data: dict | None = None) -> None` — under the row lock: if still active, status `done` + event `done` (`data`) or `failed` + event `failed` (`data`); a stopped/swept run is left alone.
  - `tasks.run_focus_outline(schema_name: str, run_id: int)` — `@shared_task(queue="agents", ignore_result=True)`, calls `outline.execute(schema_name, run_id)`.
  - `outline.OutlineDraft(BaseModel)`: `title: str`, `description: str`, `modules: list[_Module]` (reuse `setup_flow._Module`: `title`, `lessons: list[str]`).
  - `outline.start(creation, instruction: str = "") -> CopilotRun` — `CopilotRun(actor=creation.actor, chat=creation.chat, specialist="content", request={"focus": creation.id, "job": "outline", "instruction": instruction})`, sets `creation.outline_run`, enqueues `run_focus_outline` on commit.
  - `outline.execute(schema_name, run_id) -> None` — claim; emit `step` `{"specialist": "content", "label": "Writing your outline", "state": "start"}`; one `structured` call (fallback on `AiError` or `compose_available()` false: `fallback(answers, title)`); write; emit the reveal events; emit `step` `state: "done"`; `runs.finish(run_id, True, {"summary": "<n> modules, <m> lessons"})`. Any other exception → `runs.finish(run_id, False)`.
  - `outline.fallback(answers: dict, title: str) -> OutlineDraft` — honest, generic: `SIZES[size]` modules (short when delegated) titled "Getting started", "Building the basics", "Putting it into practice", … with lessons "Lesson 1"… (never invented facts).
  - `outline.write(course, draft: OutlineDraft, working_title: str) -> list[dict]` — one `transaction.atomic()`: title only if the course still has `working_title` (her edit wins); description only if empty; modules and lessons only if the course has no modules (her own outline wins); a redraft (instruction given) replaces modules and lessons the previous outline run created. Returns the events to emit, in order: `{"type": "field", "data": {"record": "course:<id>", "name": "title"|"description", "value": str}}` for each field written, then `{"type": "row", "data": {"record": "course:<id>", "kind": "module", "value": {"title": str, "lessons": [str]}}}` per module.
  - Prompt: system = `setup_flow._DRAFT_RULES` + a course paragraph (title ≤ 80 chars; 2–3 sentence description of who it is for and what they will be able to do; the module count and lessons per module from `SIZES`, or 3–5 modules of 2–4 lessons when delegated; titles only, no lesson text); user turn = JSON `{"topic", "level", "size", "instruction", "niche"}` with `niche` from `CoachBrief.from_tenant(tenant).subject`.

- [ ] **Step 1: Write the failing tests** (`core_ai.structured` patched to return an `OutlineDraft` with 2 modules × 2 lessons, cost `Decimal("0")`, model `"x"`; `compose_available` patched True; run created via `outline.start` with `transaction.on_commit` executed by `django_capture_on_commit_callbacks` or by calling `execute` directly):
  - `test_execute_writes_the_course_then_emits_title_description_and_rows_in_order`: event types after `execute` == `["step", "field", "field", "row", "row", "step", "done"]`; course has 2 modules / 4 lessons; run status `done`.
  - `test_her_title_and_her_modules_win` (Review Focus 1): rename the course before `execute`, add one module by hand → after `execute` the title is hers, the course has exactly her 1 module, no `field:title` and no `row` events.
  - `test_a_model_failure_falls_back_to_an_honest_outline` (Review Focus 3): `structured` raises `AiError` → course has `SIZES["short"][0]` modules, run `done`.
  - `test_a_redraft_replaces_only_the_previous_outline`: execute once, then `outline.start(c, instruction="fewer lessons")` + execute with a 1-module draft → 1 module, run `done`.
  - `test_finish_never_revives_a_stopped_run`: `runs.stop(run_id)` before `runs.finish(run_id, True)` → status stays `stopped`, no `done` event.
- [ ] **Step 2: Run** `docker compose exec -T django pytest apps/core/tests/test_focus_outline.py -q -p no:cacheprovider` → FAIL.
- [ ] **Step 3: Implement** the helpers, task and module with the signatures above.
- [ ] **Step 4: Re-run, plus the existing runs tests:** `docker compose exec -T django pytest apps/core/tests/test_focus_outline.py apps/core/tests -k "run" -q -p no:cacheprovider` → PASS. Then recreate the agents worker so it registers the task: `docker compose up -d --force-recreate celery-agents` (task registration is cached; see memory "dev-stack staleness traps").
- [ ] **Step 5: Commit** `feat(focus): the outline job writes the course and emits its reveal`.

### Task 4: The API, and the timing command

**Files:**
- Create: `backend/apps/core/focus/views.py`, `backend/apps/core/focus/urls.py`, `backend/apps/tenant_config/management/commands/focus_timing.py`
- Modify: `backend/config/urls.py` (mount `path("api/v1/admin/focus/", include("apps.core.focus.urls"))` beside the copilot line)
- Test: `backend/apps/core/tests/test_focus_api.py`, `backend/apps/core/tests/test_focus_timing.py`

**Interfaces:**
- Consumes: `flow.*` (Task 2), `FocusCreation`.
- Produces (all JSON; `state` = `flow.state(creation)`):
  - `GET /api/v1/admin/focus/` → `{"enabled": bool, "first": {"course": <question dict for topic>}, "open": [{"id", "kind", "record": {"id", "slug", "title"}}]}` (her active creations with a live record). Answers 200 with `enabled: false` when the switch is off (and `first: {}`, `open: []`).
  - `POST /api/v1/admin/focus/` body `{"kind": "course", "value"?, "text"?, "delegate"?, "active_ms"?}` → 201 `state`.
  - `GET /api/v1/admin/focus/<id>/` → `state`.
  - `POST /api/v1/admin/focus/<id>/answer/` body `{"field", "value"?, "text"?, "delegate"?, "rest"?, "active_ms"?}` → `state`.
  - `POST /api/v1/admin/focus/<id>/finish/` body `{"publish": bool, "active_ms"?}` → `state`.
  - `POST /api/v1/admin/focus/<id>/leave/` body `{"abandon"?: bool, "active_ms"?}` → `state`.
  - `POST /api/v1/admin/focus/form-timing/` body `{"course_id": int, "active_ms": int}` → 201; records `FocusCreation(mode="form", kind="course", record_id, status="done", active_ms, finished_at=now)` for a course of hers.
  - Switch off: every endpoint but the overview → 404. Another coach's creation → 404. A student → 403. Bad `kind` → 400 `{"detail": "unknown_kind"}`.
  - `focus_timing.summarize(rows: list[dict]) -> dict` — rows `{"mode", "active_ms", "complete": bool}`; returns per mode `{"count", "complete", "median_ms"}` where `median_ms` is the median over complete rows only (None when none). The command walks every tenant, builds rows from done creations (`complete` = the course exists, has ≥1 module with ≥1 lesson, and has a cover: `thumbnail_id` or `thumbnail_url`) and prints the summary as JSON. `# ponytail:` comment: form timing stops at the create click, so later editor time is not counted; the stage 3 scripted comparison is the real gate (spec §6.6).

- [ ] **Step 1: Write the failing tests** (`test_focus_api.py`, `@override_settings(FOCUS_MODE_ENABLED=True)` unless stated; `outline.start` patched):
  - `test_overview_says_off_when_the_switch_is_off` (no override) → `enabled is False`; `POST /focus/` → 404.
  - `test_start_answer_finish_round_trip`: start with text → 201, `state["question"]["field"] == "level"`, `record.slug` set; answer level/size → `question.field == "outline_review"`, `outline.status == "building"`; answer `outline_review` "ok" → `finish`; finish publish false → `status == "done"`.
  - `test_a_stale_or_double_answer_returns_the_same_state` (Review Focus 2): post `size` twice → second response equals the first; `outline.start` called once.
  - `test_retry_after_a_failed_outline_starts_one_new_run` (Review Focus 3): mark the run `failed`; `state["outline"]["status"] == "failed"`; answer `outline_review` `value="retry"` → one new run, status `building`.
  - `test_switching_off_hides_an_open_creation` (Review Focus 5): start with the switch on, then with it off `GET /focus/<id>/` → 404 and overview `open == []`.
  - `test_creations_are_private_to_their_coach`: a second owner gets 404 on the first owner's creation.
  - `test_form_timing_records_a_form_creation`: post `{course_id, active_ms: 42000}` → a `FocusCreation(mode="form", active_ms=42000)`.
  - In `test_focus_timing.py`: `test_summarize_medians_complete_rows_per_mode`: rows focus 60s complete, focus 120s complete, focus 10s incomplete, form 300s complete → `{"focus": {"count": 3, "complete": 2, "median_ms": 90000}, "form": {"count": 1, "complete": 1, "median_ms": 300000}}`.
- [ ] **Step 2: Run** `docker compose exec -T django pytest apps/core/tests/test_focus_api.py apps/core/tests/test_focus_timing.py -q -p no:cacheprovider` → FAIL.
- [ ] **Step 3: Implement** views (function views with `@api_view`, like `copilot/views.py`), urls and the command.
- [ ] **Step 4: Re-run** → PASS; then `cd frontend-customer && npm run gen:api` inside the container (`docker compose exec -T nextjs-customer npm run gen:api`), `npx prettier --write src/types/api-generated.ts`, and check the diff only adds focus paths.
- [ ] **Step 5: Commit** `feat(focus): endpoints for starting, answering, finishing and timing a creation`.

### Task 5: Frontend client, store and active time

**Files:**
- Create: `frontend-customer/src/lib/focus/api.ts`, `frontend-customer/src/lib/focus/store.ts`, `frontend-customer/src/lib/focus/active-time.ts`
- Test: `frontend-customer/src/lib/__tests__/focus-store.test.ts`, `frontend-customer/src/lib/__tests__/focus-active-time.test.ts`

**Interfaces:**
- Consumes: the endpoints of Task 4.
- Produces:
  - Types: `FocusQuestion`, `FocusState`, `FocusOverview` mirroring Task 4's dicts exactly (`question.kind: "text" | "choice" | "review" | "finish"`, `outline.status: "idle" | "building" | "ready" | "failed"`).
  - `api.ts`: `fetchOverview(): Promise<FocusOverview>`, `startCreation(body): Promise<FocusState>`, `fetchCreation(id)`, `answerCreation(id, body)`, `finishCreation(id, body)`, `leaveCreation(id, body)`, `postFormTiming(courseId, activeMs)` (all through `clientFetch`).
  - `store.ts` (module-level, `useSyncExternalStore`, the `lib/setup-assistant.ts` idiom): `useFocusOverview(): FocusOverview | null` (one fetch shared by every caller, fail-soft to `null`); `refreshFocusOverview()`; `openCreationFor(overview, kind, recordId): number | null`; `setActiveCreation(state: FocusState | null)`; `useActiveCreation(): FocusState | null`; `focusProgress(state): { done: number; total: number }` (pure: counts `steps`).
  - `active-time.ts`: `startActiveTime(key: string): void` and `takeActiveMs(key: string): number` (the visible time since the last take, then resets) — counts only while `document.visibilityState === "visible"`, per key, in module state so it survives client navigation from `/admin/courses/new` to the course page (the whole creation uses the key `"focus:course"`; the plain form uses `"form:new-course"`); the pure core `accumulate(prev: { total: number; since: number | null }, event: "visible" | "hidden", now: number)` is what the tests drive.
- [ ] **Step 1: Write the failing tests:** `openCreationFor` returns the creation id whose `record.id` matches and `null` otherwise; `focusProgress` counts done steps; `accumulate` adds only visible spans (`visible@0, hidden@1000, visible@5000, hidden@5500` → `1500`); `takeActiveMs` returns the span once and `0` on an immediate second take.
- [ ] **Step 2: Run** `docker compose exec -T nextjs-customer npx vitest run src/lib/__tests__/focus-store.test.ts src/lib/__tests__/focus-active-time.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Re-run** → PASS.
- [ ] **Step 5: Commit** `feat(focus): client, store and active-time counter`.

### Task 6: Live events on the page (the shared hook)

**Files:**
- Modify: `frontend-customer/src/lib/copilot/runs.ts` (`RunState.events`), `frontend-customer/src/lib/copilot/types.ts` (event data types if `RunDetail` needs them)
- Create: `frontend-customer/src/lib/copilot/live.ts`, `frontend-customer/src/components/focus/working-tag.tsx`
- Test: `frontend-customer/src/lib/__tests__/copilot-live.test.ts` (and extend `copilot-runs.test.ts`)

**Interfaces:**
- Consumes: Task 3's event shapes (`step`, `field`, `row` with `record: "course:<id>"`).
- Produces:
  - `RunState.events: RunEvent[]` — `applyRun` keeps `step`/`field`/`row` events in order (still sets `reply` as today); `RunEvent = { seq: number; type: "step" | "field" | "row"; data: Record<string, unknown> }`.
  - `liveFrame(events: RunEvent[], record: string, elapsedMs: number, cps = 60): LiveFrame` (pure) where `LiveFrame = { fields: Record<string, { value: string; typing: boolean }>; rows: { title: string; lessons: string[]; typing: boolean }[]; working: { specialist: SpecialistKey; label: string } | null; settled: boolean }`. Events for other records are ignored; each field's text reveals at `cps` characters per second, one after another, then rows one by one (a row's title, then its lessons); `settled` once every reveal is complete and a `step` with `state: "done"` was seen.
  - `useLiveRecord(record: string, runId: number | null): LiveFrame | null` — `trackRun(runId, "content")` when given; drives `elapsedMs` with `requestAnimationFrame` from the first event's arrival; with `prefers-reduced-motion: reduce` passes `elapsedMs = Infinity` (everything at once); `null` when there is no run.
  - `WorkingTag({ specialist, label }: { specialist: SpecialistKey; label: string })` — the "Specialist · doing" pill in the specialist's colour from `team.ts` (Designer spec §7.5's shared tag, first user here).
- [ ] **Step 1: Write the failing tests:** `applyRun` keeps field/row events and ignores repeats (`seq <= lastSeq`); `liveFrame` at `elapsedMs=0` shows the first field empty and typing; at a mid time shows a prefix of the title; at `Infinity` shows every field and row complete with `settled: true` only when the `step done` event is present; events for `course:2` do not appear in a frame for `course:1`.
- [ ] **Step 2: Run** `docker compose exec -T nextjs-customer npx vitest run src/lib/__tests__/copilot-live.test.ts src/lib/__tests__/copilot-runs.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run** → PASS (the existing `copilot-runs` tests still pass).
- [ ] **Step 5: Commit** `feat(copilot): run events replayed live on a page, and the working tag`.

### Task 7: The guide in the dock

**Files:**
- Create: `frontend-customer/src/components/focus/focus-guide.tsx`, `frontend-customer/src/components/focus/guide-question.tsx`
- Modify: `frontend-customer/src/components/admin/assistant-dock.tsx`, `frontend-customer/messages/en/admin.json` (a `focus` block with the copy from Global Constraints)
- Test: `frontend-customer/src/lib/__tests__/focus-guide.test.ts`

**Interfaces:**
- Consumes: `useActiveCreation`, `setActiveCreation`, `answerCreation`, `finishCreation`, `activeMs` (Task 5); `AnswerBox`, `StarterCard` from `components/setup-flow/`; `WorkingTag` (Task 6); `saveUiState` from `lib/copilot/storage`.
- Produces:
  - `guideBody(question: FocusQuestion, input: { picked: string | null; text: string; delegate: boolean; rest: boolean }): AnswerBody | null` (pure, in `frontend-customer/src/lib/focus/guide.ts`, created in this task) — the request a screen sends: a tile → `{field, value}`; typed text → `{field, text}`; "You decide" → `{field, delegate: true}`; "Just draft it" → `{field, rest: true}`; nothing picked or typed → `null`.
  - `GuideQuestion({ question, sending, onSend })` — the specialist's `WorkingTag`-style header with its name, the question, `why` under it, tiles (option label + hint) that send on tap, the topic's starter via `StarterCard`, "You decide" when `can_delegate`, "Just draft it" on the questions before `outline_review`, and `AnswerBox` ("Or say it your way…").
  - `FocusGuide()` — reads the active creation. A provisional one (`id === 0`, from `FocusStart`) sends its first answer with `startCreation({ kind: "course", ...body })`, then `setActiveCreation(state)`, `refreshFocusOverview()` and `navigate(`/admin/courses/${state.record.slug}`)`. It shows answered lines (short), then by question kind: `GuideQuestion`; `review` → by `outline.status`: building = "Writing your outline…" with a `<Spinner>`, ready = "Looks good, continue" + answer box for changes, failed = "Try again" (sends `value: "retry"`); `finish` = "Publish now" / "Keep as a draft" (`finishCreation`), after which it calls `saveUiState({ open: true, chatId: state.chat })`, `setActiveCreation(null)` and a toast. Every send passes `active_ms: takeActiveMs("focus:course")` and is wrapped in `useAsyncAction`. While `outline.status === "building"` it polls `fetchCreation` every 1.5 s to move to the review buttons, and shows **Stop** (`stopRun(outline.run)` from `lib/copilot/api.ts`, then one `fetchCreation`), after which the screen offers "Try again" (spec §4.1).
  - `AssistantDock`: when `useActiveCreation()` is set it opens itself, hides the tab strip, and renders `<FocusGuide />` with a header "New course"; below `lg` the aside is a bottom sheet (`fixed inset-x-0 bottom-0 max-h-[60vh] rounded-t-xl border-t`) that does not make the page inert (spec F12).
- [ ] **Step 1: Write the failing tests** for `guideBody`: tile → `{field: "level", value: "beginners"}`; text → `{field: "topic", text: "A course on desk yoga"}`; delegate → `{field: "size", delegate: true}`; rest → `{field: "level", rest: true}`; empty → `null`.
- [ ] **Step 2: Run** `docker compose exec -T nextjs-customer npx vitest run src/lib/__tests__/focus-guide.test.ts` → FAIL.
- [ ] **Step 3: Implement** the components and the dock change; `node scripts/check-loading-patterns.mjs` must pass.
- [ ] **Step 4: Re-run the test, the loading check and** `docker compose exec -T nextjs-customer npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(focus): the guide in the assistant dock`.

### Task 8: The course page in focus mode, the shell, and the entry

**Files:**
- Modify: `frontend-customer/src/app/admin/courses/new/page.tsx`, `frontend-customer/src/app/admin/courses/[slug]/page.tsx`, `frontend-customer/src/components/admin/course-form.tsx`, `frontend-customer/src/components/admin/admin-shell.tsx`
- Create: `frontend-customer/src/components/focus/focus-bar.tsx`, `frontend-customer/src/components/focus/live-outline.tsx`, `frontend-customer/src/components/focus/focus-start.tsx`
- Test: `e2e/specs/33-focus-course.spec.ts` (Task 9) covers this task's wiring; this task's own check is typecheck + a dev browser pass.

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces:
  - `FocusStart({ kind: "course" })` — the new-course page in focus mode: left, an empty course page outline (title, description, cover slot and curriculum as quiet placeholders); on mount it calls `startActiveTime("focus:course")` and `setActiveCreation(provisional)`, a `FocusState` with `id: 0`, `record: null` and `question: overview.first.course`, which opens the dock on the first question (Task 7 sends it).
  - `/admin/courses/new`: when `useFocusOverview()?.enabled` and no `?form=1` → `<FocusStart kind="course" />` plus a "Fill it in myself" `NavLink` to `?form=1`; otherwise today's page (DescribeIt + CourseForm), where `CourseForm`'s new `onCreated` posts `postFormTiming(course.id, takeActiveMs("form:new-course"))` (the page calls `startActiveTime("form:new-course")` on mount).
  - `/admin/courses/[slug]`: `const creationId = openCreationFor(overview, "course", course.id)`; when set, fetch it, `setActiveCreation` and `startActiveTime("focus:course")`; pass `focus={{ record: \`course:${course.id}\`, runId: state.outline.run }}` to `CourseForm`; clear with `setActiveCreation(null)` on unmount.
  - `CourseForm` new props: `focus?: { record: string; runId: number | null }` and `onCreated?: (course: CourseDetail) => void`. In focus mode: the settings card shows title, description, cover, pricing; filters, tags and the publish switch sit behind an "All details" toggle (closed); title/description show `live.fields.*.value` while a reveal runs and are `readOnly` with a `WorkingTag` while their own field types (F9: only what is being written is locked); the curriculum card shows `<LiveOutline frame={live} />` while the run is active or not yet settled, then calls `loadCourse()` once (no remount) and shows the normal editable list.
  - `LiveOutline({ frame })` — module cards with their lessons typing in, the current one outlined and tagged.
  - `FocusBar()` — replaces the search pill in the shell's top bar while a creation is active: "New course", progress dots from `focusProgress`, and "Save & leave" (`leaveCreation` with `active_ms: takeActiveMs("focus:course")`, `setActiveCreation(null)`, `navigate("/admin/courses")`).
  - `AdminShell`: `compact={studio || !!activeCreation}` and the `FocusBar` swap.
- [ ] **Step 1: Implement** the components and the page/form/shell changes.
- [ ] **Step 2: Typecheck + loading check:** `docker compose exec -T nextjs-customer npm run typecheck` and `node scripts/check-loading-patterns.mjs` → clean.
- [ ] **Step 3: Dev browser pass** with `FOCUS_MODE_ENABLED=true` in the root `.env` (then `docker compose up -d --force-recreate django celery-agents`): as coach on demo-yoga (memory: browser-pane coach login), New course → type a topic → level → size → watch the outline type in → Looks good → Keep as a draft; check: side menu tucked away, dock shows the guide, the page never remounts while typing in the title during the reveal, Save & leave then reopening the course resumes at the same question, "Fill it in myself" shows today's form. Phone width (375 px): the guide is a bottom sheet over the page. Light and dark.
- [ ] **Step 4: Commit** `feat(focus): the course page in focus mode, the focus bar and the new-course entry`.

### Task 9: End to end

**Files:**
- Create: `e2e/specs/33-focus-course.spec.ts`
- Modify: `e2e/impact-map.json` (add `"src/components/focus": ["33-focus-course"]`, `"src/lib/focus": ["33-focus-course"]`, `"src/app/admin/courses": ["02-courses", "33-focus-course"]` beside the existing `"src/app/admin/studio"` line)

**Interfaces:**
- Consumes: everything above. The spec stubs the network like `29-copilot.spec.ts`: `GET /api/v1/admin/focus/` (enabled, first question), `POST /api/v1/admin/focus/` (state with a fixture record), `/focus/<id>/answer/`, `/focus/<id>/finish/`, `/api/v1/admin/copilot/runs/<id>/**` (scripted `step`/`field`/`row`/`done` events), and `GET /api/v1/courses/<fixture slug>/` (before and after the outline).
- [ ] **Step 1: Write the spec** with three tests:
  - `"a new course is built one question at a time"`: New course → dock shows "What will your students learn?" → type → "Who is it for?" → tap "Complete beginners" → tap "Short course" → the outline's module titles appear on the page → "Looks good, continue" → "Keep as a draft" → the side menu is back and the dock is the chat.
  - `"just draft it skips to the outline"`: after the topic, "Just draft it" → the review screen.
  - `"fill it in myself is today's form"`: the link shows the Course Settings card.
- [ ] **Step 2: Run** `make e2e-spec SPEC=33-focus-course` → PASS (and `make e2e-spec SPEC=02-courses` still passes: the plain form path is unchanged with the switch off).
- [ ] **Step 3: `make lint`** (selector self-test needs the impact-map entry) → clean.
- [ ] **Step 4: Commit** `test(e2e): focus mode builds a course one question at a time`.

### Task 10: Real runs and wrap-up

- [ ] **Step 1:** With the switch on in dev, make three courses through focus mode on the real hub (different niches/sizes) and one through "Fill it in myself"; read them by eye (titles honest, no invented facts, sizes respected); run `docker compose exec -T django python manage.py focus_timing` and note the medians.
- [ ] **Step 2:** `make test-changed` (backend + vitest for the diff) → green; full backend suite once at the end (`make test`; after the new migration run `make test-fresh` first) because `apps/core` runtime code changed.
- [ ] **Step 3:** Pre-commit on the changed files → clean; final review of the whole commit range by one fresh read-only reviewer before any deploy (repo practice); deploy with the switch OFF in prod (no KV change), so prod behaviour is unchanged until stage 3.
