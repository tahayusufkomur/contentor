# Focus mode: guided creation in the studio, starting with the course

Date: 2026-10-18 · Status: direction agreed with the owner in conversation the same day; this
document is the written design for approval · Mockups (git-ignored, served by the brainstorm
companion): `.superpowers/brainstorm/65157-1792333207/content/focus-layout-v2.html` (D1 picked) and
`course-steps.html` · Builds on `2026-10-17-agent-team-studio-design.md` (the team spec) and
`2026-10-17-designer-end-to-end-design.md` (the Designer spec), whose stage 2 is built as part of
this work.

## 1. Intent

The owner loves the `/setup` interview: one question at a time, tap-to-answer buttons, the AI
drafts and she approves, and she watches her site take shape. Once onboarding ends, the studio
loses all of that. In his words: the forms are too wide and too long, it is hard to know what to
fill in and how; making a cover is hard; the assistant "does things and you click a link to see"
instead of working on the page; "overall it's not like you are in good hands".

Focus mode brings the interview's way of working to creating things in the studio. It starts with
the course and is built so every other kind (class, download, membership, bundle, message, blog
post) can use it later without new machinery.

What the code shows today (survey 2026-10-18):

- A new course is one 1,228-line page (`components/admin/course-form.tsx`): settings, pricing,
  filters, tags and the whole curriculum at once. Only the title is required.
- The assistant never fills the page she is on. It creates the record on the server and returns a
  confirm card with a "View" link; the course editor then remounts its form, which throws away
  unsaved typing (`useAssistantApplied`, `formKey`).
- Covers are scattered: a photo picker at create, the photo studio only after the course is saved
  and on another page (`OpenStudioButton`, edit mode only); events get no cover until saved.
- "Describe it" (`components/admin/describe-it.tsx`) drafts a course from one line on the old SSE
  converse path and lands her on the editor.

## 2. Goals, non-goals, anti-goals

Goals

- "New course" opens focus mode: the real course page on the left, the docked assistant on the
  right acting as the guide, one question at a time with tap answers.
- The course takes shape on the page as she answers: title, description, modules and lessons type
  and appear in place; the Designer designs the cover in the cover slot; the Financial Strategist
  sets the price with one line of reasoning; Marketing offers the launch message.
- The guide asks a few must-ask questions and, between them, follow-up questions specific to her
  course, each with button options.
- Focus mode is never slower than the form it replaces, and we measure that.
- The machinery is reusable: a new kind is a new recipe (its questions and its drafting step) plus
  the shared steps (cover, price and access, finish).

Non-goals (this project)

- Focus mode for kinds other than the course. The design names what each will need (§9); each is
  its own project afterwards.
- Writing lesson bodies or recording videos. Focus mode stops at the outline: module and lesson
  titles (the fields `Module` and `Lesson` have today; no migration). Lesson content is her work
  afterwards.
- A chat-first studio. The pages stay (team spec T2; coach-admin spec D3): the form still works by
  hand.

Anti-goals: it fails, even if it works, when

- **it is slower than the usual way.** (The owner's words: what would make him wince is if it were
  "somehow slower than the usual way".)
