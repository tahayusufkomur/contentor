# Focus mode, stages 2–4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish focus mode for the course: the first answer takes everything and lesson descriptions are written (stage 2), the Designer's cover step (stage 3), and price, finish, follow-ups and the switch turned on (stage 4).

**Architecture:** Everything builds on stage 1's `apps/core/focus` (recipe, `flow`, the outline job, the endpoints at `/api/v1/admin/focus/`) and its frontend (`lib/focus/*`, `components/focus/*`, `CourseForm`'s `focus` prop, `lib/copilot/live.ts`). Every model call becomes a **focus job**: a `CopilotRun` on the `agents` worker, dispatched by one Celery task, so it survives her leaving and the ~100 s Cloudflare cap. Code still owns which questions are asked. The model only reads her words (the analysis) and drafts things (outline, descriptions, covers, follow-ups, announcement). Every job failure has a code fallback or a "Try again". The page shows a job's work by replaying its run events, as the outline does today.

**Tech Stack:** Django 5.1 + DRF, Celery (`agents` queue), Pydantic structured output through `apps.core.ai.structured`, Next.js 14 (frontend-customer), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-focus-mode-design.md` (commit `4a514976`). Read §3 (F1–F21), §5, §5.1–5.3, §6 and §7 before any task. Stage 1's code is the reference for style: `backend/apps/core/focus/flow.py`, `outline.py`, `frontend-customer/src/components/focus/focus-guide.tsx`.

## Global Constraints

- `FOCUS_MODE_ENABLED` stays default `False` until Task 4.5. Each stage still deploys (owner's standing rule: commit, deploy, verify on prod); with the switch off, the prod check is health plus migrations.
- Taps on code-owned buttons never call a model (§6 item 1). Every **typed** answer is analysed (§5.1). A tap on a model-written button (a clarify option, a follow-up option) is applied as it is, without a second analysis.
- Exact stays exact (F15): counts she gave and titles she wrote are kept word for word, in her order. A field she did not mention is never guessed.
- The outline writes at most **12 modules of 12 lessons** (`MAX_MODULES = 12`, `MAX_LESSONS = 12`). Asked for more, it says: "I drafted the first 12 modules; add the rest on the page."
- A paid price is only ever set from her tap or her own words (F11, team spec T15). No job sets a paid price.
- No model output may invent a claim, result or number (F13, F19). The price reasoning is computed by code from her own numbers.
- What she is waiting on uses hub label `contentor:copilot`. Drafting she is not waiting on (descriptions, covers drafted ahead) uses `contentor:focus-ahead`, which Task 2.1 adds to `_AGENTC_BACKGROUND_LABELS` in `backend/apps/core/ai.py`.
- A lesson counts as ready to publish with a video, or with text she wrote or edited. A description the AI wrote that she has not touched does not count (F21).
- UI copy is short and plain. New strings go in `frontend-customer/messages/en/admin.json` under `focus.*` (the only locale).
- Frontend conventions (root CLAUDE.md, enforced by `make lint`): `<Button loading>`, `<Spinner>`, `useAsyncAction`, `<NavLink>`/`useNavigate()`, sonner toasts, `motion-safe:` motion.
- Shared checkout: format and commit only your own files and hunks (memory `reference-committing-only-my-hunks-in-the-shared-checkout`). Pre-commit must be clean. Run one heavy job at a time.
- Verify each task with its focused tests: `docker compose exec django pytest <file> -q` and `cd frontend-customer && npx vitest run <file>`. Run `make test-changed` at the end of each stage, and `make e2e-spec SPEC=33-focus-course` when the screen changed.
- GitNexus calibration: run `impact` before editing `EMPTY_LESSON`, `Course.not_ready`, `publish_gap`, `_AGENTC_BACKGROUND_LABELS` and `useLiveRecord`, since each is shared beyond focus mode.

## Review Focus

1. **She types into a lesson's description while the descriptions run is writing the others** (or before it reaches that lesson). Her text must never be overwritten. Pinned in Task 2.5: `test_a_description_she_typed_meanwhile_is_never_overwritten`.
2. **Odd counts in her first answer** ("0 modules", "100 modules", "4 modules, 50 lessons", "3 modules" and five module titles). These are clamped or capped, never a crash, never more than 12 × 12. Pinned in Task 2.3: `test_counts_are_clamped_to_twelve_and_flagged_capped`, `test_more_named_modules_than_the_count_raise_the_count`.
3. **The analysis fails, is stopped, or hangs until the sweep.** The usual question comes up, her typed words are kept as the answer, and the screen never stays on "Reading your details". Pinned in Task 2.3: `test_a_failed_analysis_falls_back_to_the_usual_questions`, `test_a_stopped_analysis_settles_on_the_next_read`.
4. **A redraft lands while descriptions are being written.** The old run stops, lessons deleted under it are skipped, and the new lessons get descriptions. Pinned in Task 2.5: `test_a_redraft_stops_the_descriptions_and_rewrites_the_new_lessons`, `test_lessons_deleted_meanwhile_are_skipped`.
5. **Double taps and a vanished course in the cover step.** "Use this cover" tapped twice keeps once. A course deleted while covers draft ends quietly. Pinned in Task 3.2: `test_a_course_deleted_meanwhile_ends_the_drafting_quietly`. Pinned in Task 3.3: `test_use_this_cover_twice_keeps_once`.

## File structure

Backend, `backend/apps/core/focus/`:

| File | Responsibility | Stage |
|---|---|---|
| `jobs.py` (new) | queue / status / execute for every focus job; one Celery task | 2 |
| `analysis.py` (new) | reads a typed answer into typed fields; the `brief` it settles | 2 |
| `descriptions.py` (new) | writes lesson descriptions, one module per model call | 2 |
| `covers.py` (new) | the Designer's four drafts per round, the shared photo, keep | 3 |
| `pricing.py` (new) | the suggested price and its one line of reasoning, from her numbers | 4 |
| `announce.py` (new) | Marketing's announcement draft | 4 |
| `followup.py` (new) | one follow-up question when it is needed | 4 |
| `flow.py`, `outline.py`, `recipes.py`, `views.py`, `urls.py` | extended | 2–4 |

Other backend files: `apps/core/tasks.py` (task `run_focus_job` replaces `run_focus_outline`), `apps/core/ai.py` (background label), `apps/tenant_config/models.py` + migrations `0034`, `0035`, `apps/courses/models.py` + migration `0016`, `apps/core/copilot/context.py`, `apps/core/copilot/engine.py` (digest wording), `apps/tenant_config/setup_items.py`.

Frontend, `frontend-customer/src/`: `lib/focus/api.ts`, `lib/focus/store.ts`, `lib/focus/descriptions.ts` (new), `lib/copilot/live.ts`, `components/focus/focus-guide.tsx`, `components/focus/cover-step.tsx` (new), `components/focus/photo-row.tsx` (new), `components/focus/price-question.tsx` (new), `components/admin/course-form.tsx`, `app/admin/courses/[slug]/page.tsx`, `app/admin/page.tsx`, `components/copilot/action-card.tsx`, `components/studio/use-cover-draft.ts`.

Tests: `backend/apps/core/tests/test_focus_{jobs,analysis,descriptions,covers,pricing,announce,followup}.py` (new), the existing `test_focus_{flow,outline,api}.py`, `backend/apps/courses/tests/test_views.py`, `frontend-customer/src/lib/__tests__/focus-descriptions.test.ts` (new), `e2e/specs/33-focus-course.spec.ts`.

---

# Stage 2: the first answer takes everything, and lesson descriptions

### Task 2.1: One worker task for every focus job

**Files:**
- Create: `backend/apps/core/focus/jobs.py`
- Create: `backend/apps/tenant_config/migrations/0034_focuscreation_runs_brief_pending.py`
- Modify: `backend/apps/tenant_config/models.py` (FocusCreation), `backend/apps/core/focus/outline.py` (`start`, `execute`, `_carry_out`), `backend/apps/core/focus/flow.py` (`outline_status`, `OUTLINE_STATUS`), `backend/apps/core/tasks.py:724-730`, `backend/apps/core/ai.py:294`
- Test: `backend/apps/core/tests/test_focus_jobs.py` (new), `backend/apps/core/tests/test_focus_outline.py` (patch target and execute calls)

**Interfaces:**
- Produces:
  - `FocusCreation.runs: JSONField(default=dict)`: job name to its latest run id, for every job but the outline (the outline keeps its `outline_run` FK).
  - `FocusCreation.brief: JSONField(default=dict)`: what her typed answers settled. Keys come from Task 2.3.
  - `FocusCreation.pending: JSONField(default=dict)`: a typed answer waiting for its analysis, `{"field", "text", "rest", "run"}`.
  - `jobs.queue(creation, job: str, *, specialist: str, **request) -> CopilotRun`: creates the run with `request={"focus": creation.id, "job": job, **request}`. For `job == "outline"` it sets `creation.outline_run`; otherwise it sets `creation.runs[job] = run.id`. It saves, then sends `run_focus_job.delay(schema, run.id)` on commit.
  - `jobs.run_id(creation, job) -> int | None`
  - `jobs.status(creation, job) -> "idle" | "building" | "ready" | "failed"`: sweeps the run first, using today's `OUTLINE_STATUS` mapping, which moves here as `STATUS`.
  - `jobs.active(run_id) -> bool`: a locked (`select_for_update`) check that the run is still in `runs.ACTIVE`. Call it inside the transaction that writes.
  - `jobs.execute(schema_name, run_id) -> None`: enters the tenant, `runs.claim`, then imports `HANDLERS[job]` and calls its `carry_out(tenant, run_id)`. On any exception it logs, calls the handler's `on_failure(tenant, run_id)` when the module defines one, then `runs.finish(run_id, False)`.
  - `jobs.HANDLERS: dict[str, str]`: job name to module path. Stage 2 adds `outline`, `analysis`, `descriptions`; Task 3.2 adds `covers`; Tasks 4.2–4.3 add `announce`, `followup`.
  - `tasks.run_focus_job(schema_name, run_id)`: `@shared_task(queue="agents", ignore_result=True)`. `run_focus_outline` is deleted. Focus mode was never switched on in prod, so no queued messages carry the old name.
  - `outline.start(creation, instruction="")` keeps its signature. `outline._carry_out` is renamed `carry_out(tenant, run_id)`, and `outline.execute` is deleted.
  - `_AGENTC_BACKGROUND_LABELS` gains `"contentor:focus-ahead"`.

- [ ] **Step 1: Write the failing tests** in `test_focus_jobs.py`, using the fixtures of `test_focus_outline.py` (`owner`, an autouse patch of `tasks.run_focus_job.delay`):

```python
def test_queue_records_the_run_under_its_job(owner):
    creation = flow.start(owner, "course", value="Desk yoga")  # a tap: no analysis
    run = jobs.queue(creation, "descriptions", specialist="content")
    creation.refresh_from_db()
    assert creation.runs == {"descriptions": run.id}
    assert run.request == {"focus": creation.id, "job": "descriptions"}
    assert jobs.status(creation, "descriptions") == "building"

