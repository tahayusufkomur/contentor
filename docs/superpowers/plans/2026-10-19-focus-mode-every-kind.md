# Focus mode for every kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every kind of thing a coach makes in the studio is made the way the course is in focus mode: the real page on the left, the guide in the dock on the right, one question at a time, the first answer taking everything, the AI drafting while she watches, and the same shared steps (cover, price and access, finish, telling her students).

**Architecture:** Stage A turns stage 1–4's course-only engine (`backend/apps/core/focus`, `frontend-customer/src/components/focus`, `lib/focus`) into one engine with a **kind adapter** per kind. The adapter is a module in `apps/core/focus/kinds/` that holds the kind's recipe, how its draft record is made, found, priced, checked and taken live, and what its analysis reads. The course moves onto an adapter first, with no change in behaviour. Each later stage adds one kind: its adapter, the model gaps it needs (a hidden draft state, a description, a cover), its page in focus mode, an e2e spec, and its switch. Every model call stays a focus job on `run_focus_job`. Code still owns which questions are asked.

**Tech Stack:** Django 5.1 + DRF, Celery (`agents` queue), Pydantic structured output through `apps.core.ai.structured`, Next.js 14 (frontend-customer), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-focus-mode-design.md` (the course spec: F1–F21, §4–§7, and §9, which names what each other kind needs). Part 1 below is the design for the other kinds. It follows the course spec's direction, as the owner asked ("it will be same direction"). Decisions marked *my call* are listed at the end for the owner to check while reading. They were not asked. Read the course spec §3, §5 and §7, and Part 1, before any task.

**Status:** the owner approved Part 1, the gaps it names and every call in "The owner's check" on 2026-10-19 ("all your plan and gaps analysis is correct"). Not started.

**Starting point:** the course's Tasks 4.4 (assistant entry, "Continue your course") and 4.5 (switch on) in `docs/superpowers/plans/2026-10-18-focus-mode-stages-2-4.md` have landed. Stage A rewrites `flow.py`, so do not start it while another session is still committing to `apps/core/focus` (check `git log -5 -- backend/apps/core/focus` and `git status`).

---

# Part 1: The design for every kind

## 1.1 What a coach can create, and which kinds get focus mode

From a survey of the studio on 2026-10-19 (every "New …" and "Create …" action, the search palette, Home, the calendar and the setup checklist):

| Kind (id) | Made today | Focus mode | Stage |
|---|---|---|---|
| Course (`course`) | `/admin/courses/new` | Built (stages 1–4) | done |
| Class or event (`event`): live online, live stream, Zoom, in person; once or weekly | `/admin/live?new=1`, one 346-line card (`event-form.tsx`) | Yes | B |
| Message to students (`message`), the announcement | `/admin/messages/new`, a 684-line composer (`announcement-compose.tsx`) | Yes | C |
| Download (`download`) | an inline card on `/admin/downloads` (title, access, file) | Yes | D |
| Membership (`membership`) | `/admin/store/plans/new` (plan, then access) | Yes | E |
| Bundle (`bundle`) | `/admin/store/bundles/new` | Yes | F |
| Blog post (`post`) | "New post" makes an untitled draft at once; "Write with AI" dialog; autopilot | Yes (New post only) | G |
| Designed email (MailCraft) | `/admin/messages/email/new`, three steps around the MailCraft iframe | No (G21) | — |
| Community post | the student-feed composer, one box, no draft | No (G22) | — |
| Site page or section | no new pages exist; sections via "Describe a section" | No (G22) | — |
| Coupons, gift cards | do not exist (team spec T15: discount codes are rung 2) | No | — |
| Media uploads, assistant knowledge and links, filters, tags | utility records, not things she sells or teaches | No | — |

Order (*my call*): classes come first because coaches make them most after courses, Home has a button for them, and the Designer already supports their covers. Messages come next because the composer is the heaviest form and the announcement drafting already exists. Then downloads, memberships and bundles, because a bundle needs things to put in it. The blog post comes last because it already has an AI writer, so it hurts least today.

## 1.2 Decisions

| # | Decision | Source |
|---|---|---|
| G1 | Same direction as the course for every kind: the real page on the left (F3), the guide in the dock (F2), tap answers (F4), the first answer takes everything (F14), exact stays exact (F15), drafting she watches (F20), the draft exists early and leaving loses nothing (F8), she can type into the page at any time (F9), always a way forward (F5 revised). | Owner ("it will be same direction") |
| G2 | One engine. A kind is a recipe plus an adapter module (`apps/core/focus/kinds/<kind>.py`). The shared steps (cover, price and access, finish, telling her students) read the record only through the adapter. | Course spec F1, §7.1 |
| G3 | Each kind has its own switch: `FOCUS_KINDS` (a comma-separated env list, default `course`). A kind is added to the default only in its stage's last task, so coaches meet each kind whole, as they met the course. `FOCUS_MODE_ENABLED` stays the master switch. | My call, following F-stage rule |
| G4 | Every kind's draft is hidden from students until her tap on the finish step. Where a kind has no hidden state today, the plan adds the smallest one: an event is held as `status="draft"`; a download and a bundle get `is_published`; a membership stays `is_active=False` (off sale); a message stays `status="draft"`; a post stays `status="draft"`. | Team spec T6, F8 |
| G5 | A short-copy job (`copy`) writes the title and the description for the event, download, membership, bundle and message kinds, typed into the page as the outline is. It has one prompt per kind and never invents a claim, result or number (F13, F19). A redraft writes a field only while it still holds what the job wrote, so her edit is never overwritten. | My call (one job instead of five) |
| G6 | The review step is the same for every drafted kind: "Here's your {noun}. Does it fit?" She can answer "Looks good", say a change (a redraft with her words), or edit the page herself. | Course step 3 |
| G7 | Covers. Course, event and download get the Designer's four styles (F16–F18). A download becomes a new `Design` target. A post gets the photo row only (her photos, the library, upload, say it), because a post page prints its own title and a styled cover would print it twice; styled blog covers stay with Designer stage 5. Memberships, bundles and messages get no cover step: none of them shows an image today. | My call |
| G8 | Price and access is the course's step (F11, F13) wherever a kind is sold one-time: event (not Zoom), download. The suggestion is computed by code from her own numbers for that kind, with a plain fallback line. A membership has its own price step (an amount per month or per year). A bundle's suggestion is a discount off what its items cost bought apart, which is still her own numbers. A paid price is only ever her tap or her own words. | Course spec F11, F13 |
| G9 | Zoom classes cannot be sold, bundled or put in a membership today (billing leaves them out). Focus mode makes a Zoom class free and says so in one line ("Zoom classes are free to join"). It does not ask. | My call, from the code |
| G10 | A class's kind (live, stream, Zoom, in person) cannot change after it exists. So its draft is made once the kind is known: usually from her first answer, otherwise from the tap on "Where will it happen?". Until then the creation has no record, and the page shows the empty form with her title. | My call (course spec §9) |
| G11 | A weekly class is a series: every row of its kind with the same title (Designer spec E14). Focus mode drafts the first session. The finish step makes the rest from her schedule, using the code `/setup` uses (moved to `apps/live/series.py`), capped at 60 sessions. "Publish" publishes the whole series. "Keep as a draft" makes the series as held drafts, and the event form's **Publish** button publishes the held series later. | My call (course spec §9) |
| G12 | A held event with a date stays a draft until she publishes it. Saving it in the event form no longer publishes it. Moving from no date to a date still publishes, as the form's hint promises. Held drafts are hidden from the calendar, from event details and from reminders. This also fixes `/setup`'s held classes. | My call, from the code (leaks found in the survey) |
| G13 | Times in focus mode are in her site's time zone (`TenantConfig.timezone`), as the assistant uses it, and the guide shows the zone. | My call |
| G14 | A message's audience is a question: "Who should get it?" with All my students, the students of one of her courses or bundles, or "You decide" (all). The tile shows how many students that is. A message with nobody to receive it offers only "Keep as a draft". | My call |
| G15 | A message's "When?" offers: Now, the next 10:00 at least an hour away (as Marketing's course announcement does), or a time she types. Repeating messages stay on the plain form. | My call |
| G16 | Who signs what (team spec T1, T12, T16). The Content Creating Specialist drafts classes, downloads and the course. The Financial Strategist asks the membership and bundle questions, their prices and every price step. The Marketing Specialist writes membership, bundle and post copy and announces courses, downloads, memberships, bundles and posts. The Community manager writes messages and announces classes. | Team spec, applied |
| G17 | A download needs a description and a cover to be worth guiding, so it gains both (a description field and a `thumbnail` photo, drawn with `CoverArt` in the store, the student downloads list and the admin list), plus its own editor page (`/admin/downloads/<id>`). Today it has only the inline card. | My call |
| G18 | A membership draft is a plan off sale with price 0 until her price tap. A plan cannot be deleted (it may have subscribers), so a membership she leaves stays off sale, as a course draft stays a draft. Membership and bundle focus mode is for the site owner only, as their endpoints are today. | My call, from the code |
| G19 | A bundle needs at least two items to go live, since a bundle of one is just the item. | My call |
| G20 | A post goes live only with a real title and some body text (`BlogPost.not_ready`), wherever it is published: the editor, the assistant, focus mode. Autopilot posts always have both. This follows the owner's "strict for everywhere" on empty lessons. | My call, after the owner's rule for courses |
| G21 | The designed email (MailCraft) keeps its three steps. Focus mode would need MailCraft to take a drafted template through its API, and the plain message (stage C) already covers "tell my students". Revisit when MailCraft can take one. | My call |
| G22 | Community posts and site sections are out. A community post is one box with no draft state, so a guide would only make it slower. Sections already have their own guided AI flow ("Describe a section"). | My call |
| G23 | Every new kind gets the course's entry points (F7). "New …" on its list page opens focus mode. The search palette gains a "New …" entry per kind. Home's "Continue your …" names the kind. When she asks the assistant to make one, its card offers **Start it** (or opens focus mode by itself on that kind's own pages). Each list keeps "Fill it in myself" for the plain form. | Course spec F7 |
| G24 | Telling her students (team spec T12) is the course's finish offer, for every kind students can join or buy: the announcement draft, then Schedule or Not now. A message is itself the telling, so it has no such offer. | Course spec §5 step 6 |

## 1.3 Each kind, step by step

Each table lists the questions in order. Skipped means her first answer (or an earlier answer) settled it. The shared steps are written **in bold**.

### Class or event (`event`, stage B)

| Step | Question (asked by) | Answers | On the page |
|---|---|---|---|
| 1 | What's your class or event about? (Content) | Ideas from her niche and classes, "My own idea…" (starter "A class on "), "You decide". She can write it all: what, where, when, weekly, how long, the address, the price. | The title types in |
| 2 | Where will it happen? (Content) | Live online / Live stream / On Zoom / In person. Skipped when step 1 settled it. The draft is made here at the latest (G10). | The form switches to that kind |
| 3 | When? (Content) | The `/setup` schedule picker: once (a date and time) or weekly (days, times, from, for how many weeks). Shown in her time zone (G13). | "Weekly · Tuesdays 18:00 · 8 weeks" under the date |
| 4 | The place (Content): "What's the address?" in person, "Paste your Zoom link" on Zoom | An answer box with a starter; "Add it later". Not asked for live or stream. | Address or link fills in |
| 5 | Here's your class. Does it fit? (Content, G6) | The copy job writes the title and description; Looks good / say a change / edit the page | They type in |
| 6 | **Cover** (Designer) | Four styles, the photo row (F16–F18). The cover belongs to the series (E14). | The cover slot |
| 7 | **How will students join?** (Financial Strategist) | Free / one-time price with its reason / in a membership (live and in person only). Zoom: free, one line (G9). | The price fills in |
| 8 | **Ready. Publish it?** (Content) | Publish / Keep as a draft (G11). Publish is refused while the address (in person), the link (Zoom) or a future date is missing. | — |
| 9 | **Tell your students?** (Community manager) | The announcement, with the schedule in it | — |

### Message (`message`, stage C)

| Step | Question (asked by) | Answers | On the page |
|---|---|---|---|
| 1 | What do you want to tell your students? (Community) | Starter "Tell them ", "You decide" off (a message must come from her). She can say it all: what, who, when, a link, "also by email". | The title types in |
| 2 | Who should get it? (Community, G14) | All my students (count) / students of {course or bundle} (count) / You decide | The audience fills in |
| 3 | Here's your message. Does it fit? (Community, G6) | The copy job writes the title and body, with a link to the course or class she named | Title and body type in |
| 4 | When should it go out? (Community, G15) | Now / {next 10:00} / say a time | The time fills in |
| 5 | **Ready. Send it?** (Community) | Send (now or at the time) / Keep as a draft; "Also by email" tick. Send is refused with nobody to receive it. | — |

No cover, no price, no announcement.

### Download (`download`, stage D)

| Step | Question (asked by) | Answers | On the page |
|---|---|---|---|
| 1 | What are you sharing? (Content) | Ideas (a workbook, a checklist, a recording, a template, from her niche), "My own idea…" (starter "A "), "You decide". She can say the price, who it is for, what is inside. | The title types in |
| 2 | Add the file (Content) | An upload tile in the guide (the record → presign → upload → complete chain, with progress), or drop it on the page; "Add it later". | The file row fills in |
| 3 | Here's your download. Does it fit? (Content, G6) | The copy job writes the title and description, from her words and the file name | They type in |
| 4 | **Cover** (Designer) | Four styles (G7, G17) | The cover slot |
| 5 | **How will students get it?** (Financial Strategist) | Free / one-time price / in a membership | The price fills in |
| 6 | **Ready. Publish it?** (Content) | Publish / Keep as a draft. Publish is refused without a file. | — |
| 7 | **Tell your students?** (Marketing) | — | — |

### Membership (`membership`, stage E, owner only)

| Step | Question (asked by) | Answers | On the page |
|---|---|---|---|
| 1 | What do members get? (Financial Strategist) | The `/setup` tiers (digital, online, studio, community, everything) for what she has, "My own idea…", "You decide" | The name types in |
| 2 | What's included? (Financial Strategist) | Multi-select tiles of her courses, class series and downloads, with "Select all"; items her words named are ticked | The access list fills in |
| 3 | Here's your membership. Does it fit? (Marketing, G6) | The copy job writes the name and description from what is included | They type in |
| 4 | What should it cost? (Financial Strategist) | The suggested monthly price with its reason, the yearly price, or say an amount (G8) | Price and cycle fill in |
| 5 | **Ready. Put it on sale?** (Financial Strategist) | Put it on sale / Keep it off sale. With selling not open: Start selling (F11). Refused with nothing included or no price. | — |
| 6 | **Tell your students?** (Marketing) | — | — |

### Bundle (`bundle`, stage F, owner only)

| Step | Question (asked by) | Answers | On the page |
|---|---|---|---|
| 1 | What goes in the bundle? (Financial Strategist) | Multi-select tiles of what she sells (paid courses, downloads, classes); her words name items by title | The items list fills in |
| 2 | Here's your bundle. Does it fit? (Marketing, G6) | The copy job writes the name and description | They type in |
| 3 | What should it cost? (Financial Strategist) | The suggested price ("{sum} bought apart; 25% off"), the full sum, or say an amount (G8) | The price fills in |
| 4 | **Ready. Publish it?** (Financial Strategist) | Publish / Keep as a draft. Refused under two items (G19). | — |
| 5 | **Tell your students?** (Marketing) | — | — |

### Blog post (`post`, stage G)

| Step | Question (asked by) | Answers | On the page |
|---|---|---|---|
| 1 | What's your post about? (Marketing) | Her topic ideas (`BlogTopicIdea`), "My own idea…" (starter "A post on "), "You decide" | The title types in |
| 2 | How long? (Marketing) | Short read (~600 words) / Standard (~1,200) / Long guide (~2,000), "You decide" | — |
| 3 | Here's your post. Does it fit? (Marketing, G6) | The post job writes the title, excerpt, body, meta description and tags with the blog writer; Looks good / say a change / edit the page | Everything types in |
| 4 | **Cover photo** (Designer, G7) | The photo row only: her photos, the library, upload, say it; "Later" | The cover photo |
| 5 | **Ready. Publish it?** (Marketing) | Publish now / Keep as a draft (G20) | — |
| 6 | **Tell your students?** (Marketing) | — | — |

"New post" opens focus mode. "Write with AI" and autopilot stay as they are (course spec §9).

---

# Part 2: The build

## Global Constraints

- `FOCUS_KINDS` defaults to `course` until each kind's last task adds it. Every stage still deploys (owner's standing rule: commit, deploy, verify on prod). With the kind off, the prod check is health plus migrations.
- Taps on code-owned buttons never call a model. Every typed answer is analysed. A tap on a model-written button (a clarify option, a follow-up option) is applied as it is, without a second analysis.
- Exact stays exact (F15). Dates, times, counts, prices, addresses, links and titles she gave are kept as she gave them. A field she did not mention is never guessed and gets its usual question.
- A paid price is only ever set from her tap or her own words (F11, T15). No job sets a paid price. A membership draft keeps price 0 and stays off sale until her tap.
- No model output may invent a claim, result or number (F13, F19). Price reasoning is computed by code from her own numbers.
- Nothing she typed is lost. A redraft never overwrites a field she edited (G5). A job writes into a field only while it still holds what that job last wrote, or nothing.
- Nothing goes live, is sent or is put on sale without her tap on the finish step. Drafts are hidden from students (G4). An unpublished focus draft never blocks the site's go-live (`setup_items._has_paid_content`).
- What she is waiting on uses hub label `contentor:copilot`. Drafting she is not waiting on uses `contentor:focus-ahead`.
- UI copy is short and plain, in `frontend-customer/messages/en/admin.json` under `focus.*`. Kind-specific copy goes under `focus.kinds.<kind>.*`.
- Frontend conventions (root CLAUDE.md, enforced by `make lint`): `<Button loading>`, `<Spinner>`, `useAsyncAction`, `<NavLink>`/`useNavigate()`, sonner toasts, `motion-safe:` motion, a `loading.tsx` for every new route.
- After any serializer change, run `npm run gen:api` in `frontend-customer` and review the `src/types/api-generated.ts` diff.
- Shared checkout: format and commit only your own files and hunks (memory `reference-committing-only-my-hunks-in-the-shared-checkout`). Pre-commit must be clean. Run one heavy job at a time.
- Verify each task with its focused tests: `docker compose exec django pytest <file> -q` and `cd frontend-customer && npx vitest run <file>`. Run `make test-changed` at the end of each stage.
- E2e (rules from the owner, 2026-10-19, commits 34e13f27 and 509504bd):
  - While iterating, run only the task's own spec: `make e2e-spec SPEC=<spec>`.
  - Run `make e2e-changed BASE=<the stage's first commit>` once per stage, in its check task. Preview it with `PLAN=1`.
  - Before any e2e run, check `pgrep -fl 'playwright test'`. If another session's run is going, wait: the runs share the demo tenant and the Docker VM.
  - Never start a full `make e2e`, and never re-run a spec that passed just to confirm it.