- a tap waits on the AI, or anything waits without a way forward (no fallback, no "Try again");
- it feels like an interrogation;
- her screen is pulled somewhere else, or she has to follow a link to see the result;
- anything she typed is lost.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| F1 | Start with the course; build every part so other kinds reuse it. | Owner |
| F2 | The guide lives in the docked assistant on the right, not in a second panel. In focus mode the dock stops being an open chat and asks one thing at a time; she can still type or speak anything. It is one conversation: after focus mode the dock is the normal chat again, with the whole exchange in it. | Owner |
| F3 | The left side is the real course page she will keep using (mockup D1), shown with only what matters now; filters, tags and the rest wait behind "All details". When focus mode ends nothing moves or reloads. | Owner (D1); "All details" my call, played back and accepted |
| F4 | Tap-to-answer buttons as in `/setup`, with dynamic follow-up questions specific to her course, each with button options. | Owner |
| F5 | Never slower than the form (§6). This overrides team spec T5 ("speed is not a design limit") for focus mode. | Owner |
| F6 | The Designer's live cover design (Designer spec stage 2) is built as part of this project and is focus mode's cover step. | Owner |
| F7 | Getting in: "New course" on Home, the Courses list and the search palette opens focus mode. Asking the assistant for a course ("make me a course about…") on the Courses list or the course page opens it too, with what she said as the first answer; asked from any other page, the dock answers with a **Start it** button that does the same in one tap, so her screen never moves on its own (team spec §5.2). "Describe it" is replaced by focus mode's first screen. A "Fill it in myself" link opens the plain form. | Played back, accepted; the "Start it" rule my call after the builder check |
| F8 | The course exists as an unpublished draft from her first answer (team spec T6, build). Leaving loses nothing: work in progress carries on (team spec T7), she gets "ready for you", and reopening the course resumes the guide where she stopped. | Played back, accepted |
| F9 | She can type into the page at any time; the guide takes her edit as her answer and does not ask that question again. Only the field or rows being written at that moment are read-only (a narrowing of team spec T8's whole-record lock). | Played back, accepted; lock narrowing my call |
| F10 | Steps for the course (§5): topic → who and how big → outline check → cover (Designer) → price and access (Financial Strategist) → finish (Marketing). The last three are the shared steps. | Played back, accepted |
| F11 | Price: a paid price is always her tap. What she taps is saved on the draft. If she cannot take payments yet (the trial cannot sell), the course keeps its price and stays a draft; the finish step offers "Start selling" (her plan, then payouts) or "Keep as a draft". "You decide" on the price question makes the Financial Strategist highlight its pick with its reason, for her to tap. "Just draft it" leaves the price to her: the draft stays free and the finish step shows the suggested price as a button (team spec T15 holds: a run never sets a paid price on its own). An unpublished focus-mode draft never blocks the site's go-live (`setup_items._has_paid_content` skips it); publishing a paid course still needs selling open. | Played back, accepted; delegated price, "Just draft it" and the go-live rule my calls after the builder check |
| F12 | Phone: the guide is a bottom sheet over the page. The cover's live drawing is for computers only (Designer spec E18); on a phone the cover step shows the finished cover with the same buttons. | Played back, accepted |
| F13 | The price's one line of reasoning uses her own numbers only: her other courses' and memberships' prices, the prices she gave in `/setup`, her sales. With none, it says so plainly ("A common place to start; change it any time"). No market ranges (the mockup's "courses like this sell for €19–39" is out): the model would have to invent them, and the team spec rules that out. | My call after the builder check |

## 4. What she sees

### 4.1 The screen

- **Top bar:** "New course", progress dots for the steps, and **Save & leave**. The studio's side
  menu is tucked away while focus mode is on.
- **Left, the course page:** cover, title, description, price, curriculum. The part being worked on
  carries the specialist's tag ("Content Creating Specialist · writing") and outline; text types
  in, modules and lessons appear one by one, the cover draws itself (team spec §5.2). "All details"
  opens the rest of the form.
- **Right, the guide (the dock):** the specialist asking, what she answered so far (short), the
  current question with its buttons, and the answer box ("Or say it your way…", with the mic).
  When another specialist takes a step, the dock shows the hand-over in one line with that
  specialist's name and colour ("Designer here: let's make your cover").
- **Always there:** "You decide" on every question that can be delegated, **Just draft it** (draft
  everything now with sensible choices, then review), and Stop while something is being written.

### 4.2 Finishing

After the finish step, focus mode switches off: the side menu returns, the page is the normal
course editor with the same values, and the dock is the normal chat. The setup-status Home card
and the Today feed (team spec rung 3) never list a creation that is still in focus mode as
something to do; a resumable one shows as "Continue your course".

## 5. The course, step by step

Code owns which questions must be answered; the model only phrases them and proposes options,
exactly as `/setup` does (`interview_brief.Field`, `required`/`missing`, pre-written fallback
questions). Each must-ask question has pre-written buttons, so a slow or failing model never stalls
the screen.

1. **What will your students learn?** (Content Creating Specialist.) Buttons: topic ideas from her
   niche and existing courses, "My own idea…" (a sentence starter she finishes), "You decide".
   Skipped when she already said it. Left: a working title types in.
2. **Who is it for, and how big?** Level (complete beginners / some experience / advanced) and size
   (Quick win, 1 module / Short course, ~3 modules / Full program, ~6 modules), each with "You
   decide". Left: the description, then modules and lessons draft and appear.
3. **Here's your outline. Does it fit?** "Looks good, continue", or she says a change ("make module
   2 about breathing", a scoped redraft as in `/setup`'s `redraft_scope`), or she renames, reorders
   or deletes lessons on the page herself.
4. **Cover** (Designer, shared step): Designer spec §5.1. It looks at her covers, asks "Which photos
   should I use?" (My own photos / Contentor's library / Make a new one) only when it must, finds
   or makes the photo, and builds the cover in the course page's cover slot while she watches.
   **Keep**, **Try another photo**, **I'll edit it** (opens the photo studio on that design; Keep
   there brings her back to focus mode).
5. **How will students get it?** (Financial Strategist, shared step.) Free / a one-time price with
   one line of reasoning / in a membership she has. Left: the price fills in. Selling not open yet:
   F11.
6. **Ready. Publish it now?** (Marketing Specialist, shared step.) **Publish now** / **Keep as a
   draft**, plus "Tell my students": Marketing drafts an announcement (team spec T12) shown in the
   dock with Schedule / Not now. Focus mode then ends (§4.2).