def test_the_outline_keeps_its_own_field(owner):
    creation = flow.start(owner, "course", value="Desk yoga")
    run = jobs.queue(creation, "outline", specialist="content", instruction="")
    creation.refresh_from_db()
    assert creation.outline_run_id == run.id and "outline" not in creation.runs

def test_a_failing_handler_calls_its_on_failure_and_fails_the_run(owner, monkeypatch):
    # A stub module registered under HANDLERS["boom"] whose carry_out raises.
    ...
    jobs.execute(SCHEMA, run.id)
    assert CopilotRun.objects.get(pk=run.id).status == "failed"
    assert called == [run.id]

def test_status_of_a_job_never_queued_is_idle(owner):
    assert jobs.status(flow.start(owner, "course", value="x"), "covers") == "idle"
```

- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_jobs.py -q` should fail with `ModuleNotFoundError: apps.core.focus.jobs`.
- [ ] **Step 3: Add the three fields and migration `0034`.** Generate it with `make makemigrations`, then rename the file to `0034_focuscreation_runs_brief_pending.py`.
- [ ] **Step 4: Implement `jobs.py`.** Move the outline onto it. `flow.outline_status` keeps its "ready when `drafted.modules` and no run" special case and asks `jobs.status(creation, "outline")` for the rest. Replace the task in `tasks.py`. Add the label to `ai.py`.
- [ ] **Step 5: Update `test_focus_outline.py`.** It patches `tasks.run_focus_job.delay` and calls `jobs.execute(SCHEMA, run_id)` where it called `outline.execute`.
- [ ] **Step 6: Run the focus tests.** `docker compose exec django pytest apps/core/tests/test_focus_jobs.py apps/core/tests/test_focus_outline.py apps/core/tests/test_focus_flow.py apps/core/tests/test_focus_api.py -q` should pass.
- [ ] **Step 7: Check the hub treats the new label as background.** Through the dev tunnel, `curl -s localhost:39300/rules` should have no rule for `contentor:focus-ahead`. A type with no rule keeps the priority the app asks for (memory `reference-agent-hub-scheduling-and-rules`). If a rule exists, note it in the commit message.
- [ ] **Step 8: Restart the agents worker** (`docker compose restart celery-agents`) so it registers `run_focus_job` (memory `reference-dev-stack-staleness-traps`). Then commit: `refactor(focus): one worker task runs every focus job`.

### Task 2.2: An untouched AI description does not count for publishing (F21)

**Files:**
- Modify: `backend/apps/courses/models.py:5-16` (`EMPTY_LESSON`, `GO_LIVE_RULE`), `Lesson` (new field and method)
- Create: `backend/apps/courses/migrations/0016_lesson_drafted_html.py`
- Modify: `backend/apps/core/copilot/context.py:83`, `backend/apps/core/copilot/engine.py:653-668` (digest header wording)
- Test: `backend/apps/courses/tests/test_views.py` (next to the existing `not_ready` tests), `backend/apps/core/tests/test_focus_outline.py`

**Interfaces:**
- Produces:
  - `Lesson.drafted_html = TextField(blank=True, default="")`: exactly what the Content Creating Specialist wrote into `content_html`. The text is hers once the two differ. No clearing hook is needed: an edit makes them differ.
  - `EMPTY_LESSON = Q(video__isnull=True, video_url="") & (Q(content_html="") | Q(content_html=F("drafted_html")))`
  - `Lesson.empty(self) -> bool`: the same rule, in Python, for code that holds the row.
  - `GO_LIVE_RULE = "a course goes live once every lesson has a video, or text you wrote or edited"`
- Everything that reads `EMPTY_LESSON` (`Course.not_ready`, the engine digest, `outline._kept`) follows on its own. `context.py` switches to `lesson.empty()`. `LessonSerializer` does not expose `drafted_html`, so no `gen:api` diff is expected.

- [ ] **Step 1: Write the failing tests:**

```python
def test_an_untouched_drafted_description_leaves_the_lesson_empty(course_with_one_lesson):
    lesson = course_with_one_lesson.modules.get().lessons.get()
    lesson.content_html = lesson.drafted_html = "<p>What this lesson covers.</p>"
    lesson.save()
    assert course_with_one_lesson.not_ready()  # still refused
    assert lesson.empty()

def test_her_edit_of_a_drafted_description_makes_it_hers(course_with_one_lesson):
    lesson = ...; lesson.drafted_html = "<p>A</p>"; lesson.content_html = "<p>A, and B.</p>"; lesson.save()
    assert course_with_one_lesson.not_ready() is None

def test_a_video_makes_a_drafted_lesson_ready(course_with_one_lesson):
    ...  # content_html == drafted_html, video_url="x" -> not_ready() is None
```

In `test_focus_outline.py`, add `test_a_module_whose_only_text_is_drafted_is_not_kept`: a redraft replaces such a module.

- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/courses/tests/test_views.py -q -k drafted` should fail (`Lesson` has no `drafted_html`).
- [ ] **Step 3: Implement the field, migration `0016`, `EMPTY_LESSON`, `Lesson.empty` and `GO_LIVE_RULE`.** In `context.py:83`, use `empty = lesson.empty()`. In the engine digest header, change "lessons with a video or text" to "lessons with a video or her own text (an untouched drafted description does not count)".
- [ ] **Step 4: Run** `docker compose exec django pytest apps/courses apps/core/tests/test_focus_outline.py apps/core/tests/test_copilot_context.py -q`. All should pass. If the context test file has another name, find it with `grep -ln "context.py\|course_context" apps/core/tests`.
- [ ] **Step 5: Commit.** `feat(courses): a description we drafted counts once she edits it`

### Task 2.3: The analysis reads every typed answer (§5.1)

**Files:**
- Create: `backend/apps/core/focus/analysis.py`
- Modify: `backend/apps/core/focus/flow.py` (`start`, `answer`, `current_field`, `question`, `state`, new `apply`, `_analyse`, `_clarify`, `_set_price`), `backend/apps/core/focus/recipes.py` (topic `why`), `backend/apps/tenant_config/setup_items.py:83-96`
- Test: `backend/apps/core/tests/test_focus_analysis.py` (new), `backend/apps/core/tests/test_focus_flow.py`

**Interfaces:**
- Consumes: `jobs.queue`, `jobs.status`, `jobs.active` (Task 2.1).
- Produces, in `analysis.py`:

```python
class NamedModule(BaseModel): title: str = ""; lessons: list[str] = []
class ClarifyOption(BaseModel): label: str; value: str  # value: "4" | "49.00" | "free" | "beginners"...
class Unclear(BaseModel):
    field: Literal["modules", "lessons", "price", "level"]; question: str; options: list[ClarifyOption]
class Analysis(BaseModel):
    answer: str = ""          # her answer to the question on screen, in her words; "" when she said something else
    topic: str = ""           # what students learn, short, her words
    level: str = ""           # beginners | some | advanced | her own words
    modules: int | None = None
    lessons: int | None = None   # per module
    total: int | None = None     # lessons in all, when she gave a total instead
    named: list[NamedModule] = []  # in her order; lessons she named without a module go in one untitled module
    price: str = ""           # "free" | "membership" | an amount in the site's currency ("49")
    notes: str = ""           # the rest she said about the course: format, promise, angle
    outline_change: str = ""  # a change to the outline she asked for (only when an outline exists)
    unclear: list[Unclear] = []