- Every new e2e spec needs its `e2e/impact-map.json` entries (the `make lint` self-test fails without them). Keys match by longest prefix (`scripts/select_tests.py`). Each kind's spec task adds:
  - `"core/focus/kinds/<kind>.py": ["<its spec>"]` to the backend map;
  - its pages to the frontend map;
  - its spec to the shared `core/focus`, `src/components/focus` and `src/lib/focus` entries, because shared focus code can break every kind.
  `core/copilot` still selects every spec on purpose.
- GitNexus calibration: run `impact` before editing `content.create_event`, `expand_class_series`, `_ScheduledOnCreateMixin`, `designs.TARGET_KINDS` / `designs._model`, `get_access_info`, `setup_items._has_paid_content`, `useLiveRecord`, `ActionCard` and every `flow.py` function Stage A moves. Each is shared beyond one kind.
- After every migration, the test DB needs `make test-fresh` once (memory `reference-dirty-test-db-seed-failures`). Restart `celery-agents` after adding a job handler (memory `reference-dev-stack-staleness-traps`).

## Review Focus

1. **She edits a held class in the event form** (title, description) after "Keep as a draft", or during focus mode. Today any save with a date publishes it. It must stay a draft. Pinned in Task B2: `test_saving_a_held_draft_keeps_it_a_draft`.
2. **She edits the title or description while the copy job is still writing, or before a redraft.** Her text must survive both. Pinned in Task B4: `test_a_redraft_never_overwrites_a_field_she_edited`, `test_her_edit_during_the_run_is_kept`.
3. **A weekly schedule whose first slot has already passed today, or which crosses a clock change.** Sessions start at the first future slot, at her local time on every date. Pinned in Task B1: `test_a_series_starts_at_the_first_future_slot_in_her_timezone`, `test_a_series_keeps_her_local_time_across_a_clock_change`.
4. **A draft leaking to students or checkout:** an off-sale plan, an unpublished bundle or download, or a held class. Pinned in Tasks B2, D1, E1 and F1: `test_held_drafts_are_hidden_from_calendar_details_and_reminders`, `test_an_unpublished_download_is_hidden_from_students_and_the_store`, `test_a_draft_plan_is_not_on_the_pricing_page_and_cannot_be_bought`, `test_an_unpublished_bundle_cannot_be_bought`.
5. **Send tapped twice, or a message with nobody to receive it.** It is sent once, and with no audience only "Keep as a draft" is offered. Pinned in Task C2: `test_send_twice_sends_once`, `test_an_empty_audience_offers_only_keep_as_a_draft`.