**Follow-ups (F4).** Between the must-ask questions the specialist may ask a question specific to
this course, with two to four buttons, "You decide" and the answer box. Examples for a desk-yoga
course: "Will lessons be videos you record, or written guides?"; "Where do your students practise:
at the office desk or at home?" (Office / Home / Both); "End each lesson with a small daily habit?".
Rules:

- At most four follow-ups per creation; "Just draft it" skips the rest.
- Follow-ups that shape the outline (up to two) come after step 2 and before the outline drafts;
  they are written ahead while she answers steps 1 and 2. The outline starts drafting as soon as
  they are answered or dropped, and she watches it fill in at step 3. Later follow-ups shape only
  what comes after (cover, announcement); they never redraft an outline under her eyes. A change to
  the outline is always her request (step 3).
- A follow-up is shown only if it is already written when she finishes the current question (§6);
  otherwise it is dropped, never waited for.
- Every answer feeds the draft, so its effect shows on the page (her "office desk" appears in the
  description and lesson titles).
- Where it fits, buttons allow several picks and a "My own…" tile, as in `/setup`.
- Follow-ups use the engine's `ask` with options (Designer spec §7.4), so every specialist and
  every future kind gets them.

## 6. Speed (F5)

1. **A tap never waits on the model.** The next question appears in under a second: must-ask
   questions are code-owned with pre-written buttons, and a tap that leads to a code-owned question
   makes no model call (`/setup`'s instant path, `interview._code_owned`).
2. **Follow-ups are written ahead.** While she reads the current question, the specialist writes
   the next follow-up in the background (the approach measured on branch `claude/setup-fast-tiles`:
   model turns written ahead, shown only while still "fresh", i.e. written knowing every answer it
   depends on; hub label `contentor:interview-ahead`, background priority). Not ready or stale:
   dropped.
3. **Drafting runs alongside her answers.** The outline drafts on the `agents` worker as soon as
   step 2 is answered, while she continues; the cover search starts once the topic is known. She
   only watches something build when she is reviewing that very thing, and then it is filling in,
   not a spinner. Background drafting uses a background hub label; what she is waiting on uses
   `contentor:copilot`.
4. **She can always type into the page** (F9): the fastest path for someone who knows what she
   wants.
5. **"Just draft it"** from the first screen: one sentence, everything drafted with defaults, then
   review.
6. **Measured.** What is timed is her active time (the tab visible and in use; time away excluded)
   from "New course" to a **complete draft**: a title, at least one module with lessons, a cover,
   and a price decided (free counts). Both paths are stamped the same way: focus mode and the plain
   form ("Fill it in myself" and the old entry points), next to `/setup`'s funnel stamps
   (`setup_funnel`). Target: a complete course draft in two to three minutes of her time.
   **Before the switch goes on** (stage 3), a scripted dev comparison drives both paths with the
   same realistic input and focus mode must not be slower; the prod stamps then keep checking it.

## 7. How it works

### 7.1 The reusable pieces

- **A recipe per kind** (backend): its must-ask fields (the `/setup` `Field` shape: kind, options,
  multi/custom/alone, delegable, starter, needs), the specialist who drafts, the draft action
  (`create_course` today), and which shared steps it uses. The course is the first recipe.
- **Shared steps:** cover (Designer), price and access (Financial Strategist), finish (publish or
  keep, plus the announcement offer by Marketing). Each is a recipe-independent step that reads the
  draft record.
- **A creation store** (backend, tenant schema): one row per creation in progress, holding the kind,
  the draft record, the answers, which questions were asked and skipped, the follow-ups written
  ahead, the step, the status (active / done / left) and the dock thread it belongs to. Several
  may be in progress at once. The `/setup` stores (`Tenant.wizard_state`, `TenantConfig.setup_flow`)
  are singletons and are not reused; their patterns are (locked read-modify-write, fire-once
  milestones, `save_answers` merging against a base).
- **The guide in the dock** (frontend): the `/setup` question screen and its primitives in the dock
  column. Reuse `QuestionScreen`'s shape (`GuideTurn` flags), `AnswerBox`, `StarterCard`,
  `OwnOptionCard`, `DraftReview`'s statuses (building / ready / failed with "Try again" after 120 s)
  and the per-question `StepDraft` cache, behind a `SetupFlowApi`-style seam pointed at the creation
  endpoints. Pieces hard-wired to onboarding field ids (`BuilderPreview`, `SECTIONS`, `GoLivePanel`)
  are not reused.
- **Live on the page:** the team spec's event vocabulary (§6.2: a step started or finished with its
  specialist, a draft record created, a field written, a row added) and its page rule (§6.3: one
  shared hook feeds each live field its value and presence; pages never remount). The course page is
  the first page to use them. The Designer spec's shared live pieces (§7.5: the specialist tag and
  outline, the typing hook, the run-events hook on `lib/copilot/runs.ts`) are built here and used
  by both the course page and the photo studio.