def read(tenant, text: str, *, question: str, outline_exists: bool, currency: str) -> Analysis  # raises core_ai.AiError
def brief_from(found: Analysis, brief: dict) -> dict    # merges counts, named, notes into a copy of brief; sets "analysed": True
def price_value(raw: str) -> str | None                 # "free" | "membership" | "49.00"; None when not a price
def carry_out(tenant, run_id) -> None                   # read, then flow.apply under lock, then finish the run
def on_failure(tenant, run_id) -> None                  # flow.apply(creation, None) when this run is still the pending one
```

  The model call is `core_ai.structured(system=SYSTEM, user=<json>, output_model=Analysis, model=settings.COPILOT_MODEL, max_tokens=4000, label="contentor:copilot", effort="medium")`. The user turn carries `text`, `question` (the words on screen), `outline_exists`, `currency`, and the site context (brand, niche, her course titles) as `outline._user_turn` builds them. `SYSTEM` is static, which helps prompt caching. It says: fill only what she said; never guess; a vague amount or count ("a few", "around 40–50", a currency other than `currency`) goes in `unclear` with 2–4 options; `outline_change` only when `outline_exists`.

- `brief` keys: `modules`, `lessons`, `total` (int or absent), `named` (list), `notes` (str), `capped` (bool), `analysed` (bool), `clarify` (list of `Unclear` dicts, asked in order), `asked` (fields already clarified once), `rest` (bool: "Just draft it" was tapped, set wherever `rest` is applied).
- Counts in `brief_from`: each count is clamped to 1..12 (`total` to 1..144). A value above the cap sets `capped`. `modules = max(modules or 0, len(named))` when she named more modules than she counted.
- Produces, in `flow.py`:
  - `apply(creation, found: Analysis | None) -> None`: call under lock. It reads `creation.pending`, applies it, and clears it. The effects, in order:
    1. Topic, when the pending field is `topic`: `answers.topic = text` (her whole words, which the outline reads). The course title becomes `working_title(found.topic or text)` while it is still the provisional title.
    2. Level: `answers.level` (a recipe value when it matches, else her words).
    3. Counts: `answers.size = size_label(brief)`, for example "4 modules · 3 lessons each", "4 modules" or "12 lessons". Any count settles the size question.
    4. `price` goes through `_set_price`.
    5. `answer`, for the field on screen.
    6. `outline_change`, or new counts once an outline exists: stop a building outline or descriptions run, then `outline.start(creation, instruction=text)`.
    7. `unclear`: added to `brief.clarify` minus `brief.asked`.
    8. `rest`: delegate every asked question still open.
    9. Start the outline when every asked question is answered, none is clarifying, and no outline has started.

    `found is None` (failed, stopped or swept) is stage 1's behaviour: her words answer the pending field (a redraft at the review), and `rest` delegates the others.
  - `_analyse(creation, field, text, rest) -> None`: with `ai_compose.compose_available()`, it sets `pending` and queues job `analysis`. Without it, it sets `pending` and calls `apply(creation, None)` at once.
  - `_set_price(creation, value: str) -> None`. `"free"` sets `pricing_type="free", price=0`. An amount sets `pricing_type="paid", price=amount`. `"membership"` leaves the course as it is. Each one sets `answers.price = value`.
  - `current_field(creation)` returns `None` while `pending` is set. It returns `"clarify"` while `brief.clarify` is non-empty. Otherwise it behaves as today.
  - `answer(creation, "clarify", value=<option value> | delegate=True | text=...)`. A value applies to `clarify[0].field`, pops it, and adds the field to `asked`. `delegate` sets the size or level to `DELEGATE` (for a price it only drops the item). Text is analysed with that question on screen. A field still unclear after its one question gets its usual question back.
  - `question(kind, field, creation=None)` builds the clarify question: `{"field": "clarify", "kind": "choice", "question": u.question, "why": "", "options": [{"value", "label", "hint": ""}], "starter": None, "can_delegate": True, "specialist": "content"}`.
  - `state()` adds `"reading": {"status": jobs.status(creation, "analysis"), "run": jobs.run_id(creation, "analysis")}` while `pending` is set, else `None`. It adds an answered line `{"field": "price", "label": "$49" | "Free" | "In your membership"}` when `answers.price` exists. The amount is formatted with `apps.core.access.content_currency`, with no decimals when it is a whole number. Before computing anything, it settles a pending answer whose run is terminal: `apply(creation, None)` under lock.
  - Typed text at any question but `finish` goes through `_analyse`. Taps and "You decide" behave as today.
  - `start(..., text=...)` creates the draft and the creation with `answers={}` and `pending={"field": "topic", "text": text, "rest": rest}`, then queues the analysis. Taps (`value`) and `delegate` behave as today.
- The topic `why` becomes: "Say as much as you know: who it's for, how many modules and lessons, lesson titles, the price. I'll fill in the rest for you to check."
- `setup_items._has_paid_content` excludes unpublished courses that have a `FocusCreation(mode="focus", kind="course")` row (F11: a focus draft never blocks the site's go-live).

- [ ] **Step 1: Write the failing analysis tests** in `test_focus_analysis.py`, with the model patched as `test_focus_outline._model` does:

```python
def test_counts_are_clamped_to_twelve_and_flagged_capped():
    brief = analysis.brief_from(analysis.Analysis(modules=100, lessons=0), {})
    assert brief["modules"] == 12 and brief["lessons"] == 1 and brief["capped"] is True

def test_more_named_modules_than_the_count_raise_the_count():
    found = analysis.Analysis(modules=3, named=[analysis.NamedModule(title=f"M{i}") for i in range(5)])
    assert analysis.brief_from(found, {})["modules"] == 5

def test_price_value_reads_amounts_free_and_membership():
    assert analysis.price_value("49") == "49.00"
    assert analysis.price_value("free") == "free"
    assert analysis.price_value("membership") == "membership"
    assert analysis.price_value("lots") is None and analysis.price_value("-5") is None
```

- [ ] **Step 2: Write the failing flow tests** in `test_focus_flow.py`. Run the analysis through `jobs.execute(SCHEMA, run_id)` with `analysis.core_ai.structured` patched:

```python
RICH = "A course on desk yoga for complete beginners, 4 modules of 3 lessons, $49"

def test_a_rich_first_answer_skips_what_it_settled(owner, outline_start, analysed):
    analysed(analysis.Analysis(topic="desk yoga", level="beginners", modules=4, lessons=3, price="49"))
    creation = _run_pending(flow.start(owner, "course", text=RICH))
    assert creation.answers["level"] == "beginners"
    assert creation.answers["size"] == "4 modules · 3 lessons each"
    assert Course.objects.get(pk=creation.record_id).price == Decimal("49.00")
    assert outline_start.called  # nothing left to ask before the outline
    labels = [line["label"] for line in flow.state(creation)["answered"]]
    assert "Complete beginners" in labels and "$49" in labels

def test_a_tap_never_waits_on_the_analysis(owner, outline_start):
    creation = flow.answer(flow.start(owner, "course", value="Desk yoga"), "level", value="some")
    assert not creation.pending and "analysis" not in creation.runs

def test_an_unclear_count_is_asked_once(owner, outline_start, analysed):
    analysed(analysis.Analysis(topic="desk yoga", unclear=[analysis.Unclear(field="modules",
        question="How many modules?", options=[analysis.ClarifyOption(label="3 modules", value="3")])]))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga, a few modules"))
    assert flow.current_field(creation) == "clarify"
    creation = flow.answer(creation, "clarify", value="3")
    assert creation.brief["modules"] == 3 and creation.brief["asked"] == ["modules"]
    assert flow.current_field(creation) == "level"

def test_a_failed_analysis_falls_back_to_the_usual_questions(owner, outline_start, analysed):
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga"))
    assert creation.answers["topic"] == "desk yoga" and not creation.pending
    assert flow.current_field(creation) == "level"

def test_a_stopped_analysis_settles_on_the_next_read(owner, outline_start):
    creation = flow.start(owner, "course", text="desk yoga")
    runs.stop(creation.runs["analysis"])
    assert flow.state(creation)["question"]["field"] == "level"

def test_her_words_answer_the_question_on_screen_and_route_the_rest(owner, outline_start, analysed):
    # At "level" she types "beginners, and make it 5 modules"
    analysed(analysis.Analysis(answer="beginners", level="beginners", modules=5))
    ...
    assert creation.answers["level"] == "beginners" and creation.brief["modules"] == 5

def test_just_draft_it_with_words_delegates_only_what_they_left_open(owner, outline_start, analysed): ...

def test_a_focus_draft_with_a_price_never_blocks_go_live(owner, outline_start, analysed):
    ...  # rich answer with $49 -> _has_paid_content(seeded={}) is False
```

  `_run_pending(creation)` is a test helper: `jobs.execute(SCHEMA, creation.runs["analysis"])`, then `refresh_from_db()`. `analysed` is a fixture that patches `apps.core.focus.analysis.core_ai.structured` and `ai_compose.compose_available`.

- [ ] **Step 3: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_analysis.py apps/core/tests/test_focus_flow.py -q` should fail.
- [ ] **Step 4: Implement `analysis.py`, then the flow changes, the topic `why`, and `_has_paid_content`.** Add `"analysis": "apps.core.focus.analysis"` to `jobs.HANDLERS`. Fix the stage 1 flow tests that typed a topic: they now need `_run_pending`, or they tap with `value=`.
- [ ] **Step 5: Run** `docker compose exec django pytest apps/core/tests/test_focus_analysis.py apps/core/tests/test_focus_flow.py apps/core/tests/test_focus_api.py apps/tenant_config/tests/test_setup_items.py -q`. All should pass. If the setup-items test file has another name, find it with `grep -ln _has_paid_content apps/tenant_config/tests`.
- [ ] **Step 6: Commit.** `feat(focus): her first answer is read once and fills everything it can`

### Task 2.4: The outline keeps her counts and titles exactly