## File structure

Backend, `backend/apps/core/focus/`:

| File | Responsibility | Stage |
|---|---|---|
| `kinds/__init__.py` (new) | the registry: `KINDS`, `get(kind)`, `enabled()` | A |
| `kinds/course.py` (new) | the course's recipe and adapter, moved out of `flow.py`, `recipes.py`, `pricing.py` | A |
| `kinds/event.py`, `kinds/message.py`, `kinds/download.py`, `kinds/membership.py`, `kinds/bundle.py`, `kinds/post.py` (new) | one adapter per kind | B–G |
| `copywriter.py` (new) | the short-copy job: title and description for any kind (G5) | B |
| `post.py` (new) | the post job, wrapping the blog writer | G |
| `flow.py`, `analysis.py`, `covers.py`, `pricing.py`, `announce.py`, `followup.py`, `views.py`, `recipes.py` | read the adapter instead of the course | A |

Other backend: `apps/live/series.py` (new), `apps/live/serializers.py`, `apps/live/views.py`, `apps/notifications/tasks.py`, `apps/tenant_config/interview_milestones.py`, `apps/downloads/{models,serializers,views}.py` + migration, `apps/media/{designs,models}.py` + migration, `apps/billing/models/core.py` + migration, `apps/billing/views/{bundles,store,payments}.py`, `apps/blog/{models,views}.py`, `apps/core/copilot/content.py`, `apps/tenant_config/setup_items.py`, `config/settings/base.py`.

Frontend, `frontend-customer/src/`: `lib/focus/kinds.ts` (new: one table of routes and labels per kind), `components/focus/*` (kind-agnostic, plus `schedule-question.tsx`, `upload-question.tsx`, `pick-question.tsx` as stages need them), `components/admin/live/event-form.tsx`, `app/admin/live/page.tsx`, `components/admin/announcement-compose.tsx`, `app/admin/messages/new/page.tsx`, `app/admin/downloads/{page.tsx,new/page.tsx,[id]/page.tsx}`, `components/admin/download-form.tsx` (new), `app/admin/store/plans/[id]/page.tsx`, `app/admin/store/bundles/{new,[id]}/page.tsx`, `app/admin/blog/{page.tsx,new/page.tsx,[id]/page.tsx}`, `app/admin/page.tsx`, `lib/admin-palette.ts`, `components/copilot/action-card.tsx`.

Tests: `backend/apps/core/tests/test_focus_{kinds,copy,event,message,download,membership,bundle,post}.py` (new), the existing `test_focus_*.py`, `backend/apps/live/tests/test_series.py` (new), the touched apps' existing tests, `frontend-customer/src/lib/__tests__/focus-kinds.test.ts` (new), and `e2e/specs/{34-focus-event,35-focus-message,36-focus-download,37-focus-membership,38-focus-bundle,39-focus-post}.spec.ts` (new).

---

# Stage A: one engine for every kind (no change a coach can see)

### Task A1: The kind adapter, and the course moved onto it

**Files:**
- Create: `backend/apps/core/focus/kinds/__init__.py`, `backend/apps/core/focus/kinds/course.py`
- Modify: `backend/apps/core/focus/flow.py` (every `Course` reference: `start`, `finish`, `state`, `_set_price`, `_access`, `_cannot_sell`, `_retitle`, `_record`, `working_title`, `CLOSING`, `NOT_READY`), `backend/apps/core/focus/recipes.py` (keeps `Recipe`; `COURSE` and `SIZES` move to `kinds/course.py`), `backend/apps/core/focus/views.py` (`focus_root`), `backend/config/settings/base.py` (next to `FOCUS_MODE_ENABLED`)
- Test: `backend/apps/core/tests/test_focus_kinds.py` (new); every existing `test_focus_*.py` stays green unchanged, apart from import paths