### 7.2 The course page in focus mode

`CourseForm` copies its record into local state once; under focus mode it must read live fields
through the shared hook instead (team spec §6.3), and the existing `formKey` remount on
`useAssistantApplied` must stop throwing away typing. The cover slot draws with `CoverArt`, so the
Designer's design shows the moment layers arrive (Designer spec E9, E10). The studio button works
in create mode once the draft exists (it is hidden on create today).

### 7.3 The Designer's stage 2 inside this work (F6)

Everything in Designer spec §7.4 and §7.5: `design_cover`, the covers digest, `ask` with up to four
options (engine-wide; focus mode's follow-ups use it), run events, the shared live pieces, the
studio replay and panel steps (§5.2, §5.3), and Try another photo. In focus mode the replay plays in
the course page's cover slot instead of the studio; from the studio it plays in the studio as
specified. Whether today's automatic stock cover on `create_course` (`content._give_cover`) stays
for the plain form is left to the builder; in focus mode the cover step replaces it.

### 7.4 Endpoints and runs

Focus-mode turns and drafting run as copilot runs on the `agents` worker (team spec §6.2) so they
survive her leaving and are not cut by Cloudflare's ~100 s request cap. Taps on code-owned
questions are answered synchronously without a run. The creation store is what "Continue your
course" and resume read.

## 8. Stages

Each stage gets its own implementation plan and review. Focus mode stays behind a switch until stage
3 lands, so coaches first meet it whole (cover included, F6); the plain form stays the default
until then.

| Stage | What it adds | Main pieces |
|---|---|---|
| 1. The foundation, with the course | §4, §5 steps 1–3 and 6 (without the announcement), §6 items 1, 3–6 | recipe + creation store + endpoints; the guide in the dock; focus layout of the course page; live field/row events and the shared hook; draft from the first answer; resume; timing |
| 2. The Designer, live | §5 step 4; Designer spec stage 2 in full | `design_cover`, covers digest, `ask` with options, run events, shared live pieces, slot and studio replay, Try another photo |
| 3. Price, finish, follow-ups | §5 step 5, the announcement offer, follow-ups written ahead (§6 item 2); switch on | price and access step under F11; Marketing's draft; written-ahead follow-ups with the cap |

## 9. Other kinds later

What each needs beyond its recipe (survey 2026-10-18):

- **Class or event:** no draft state (team spec T6): either a draft state or the suggest path with
  Keep; its kind (live / stream / Zoom / in person) picks the endpoint and cannot change later, so it
  is the first question; a weekly class expands into a series (`expand_class_series`); the cover
  belongs to the series (Designer spec E14).
- **Membership and bundle:** no engine actions yet (the Financial Strategist has none); a
  membership saves in two calls (plan, then access).
- **Download:** the file upload is the first step (record → presign → upload → complete).
- **Message / announcement:** Marketing or Community (T12); the email campaign already has a
  three-step flow to fold in.
- **Blog post:** "New post" creates an untitled draft immediately today; the generate dialog and
  autopilot stay.

## 10. Verification

- Backend tests for the recipe engine: must-ask completeness, fallbacks with the model down, the
  follow-up cap and freshness rule, resume, and the price rule (F11).
- An e2e spec for the course in focus mode with the model stubbed (as `29-copilot` does), plus a
  few real runs on the dev hub checked by eye.
- The timing stamps (§6.6) read back for a handful of dev runs against the plain form.
- A browser pass on desktop and phone widths, light and dark.

## 11. Left to the builder

- The creation store's fields and the endpoint shapes; event shapes and replay timings (as in both
  specs).
- The wording of questions, buttons, hand-over lines and the follow-up prompt.
- How "All details" shows the rest of the form.
- Whether the follow-up writer reuses `interview_tiles.py` from `claude/setup-fast-tiles` or a new
  module built on the same rule.
- Whether `_give_cover` stays for the plain form.
- The exact background/interactive hub labels for each call.

## 12. Open questions for the owner

None. The builder check (2026-10-18) raised six questions; all were settled in this document as my
calls, for the owner to check while reading:

1. Delegated price, "Just draft it" and the go-live rule (F11).
2. The price's reasoning uses her own numbers only; no market ranges (F13).
3. What is timed (active time to a complete draft) and the dev comparison before the switch goes on
   (§6 item 6).
4. Asked from an unrelated page, the assistant offers "Start it" instead of opening focus mode (F7).
5. The outline is titles only; no lesson summaries (§2 non-goals).
6. Outline-shaping follow-ups come before the outline drafts; later ones never redraft it (§5).