**Files:**
- Modify: `backend/apps/core/focus/outline.py` (`MAX_MODULES`, `MAX_LESSONS`, `SYSTEM`, `_user_turn`, `_draft`, `fallback`, `carry_out`'s finish text; new `conform`)
- Test: `backend/apps/core/tests/test_focus_outline.py`

**Interfaces:**
- Consumes: `creation.brief` keys and `analysis.read` / `analysis.brief_from` (Task 2.3).
- Produces:
  - `MAX_MODULES = 12`, `MAX_LESSONS = 12`.
  - `conform(draft: OutlineDraft, brief: dict, *, first: bool, kept: int = 0) -> OutlineDraft`, pure code:
    - The module count is `brief.modules - kept` (at least 0), when set.
    - Each module's lesson count is `brief.lessons`, when set.
    - With only `total`, lessons are trimmed or padded from the last module until the sum equals `total`.
    - Padding is honest and generic: module "Module {n}", lesson "Lesson {n}".
    - With `first` only: module *i*'s title becomes `named[i].title` when non-empty, and its first lessons become `named[i].lessons`, word for word.
    - Everything is clamped to `MAX_MODULES` × `MAX_LESSONS`.
  - `_user_turn` adds `"exact": {modules, lessons, total, named}` and `"notes": brief.notes`. `SYSTEM` gains: "- exact: counts and titles the coach gave: use her titles word for word, in her order, and write only what she left open. - notes: what else she said about the course; follow it."
  - `_draft`: when `brief.analysed` is not set and the topic is her words (not `DELEGATE`), it first calls `analysis.read` on the topic. On success it saves `creation.brief = analysis.brief_from(...)`; on `AiError` it goes on without (spec §5.1 Waiting). The result always passes through `conform`. A redraft gets `first=False, kept=len(_kept(...))`.
  - `fallback(answers, title, brief)` honours the brief's counts.
  - With `brief.capped`, the run's finish text ends: " I drafted the first 12 modules; add the rest on the page."

- [ ] **Step 1: Write the failing tests:**

```python
def test_conform_keeps_her_counts():
    out = outline.conform(_draft(modules=6, lessons=5), {"modules": 4, "lessons": 3}, first=True)
    assert len(out.modules) == 4 and all(len(m.lessons) == 3 for m in out.modules)

def test_conform_pads_honestly_when_the_model_wrote_too_few():
    out = outline.conform(_draft(modules=2, lessons=2), {"modules": 3, "lessons": 3}, first=True)
    assert out.modules[2].title == "Module 3" and out.modules[0].lessons[2] == "Lesson 3"

def test_conform_uses_her_titles_word_for_word_in_her_order():
    brief = {"named": [{"title": "Wake up your neck", "lessons": ["Chin tucks"]}]}
    out = outline.conform(_draft(), brief, first=True)
    assert out.modules[0].title == "Wake up your neck" and out.modules[0].lessons[0] == "Chin tucks"

def test_a_total_alone_is_kept_exactly():
    out = outline.conform(_draft(modules=3, lessons=4), {"total": 10}, first=True)
    assert sum(len(m.lessons) for m in out.modules) == 10

def test_a_redraft_counts_the_modules_she_keeps():
    out = outline.conform(_draft(modules=5), {"modules": 5}, first=False, kept=1)
    assert len(out.modules) == 4

def test_the_outline_reads_her_first_answer_itself_when_the_analysis_failed(owner):
    ...  # brief without "analysed"; analysis.read patched to return modules=2 -> two modules written

def test_a_capped_brief_says_so_in_the_finish_text(owner): ...
```

- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_outline.py -q` should fail.
- [ ] **Step 3: Implement as specified.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_outline.py apps/core/tests/test_focus_flow.py -q`. Both should pass.
- [ ] **Step 5: Do a real dev check.** With `FOCUS_MODE_ENABLED=true`, after `docker compose restart celery-agents`, run in `make shell` one creation with the first answer: "A course on desk yoga for complete beginners. 4 modules of 3 lessons. Module 1 is Wake up your neck. $49". It should come back with exactly 4×3, module 1 titled "Wake up your neck", and price 49.00. Paste the module titles into the commit message.
- [ ] **Step 6: Commit.** `feat(focus): the outline keeps her counts and titles exactly`

### Task 2.5: Lesson descriptions after "Looks good" (§5.3)

**Files:**
- Create: `backend/apps/core/focus/descriptions.py`
- Modify: `backend/apps/core/focus/flow.py` (review `ok`; `state`; new `retry_descriptions`), `backend/apps/core/focus/outline.py` (`carry_out` tail), `backend/apps/core/focus/views.py`, `backend/apps/core/focus/urls.py`
- Test: `backend/apps/core/tests/test_focus_descriptions.py` (new), `backend/apps/core/tests/test_focus_api.py`

**Interfaces:**
- Consumes: `jobs.*` (2.1), `Lesson.drafted_html` (2.2).
- Produces:
  - `descriptions.STEP = {"specialist": "content", "label": "Writing lesson descriptions"}`
  - `descriptions.start(creation) -> CopilotRun`: stops a building descriptions run first, then `jobs.queue(creation, "descriptions", specialist="content")`.
  - `descriptions.carry_out(tenant, run_id)`:
    - The lessons to write are the course's lessons with `content_html == ""`, in module then lesson order, read when the job starts.
    - It emits `step` `{**STEP, "state": "start", "total": n}`.
    - Then, per module, it makes one `core_ai.structured` call (`output_model=ModuleTexts`, label `contentor:focus-ahead`, `effort="low"`).
    - Before each module's write it checks `jobs.active` under lock and returns quietly once stopped.
    - Each lesson's text is written as `html = clean_rich_html(f"<p>{escape(text)}</p>")`, through `Lesson.objects.filter(pk=id, content_html="").update(content_html=html, drafted_html=html)`. A row count of 0 (she typed meanwhile, or the lesson is gone) is skipped without an event.
    - A row count of 1 emits `field` `{"record": f"lesson:{id}", "name": "content_html", "value": text}`.
    - It ends with `step` `{**STEP, "state": "done"}` and `runs.finish(run_id, True, {"text": f"Wrote {k} lesson descriptions."})`.
    - Without `compose_available()` it raises `core_ai.AiError("ai_unavailable")`: the run fails and the guide offers Try again.
  - `class LessonText(BaseModel): id: int; text: str` and `class ModuleTexts(BaseModel): lessons: list[LessonText]`.
  - `SYSTEM` (static): "For each lesson, write the brief description that goes with its video, the way creators describe their videos: 2–4 sentences for students, what the lesson covers and what they can do after it. Use only the lesson title, the course and the coach's own words. Never invent a claim, a result or a number. Plain text, no markdown." The user turn carries: course title, description, level, her first answer (`answers.topic`), `brief.notes`, and the module's lessons as `{id, title}`.
  - In `flow.answer` at the review, `value == "ok"`: after answering, `descriptions.start(creation)`, then `_chat_append` the assistant line "Writing a short description for each lesson's video. Edit any of them on the page."
  - In `outline.carry_out`, after a write: when `answers.outline_review == "ok"` (a redraft after she confirmed the titles), call `descriptions.start(creation)`. A redraft deletes and recreates the modules it replaces, so "new or renamed by the outline change" is exactly "no text yet".
  - `flow.retry_descriptions(creation) -> FocusCreation`: starts a run only when `jobs.status(creation, "descriptions") in ("failed", "idle")` and the review is answered.
  - `state()` adds `"descriptions": {"status", "run"}` once one has run, else `None`.
  - `POST /api/v1/admin/focus/<id>/descriptions/` calls `retry_descriptions` and returns the state (view `focus_descriptions`, url name `focus-descriptions`).
  - `jobs.HANDLERS["descriptions"] = "apps.core.focus.descriptions"`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_looks_good_starts_the_descriptions_and_says_so(owner, at_review):
    creation = flow.answer(at_review, "outline_review", value="ok")
    assert "descriptions" in creation.runs
    assert creation.chat.entries[-1]["text"].startswith("Writing a short description")

def test_each_lesson_gets_its_description_marked_as_drafted(owner, at_review, texts):
    ...  # run jobs.execute; every lesson: content_html == drafted_html == "<p>…</p>"; course.not_ready() still set

def test_a_description_she_typed_meanwhile_is_never_overwritten(owner, at_review, texts):
    lesson = first_lesson(at_review); lesson.content_html = "<p>Mine.</p>"; lesson.save()
    ...  # run; lesson.content_html == "<p>Mine.</p>" and no field event for lesson.id

def test_stop_keeps_what_was_written(owner, at_review, texts):
    ...  # texts side effect stops the run after module 1; module 1 written, module 2 empty

def test_lessons_deleted_meanwhile_are_skipped(owner, at_review, texts): ...

def test_a_redraft_stops_the_descriptions_and_rewrites_the_new_lessons(owner, at_review, texts):
    ...  # descriptions building; typed change (analysis returns outline_change) -> old run stopped,
    # after the outline run a new descriptions run exists

def test_a_failed_run_offers_try_again(owner, at_review, texts):
    ...  # side_effect AiError -> state()["descriptions"]["status"] == "failed"; POST descriptions/ -> new run
```

- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_descriptions.py -q` should fail.
- [ ] **Step 3: Implement as specified.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_descriptions.py apps/core/tests/test_focus_flow.py apps/core/tests/test_focus_outline.py apps/core/tests/test_focus_api.py -q`. All should pass.
- [ ] **Step 5: Commit.** `feat(focus): each lesson gets a short description once she confirms the titles`

### Task 2.6: The replay hook, shared by the outline and the descriptions

**Files:**
- Modify: `frontend-customer/src/lib/copilot/live.ts`, `frontend-customer/src/lib/focus/api.ts`
- Create: `frontend-customer/src/lib/focus/descriptions.ts`
- Test: `frontend-customer/src/lib/__tests__/focus-descriptions.test.ts` (new). The existing tests of `liveFrame` and `useLiveRecord` stay green (find them with `grep -ln liveFrame src/lib/__tests__`).

**Interfaces:**
- Produces:
  - In `live.ts`: `useReplay<F extends { settled: boolean }>(runId: number | null, specialist: SpecialistKey, frameOf: (events: RunEvent[], elapsedMs: number) => F, reveals: (events: RunEvent[]) => boolean): F | null`. This is today's body of `useLiveRecord`: watching, the clock, `instant`, reduced motion, `markRunSeen`. `useLiveRecord(record, runId)` becomes `useReplay(runId, "content", (e, ms) => liveFrame(e, record, ms), (e) => e.some(<field/row for record>))` with unchanged behaviour.
  - In `lib/focus/descriptions.ts`:

```ts
export interface LessonsFrame {
  texts: Record<number, { value: string; typing: boolean }>;
  done: number;   // fully typed so far
  total: number;  // from the step start's data.total
  working: { specialist: SpecialistKey; label: string } | null;
  settled: boolean;
}
export function lessonsFrame(events: RunEvent[], elapsedMs: number, cps?: number): LessonsFrame;
export function useLiveLessons(runId: number | null): LessonsFrame | null;
```

  `lessonsFrame` types the `field` events whose record starts with `lesson:` and whose name is `content_html`, one after another, against the same character budget as `liveFrame`.
  - In `api.ts`: `FocusState` gains `reading: { status: OutlineStatus; run: number | null } | null` and `descriptions: { status: OutlineStatus; run: number | null } | null`. Add `export const retryDescriptions = (id: number) => post<FocusState>(\`${id}/descriptions/\`, {})`.

- [ ] **Step 1: Write the failing test:**

```ts
const ev = (seq: number, type: string, data: object) => ({ seq, at: "", type, data }) as RunEvent;
const EVENTS = [
  ev(1, "step", { specialist: "content", label: "Writing lesson descriptions", state: "start", total: 2 }),
  ev(2, "field", { record: "lesson:7", name: "content_html", value: "Sit tall." }),
  ev(3, "field", { record: "lesson:8", name: "content_html", value: "Breathe out." }),
  ev(4, "step", { specialist: "content", label: "Writing lesson descriptions", state: "done" }),
];
it("types lessons one after another and counts them", () => {
  const mid = lessonsFrame(EVENTS, 200, 60); // 12 chars of budget
  expect(mid.texts[7]).toEqual({ value: "Sit tall.", typing: false });
  expect(mid.texts[8].typing).toBe(true);
  expect([mid.done, mid.total]).toEqual([1, 2]);
  expect(mid.working?.specialist).toBe("content");
});
it("settles once everything is shown and the step is done", () => {
  const end = lessonsFrame(EVENTS, Infinity);
  expect(end.settled).toBe(true);
  expect(end.working).toBeNull();
});
it("ignores fields of other records", () => { /* a course:1 title event adds nothing */ });
```

- [ ] **Step 2: Run it.** `cd frontend-customer && npx vitest run src/lib/__tests__/focus-descriptions.test.ts` should fail (module not found).
- [ ] **Step 3: Implement `useReplay`, `lessonsFrame`, `useLiveLessons` and the api types.**
- [ ] **Step 4: Run** `cd frontend-customer && npx vitest run src/lib/__tests__` and `make typecheck`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): one replay hook for the outline and the lesson descriptions`

### Task 2.7: The guide and the page for stage 2

**Files:**
- Modify: `frontend-customer/src/components/focus/focus-guide.tsx`, `frontend-customer/src/components/admin/course-form.tsx` (lesson table rows ~985-1010, the curriculum header ~960), `frontend-customer/src/app/admin/courses/[slug]/page.tsx` (the `focus` prop), `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/33-focus-course.spec.ts`

**Interfaces:**
- Consumes: `FocusState.reading`, `.descriptions`, `retryDescriptions` and `useLiveLessons` (Task 2.6), plus the clarify question (Task 2.3, a `choice` question with `field: "clarify"`).
- Produces:
  - `CourseForm`'s `focus` prop becomes `{ record: string; runId: number | null; descriptionsRunId: number | null }`. The course page passes `active.descriptions?.run` while its status is `building` or `ready`.
  - In the guide:
    - While `state.reading`: the specialist byline, `<Spinner size="sm" />`, `focus.readingDetails` and a Stop button (`stopRun(reading.run)`, then `fetchCreation`).
    - The poll (`POLL_MS`) runs while the outline, the reading or the descriptions are `building`.
    - The clarify question renders through `GuideQuestion` with `showRest={false}`.
    - While the descriptions are `building`, a muted line under the answered list shows `focus.descriptionsNote`. On `failed` it shows `focus.descriptionsFailed` and a "Try again" button (`retryDescriptions`).
  - On the page (edit-mode lesson table):
    - Under each lesson title, a `line-clamp-2 text-xs text-muted-foreground` line shows the live text while it types (with `<WorkingTag specialist="content" label={t("focus.writing")} />` on the typing one). Otherwise it shows the plain text of `lesson.content_html`. Strip tags with the existing helper if `grep -rn "stripTags\|htmlToText\|plainText" src packages` finds one, else `new DOMParser().parseFromString(html, "text/html").body.textContent`.
    - The pencil of the lesson being typed is disabled (F9).
    - Above the modules, while `useLiveLessons` is working: `<WorkingTag specialist="content" label={t("focus.writingDescriptions")} />`, `t("focus.descriptionCount", { done, total })` and a Stop button. When it settles, `loadCourse()` runs once, as for the outline.
  - New strings in `focus`:
    - `readingDetails`: "Reading your details…"
    - `writingDescriptions`: "writing lesson descriptions"
    - `descriptionCount`: "{done} of {total}"
    - `descriptionsNote`: "Writing a short description for each lesson's video. Edit any of them on the page."
    - `descriptionsFailed`: "Some lesson descriptions didn't come through."

- [ ] **Step 1: Write the failing e2e tests** in `33-focus-course.spec.ts`, stubbed at the network layer like its existing tests:
  - `"a rich first answer goes straight to the outline"`: the typed topic is answered with a `reading` state. The next poll returns the review state, with answered lines including "4 modules · 3 lessons each" and "$49". Expect the reading line, then those lines, then the outline on the page.
  - `"an unclear detail gets one short question"`: the state after reading carries a clarify question with two options. Tapping one posts `{field: "clarify", value: "3"}`.
  - `"lesson descriptions type in after Looks good, with a count and Stop"`: after `ok`, the state has `descriptions: {status: "building", run: 5151}` and run 5151's events are two lesson fields. Expect "1 of 2" then "2 of 2" on the page, the note in the dock, and Stop posting to the run's stop endpoint.
- [ ] **Step 2: Run** `make e2e-spec SPEC=33-focus-course`. The new tests should fail.
- [ ] **Step 3: Implement the guide, page and strings as specified.**
- [ ] **Step 4: Run** `make e2e-spec SPEC=33-focus-course`, `cd frontend-customer && npx vitest run` and `make lint`. All should pass.
- [ ] **Step 5: Commit.** `feat(focus): the guide reads her details and the page types each lesson's description`

### Task 2.8: Stage 2 check and deploy

- [ ] **Step 1: Run** `make test-changed` (PLAN=1 first, to see what it picked). It should pass.
- [ ] **Step 2: Do a real dev pass in the browser pane** (memory `reference-browser-pane-coach-login`) on desktop, then at 375 px, in light and dark.
  1. A rich first answer, the RICH text of Task 2.3. It should skip to the outline: 4×3, $49.
  2. "desk yoga, a few modules". It should ask one clarify question.
  3. "Looks good". The descriptions should type in with the count. Stop one run halfway.
  4. Edit one description, then confirm the finish step still counts the untouched ones as empty.
- [ ] **Step 3: Write `docs/wiki` and memory updates as needed.** Update memory `project-focus-mode` with the stage 2 commits.
- [ ] **Step 4: Deploy with the switch off.** Run `make deploy` (it runs the full backend suite; don't run it separately). Then check prod health, and confirm migrations `courses.0016` and `tenant_config.0034` applied in every tenant schema with the read-only `contentor-postgres` connector (memory `reference-prod-read-only-sql-via-connector`). Typecheck the committed tree first (memory `reference-typecheck-the-committed-tree`).

---

# Stage 3: the cover step

### Task 3.1: The cover question in the recipe; the outline stops giving covers

**Files:**
- Modify: `backend/apps/core/focus/recipes.py`, `backend/apps/core/focus/outline.py` (remove the `content._give_cover` block), `backend/apps/core/focus/flow.py` (`state`, new `_sync_cover`)
- Test: `backend/apps/core/tests/test_focus_flow.py`, `backend/apps/core/tests/test_focus_outline.py`

**Interfaces:**
- Produces:
  - `Field("cover", "Cover", "Which cover fits your course?", kind="cover", why="Pick a style on the page. The photo row under it changes the photo in all four; upload one, or tell me what you want.")`, placed between `outline_review` and `finish`, with `specialists["cover"] = "designer"`. Its answers are `"kept"` or `"later"`, set by the cover endpoint (Task 3.3), never by `answer()` with a value. Typed text at the cover question is analysed (Task 3.4).
  - `_sync_cover(creation)`, called at the top of `state()`: when the cover is unanswered and a kept cover `Design` exists for the course (`target_kind="course", target_key=str(record_id), state="kept"`), it sets `answers.cover = "kept"`. That is how Keep in the photo studio ("I'll edit it") brings her back answered.
  - The plain form's and the assistant's `create_course(cover=True)` keep their automatic stock cover (spec §11 leaves this to the builder: unchanged).

- [ ] **Step 1: Write the failing tests:**
  - `test_the_cover_comes_after_the_outline_and_before_finish`: the recipe order is `[..., "outline_review", "cover", "finish"]`.
  - `test_the_outline_gives_no_cover_any_more`: after `jobs.execute`, `course.thumbnail_id is None`.
  - `test_a_cover_kept_in_the_studio_answers_the_question`: create a kept `Design` for the course, then `flow.state(c)["question"]["field"] == "finish"`.
- [ ] **Step 2: Run them.** They should fail.
- [ ] **Step 3: Implement as specified.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_flow.py apps/core/tests/test_focus_outline.py -q`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): the cover is its own step, after the outline`

### Task 3.2: The Designer drafts four covers per round

**Files:**
- Create: `backend/apps/core/focus/covers.py`
- Create: `backend/apps/tenant_config/migrations/0035_focuscreation_covers.py`
- Modify: `backend/apps/tenant_config/models.py` (FocusCreation), `backend/apps/core/focus/outline.py` (start the covers ahead), `backend/apps/core/focus/flow.py` (`state`)
- Test: `backend/apps/core/tests/test_focus_covers.py` (new)

**Interfaces:**
- Consumes: `apps.media.design_recipe.validate_recipe`, `LAYOUTS`, `PAINT_ROLES`; `apps.media.designs.site_look`; `apps.media.own_photos.search`, `photo_of`; `apps.core.curated_images.client.search` (`orientation=client.WIDE`); `apps.core.curated_images.cache.cache_remote_image`; `apps.core.onboarding.ai_curate.CoachBrief`, `photo_query`.
- Produces:
  - `FocusCreation.covers: JSONField(default=dict)`, shaped `{"photo": "<photo uuid>" | None, "rounds": [[recipe ×4], ...], "query": str}`. The current round is the last one.
  - `class CoverStyle(BaseModel): layout: Literal[*LAYOUTS]; panel: Literal["primary", "accent", "ink", "paper", "primary-dark", "accent-dark"]; title_font: Literal["display", "body"]; upper: bool; subtitle: str`. The subtitle is at most 60 characters, taken from the course description or outline, never an invented claim.
  - `class CoverPlan(BaseModel): photo_query: str; styles: list[CoverStyle]` (code keeps the first four distinct layouts).
  - `FALLBACK = (("full", "panel", "title", "band"), ("framed", "photo", "panel", "full"))`. Fallback round *n* uses `FALLBACK[n % 2]` with panel `primary`, the display font and no subtitle.
  - `covers.start(creation, *, ahead: bool) -> CopilotRun`: `jobs.queue(creation, "covers", specialist="designer", ahead=ahead)`. The model label is `contentor:focus-ahead` when `ahead`, else `contentor:copilot`.
  - `covers.carry_out(tenant, run_id)`:
    1. It returns quietly when the course is gone.
    2. The model writes a `CoverPlan`. The user turn carries the course title, description, level, her look, `brief.notes`, and the layouts of earlier rounds ("choose different ones").
    3. On `core_ai.AiError` it uses the fallback styles and `photo_query(CoachBrief.from_tenant(tenant), course.title)`.
    4. The photo comes from `pick_photo(query)` in the first round only. Later rounds keep `covers.photo`.
    5. It builds four recipes with `recipe_for(style, photo_id)`, appends the round under lock (when `jobs.active`), and emits `step` start/done with the Designer specialist and label "Drafting covers".
  - `covers.pick_photo(query: str) -> Photo | None`: her photo first, `own_photos.search(query, aspect="16:9", limit=1)` then `own_photos.photo_of`. Else the top library match, `client.search(query, orientation=client.WIDE).results[0]` through `cache_remote_image` (one copy into her Media). `None` on any error.
  - `covers.recipe_for(style: CoverStyle | dict, photo_id: str | None) -> dict`: `validate_recipe({"layout", "panel", "photo": {"id": photo_id}, "words": {"subtitle"}, "styles": {"title": {"font", "upper"}}}, photo_exists=...)`. A layout that draws no photo (`title`) gets `photo.id = None`.
  - `covers.payload(creation) -> dict | None`, for `state()["cover"]`: `{"status": jobs.status(creation, "covers"), "run", "round": len(rounds), "drafts": [{"id": f"d{i}", "recipe", "photos": {pid: url}, "logo_url", "look"}], "photo": {"id", "url"} | None, "query"}`. This is the `CoverDesign` shape `CoverArt` draws (`frontend-customer/src/types/design.ts`); look and logo come from `designs.site_look({})`.
  - In `outline.carry_out` after a first write (not a redraft): when the course has no cover, `covers.start(creation, ahead=True)`.
  - `jobs.HANDLERS["covers"] = "apps.core.focus.covers"`.

- [ ] **Step 1: Write the failing tests**, with the model and `curated_images.client.search` patched (`CURATED_IMAGE_API_FAKE` fixtures work too):
  - `test_the_first_outline_starts_the_covers_ahead`: `"covers" in creation.runs` and its request has `ahead=True`.
  - `test_a_round_is_four_validated_recipes_sharing_one_photo`: every photo layout's `recipe["photo"]["id"] == covers["photo"]`; the title layout's is `None`.
  - `test_her_own_photo_comes_before_the_library`: an own photo that `own_photos.search` returns is used, and `client.search` is not called.
  - `test_a_failed_draft_falls_back_to_fixed_styles`: on `AiError`, the layouts are `["full", "panel", "title", "band"]` and the run status is `done`.
  - `test_four_more_styles_avoids_the_layouts_already_shown`: the second round's user turn lists the first round's layouts, and the fallback's second round uses `FALLBACK[1]`.
  - `test_a_course_deleted_meanwhile_ends_the_drafting_quietly`: no exception, and no round appended.
- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_covers.py -q` should fail.
- [ ] **Step 3: Implement the field, migration `0035`, `covers.py` and the outline hook.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_covers.py apps/core/tests/test_focus_outline.py -q`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): the Designer drafts four covers once the outline is written`

### Task 3.3: The cover's actions and its photo row

**Files:**
- Modify: `backend/apps/core/focus/covers.py`, `backend/apps/core/focus/views.py`, `backend/apps/core/focus/urls.py`
- Test: `backend/apps/core/tests/test_focus_covers.py`, `backend/apps/core/tests/test_focus_api.py`

**Interfaces:**
- Consumes: `designs.open_draft`, `designs.keep`, `apps.core.copilot.views._record_audit` (as `design_views.design_keep` uses them), `curated_images.client.get`, `cache_remote_image`.
- Produces:
  - `covers.set_photo(creation, photo) -> None`: under lock, it sets `covers.photo` and swaps `photo.id` into each draft of the current round whose layout draws a photo. No model call.
  - `covers.keep(creation, index: int, user) -> None`:
    - `draft = designs.open_draft("course", str(record_id), recipe=rounds[-1][index], made_by="designer")`. When `open_draft` hands back an older draft, its recipe is replaced (validated) before keeping.
    - Then `designs.keep(draft)` and `_record_audit(tenant, user, {"kind": "keep_cover", "design_id", "title", "made_by": "designer"}, result, inverse)`, which gives Undo in History.
    - Then `answers.cover = "kept"`.
    - A second call after the first finds the cover answered and does nothing.
  - `covers.open_for_edit(creation, index) -> str`: the draft's id (same open-or-update as `keep`, without keeping).
  - `GET /api/v1/admin/focus/<id>/photos/?q=&page=` (view `focus_photos`) returns `{"results": [{"asset_id", "url", "title", "mine": bool}], "has_next": bool}`.
    - Page 1 holds her photos first (`own_photos.search(q or default, aspect="16:9", limit=8)`, `asset_id` `own:<uuid>`), then library matches (`client.search(q or default, orientation=client.WIDE, page=1)`). Later pages hold the library only.
    - `default` is `covers.query`, or else the course's `photo_query`.
    - A library error leaves only her photos and `has_next: false`, never a 5xx.
  - `POST /api/v1/admin/focus/<id>/cover/` (view `focus_cover`) takes a body of:
    - `{"action": "photo", "asset_id"}`: `own:` goes through `own_photos.photo_of`; a library id goes through `client.get` and `cache_remote_image`, the copy into her Media (§5.2). Then `set_photo`.
    - `{"action": "keep", "index": 0..3}`
    - `{"action": "more"}`: `covers.start(creation, ahead=False)`, refused while one is building.
    - `{"action": "later"}`: `answers.cover = "later"`.
    - `{"action": "edit", "index"}`: the response adds `"design_id"`.

    It returns `flow.state(creation)`. An action is refused when `current_field != "cover"` (it returns the state unchanged), as `answer()` does.

- [ ] **Step 1: Write the failing tests:**
  - `test_tapping_a_photo_puts_it_into_every_photo_style`: `POST cover/ {action: "photo", asset_id: "own:<id>"}`, then each photo draft's `photo.id == <id>`.
  - `test_a_library_photo_is_copied_into_her_media_when_tapped`: a `Photo` with the catalog key exists afterwards.
  - `test_use_this_cover_keeps_it_with_an_undo`: the course's `thumbnail_id` is the draft's photo, a kept `Design` with `made_by == "designer"` exists, an audit row with `kind == "keep_cover"` exists, and the state's question is `finish`.
  - `test_use_this_cover_twice_keeps_once`: one kept design and one audit row.
  - `test_later_leaves_it_without_a_cover`
  - `test_the_photo_row_lists_hers_first_then_the_library`
  - `test_the_photo_row_survives_the_library_being_down`: `client.search` raises `CuratedImageError`, and the response is 200 with only her photos.
- [ ] **Step 2: Run them.** They should fail.
- [ ] **Step 3: Implement as specified.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_covers.py apps/core/tests/test_focus_api.py -q`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): pick, keep or edit a cover, and the photo row`

### Task 3.4: Saying the photo she wants

**Files:**
- Modify: `backend/apps/core/focus/analysis.py` (`Analysis.photo`, `SYSTEM`), `backend/apps/core/focus/flow.py` (`apply`)
- Test: `backend/apps/core/tests/test_focus_flow.py`

**Interfaces:**
- Produces:
  - `Analysis.photo: str = ""`: "at the cover question, a plain description of the photo she wants".
  - The user turn carries `cover_step: bool`.
  - In `apply`, when the pending field is `cover` and `found.photo` is set: `creation.covers["query"] = found.photo` (the page's row refetches with it). Prices, outline changes and other routes apply as at any step.

- [ ] **Step 1: Write the failing test.** `test_at_the_cover_step_her_words_search_the_photo_row`: typed "hands on a keyboard, no faces" with the analysis returning `photo` gives `state()["cover"]["query"] == "hands on a keyboard, no faces"`.
- [ ] **Step 2: Run it.** It should fail. **Step 3: Implement.** **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_flow.py -q`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): she can say the photo she wants for her cover`

### Task 3.5: The cover step on the page and in the guide

**Files:**
- Create: `frontend-customer/src/components/focus/cover-step.tsx`, `frontend-customer/src/components/focus/photo-row.tsx`
- Modify: `frontend-customer/src/lib/focus/api.ts`, `frontend-customer/src/lib/focus/store.ts`, `frontend-customer/src/components/focus/focus-guide.tsx`, `frontend-customer/src/components/admin/course-form.tsx` (the Thumbnail block ~565-625), `frontend-customer/src/components/studio/use-cover-draft.ts` (`keep`), `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/33-focus-course.spec.ts`

**Interfaces:**
- Consumes: `FocusState.cover` (Task 3.2's `covers.payload`), the endpoints of Task 3.3, `CoverArt` (`components/covers/cover-art.tsx`), `courseItem` (`lib/covers/items.ts`), `uploadPhoto` (`lib/upload.ts`), `makePhoto` (`lib/covers/generate.ts`), `generationAllowance` (`lib/curated-images-api.ts`).
- Produces:
  - In `api.ts`:
    - `FocusCover = { status: OutlineStatus; run: number | null; round: number; drafts: CoverDesign[]; photo: { id: string; url: string } | null; query: string }`; `FocusState.cover: FocusCover | null`.
    - `fetchCoverPhotos(id, q, page) -> Promise<{ results: { asset_id: string; url: string; title: string; mine: boolean }[]; has_next: boolean }>`.
    - `coverAction(id, body: { action: "photo"; asset_id: string } | { action: "keep" | "edit"; index: number } | { action: "more" | "later" }) -> Promise<FocusState & { design_id?: string }>`.
  - In `store.ts`, module state the page and the guide share:
    - `useCoverPick(): number | null` and `setCoverPick(i: number | null)`, cleared when the round changes.
    - `usePhotoPage(): number` and `morePhotos()`.
  - `<CoverStep creationId cover course />` on the page, replacing the Thumbnail block while `question.field === "cover"`:
    - Four drafts in a 2-column grid: `<CoverArt design={d} item={courseItem(course)} size="wide" />` in a button, captioned `t(\`focus.coverStyle.${layout}\`)`.
    - The picked draft is outlined in the Designer's colour (`SPECIALIST_LOOK.designer.color`, data not a token).
    - While `building` with no drafts: four `Skeleton` tiles and `<WorkingTag specialist="designer" label={t("focus.drafting")} />`.
    - Then `<PhotoRow>`.
  - `<PhotoRow creationId query selected />`:
    - A horizontal scroller of tiles. Hers are labelled `focus.yours`; library tiles have no label; `+ Upload` is a file input that runs `uploadPhoto`, then `coverAction({action: "photo", asset_id: "own:" + photo.id})`.
    - It fetches page 1 when `query` changes and appends when `usePhotoPage()` grows. It is wrapped in `<StaleContainer pending>` while refetching.
    - When `query` is set, the results are empty, and `generationAllowance().left > 0`: one tile shows `focus.makingPhoto` while `makePhoto(query, "16:9")` runs. The made photo joins the row as hers, and she can keep choosing meanwhile.
  - The guide's `CoverQuestion`:
    - The Designer byline, the question and `why`.
    - Buttons: `focus.useCover` (disabled until a pick; calls `keep`), `focus.moreStyles` (`more`), `focus.morePhotos` (`morePhotos()`), `focus.editCover` (disabled until a pick; calls `edit`, then `navigate(\`/admin/studio/${design_id}?back=/admin/courses/${slug}\`)`) and `focus.later`.
    - An `AnswerBox` with placeholder `focus.coverPlaceholder` (typed text is answered on field `cover`).
  - `use-cover-draft.ts` `keep`: after the success toast, when `useSearchParams().get("back")` starts with `/admin/`, `navigate(back)`.
  - The hand-over line (§4.1): above any question whose field has a line under `focus.handOver`, the guide shows that specialist's face and `t(\`focus.handOver.${field}\`, { name })` in one line. Use `t.has` to check for a line. Stage 3 adds `cover`; Task 4.1 adds `access`; `finish` is added here too, since Marketing already asks it.
  - New strings in `focus`:
    - `drafting`: "drafting covers"
    - `coverStyle`: `{full: "Photo, title over it", panel: "Photo and colour panel", title: "Title only", band: "Photo, band across it", framed: "Framed photo", photo: "Photo only"}`
    - `yours`: "Yours"
    - `upload`: "Upload"
    - `makingPhoto`: "Making your photo…"
    - `useCover`: "Use this cover"
    - `moreStyles`: "Four more styles"
    - `morePhotos`: "More photos"
    - `editCover`: "I'll edit it"
    - `later`: "Later"
    - `coverPlaceholder`: "Or say it: brighter, a man at a standing desk…"
    - `handOver`: `{cover: "{name} here: let's make your cover.", finish: "{name} here: let's get it out there."}`

- [ ] **Step 1: Write the failing e2e tests**, stubbing `photos/` and `cover/` at the network layer:
  - `"the cover step offers four styles and the photo they share"`: the drafts are visible with captions; tapping a photo tile posts `{action: "photo"}` and the drafts redraw with it.
  - `"use this cover keeps it and moves on to finish"`
  - `"I'll edit it opens the photo studio and Keep brings her back"`: the URL has `/admin/studio/<id>?back=`.
  - `"saying a photo searches the row"`: the typed text shows the reading state, then the row fetches with `q`.
- [ ] **Step 2: Run** `make e2e-spec SPEC=33-focus-course`. The new tests should fail.
- [ ] **Step 3: Implement as specified.** Below `sm` the grid stays 2 columns and the guide is the bottom sheet (F12). The drafts are drawn, so they need nothing more there.
- [ ] **Step 4: Run** `make e2e-spec SPEC=33-focus-course`, `make e2e-spec SPEC=32-photo-studio` (the Keep change) and `make lint`. All should pass.
- [ ] **Step 5: Commit.** `feat(focus): the cover step: four styles, her photo, keep, edit or later`

### Task 3.6: Stage 3 check and deploy

- [ ] **Step 1: Run** `make test-changed`. It should pass.
- [ ] **Step 2: Do a real dev pass** on desktop and 375 px, light and dark.
  1. Reach the cover step and confirm the drafts are often already there.
  2. Tap one of her photos and one library photo; the library one should land in Media.
  3. Upload one.
  4. Say "hands on a keyboard, no faces".
  5. Keep a cover, then Undo it in History.
  6. "I'll edit it", then Keep, and confirm she is back at finish.
- [ ] **Step 3: Update memory `project-focus-mode`, then deploy** with the switch off, as in Task 2.8 Step 4 (migration `tenant_config.0035`).

---

# Stage 4: price, finish, follow-ups, switch on

### Task 4.1: Price and access (Financial Strategist; F11, F13)

**Files:**
- Create: `backend/apps/core/focus/pricing.py`, `frontend-customer/src/components/focus/price-question.tsx`
- Modify: `backend/apps/core/focus/recipes.py`, `backend/apps/core/focus/flow.py` (`_tiles`, `answer`, `state` finish options), `backend/apps/core/focus/analysis.py` (no change in shape: `price` already routes), `frontend-customer/src/components/focus/focus-guide.tsx`, `frontend-customer/messages/en/admin.json`
- Test: `backend/apps/core/tests/test_focus_pricing.py` (new), `backend/apps/core/tests/test_focus_flow.py`, `e2e/specs/33-focus-course.spec.ts`

**Interfaces:**
- Consumes: `apps.core.monetization.can_monetize`, `is_paid_active`; `apps.billing.models.SubscriptionPlan`, `SubscriptionPlanAccess`; `apps.tenant_config.interview_brief.answers_of` (key `course_price`); `apps.courses.models.Enrollment`; `content_currency`.
- Produces:
  - `pricing.Suggestion = dataclass(frozen=True)(amount: Decimal, reason: str)`.
  - `pricing.suggest(course) -> Suggestion`, code only, her numbers only. The first rule that applies wins:
    1. Her other paid courses: the median of their prices. Reason: "Your other courses sell for {min}–{max}", or "{title} sells for {price}" for one. Her best seller with enrollments adds "; {title} has {n} students".
    2. Her `/setup` `course_price`. Reason: "The price you gave when you set up your site".
    3. Neither: 19 for one module, 39 for up to three, 69 above. Reason: "A common place to start; change it any time".

    Amounts are in her currency, rounded to whole units.
  - `Field("access", "Access", "How will students get it?", kind="price", delegable=True, why="You can change it any time.")`, placed between `cover` and `finish`, with `specialists["access"] = "finance"`. It is skipped when `answers.price` is `"free"` or an amount (the first answer gave it). In that case `apply` also sets `answers.access` to `"free"` or `"paid:<amount>"`. `"membership"` keeps the question, which then shows only the membership tiles.
  - `_tiles` for `kind == "price"`: `{"value": "free", "label": "Free"}`, then `{"value": f"paid:{amount}", "label": "One-time price: {price}", "hint": reason}`, then `{"value": f"plan:{id}", "label": "In {plan.name}"}` for each active plan. The question dict adds `"suggested": f"paid:{amount}"`.
  - `answer(creation, "access", value=...)`:
    - `free` and `paid:<amount>` go through `_set_price` (a tap is hers).
    - `plan:<id>` sets `pricing_type="subscription"` and `SubscriptionPlanAccess.get_or_create(plan, content_type=Course, object_id)`.
    - It sets `answers.access` and `answers.price`.
    - Typed text is analysed (`price` routes).
    - `delegate` is not sent for this question. "You decide" is client-side (below).
    - "Just draft it" (`rest`) answers it `DELEGATE`, which keeps the course free.
  - Finish options in `state()`:
    - When the course is paid and `not can_monetize(tenant)`: options `{"value": "start_selling", "label": "Start selling", "hint": "your plan, then payouts"}` and `{"value": "draft", ...}`, without `publish`.
    - When `answers.access == DELEGATE`: an extra `{"value": f"price:{amount}", "label": f"Sell it for {price}", "hint": reason}`. Through `answer(creation, "finish", value="price:<amount>")` it sets the price and stays at finish. This is the one `answer()` path allowed on `finish`.
  - In the frontend, `PriceQuestion` renders the price tiles. "You decide" highlights the `suggested` tile and shows its hint, and sends nothing. "Start selling" calls `finish(publish=false)`, then `navigate("/admin/billing")` when not `is_paid_active`, else `navigate("/admin/payouts")`. `FocusQuestion` gains `suggested?: string`. The guide picks `PriceQuestion` for `kind === "price"`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_the_suggestion_uses_her_other_courses(paid_courses):  # 29 and 49
    s = pricing.suggest(new_course)
    assert s.amount == Decimal("39") and s.reason == "Your other courses sell for $29–$49"

def test_with_no_numbers_it_says_so_plainly(new_course):
    assert pricing.suggest(new_course).reason == "A common place to start; change it any time"

def test_a_price_from_her_first_answer_skips_the_access_question(...): ...
def test_tapping_a_membership_puts_the_course_in_it(...): ...
def test_just_draft_it_keeps_it_free_and_finish_offers_the_suggested_price(...): ...
def test_a_paid_course_she_cannot_sell_yet_offers_start_selling_not_publish(...): ...
def test_no_job_ever_sets_a_paid_price(...):  # rest path: course.pricing_type == "free"
```

- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_pricing.py apps/core/tests/test_focus_flow.py -q` should fail.
- [ ] **Step 3: Implement the backend, then `PriceQuestion` and its strings.** Strings: `focus.startSelling`: "Start selling", `focus.sellFor`: "Sell it for {price}", `focus.handOver.access`: "{name} here: let's decide how students get it."
- [ ] **Step 4: Add the e2e test** `"the price step: you decide highlights the suggestion for her to tap"`. Then run `make e2e-spec SPEC=33-focus-course` and the backend tests. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): the price step, with a suggestion from her own numbers`

### Task 4.2: Finish: "Tell my students" (Marketing; team spec T12)

**Files:**
- Create: `backend/apps/core/focus/announce.py`
- Modify: `backend/apps/core/focus/recipes.py`, `backend/apps/core/focus/flow.py` (`finish`, `state`, new `decide_announcement`), `backend/apps/core/focus/views.py`, `backend/apps/core/focus/urls.py`, `frontend-customer/src/components/focus/focus-guide.tsx` (`FinishStep`, new `AnnounceStep`), `frontend-customer/src/lib/focus/api.ts`, `frontend-customer/messages/en/admin.json`
- Test: `backend/apps/core/tests/test_focus_announce.py` (new), `e2e/specs/33-focus-course.spec.ts`

**Interfaces:**
- Consumes: `content.create_announcement_draft(user, {"title", "body_html", "link"})`; `Announcement` (`status`, `scheduled_at`); the site time zone on `TenantConfig` (`grep -n timezone apps/tenant_config/models.py`).
- Produces:
  - `Field("announce", "Announcement", "Tell your students?", kind="announce")` after `finish`, with `specialists["announce"] = "marketing"`.
  - `flow.finish(creation, *, publish: bool, announce: bool = False, active_ms=None)`. When the course was published and `announce`, it queues job `announce`, sets `answers.finish = "publish"`, and the status stays `active`. Otherwise it behaves as today and sets `answers.announce = "skip"`.
  - `announce.carry_out(tenant, run_id)`:
    - Marketing writes `AnnouncementDraft(title: str, body: str)` (label `contentor:copilot`). The input is the course title, its description, `brief.notes` and the follow-up answers; the output is 2–4 plain sentences with no invented claim.
    - Code creates the draft with `link=f"/courses/{slug}"`.
    - The proposed send time is the next 10:00 in the site's time zone, at least an hour away.
    - It finishes with `{"announcement": id, "send_at": iso}`.
    - On failure the guide offers Try again or Not now.
  - `state()["announcement"] = {"status", "run", "id", "title", "body", "send_at"}` while the announce question is current.
  - `flow.decide_announcement(creation, *, schedule: bool) -> FocusCreation`:
    - `schedule` sets `status="scheduled", scheduled_at=send_at` on the draft.
    - Not now leaves it a draft in Messages, and the closing line says so: "Your announcement is saved as a draft in Messages."
    - It then sets `answers.announce` and status `done`, with closing chat lines.
  - `POST /api/v1/admin/focus/<id>/announce/` takes `{"schedule": bool}` or `{"retry": true}` (view `focus_announce`).
  - In the frontend:
    - `FinishStep` shows a "Tell my students" checkbox, ticked by default, beside Publish now. `finishCreation` sends `announce`.
    - `AnnounceStep` shows the draft's title, body and the send time (formatted in her locale), with **Schedule** and **Not now**. Both are `useAsyncAction` buttons.
    - Focus mode ends after the choice, as `finish` does today.
  - New strings in `focus`: `tellStudents`: "Tell my students", `schedule`: "Schedule", `notNow`: "Not now", `sendsAt`: "Sends {when}".

- [ ] **Step 1: Write the failing tests:**
  - `test_publish_with_tell_my_students_drafts_an_announcement_and_waits`
  - `test_keep_as_a_draft_never_offers_an_announcement`
  - `test_schedule_schedules_it_and_ends_focus_mode`
  - `test_not_now_leaves_it_a_draft_and_says_where`
  - `test_a_failed_announcement_can_be_skipped`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** Add `jobs.HANDLERS["announce"]`.
- [ ] **Step 4: Add the e2e test** `"publish now, then schedule the announcement"`. Then run `make e2e-spec SPEC=33-focus-course` and `docker compose exec django pytest apps/core/tests/test_focus_announce.py apps/core/tests/test_focus_flow.py -q`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): tell her students when the course goes live`