**Interfaces:**
- Produces:
  - `kinds.KINDS: dict[str, str]`: kind to module path (`{"course": "apps.core.focus.kinds.course"}`).
  - `kinds.get(kind: str) -> ModuleType` raises `flow.FlowError("unknown_kind")` for an unknown kind.
  - `kinds.enabled() -> list[str]`: the kinds in `settings.FOCUS_KINDS` that are in `KINDS`, in `KINDS` order.
  - `settings.FOCUS_KINDS: list[str]`, from env `FOCUS_KINDS` (CSV), default `["course"]`.
  - Each adapter module defines:
    - `RECIPE: Recipe`, `NOUN: str` (`"course"`), `NEW_TITLE: str` (`"New course"`)
    - `create_draft(actor, title: str, answers: dict) -> int | None`: the record id. `None` while the kind still needs an answer first (G10).
    - `record(record_id: int | None)`: the row, or `None`.
    - `payload(record) -> dict`: `{"id", "title", "path"}`, where `path` is the studio URL of its page (`/admin/courses/<slug>`).
    - `retitle(record_id: int, provisional: str, title: str) -> bool`
    - `set_price(record_id: int, value: str) -> None`: `value` is `"free"` or an amount.
    - `put_in_plan(record_id: int, plan) -> None`, or `None` when the kind cannot be in a membership.
    - `not_ready(record) -> str`: `""` when it may go live, else why (the course's `Course.not_ready()`).
    - `cannot_sell(record) -> bool`, and `go_live(record_id: int) -> None` (the course's `content.publish_course`).
    - `CLOSING: dict[str, str]` (`publish`, `draft`), `NOT_READY_LINE: str`.
    - `skips(creation) -> set[str]`: questions not asked for this creation (the course returns an empty set).
- `flow.py` calls `kinds.get(creation.kind)` for all of these. `RECIPES` becomes `{k: kinds.get(k).RECIPE for k in KINDS}`.
- A creation whose `record_id` is `None` stays active, and `state()` gives `"record": None` without closing it. Only a `record_id` whose row is gone closes it (today's rule).
- `current_field` skips `adapter.skips(creation)`.
- The overview returns `kinds: enabled()` and `first` only for them. `start` refuses a kind not in `enabled()` (`FlowError("unknown_kind")`).

- [ ] **Step 1: Write the failing tests** in `test_focus_kinds.py`:
  - `test_every_kind_module_has_the_whole_adapter`: for each `KINDS` module, every name listed above exists (`put_in_plan` may be `None`).
  - `test_a_creation_without_a_record_yet_stays_active`: a stub kind registered with `monkeypatch.setitem(kinds.KINDS, …)` whose `create_draft` returns `None`. After `flow.start(owner, "stub", value="x")`, `state()["record"] is None` and `status == "active"`.
  - `test_a_skipped_question_is_never_current`: the stub's `skips` returns `{"level"}`, so `current_field` moves past it.
  - `test_a_kind_not_switched_on_cannot_start`: with `settings.FOCUS_KINDS = []`, `POST /api/v1/admin/focus/` gives 400 `unknown_kind`.
  - `test_overview_lists_only_switched_on_kinds`: `GET` gives `kinds == ["course"]` and `first` has only `course`.
- [ ] **Step 2: Run them.** `docker compose exec django pytest apps/core/tests/test_focus_kinds.py -q` should fail with `ModuleNotFoundError`.
- [ ] **Step 3: Implement.** Move the code only. The course's behaviour, copy and tests stay as they are.
- [ ] **Step 4: Run every focus test.** `docker compose exec django pytest apps/core/tests -k focus -q` should pass.
- [ ] **Step 5: Commit.** `refactor(focus): a kind adapter, with the course moved onto it`

### Task A2: The analysis reads each kind's own fields

**Files:**
- Modify: `backend/apps/core/focus/analysis.py`, `backend/apps/core/focus/kinds/course.py`, `backend/apps/core/focus/flow.py` (`apply`)
- Test: `backend/apps/core/tests/test_focus_analysis.py`, `test_focus_kinds.py`

**Interfaces:**
- Produces:
  - `analysis.Unclear` (unchanged), and `analysis.Found(BaseModel)`, the fields every kind shares: `answer`, `topic`, `price`, `notes`, `photo`, `change` (renamed from `outline_change`; the course prompt says "a change she asks for to what is drafted"), `unclear`.
  - `analysis.SHARED_RULES: str`: today's rules for those fields, with "course" replaced by `{noun}` at module import per kind. The text stays static, so prompt caching holds.
  - `analysis.system_for(kind: str) -> str`: `SHARED_RULES` for that noun plus the adapter's `RULES`. Built once per kind (memoised).
  - Each adapter adds `FOUND: type[Found]` (the course's `CourseFound(Found)`: `level`, `modules`, `lessons`, `total`, `named`), `RULES: str`, and `apply_found(creation, found) -> None` (the course-only half of today's `flow.apply`: level, counts, size label, redraft).
  - `flow.apply` keeps the shared half (topic and retitle, price, photo, answer, clarify, rest) and calls `adapter.apply_found`.
  - `unclear.field` is validated against `adapter.UNCLEAR_FIELDS: tuple[str, ...]` (the course's `("modules", "lessons", "price", "level")`).
- [ ] **Step 1: Write the failing tests:**
  - `test_the_course_prompt_is_the_same_bytes_every_call`: `system_for("course") is system_for("course")`, and it equals the snapshot of today's `SYSTEM` with `outline_change` read as `change`.
  - `test_a_kind_reads_only_its_own_fields`: the stub kind's `FOUND` is `Found`, and its JSON schema has no `modules` key.
  - `test_an_unclear_field_outside_the_kind_is_dropped`
  - Existing analysis tests updated only for the rename.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus -q`. It should pass.
- [ ] **Step 5: Commit.** `refactor(focus): the analysis reads each kind's own fields`

### Task A3: The shared steps read the adapter

**Files:**
- Modify: `backend/apps/core/focus/covers.py` (`_plan`, `pick`/keep, `carry_out`, `SYSTEM`), `backend/apps/core/focus/pricing.py` (the course rule moves to `kinds/course.py`), `backend/apps/core/focus/announce.py`, `backend/apps/core/focus/followup.py`, `backend/apps/core/focus/flow.py` (`_price_tiles`, `_access`, `_finish_options`, `finish`), `backend/apps/core/focus/kinds/course.py`
- Test: the existing `test_focus_{covers,pricing,announce,followup,flow}.py`, `test_focus_kinds.py`

**Interfaces:**
- Produces, on each adapter:
  - `COVER: Literal["styles", "photo"] | None`
  - `cover_target(record) -> tuple[str, str]`: the `Design` target (`("course", str(pk))`).
  - `cover_facts(record) -> dict`: `{"title", "description"}` for the Designer prompt.
  - `suggest_price(record) -> pricing.Suggestion | None`
  - `price_tiles(creation, record) -> dict | None`: `None` uses the shared tiles (Free, the suggestion, her memberships when `put_in_plan` is not `None`). A kind with its own price step returns its tiles, and a tap on one is passed to its `set_price` as it is. Every price step has the question id `access` (kind `price`), since `answers["price"]` already holds the price she said.
  - `FINISH: tuple[tuple[str, str], ...]`: the value and label of each finish option (the course's `(("publish", "Publish now"), ("draft", "Keep as a draft"))`).
  - `ANNOUNCER: str | None` (the specialist key, or no offer), and `announce_facts(record) -> dict`: `{"what", "title", "description", "link", "when"}`.
  - `DRAFT_SLOT: str`: the follow-up slot name before the drafting (the course's `"outline"`). `followup.SYSTEM` reads `{noun}` and the slot.
- `pricing.py` keeps `Suggestion`, `FALLBACK`, `SETUP` and `whole(amount)` (renamed from `_whole`) as shared helpers.
- [ ] **Step 1: Write the failing tests** in `test_focus_kinds.py`:
  - `test_the_cover_step_draws_for_the_adapters_target`: the stub kind with `COVER="styles"` and a course-shaped target gets a round of four.
  - `test_no_covers_are_drafted_for_a_kind_without_a_cover`: with `COVER=None` (and no `cover` question in its recipe) the drafting job's end starts no covers job.
  - `test_no_announcement_offer_without_an_announcer`
  - `test_the_finish_options_come_from_the_adapter`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus -q`. It should pass.
- [ ] **Step 5: Commit.** `refactor(focus): cover, price, finish and the announcement read the kind`

### Task A4: The frontend works for any kind

**Files:**
- Create: `frontend-customer/src/lib/focus/kinds.ts`, `frontend-customer/src/lib/__tests__/focus-kinds.test.ts`
- Modify: `frontend-customer/src/components/focus/{focus-start,focus-bar,focus-guide,cover-step}.tsx`, `frontend-customer/src/lib/focus/{api,store}.ts`, `frontend-customer/src/app/admin/page.tsx`, `frontend-customer/src/lib/admin-palette.ts`, `frontend-customer/src/components/copilot/action-card.tsx`, `frontend-customer/messages/en/admin.json`, `backend/apps/core/focus/views.py` (`focus_form_timing`)
- Test: `focus-kinds.test.ts`, `e2e/specs/33-focus-course.spec.ts` (unchanged, must pass)

**Interfaces:**
- Produces:
  - `FocusKind = "course" | "event" | "message" | "download" | "membership" | "bundle" | "post"`
  - `KIND_ROUTES: Record<FocusKind, { newHref: string; plainHref: string; listHref: string; card?: string }>`: `card` is the assistant action kind that opens it (`create_course`; later `create_event`, `draft_announcement`, `create_blog_post`). In stage A only `course` is filled. Every later stage adds its own row.
  - `focusTimeKey(kind)` replaces `FOCUS_TIME_KEY`. `FocusBar` takes `kind` and shows `t("focus.kinds.<kind>.new")`. Every navigation uses `state.record.path`. Save & leave goes to `listHref`.
  - `useFocusOverview()` exposes `kinds: FocusKind[]`. The palette adds `focus.kinds.<kind>.new` for each enabled kind but the course and the message (both already there). Home's continue button reads `t("focus.kinds.<kind>.continue", { title })`.
  - `ActionCard`: for a card whose kind maps to an enabled `FocusKind`, it does what Task 4.4 does for `create_course` (Start it, or open by itself on that kind's `listHref` and `path`s).
  - `postFormTiming(kind, recordId, activeMs)`. The backend's `form-timing/` takes `kind` (default `course`) and checks the record through the adapter.
  - Strings: `focus.kinds.course.{new, continue, fillMyself}` take today's values, and the old keys are removed.
- [ ] **Step 1: Write the failing tests:**
  - `focus-kinds.test.ts`: `"every kind has its routes"` and `"a card kind maps to at most one focus kind"`.
  - Backend `test_form_timing_takes_the_kind`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/__tests__/focus-kinds.test.ts` and `make e2e-spec SPEC=33-focus-course`. Both should pass. `29-copilot` runs in Task A5's `make e2e-changed`.
- [ ] **Step 5: Commit.** `refactor(focus): the guide, the bar and the entry points work for any kind`

### Task A5: Stage A check and deploy

- [ ] Run `make test-changed`, `make test-frontend`, `make lint` and `make e2e-changed BASE=<Task A1's commit>`, one at a time.
- [ ] Walk the course in focus mode once on the dev hub, desktop and phone. It must look and behave exactly as before.
- [ ] Typecheck the committed tree fresh (memory `reference-typecheck-the-committed-tree`), then `make deploy`.
- [ ] Verify on prod: health, then `GET /api/v1/admin/focus/` gives `kinds: ["course"]`.

---

# Stage B: class or event

### Task B1: The weekly series, out of onboarding (G11)

**Files:**
- Create: `backend/apps/live/series.py`, `backend/apps/live/tests/test_series.py`
- Modify: `backend/apps/tenant_config/interview_milestones.py:381-424` (`expand_class_series` keeps its signature and calls `series.expand`)

**Interfaces:**
- Produces:
  - `series.expand(first, schedule: dict, tz: str) -> int`: copies `first` (today's `copy_fields`, plus its membership links) to every slot of `interview_schedule.occurrences(schedule, tz)` after `first.scheduled_at`, capped by `interview_schedule.MAX_CLASSES`. Returns how many it added.
  - `series.rows(row) -> QuerySet`: every row of the same model with the same title.
  - `series.publish_series(row) -> int`: every held (`status="draft"`), future row of `rows(row)` becomes `scheduled`. Returns the count.
- [ ] **Step 1: Write the failing tests:**
  - `test_expand_copies_the_first_session_to_every_later_slot`
  - `test_a_series_starts_at_the_first_future_slot_in_her_timezone`
  - `test_a_series_keeps_her_local_time_across_a_clock_change`: a Europe/Istanbul or Europe/Berlin span over a DST change keeps 18:00 local.
  - `test_expand_is_capped_at_sixty`
  - `test_later_sessions_join_the_first_ones_memberships`
  - `test_publish_series_skips_past_and_published_rows`
  - The existing `/setup` series tests stay green.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/live/tests/test_series.py apps/tenant_config -q`. It should pass.
- [ ] **Step 5: Commit.** `refactor(live): the weekly series is a live helper /setup and focus mode share`

### Task B2: A held class stays a draft, and stays hidden (G12)

**Files:**
- Modify: `backend/apps/live/serializers.py:45-74` (`_ScheduledOnCreateMixin`), `backend/apps/live/views.py` (the calendar list near `:444`, `calendar_event_detail` near `:504`), `backend/apps/notifications/tasks.py:21-38` (the 15-minute reminder), `backend/apps/core/copilot/content.py` (`edit_event`), `frontend-customer/src/components/admin/live/event-form.tsx`, `frontend-customer/messages/en/admin.json`
- Test: `backend/apps/live/tests/test_held_drafts.py` (new), `backend/apps/notifications/tests/` (the reminder test file)

**Interfaces:**
- Produces:
  - On update, the mixin moves `draft` to `scheduled` only when the row had no date and now gets one. A row already dated and in draft keeps `draft`, unless the request sends `status: "scheduled"`.
  - Consumes B1's `series.publish_series(row) -> int`. The form's **Publish** button on a held row sends `{"publish_series": true}`, and the views call `publish_series`.
  - The event form shows "Draft" and **Publish** on a held row (`live.held`, `live.publish`).
- [ ] **Step 1: Write the failing tests:**
  - `test_saving_a_held_draft_keeps_it_a_draft`: PUT title only on a dated draft gives `status == "draft"`.
  - `test_dating_an_undated_draft_still_publishes_it`
  - `test_held_drafts_are_hidden_from_calendar_details_and_reminders`: the calendar list, `calendar_event_detail` for a student (404) and the reminder task all skip `status="draft"`.
  - `test_publish_series_from_the_form_publishes_every_held_session`
  - `test_the_assistant_editing_a_held_draft_keeps_it_a_draft`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/live apps/notifications -q`. It should pass. The live specs run in Task B6's `make e2e-changed`.
- [ ] **Step 5: Commit.** `fix(live): a held class stays a draft until she publishes it, and students never see it`

### Task B3: The event adapter

**Files:**
- Create: `backend/apps/core/focus/kinds/event.py`, `backend/apps/core/tests/test_focus_event.py`
- Modify: `backend/apps/core/focus/kinds/__init__.py`, `backend/apps/core/focus/flow.py` (make the record once the kind is known: `_ensure_record(creation)` after every answer and every `apply`)

**Interfaces:**
- Consumes: A1–A3's adapter, B1's `series.expand` and `publish_series`, `content.create_event(user, kind, params)`, `interview_schedule.parse` / `summary`, `content.EVENT_KINDS`, `designs` (target `(kind, title)`).
- Produces:
  - `RECIPE` questions: `topic` (starter `"A class on "`, delegable), `where` (choice, values `live`, `stream`, `zoom`, `onsite`, labels "Live online", "Live stream", "On Zoom", "In person"), `when` (kind `schedule`), `place` (kind `text`, starter `"https://zoom.us/j/"` for Zoom; "Add it later" answers `later`), `review`, `cover`, `access`, `finish`, `announce`. Specialists follow G16.
  - `skips`: `place` for live and stream; `access` for Zoom, answered `"free"` with the line `ZOOM_FREE = "Zoom classes are free to join."`.
  - `create_draft` returns `None` until `answers["where"]` is set. Then it calls `content.create_event(actor, where, {"title": title})` with no date (an undated draft) and `cover=False`.
  - `EventFound(Found)`: `where`, `schedule` (`mode`, `date`, `time`, `days`, `times`, `start`, `weeks`, mapped onto `interview_schedule`'s shape and validated by `parse`), `duration_minutes`, `address`, `zoom_link`, `capacity`. Applying the date keeps the row a draft (the date is written to the model directly, not through the serializer).
  - `UNCLEAR_FIELDS = ("where", "when", "price")`
  - `not_ready`: `"Add the address first"` (onsite), `"Add the Zoom link first"`, `"Pick a date in the future"`, else `""`.
  - `go_live` saves the series when weekly (`series.expand`), then `publish_series`. Keeping a draft runs `series.expand` with the rows held (G11).
  - `suggest_price`: her published paid events of the same kind, then the class price from `/setup` (`answers_of(...)["event_price"]` when present), else `FALLBACK` at 15. `put_in_plan` for live and onsite only.
  - `ANNOUNCER = "community"`. `announce_facts` gives `when` from `interview_schedule.summary`.
  - `payload.path` = `/admin/live?event=<id>&kind=<kind>`
- [ ] **Step 1: Write the failing tests:**
  - `test_the_draft_waits_for_the_kind_then_is_an_undated_draft`
  - `test_a_first_answer_with_everything_skips_where_when_and_place`: "weekly yoga at my studio, Tuesdays 18:00, Kadıköy Moda Cd. 12, 200 lira".
  - `test_leaving_before_the_kind_is_known_leaves_no_record`
  - `test_zoom_is_free_and_its_access_step_is_skipped`
  - `test_publish_is_refused_without_the_address_or_link_or_a_future_date`
  - `test_publish_makes_and_publishes_the_weekly_series`
  - `test_keep_as_a_draft_holds_the_whole_series`
  - `test_a_date_she_gave_keeps_the_event_a_draft_until_finish`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.**
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus -q`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): the class or event recipe`

### Task B4: The copy job (G5)

**Files:**
- Create: `backend/apps/core/focus/copywriter.py`, `backend/apps/core/tests/test_focus_copy.py`
- Modify: `backend/apps/core/focus/jobs.py` (`HANDLERS["copy"]`), `backend/apps/core/focus/flow.py` (the review step starts it once the questions before `review` are answered; "Looks good" answers `review`; a typed change at any step after the draft redrafts), `backend/apps/core/focus/kinds/event.py`

**Interfaces:**
- Produces:
  - Each drafted adapter defines `COPY_RULES: str` (what to write: "a class title under 60 characters and a 2–4 sentence description for students: what happens, who it is for, what to bring") and `copy_facts(creation, record) -> dict` (her answers, brief and notes, her site, and for an event the kind, schedule summary and place). It also defines `write_copy(record_id, fields: dict) -> None` and `COPY_FIELDS: tuple[str, ...]` (`("title", "description")`).
  - `copywriter.start(creation, instruction: str = "") -> CopilotRun`: job `"copy"`, specialist `RECIPE.specialists["review"]`, label `contentor:copilot`.
  - `copywriter.carry_out(tenant, run_id)`: one structured call. It emits the stage-1 `field` events per field, so `useLiveRecord` types them in. It saves `creation.drafted["copy"] = {field: value}` in the same transaction as the write, and writes a field only while the record's value is blank or equals `drafted["copy"][field]`.
  - When it finishes and the kind's `COVER == "styles"`, it starts the covers job (label `contentor:focus-ahead`), as the outline does.
  - On failure, the working title stays, the description stays empty, and `state()["copy"] = {"status": "failed", "run"}` gives the guide "Try again" (`POST <id>/copy/`, a new endpoint, only while not building).
  - `state()` gains `"copy": {"status", "run"} | None`.
- [ ] **Step 1: Write the failing tests:**
  - `test_copy_writes_each_field_as_a_field_event`
  - `test_a_redraft_never_overwrites_a_field_she_edited`
  - `test_her_edit_during_the_run_is_kept`: the record is edited between the model call and the write, using a patched `structured` with a side effect.
  - `test_a_failed_copy_keeps_her_working_title_and_offers_try_again`
  - `test_a_record_deleted_meanwhile_ends_the_copy_quietly`
  - `test_copy_never_invents_numbers`: `COPY_RULES` and the shared prompt carry the F13 line (a snapshot assertion on the system prompt).
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement**, then restart `celery-agents`.
- [ ] **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus -q`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): the short-copy job writes a title and description she watches type in`

### Task B5: The event page in focus mode

**Files:**
- Create: `frontend-customer/src/components/focus/schedule-question.tsx`
- Modify: `frontend-customer/src/app/admin/live/page.tsx` (`?new=1` opens `<FocusStart kind="event">` when enabled; `?form=1` the plain form; `DescribeIt` hidden when enabled), `frontend-customer/src/components/admin/live/event-form.tsx` (a `focus` prop as `CourseForm` has: live title and description through `useLiveRecord`, the field being written read-only, "All details" for filters, tags, capacity and auto-record, the schedule summary, `CoverStep` in the cover slot once the record exists), `frontend-customer/src/components/focus/focus-guide.tsx` (question kinds `schedule` and `text` with a starter), `frontend-customer/src/lib/focus/kinds.ts` (the `event` row, `card: "create_event"`), `frontend-customer/messages/en/admin.json` (`focus.kinds.event.*`)
- Test: `e2e/specs/34-focus-event.spec.ts` (new) + `e2e/impact-map.json` (the Global Constraints entries; `src/components/admin/live` and `src/app/admin/live` gain `34-focus-event`)

**Interfaces:**
- Consumes: B3's `state()` (`record.path`, `question.kind`), B4's `copy` run, stage 1's `useLiveRecord(record, runId)`.
- Produces:
  - `ScheduleQuestion({ value, onAnswer, timezone })` wraps `components/setup-flow/schedule-picker.tsx` and sends `interview_schedule`'s shape as the answer `value` (JSON). A tap, so no analysis.
  - The plain form ("Fill it in myself", `/admin/live?new=1&form=1`) stamps form timing with `kind="event"`.
- [ ] **Step 1: Write the failing e2e tests** (model stubbed as in `33-focus-course`):
  - `"a weekly in-person class from one rich first answer"`
  - `"the kind is asked when her first answer does not say it"`
  - `"a Zoom class skips the price and asks for the link"`
  - `"keep as a draft holds the series and the form publishes it later"`
  - `"fill it in myself opens today's form"`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.**
- [ ] **Step 4: Run** `make e2e-spec SPEC=34-focus-event`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): make a class or event one question at a time`

### Task B6: Stage B check, switch on, deploy

- [ ] Add `event` to the `FOCUS_KINDS` default and document it in `.env.prod.example`.
- [ ] Run `make test-changed`, then `make e2e-changed BASE=<Task B1's commit>`, one at a time.
- [ ] Do real dev-hub runs, checked by eye, on desktop and phone, light and dark: a rich first answer (weekly, in person); a bare first answer; "Just draft it"; a model-down run (every step must still have a way forward).
- [ ] Typecheck the committed tree fresh, then `make deploy`. On prod: health, `kinds` includes `event`, and one class kept as a draft on the test tenant (hidden from its student calendar).
- [ ] Update memory `project-focus-mode` (stage B shipped, commits).

---

# Stage C: message

### Task C1: The composer works on one draft (focus prop)

**Files:**
- Modify: `frontend-customer/src/components/admin/announcement-compose.tsx`, `frontend-customer/src/app/admin/messages/new/page.tsx`
- Test: `e2e/specs/06-announcements.spec.ts` (must stay green)

**Interfaces:**
- Produces:
  - `AnnouncementCompose` gains `focus?: { record: number; runId: number | null }`. It PATCHes the draft row as she edits. Title and body arrive live through `useLiveRecord`. Its Send and Schedule controls are hidden: the finish step sends.
  - Today's prefill-then-recreate path stays for the plain form.
- [ ] **Step 1: Write the failing test:** vitest `announcement-compose.test.tsx`, `"in focus mode it edits the draft and shows no send button"`.
- [ ] **Step 2: Run it.** It should fail. **Step 3: Implement.** **Step 4: Run** it and `make e2e-spec SPEC=06-announcements`. Both should pass.
- [ ] **Step 5: Commit.** `feat(messages): the composer can work on one draft in place`

### Task C2: The message adapter

**Files:**
- Create: `backend/apps/core/focus/kinds/message.py`, `backend/apps/core/tests/test_focus_message.py`
- Modify: `backend/apps/core/focus/kinds/__init__.py`

**Interfaces:**
- Consumes: `content.create_announcement_draft`, `notifications.audience` (counts), the send-time rule in `focus/announce.py` (`send_time`, moved to a shared helper), B4's copy job.
- Produces:
  - `RECIPE` questions: `topic` (starter `"Tell them "`, not delegable), `audience` (choice: `all`, plus one tile per course and bundle she has, `course:<id>` and `bundle:<id>`, each hint `"{n} students"`), `review`, `when` (choice: `now`, `next` (labelled with the time), typed time through the analysis), `finish` (`FINISH = (("send", "Send"), ("draft", "Keep as a draft"))`, plus `also_email` as the tick, as "Tell my students" is a tick).
  - `COVER = None`, `ANNOUNCER = None`, `put_in_plan = None`, `suggest_price` returns `None`, and `access` is not in the recipe.
  - `MessageFound(Found)`: `audience` (`all` or a course or bundle title she named), `when` (`now` or an ISO local time), `link_to` (a title she named), `also_email`.
  - `not_ready`: `"Nobody would receive it yet"` when the audience count is 0, `"Pick a time in the future"`.
  - `go_live` sets `filters_json` from the audience, `also_email`, `status="scheduled"` and `scheduled_at` (now or the time) on the draft row, under `select_for_update`, only while it is `draft`.
  - `CLOSING`: `"Sent."` / `"Scheduled for {time}."` / `"Saved as a draft in Messages."`
- [ ] **Step 1: Write the failing tests:**
  - `test_a_first_answer_with_everything_skips_audience_and_when`
  - `test_send_twice_sends_once`
  - `test_an_empty_audience_offers_only_keep_as_a_draft`
  - `test_a_scheduled_message_goes_out_at_her_time_not_now`
  - `test_a_link_she_named_points_at_that_course`
  - `test_keep_as_a_draft_never_sends`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus apps/notifications -q`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): the message recipe`

### Task C3: The message page in focus mode

**Files:**
- Modify: `frontend-customer/src/app/admin/messages/new/page.tsx` (`<FocusStart kind="message">` when enabled and no `?draft`; `?form=1` the plain composer), `frontend-customer/src/components/focus/focus-guide.tsx` (the finish tick label per kind), `frontend-customer/src/lib/focus/kinds.ts` (the `message` row, `card: "draft_announcement"`), `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/35-focus-message.spec.ts` (new) + `e2e/impact-map.json`

- [ ] **Step 1: Write the failing e2e tests:**
  - `"a message from one sentence, scheduled for tomorrow 10:00"`
  - `"students of one course: the tile shows how many"`
  - `"send is not offered with nobody to receive it"`
  - `"the assistant's draft_announcement card offers Start it"`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `make e2e-spec SPEC=35-focus-message`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): write a message to her students one question at a time`

### Task C4: Stage C check, switch on, deploy

Same shape as Task B6, with `message`. On prod, keep the test message as a draft. Never send to the test tenant's students.

---

# Stage D: download

### Task D1: A download gets a description, a cover photo and a hidden draft

**Files:**
- Modify: `backend/apps/downloads/models.py` + migration, `backend/apps/downloads/serializers.py`, `backend/apps/downloads/views.py:19-52`, `backend/apps/billing/views/store.py:55-173` (products: published only, the image from `thumbnail`), `backend/apps/tenant_config/setup_items.py:83-101`
- Test: `backend/apps/downloads/tests/` (the views test file), `backend/apps/tenant_config/tests/` (the setup items test file)

**Interfaces:**
- Produces:
  - `DownloadFile.description = TextField(blank=True)`, `is_published = BooleanField(default=True)` (existing rows stay published), `thumbnail = ForeignKey("media.Photo", null=True, blank=True, on_delete=SET_NULL)`. All three are in the serializer.
  - Students and the store see a download only when `is_published` and it has a file.
  - `_has_paid_content` skips an unpublished focus draft of any kind. The course-only `FocusCreation` filter becomes per kind: `kind__in=("course", "download")`.
- [ ] **Step 1: Write the failing tests:**
  - `test_an_unpublished_download_is_hidden_from_students_and_the_store`
  - `test_existing_downloads_stay_published`
  - `test_a_focus_draft_download_never_blocks_go_live`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement**, then `make test-fresh`. **Step 4: Run** `make test-app APP=downloads` and the setup items tests. Both should pass. Run `npm run gen:api` and review the diff.
- [ ] **Step 5: Commit.** `feat(downloads): a description, a cover photo and an unpublished draft`

### Task D2: The Designer can design a download's cover (G17)

**Files:**
- Modify: `backend/apps/media/designs.py:30-57` (`TARGET_KINDS`, `_model`, `_gone`, `target_rows`, `target_title`), `backend/apps/media/models.py:43-49` + migration (choices), the store card, student downloads list and admin downloads list components in `frontend-customer/src` that show a download (find them with `grep -rn "file_size" src/components src/app`), which draw `CoverArt` / `CoverThumb` when a kept design exists
- Test: `backend/apps/media/tests/` (the designs test file)

**Interfaces:**
- Produces: `Design.target_kind="download"`, `target_key=str(pk)`. `keep` writes `thumbnail`. `restore_cover` works as for the course.
- [ ] **Step 1: Write the failing tests:** `test_a_download_cover_is_kept_and_undone` and `test_a_deleted_download_refuses_a_draft`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `make test-app APP=media`. It should pass. `32-photo-studio` runs in Task D5's `make e2e-changed`.
- [ ] **Step 5: Commit.** `feat(designer): covers for downloads`

### Task D3: The download page

**Files:**
- Create: `frontend-customer/src/app/admin/downloads/[id]/page.tsx` + `loading.tsx`, `frontend-customer/src/app/admin/downloads/new/page.tsx` + `loading.tsx`, `frontend-customer/src/components/admin/download-form.tsx`, `frontend-customer/src/lib/downloads/upload.ts` (the record → presign → PUT → complete chain, moved out of `app/admin/downloads/page.tsx:103-168`)
- Modify: `frontend-customer/src/app/admin/downloads/page.tsx` ("Upload File" goes to `/admin/downloads/new`, a row opens `/admin/downloads/<id>`, and the inline card and edit panel are removed)
- Test: `e2e/specs/12-downloads.spec.ts` (updated for the page)

**Interfaces:**
- Produces:
  - `uploadDownloadFile(downloadId: number, file: File, onProgress: (pct: number) => void): Promise<void>`
  - `DownloadForm({ download?, focus? })`: title, description, the cover slot (`CoverThumb`, `OpenStudioButton` once saved), the file row with progress, access and price; tags under "All details". The `focus` prop behaves as `CourseForm`'s does.
  - `/admin/downloads/new` without focus mode is the plain form (it creates the record on its first save).
- [ ] **Step 1: Update the e2e** `12-downloads` to create, upload and edit through the page.
- [ ] **Step 2: Run it.** It should fail. **Step 3: Implement.** **Step 4: Run** `make e2e-spec SPEC=12-downloads`. It should pass.
- [ ] **Step 5: Commit.** `feat(downloads): every download has its own page`

### Task D4: The download adapter and its page in focus mode

**Files:**
- Create: `backend/apps/core/focus/kinds/download.py`, `backend/apps/core/tests/test_focus_download.py`, `frontend-customer/src/components/focus/upload-question.tsx`
- Modify: `backend/apps/core/focus/kinds/__init__.py`, `frontend-customer/src/app/admin/downloads/new/page.tsx` (`<FocusStart kind="download">`), `frontend-customer/src/components/admin/download-form.tsx`, `frontend-customer/src/components/focus/focus-guide.tsx` (question kind `upload`), `frontend-customer/src/lib/focus/kinds.ts`, `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/36-focus-download.spec.ts` (new) + `e2e/impact-map.json`

**Interfaces:**
- Produces:
  - `RECIPE` questions: `topic` (starter `"A "`), `file` (kind `upload`, answered by the upload completing (`value="uploaded"`) or "Add it later" (`value="later"`)), `review`, `cover`, `access`, `finish`, `announce`.
  - `create_draft` makes `DownloadFile(title=…, is_published=False)`.
  - `DownloadFound(Found)`: `format` (workbook, checklist, recording, template, guide or her words).
  - `copy_facts` adds the file name and size.
  - `not_ready`: `"Add the file first"`. `go_live` sets `is_published=True`.
  - `suggest_price`: her published paid downloads, then `FALLBACK` at 9.
  - `put_in_plan` adds the plan access row. `COVER = "styles"`, target `("download", str(pk))`.
  - `UploadQuestion({ downloadId, onDone })` uses `uploadDownloadFile` and answers `file` when it completes.
- [ ] **Step 1: Write the failing tests:**
  - Backend: `test_a_draft_download_is_unpublished_until_finish`, `test_publish_is_refused_without_a_file`, `test_add_it_later_moves_on_and_finish_offers_only_keep`.
  - E2e: `"a download from one sentence and a file"`, `"add it later keeps it a draft"`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** the focus backend tests and `make e2e-spec SPEC=36-focus-download`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): make a download one question at a time`

### Task D5: Stage D check, switch on, deploy

Same shape as Task B6, with `download`. On prod, one download kept as a draft on the test tenant, and check it is not in its store.

---

# Stage E: membership

### Task E1: The membership adapter

**Files:**
- Create: `backend/apps/core/focus/kinds/membership.py`, `backend/apps/core/tests/test_focus_membership.py`
- Modify: `backend/apps/core/focus/kinds/__init__.py`, `backend/apps/core/focus/views.py` (owner check for `membership` and `bundle`: `FlowError("owner_only")`, 403)

**Interfaces:**
- Consumes: `SubscriptionPlan`, `SubscriptionPlanAccess`, `interview_brief.MEMBERSHIP_TIERS`, `monetization.can_monetize` / `is_paid_active`, B4's copy job.
- Produces:
  - `RECIPE` questions: `topic` (the tiers for what she has as tiles, starter `"Members get "`, delegable), `included` (kind `pick`, multi, custom off: one tile per course, class series (`series.rows` grouped by title) and download, values `course:<id>`, `event:<kind>:<id>`, `download:<id>`, plus "Select all"), `review`, `access` (kind `price`, "What should it cost?"; `price_tiles` returns the suggested monthly price, its yearly price (×10), and "Say an amount"; the values are `month:<amount>` / `year:<amount>`), `finish` (`FINISH = (("on_sale", "Put it on sale"), ("off_sale", "Keep it off sale"))`), `announce`.
  - `create_draft` makes `SubscriptionPlan(name=title, price=0, is_active=False, currency=tenant_charge_currency, billing_period="monthly")` directly (the serializer refuses 0).
  - `MembershipFound(Found)`: `included` (titles she named), `cycle` (`month` or `year`).
  - `apply_found` ticks the items her titles match (case-insensitive, exact title or a unique prefix), and never ticks one she did not name.
  - `not_ready`: `"Add what members get first"`, `"Set its price first"`. `cannot_sell` while selling is not open. `go_live` sets `is_active=True`.
  - `suggest_price`: her other active plans (median), then the price of the `/setup` tier she picked, then `MEMBERSHIP_TIERS`' price for the closest tier with `FALLBACK`.
  - `COVER = None`, `put_in_plan = None`, `ANNOUNCER = "marketing"`.
- [ ] **Step 1: Write the failing tests:**
  - `test_a_draft_plan_is_not_on_the_pricing_page_and_cannot_be_bought`
  - `test_the_draft_plan_has_no_price_until_her_tap`
  - `test_just_draft_it_leaves_the_price_to_her_finish_tap`
  - `test_named_items_are_ticked_and_nothing_else`
  - `test_a_coach_who_is_not_the_owner_cannot_start_one`
  - `test_on_sale_is_refused_with_nothing_included`
  - `test_the_trial_offers_start_selling`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus apps/billing -q`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): the membership recipe`

### Task E2: Multi-select tiles in the guide, and the plan page in focus mode

**Files:**
- Create: `frontend-customer/src/components/focus/pick-question.tsx`
- Modify: `frontend-customer/src/components/focus/focus-guide.tsx` (question kind `pick`; `price` with the membership tiles), `frontend-customer/src/app/admin/store/plans/[id]/page.tsx` (`new` with focus mode on gives `<FocusStart kind="membership">`; the page takes a `focus` prop: live name and description, the access card showing her picks as they are saved, the price and cycle filling in), `frontend-customer/src/app/admin/store/page.tsx` ("New membership" through `KIND_ROUTES`), `frontend-customer/src/lib/focus/kinds.ts`, `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/37-focus-membership.spec.ts` (new) + `e2e/impact-map.json`

**Interfaces:**
- Produces: `PickQuestion({ options, selectAll, onAnswer })` with multi ticks, "Select all" and "Deselect all" as `/setup` has them (`components/setup-flow/question-screen.tsx`). It sends the ticked values as one answer, as a tap.

- [ ] **Step 1: Write the failing e2e tests:**
  - `"a membership of all her courses at the suggested price, kept off sale"`
  - `"select all ticks every item"`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `make e2e-spec SPEC=37-focus-membership`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): make a membership one question at a time`

### Task E3: Stage E check, switch on, deploy

Same shape as Task B6, with `membership`. On prod, keep the test plan off sale.

---

# Stage F: bundle

### Task F1: A bundle can be an unpublished draft

**Files:**
- Modify: `backend/apps/billing/models/core.py:165-198` + migration, `backend/apps/billing/views/bundles.py:11-35`, `backend/apps/billing/views/store.py` (products), `backend/apps/billing/views/payments.py` (checkout refuses an unpublished bundle), `backend/apps/billing/serializers/bundles.py`, `frontend-customer/src/app/admin/store/page.tsx` (a "Draft" badge)
- Test: `backend/apps/billing/tests/` (the bundles and payments test files)

**Interfaces:**
- Produces: `Bundle.is_published = BooleanField(default=True)`. Students, the store and checkout see only `is_active and is_published`. The admin list shows drafts.
- [ ] **Step 1: Write the failing tests:** `test_an_unpublished_bundle_cannot_be_bought`, `test_an_unpublished_bundle_is_not_in_the_store`, `test_existing_bundles_stay_published`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement**, `make test-fresh`, then `npm run gen:api`. **Step 4: Run** `make test-app APP=billing`. It should pass.
- [ ] **Step 5: Commit.** `feat(billing): a bundle can be a draft`

### Task F2: The bundle adapter and its page in focus mode

**Files:**
- Create: `backend/apps/core/focus/kinds/bundle.py`, `backend/apps/core/tests/test_focus_bundle.py`
- Modify: `backend/apps/core/focus/kinds/__init__.py`, `frontend-customer/src/app/admin/store/bundles/new/page.tsx` (`<FocusStart kind="bundle">`), `frontend-customer/src/app/admin/store/bundles/[id]/page.tsx` (`focus` prop), `frontend-customer/src/lib/focus/kinds.ts`, `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/38-focus-bundle.spec.ts` (new) + `e2e/impact-map.json`

**Interfaces:**
- Consumes: E2's `PickQuestion`, the product list behind `/billing/products/` (`store.py`, as a function both the view and the adapter call).
- Produces:
  - `RECIPE` questions: `items` (kind `pick`, first, her paid items as tiles; typed words are read by the analysis), `review`, `access` (kind `price`, "What should it cost?"), `finish`, `announce`.
  - The draft is made at the first answer with `is_published=False` and price 0.
  - `BundleFound(Found)`: `items` (titles she named).
  - `price_tiles`: `"{75% of the sum, whole}"` with the reason `"{sum} bought apart; 25% off"`, `"{sum}"` with `"the same as buying them apart"`, and "Say an amount".
  - `not_ready`: `"Add at least two items"` (G19), `"Set its price first"`. `go_live` sets `is_published=True`.
  - `COVER = None`, `put_in_plan = None`, `ANNOUNCER = "marketing"`.
- [ ] **Step 1: Write the failing tests:**
  - Backend: `test_the_suggested_bundle_price_is_a_quarter_off_the_items`, `test_publish_is_refused_under_two_items`, `test_named_items_are_matched_by_title`.
  - E2e: `"a bundle of two courses at the suggested price"`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** the focus backend tests and `make e2e-spec SPEC=38-focus-bundle`. Both should pass.
- [ ] **Step 5: Commit.** `feat(focus): make a bundle one question at a time`

### Task F3: Stage F check, switch on, deploy

Same shape as Task B6, with `bundle`. On prod, keep the test bundle as a draft.

---

# Stage G: blog post

### Task G1: A post goes live only with a title and a body (G20)

**Files:**
- Modify: `backend/apps/blog/models.py:22` (`BlogPost.not_ready() -> str`), `backend/apps/blog/views.py:76` (the serializer refuses `status="published"` while not ready, with `{"detail": "post.not_ready"}`), `backend/apps/core/copilot/content.py:437` (`publish_blog_post` refuses), `frontend-customer/src/app/admin/blog/[id]/page.tsx` (Publish disabled with the reason)
- Test: `backend/apps/blog/tests/` (the views test file), `backend/apps/core/tests/` (the copilot content test file)

**Interfaces:**
- Produces: `not_ready()` gives `"Give it a title first"` for a blank title or `"Untitled post"`, `"Write something first"` for a body with no text, else `""`. Posts already published are left as they are.
- [ ] **Step 1: Write the failing tests:** `test_an_untitled_or_empty_post_cannot_be_published`, `test_the_assistant_cannot_publish_an_empty_post`, `test_a_published_post_is_left_as_it_is`.
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `make test-app APP=blog`. It should pass.
- [ ] **Step 5: Commit.** `fix(blog): an empty post is never published`

### Task G2: The post job

**Files:**
- Create: `backend/apps/core/focus/post.py`, `backend/apps/core/tests/test_focus_post.py`
- Modify: `backend/apps/core/focus/jobs.py` (`HANDLERS["post"]`), `backend/apps/blog/ai.py` (expose the generator's structured call as a function that takes the brief and returns the fields, if `blog_generate` keeps it inside the view)

**Interfaces:**
- Produces:
  - `post.start(creation, instruction="") -> CopilotRun`: job `"post"`, specialist `marketing`, label `contentor:copilot`.
  - `post.carry_out(tenant, run_id)`: calls the blog generator with her topic, length, notes and site, and `instruction` on a redraft. It writes `title`, `excerpt`, `body_html`, `meta_description` and `tags` with `field` events, keeping G5's rule through `creation.drafted["post"]`. Inline images follow the generator's own placement.
  - The failure path is the copy job's (Try again).
- [ ] **Step 1: Write the failing tests:**
  - `test_the_post_is_written_field_by_field`
  - `test_a_redraft_keeps_the_paragraphs_she_edited`: her edited `body_html` is not overwritten, and the guide says so: `"You changed the text, so I left it; the title and summary are new."`
  - `test_a_failed_post_offers_try_again`
  - `test_the_post_uses_the_blog_model_and_counts_against_the_blog_quota`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement**, then restart `celery-agents`. **Step 4: Run** the focus and blog tests. They should pass.
- [ ] **Step 5: Commit.** `feat(focus): the post job writes a post she watches type in`

### Task G3: The post adapter, with the photo-only cover

**Files:**
- Create: `backend/apps/core/focus/kinds/post.py`
- Modify: `backend/apps/core/focus/kinds/__init__.py`, `backend/apps/core/focus/covers.py` (`COVER="photo"`: no style rounds; the photo row's search; "Use this photo" sets the adapter's photo through `set_photo(record_id, photo_id)`, a library pick copied into her Media first, as today)
- Test: `backend/apps/core/tests/test_focus_post.py`, `test_focus_covers.py`

**Interfaces:**
- Produces:
  - `RECIPE` questions: `topic` (tiles from `BlogTopicIdea`, starter `"A post on "`), `length` (choice: `short`, `standard`, `long`; delegable), `review` (drafted by the post job), `cover`, `finish`, `announce`.
  - `create_draft` gives `BlogPost(title=…, status="draft", source="ai")`. `not_ready` is `BlogPost.not_ready()`. `go_live` is `content.publish_blog_post`.
  - `COVER = "photo"`, `set_photo` writes `cover_photo`. `suggest_price` returns `None` and `access` is not in the recipe. `ANNOUNCER = "marketing"`.
- [ ] **Step 1: Write the failing tests:**
  - `test_the_post_cover_step_shows_photos_not_styles`
  - `test_use_this_photo_sets_the_cover_photo_once`: a double tap keeps once.
  - `test_publish_is_refused_while_the_post_is_empty`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `docker compose exec django pytest apps/core/tests -k focus -q`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): the blog post recipe`

### Task G4: The post page in focus mode

**Files:**
- Create: `frontend-customer/src/app/admin/blog/new/page.tsx` + `loading.tsx`
- Modify: `frontend-customer/src/app/admin/blog/page.tsx` ("New post" goes to `/admin/blog/new`, which is today's untitled draft when focus mode is off or with `?form=1`; "Write with AI" and autopilot stay), `frontend-customer/src/app/admin/blog/[id]/page.tsx` (a `focus` prop: live title, excerpt, body, meta and tags; the cover slot shows the photo row's pick), `frontend-customer/src/components/focus/cover-step.tsx` (photo mode), `frontend-customer/src/lib/focus/kinds.ts` (`card: "create_blog_post"`), `frontend-customer/messages/en/admin.json`
- Test: `e2e/specs/39-focus-post.spec.ts` (new) + `e2e/impact-map.json`

- [ ] **Step 1: Write the failing e2e tests:**
  - `"a post from a topic idea, with a photo, published"`
  - `"an empty post cannot be published"`
  - `"fill it in myself makes today's untitled draft"`
- [ ] **Step 2: Run them.** They should fail. **Step 3: Implement.** **Step 4: Run** `make e2e-spec SPEC=39-focus-post`. It should pass.
- [ ] **Step 5: Commit.** `feat(focus): write a blog post one question at a time`

### Task G5: Stage G check, switch on, deploy, and close the plan

- [ ] Do Task B6's steps, with `post`.
- [ ] Update memory `project-focus-mode`: every kind is on, with the commits.
- [ ] Delete this plan file in the last commit, as the course plans were deleted.

---

# The owner's check (my calls, not asked)

Read Part 1 with these in mind. Each is a decision taken so the plan could be complete. Say which to change.

1. The order of the kinds: class, message, download, membership, bundle, post (§1.1).
2. Out: the designed email (until MailCraft can take a drafted template), community posts and site sections (G21, G22).
3. A switch per kind, so each kind ships whole (G3).
4. A weekly class: "Keep as a draft" makes the whole series as hidden drafts, and the event form gains a **Publish** that publishes the series (G11). Saving a held class no longer publishes it (G12).
5. A class's draft waits until its kind is known (G10). A Zoom class is free, without asking (G9).
6. A download gains a description, a cover and its own page, and the inline card goes away (G17).
7. Post covers are photos only; styled covers stay with Designer stage 5 (G7). New post opens focus mode, but Write with AI stays. Memberships, bundles and messages get no cover step.
8. A download asks what it is first and the file second, so her first answer can take everything; the course spec's §9 put the upload first. She can drop the file on the page at any time.
9. A bundle's suggested price is 25% off its items. A bundle needs two items (G8, G19).
10. A membership draft is off sale at price 0 until her price tap, and it stays off sale if she leaves (G18).
11. An empty post is refused wherever it is published (G20), as an empty lesson is.
12. A message's audience tiles show student counts, and its "When?" offers the next 10:00 as the course announcement does (G14, G15).