### Task 4.3: Follow-ups, only if necessary (F4)

**Files:**
- Create: `backend/apps/core/focus/followup.py`
- Modify: `backend/apps/core/focus/flow.py` (the point where the outline starts; after the review; `current_field`, `question`, `answer`, `state`), `backend/apps/core/focus/outline.py`, `covers.py` and `announce.py` (user turns carry `followups`), `frontend-customer/src/components/focus/focus-guide.tsx`
- Test: `backend/apps/core/tests/test_focus_followup.py` (new)

**Interfaces:**
- Produces:
  - `class FollowUp(BaseModel): needed: bool; question: str = ""; options: list[str] = []`. Several picks per follow-up are left out: the guide's tiles send one tap, and the answer box covers more.
  - `followup.start(creation, slot: Literal["outline", "later"]) -> CopilotRun` (label `contentor:copilot`, specialist `content` for `outline`, `designer` for `later`).
  - `SYSTEM` says: ask only when the next draft would otherwise have to guess something that changes it and nothing she said settles it; never to enrich, never to confirm; 2–4 short options.
  - `carry_out` writes `brief.followup = {"question", "options", "slot"}` when `needed`. Otherwise it writes nothing. Either way it then calls `flow.after_followup(creation)` under lock.
  - On failure the follow-up is dropped: `on_failure` calls `flow.after_followup`.
  - The rules live in code, `flow.followup_allowed(creation, slot) -> bool`: at most 4 per creation, at most 2 per slot, never after "Just draft it" (`brief.rest`), and never while one is open or building.
  - `flow._next_draft(creation)` replaces the bare `outline.start` calls in `answer`, `apply` and `_clarify`. With every asked question answered, it starts a follow-up if `followup_allowed(creation, "outline")`, else the outline.
  - After the review is answered `ok`, `followup_allowed(creation, "later")` starts one before the cover. Later follow-ups never redraft the outline.
  - `current_field` returns `"followup"` while `brief.followup` is set. Its question dict is `{"field": "followup", "kind": "choice", "question", "why": "", "options": [{"value": label, "label": label, "hint": ""}], "starter": None, "can_delegate": True, "specialist"}`.
  - `answer(creation, "followup", value | text | delegate)` appends `{"question", "answer", "slot"}` to `brief.followups`, clears `brief.followup` and calls `after_followup`. Typed text is stored as her words, with no analysis: it answers a model-written question.
  - `state()["thinking"] = {"status", "run"}` while a follow-up job is building. The guide shows the specialist's working tag "Thinking about your course" (`focus.thinking`).

- [ ] **Step 1: Write the failing tests:**
  - `test_no_follow_up_when_it_is_not_needed`: `needed=False` starts the outline at once.
  - `test_an_outline_shaping_follow_up_comes_before_the_outline`
  - `test_at_most_two_before_the_outline_and_four_in_all`
  - `test_just_draft_it_skips_the_follow_ups`
  - `test_a_failed_follow_up_is_dropped_and_the_flow_goes_on`
  - `test_her_follow_up_answers_reach_the_outline_prompt`: `_user_turn` includes `followups`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** Add `jobs.HANDLERS["followup"]` and wire the guide's `thinking` state (the poll includes it).
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests/test_focus_followup.py apps/core/tests/test_focus_flow.py apps/core/tests/test_focus_outline.py -q` and `make e2e-spec SPEC=33-focus-course` (existing tests stub no follow-up). All should pass.
- [ ] **Step 5: Commit.** `feat(focus): a follow-up question only when the draft would have to guess`

### Task 4.4: Getting in from the assistant, and "Continue your course" (F7, §4.2)

**Files:**
- Modify: `frontend-customer/src/components/copilot/action-card.tsx`, `frontend-customer/src/components/copilot/copilot-bubble.tsx:838` (pass the coach message), `frontend-customer/src/lib/focus/store.ts`, `frontend-customer/src/components/focus/focus-start.tsx`, `frontend-customer/src/app/admin/page.tsx`, `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/33-focus-course.spec.ts`

**Interfaces:**
- Produces:
  - `store.ts`: `setFirstAnswer(text: string | null)` and `takeFirstAnswer(): string | null` (read once).
  - `FocusStart`: on mount, when `takeFirstAnswer()` returns text, it sends it as her first answer (`startCreation({kind, text})`), exactly as typing it would.
  - `ActionCard` gets a new prop `askedWith?: string`, the coach message the turn answered (copilot-bubble passes the preceding coach entry). For `card.kind === "create_course"` while `useFocusOverview()?.enabled`:
    - The card shows "Make it with me" copy and a **Start it** button (`focus.startIt`) that runs `setFirstAnswer(askedWith)` then `navigate("/admin/courses/new")`, instead of Confirm.
    - On `/admin/courses` and `/admin/courses/<slug>` it runs that by itself, once per card (F7). The assistant's own create token is left unused.
  - Admin Home: for each `overview.open`, a `NavLink` button `t("focus.continueCourse", { title })` to `/admin/courses/<slug>`, beside "New Course".
  - New strings: `focus.startIt`: "Start it", `focus.makeWithMe`: "Let's make it together, one question at a time.", `focus.continueCourse`: "Continue your course: {title}".

- [ ] **Step 1: Write the failing e2e tests:**
  - `"asking the assistant for a course on the courses list opens focus mode with her words"`
  - `"asked elsewhere, the assistant offers Start it"`
  - `"home shows Continue your course for one in progress"`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.**
- [ ] **Step 4: Run** `make e2e-spec SPEC=33-focus-course` and `make e2e-spec SPEC=29-copilot`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): the assistant opens focus mode, and Home offers to continue`

### Task 4.5: Switch on, check the whole thing, deploy

**Files:**
- Modify: `backend/config/settings/base.py:454` (`FOCUS_MODE_ENABLED` default `True`), `.env.prod.example` (document the key), `docs/superpowers/plans/2026-10-18-focus-mode-stages-2-4.md` (deleted in the final commit, as stage 1's plan was)

- [ ] **Step 1: Check prod has no override.** Confirm prod's KV holds no `FOCUS_MODE_ENABLED=false` (`~/ws/home-server/scripts/secrets.sh` list for `contentor`; read only).
- [ ] **Step 2: Flip the default** and update the API test that asserts the off state (`grep -n FOCUS_MODE_ENABLED apps/core/tests`) so it sets the setting explicitly.
- [ ] **Step 3: Run the whole focus e2e** (`make e2e-spec SPEC=33-focus-course`) and `make test-changed`, each on its own.
- [ ] **Step 4: Do real dev-hub runs, checked by eye, on desktop and phone, light and dark.**
  - A rich first answer, all the way to a scheduled announcement.
  - "Just draft it" from the first screen.
  - An unclear answer.
  - A model-down run (`AI_PROVIDER` pointed at a dead hub): every step must still have a way forward.

  Then read back `docker compose exec django python manage.py focus_timing` for these runs next to two plain-form runs, and paste the numbers into the commit message (information only, F5).
- [ ] **Step 5: Update memory `project-focus-mode`** (switched on, commits), then delete this plan file.
- [ ] **Step 6: Run `make deploy`** (it runs the full backend suite; don't run it separately). Typecheck the committed tree first.
- [ ] **Step 7: Verify on prod.**
  - Health check.
  - `GET /api/v1/admin/focus/` on the test tenant answers `enabled: true`.
  - One real creation on the test tenant through to "Keep as a draft".
  - Check its outline, descriptions and covers came through prod's AI provider (`docker logs` of the agents worker on the node, or superadmin → Logs, filtered on `focus`).
  - Leave the test course as a draft.
- [ ] **Step 8: Commit.** `feat(focus): focus mode is on for every coach`
