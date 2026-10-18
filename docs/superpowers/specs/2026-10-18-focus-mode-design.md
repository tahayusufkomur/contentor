# Focus mode: guided creation in the studio, starting with the course

Date: 2026-10-18 · Status: direction agreed with the owner in conversation the same day; stage 1
built; revised the same evening (F14–F18: the first answer takes everything, the cover step), for
approval · Mockups (git-ignored, served by the brainstorm
companion): `.superpowers/brainstorm/65157-1792333207/content/focus-layout-v2.html` (D1 picked) and
`course-steps.html`; the cover step (revision the same evening):
`.superpowers/brainstorm/67803-1792352405/content/cover-step.html` (A picked) and
`cover-step-v2.html` · Builds on `2026-10-17-agent-team-studio-design.md` (the team spec) and
`2026-10-17-designer-end-to-end-design.md` (the Designer spec), whose stage 1 pieces the cover
step is built on (F16–F18).

## 1. Intent

The owner loves the `/setup` interview: one question at a time, tap-to-answer buttons, the AI
drafts and she approves, and she watches her site take shape. Once onboarding ends, the studio
loses all of that. In the owner's words: the forms are too wide and too long, it is hard to know what to
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
- Her time is measured against the plain form, as information (no longer a gate: F5, revised).
- The machinery is reusable: a new kind is a new recipe (its questions and its drafting step) plus
  the shared steps (cover, price and access, finish).

Non-goals (this project)

- Focus mode for kinds other than the course. The design names what each will need (§9); each is
  its own project afterwards.
- Recording videos, and full lesson bodies. Focus mode writes the outline (module and lesson
  titles) and, once she confirms the titles, a brief description to go with each lesson's video
  (F19, revised the same evening). The videos, and anything longer, are her work.
- A chat-first studio. The pages stay (team spec T2; coach-admin spec D3): the form still works by
  hand.

Anti-goals: it fails, even if it works, when

- ~~**it is slower than the usual way.**~~ Relaxed by the owner the same evening: "slowness is all
  ok", there is no strict rule for it being fast. Waiting while the AI does real work for her is
  fine; a dead end is not (next line).
- anything waits without a way forward (no fallback, no "Try again");
- it feels like an interrogation;
- her screen is pulled somewhere else, or she has to follow a link to see the result;
- anything she typed is lost.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| F1 | Start with the course; build every part so other kinds reuse it. | Owner |
| F2 | The guide lives in the docked assistant on the right, not in a second panel. In focus mode the dock stops being an open chat and asks one thing at a time; she can still type or speak anything. It is one conversation: after focus mode the dock is the normal chat again, with the whole exchange in it. | Owner |
| F3 | The left side is the real course page she will keep using (mockup D1), shown with only what matters now; filters, tags and the rest wait behind "All details". When focus mode ends nothing moves or reloads. | Owner (D1); "All details" my call, played back and accepted |
| F4 | Tap-to-answer buttons as in `/setup`, with dynamic follow-up questions specific to her course, each with button options. Revised the same evening: a follow-up comes only if necessary (§5 Follow-ups). | Owner; "only if necessary" owner, 2026-10-18 evening |
| F5 | ~~Never slower than the form (§6). This overrides team spec T5 ("speed is not a design limit") for focus mode.~~ Revised the same evening: "slowness is all ok", no strict speed rule. The AI takes the time it needs (the analysis, the drafts, a follow-up); every failure still has a way forward. Team spec T5 applies again. | Owner; revised by the owner, 2026-10-18 evening |
| F6 | ~~The Designer's live cover design (Designer spec stage 2) is built as part of this project and is focus mode's cover step.~~ Superseded the same evening by F16–F18: the cover step is the Designer's drafts to pick from. | Owner |
| F7 | Getting in: "New course" on Home, the Courses list and the search palette opens focus mode. Asking the assistant for a course ("make me a course about…") on the Courses list or the course page opens it too, with what she said as the first answer; asked from any other page, the dock answers with a **Start it** button that does the same in one tap, so her screen never moves on its own (team spec §5.2). "Describe it" is replaced by focus mode's first screen. A "Fill it in myself" link opens the plain form. | Played back, accepted; the "Start it" rule my call after the builder check |
| F8 | The course exists as an unpublished draft from her first answer (team spec T6, build). Leaving loses nothing: work in progress carries on (team spec T7), she gets "ready for you", and reopening the course resumes the guide where she stopped. | Played back, accepted |
| F9 | She can type into the page at any time; the guide takes her edit as her answer and does not ask that question again. Only the field or rows being written at that moment are read-only (a narrowing of team spec T8's whole-record lock). | Played back, accepted; lock narrowing my call |
| F10 | Steps for the course (§5): topic → who and how big → outline check → cover (Designer) → price and access (Financial Strategist) → finish (Marketing). The last three are the shared steps. | Played back, accepted |
| F11 | Price: a paid price is always her tap. What she taps is saved on the draft. If she cannot take payments yet (the trial cannot sell), the course keeps its price and stays a draft; the finish step offers "Start selling" (her plan, then payouts) or "Keep as a draft". "You decide" on the price question makes the Financial Strategist highlight its pick with its reason, for her to tap. "Just draft it" leaves the price to her: the draft stays free and the finish step shows the suggested price as a button (team spec T15 holds: a run never sets a paid price on its own). An unpublished focus-mode draft never blocks the site's go-live (`setup_items._has_paid_content` skips it); publishing a paid course still needs selling open. | Played back, accepted; delegated price, "Just draft it" and the go-live rule my calls after the builder check |
| F12 | Phone: the guide is a bottom sheet over the page. The cover's live drawing is for computers only (Designer spec E18); on a phone the cover step shows the finished cover with the same buttons. | Played back, accepted |
| F14 | The first question takes everything she knows. She can write her whole course in it (topic, who it is for, how many modules and lessons, module or lesson titles, the price, anything); one analysis fills every field it can, and the questions it answered are skipped. Only answered questions are skipped; the others stay as they are (not every question becomes dynamic). | Owner, 2026-10-18 evening |
| F15 | What she said exactly is kept exactly (four modules means four; a lesson title she wrote is used word for word); the outline fills only what she left open. Nothing she did not say is guessed: an unanswered field gets its usual question. What was understood shows as the usual answered lines. She can make a follow-up request at any step ("make it 5 modules", "price it at $39"); an unclear detail ("a few modules", "around $40–50") gets one short question with buttons, once, never in circles. | Owner; played back and accepted ("exactly correct") |
| F16 | Cover: not automatic. The Designer drafts covers in different styles and she picks one. The drafts appear big on the page, in the cover slot (mockup A), with the guide on the right holding the question and the buttons. | Owner (A picked) |
| F17 | She chooses the photo too: by saying it, by picking one, or by uploading one. | Owner |
| F18 | Four drafts at a time, one style each, sharing one photo; the photo row lists her own photos first, then library matches; a photo she describes is searched, and generated only when nothing fits. The live drawing with a cursor (Designer spec stage 2) is not needed for this step and goes back to the Designer spec's own track. | Played back and accepted ("looks awesome"); the generation rule and the Designer stage 2 move my calls |
| F19 | Once she confirms the lesson titles ("Looks good" on the outline), the Content Creating Specialist writes each lesson's content: the brief description that goes with its video, the way creators describe their videos. Two to four sentences for students: what the lesson covers and what they can do after it, from the lesson title, her course and her first answer; never an invented claim, result or number. | Owner ("the content part of the video… a brief description"); length and sources played back, not corrected |
| F20 | She is aware it is happening: when she confirms the titles the guide says it is now writing a short description for each lesson's video; on the page each one types in with the working tag and a count ("3 of 12"), with Stop at hand. Nothing is written silently. Told, not asked. | Owner ("should be aware"); how she is told my call |
| F21 | The publish rule (§5 step 6) counts a lesson as ready with a video, or with text she wrote or edited herself. A description the AI wrote that she has not touched does not count, or an outline could go live with no videos. | Played back, not corrected |
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
   niche and existing courses, "My own idea…" (a sentence starter she finishes), "You decide". She
   can write as much as she knows here (F14, §5.1). Skipped when she already said it. Left: a
   working title types in, and a price she gave fills in.
2. **Who is it for, and how big?** Level (complete beginners / some experience / advanced) and size
   (Quick win, 1 module / Short course, ~3 modules / Full program, ~6 modules), each with "You
   decide". Each is skipped when her first answer settled it. Left: the description, then modules
   and lessons draft and appear.
3. **Here's your outline. Does it fit?** "Looks good, continue", or she says a change ("make module
   2 about breathing", a scoped redraft as in `/setup`'s `redraft_scope`), or she renames, reorders
   or deletes lessons on the page herself. "Looks good" confirms the titles, and the lesson
   descriptions start (§5.3) while she goes on to the cover.
4. **Which cover fits your course?** (Designer, shared step; F16–F18, §5.2.) Four drafts in
   different styles fill the cover slot, big; under them, the photo they share. **Use this cover**,
   **Four more styles**, the photo row (her photos, library matches, **+ Upload**), the answer box
   for saying what she wants, **I'll edit it** (opens the photo studio on the picked design; Keep
   there brings her back to focus mode) and **Later**.
5. **How will students get it?** (Financial Strategist, shared step.) Free / a one-time price with
   one line of reasoning / in a membership she has. Left: the price fills in. Selling not open yet:
   F11.
6. **Ready. Publish it now?** (Marketing Specialist, shared step.) **Publish now** / **Keep as a
   draft**, plus "Tell my students": Marketing drafts an announcement (team spec T12) shown in the
   dock with Schedule / Not now. Focus mode then ends (§4.2). **Publish now** is offered only once
   every lesson has a video or text (owner, 2026-10-18: students never open an empty lesson); until
   then the step says how many lessons are still empty and offers **Keep as a draft** alone. The
   rule holds wherever a course goes live (`Course.not_ready`: the course API, the assistant, the
   studio's Publish action, /setup); /setup's go-live keeps its course a draft until then, and that
   draft still counts for the site's go-live (owner's call). A course already live is left as it is.

**Follow-ups (F4).** Between the must-ask questions the specialist may ask a question specific to
this course, with two to four buttons, "You decide" and the answer box. Examples for a desk-yoga
course: "Will lessons be videos you record, or written guides?"; "Where do your students practise:
at the office desk or at home?" (Office / Home / Both); "End each lesson with a small daily habit?".
Rules:

- **Only if necessary** (owner, 2026-10-18 evening): a follow-up is asked only when the next draft
  would otherwise have to guess something that changes it, and nothing she said (her first answer
  included, §5.1) settles it. Never to enrich, never to confirm what she already said. Most rich
  first answers therefore get none.
- At most four follow-ups per creation; "Just draft it" skips the rest.
- Follow-ups that shape the outline (up to two) come after step 2 and before the outline drafts.
  The outline starts drafting as soon as they are answered, and she watches it fill in at step 3. Later follow-ups shape only
  what comes after (cover, announcement); they never redraft an outline under her eyes. A change to
  the outline is always her request (step 3).
- A follow-up is written when it is needed; she waits for it with the specialist's working tag.
  If writing it fails, it is dropped and the flow goes on.
- Every answer feeds the draft, so its effect shows on the page (her "office desk" appears in the
  description and lesson titles).
- Where it fits, buttons allow several picks and a "My own…" tile, as in `/setup`.
- Follow-ups use the engine's `ask` with options (Designer spec §7.4), so every specialist and
  every future kind gets them.

### 5.1 The first answer (F14, F15)

- **What it reads.** Her first answer goes through one analysis that returns typed fields: the
  topic; who it is for (her words or a level); the number of modules and of lessons per module (or
  a total); module and lesson titles she named, in order; the price (an amount, or free; "in my
  membership" is kept for the access step); and the rest of what she said about the course (its
  format, its promise, her angle) as notes for the outline.
- **What it fills.** Every field it got: the creation's answers (a level or size question it
  settled is answered and skipped), the draft course's price (her own words count as her tap, F11),
  and the outline's brief (counts, titles and notes). The working title comes from the topic as
  today.
- **Exact means exact.** Counts she gave override the size presets, and the outline keeps her
  module and lesson titles word for word and in her order, filling only the gaps. Code checks the
  written outline against her counts and titles (as it already trims to the size she picked). A
  module count alone settles the size question; lessons per module she did not give are the
  outline's usual range, as with "You decide" today. The outline writes up to 12 modules of 12
  lessons; asked for more, the guide says it drafted the first 12 and she adds the rest by hand.
  (My calls after the builder check.)
- **Never guessed.** A field she did not mention stays unanswered and its usual question comes up
  with its buttons. Delegation stays hers ("You decide", "Just draft it").
- **Unclear.** A detail the analysis cannot pin down ("a few modules", "around $40–50", a price in
  a currency her site does not use) becomes one short question with two to four buttons and the
  answer box, asked once. If her reply is still unclear, the field falls back to its usual question.
- **Follow-up requests, any step.** Every typed answer goes through the same analysis (a tap on a
  button does not need it), which is told the question on screen and routes what she said: the
  answer to it, other fields, a price, an outline change, or at the cover step a photo description.
  Before the outline exists it updates the answers (and the price on the draft); once it exists, a
  change to the outline is a redraft exactly as at step 3, wherever she typed it, and a price change
  sets the price.
- **Waiting.** The guide waits for the analysis, showing the specialist's working tag ("Reading
  your details"), however long it takes. If it fails, the usual questions come and the outline
  still reads her whole answer (and runs the analysis itself before writing, so her counts and
  titles hold).
- **Shown.** What was understood appears as the usual answered lines in the guide ("Complete
  beginners", "4 modules · 3 lessons each", "$49"), so she sees nothing was invented; she corrects
  it at the outline step or by saying so.

### 5.2 The cover step (F16–F18)

- **When.** After "Looks good" on the outline, before price and finish. The outline job no longer
  gives the course a cover on its own (`content._give_cover` in `focus/outline.py` goes).
- **The drafts.** Four covers, one style each, drawn by `CoverArt` from design recipes (no image
  file): for instance a photo with the title over it, a photo beside a colour panel, the title only,
  a band across a photo (`design_recipe.LAYOUTS`). Each uses her site's fonts and colours, her
  course title and a short line from the outline (never an invented claim). **Four more styles**
  brings another set (other layouts, paint and type variants).
- **Drafting.** The Designer starts drafting as soon as the outline is written, so the drafts are
  often there when she reaches the step; otherwise she watches them arrive with the Designer's
  working tag. If drafting fails, code draws four from fixed layouts and the top photo, so she
  always has covers to pick from.
- **The photo.** One photo is shared by the photo styles; the row under the drafts offers her own
  photos first (Media, the `/setup` photos), then library (Pix4Less) matches for the course, and
  **+ Upload** (her device; saved to her Media through the own-photos path like any upload).
  Tapping a photo puts it into every photo style. A library photo she taps is copied into her
  Media then, as the photo studio and the picker do today (`/curated-images/<id>/use/`, one
  download each), so design recipes keep pointing at her own photos (Designer stage 1's contract
  is unchanged); the first round copies one photo. **More photos** pages on. (My call after the
  builder check.)
- **Saying it.** "Hands on a keyboard, no faces": the Designer searches her photos and the library
  with her words and refreshes the row. Nothing fits: it generates one (Pix4Less generation, within
  her monthly allowance); the row shows it arriving and she can keep choosing meanwhile.
- **Picking.** Tapping a draft selects it; **Use this cover** keeps it on the course (the Designer
  spec's Keep, with its Undo in History) and the other drafts fold away. **Later** leaves the course
  without a cover. **I'll edit it** opens the photo studio on that design.
- **Phone.** The drafts show in the page there too (they are drawn, not rendered); the guide is the
  bottom sheet (F12).

### 5.3 Lesson descriptions (F19–F21)

- **Where it lives.** In the lesson's text (`Lesson.content_html`, the course form's "Content"),
  behind the paywall like the rest of the lesson: enrolled students (and free-preview lessons)
  read it next to the video; visitors to the sales page do not (owner: "let it behind the gate").
  No new field beyond what F21 needs.
- **When.** As soon as she confirms the titles. The guide says so in one line ("Writing a short
  description for each lesson's video; edit any of them on the page") and moves on to the cover;
  the writing runs on the `agents` worker and survives her leaving.
- **On the page.** Each lesson's description types in under its title, one lesson after another,
  with the Content Creating Specialist's working tag and a count ("3 of 12"). Stop ends the run;
  what is written stays, the rest stays empty.
- **Hers to change.** Any description is editable on the page at once; one being typed in is the
  only read-only one (F9). A later outline change rewrites descriptions only for lessons that are
  new or renamed and whose description she has not touched.
- **Publishing (F21).** `Course.not_ready` treats a lesson whose only content is an untouched AI
  description as empty: it needs its video, or text she wrote or edited. So the course knows which
  descriptions are the AI's and still untouched (stored on the lesson, cleared when she saves its
  text). The same rule replaces every "filled lesson" check: the outline's redraft keeps a module
  only for lessons she filled herself (`_kept` in `focus/outline.py`), and the assistant's
  course-page context marks an untouched description as empty (`core/copilot/context.py`).
- **Failure.** A failed run leaves the lessons it did not reach empty and the guide offers "Try
  again" for them; nothing else waits on it.

## 6. Waiting and speed (F5, revised)

The owner relaxed the speed rule the same evening: the AI takes the time it needs. What stays is
that she always sees who is working, and a failure always has a way forward.

1. **Taps on code-owned questions are instant** because they need no model: must-ask questions are
   code-owned with pre-written buttons (`/setup`'s instant path, `interview._code_owned`).
2. **Follow-ups are written when needed** (§5 Follow-ups), with the working tag while they are
   written. No written-ahead machinery.
3. **Drafting runs alongside her answers.** The outline drafts on the `agents` worker as soon as
   step 2 is answered, while she continues; the cover search starts once the topic is known. She
   only watches something build when she is reviewing that very thing, and then it is filling in,
   not a spinner. Background drafting uses a background hub label; what she is waiting on uses
   `contentor:copilot`.
4. **She can always type into the page** (F9): the fastest path for someone who knows what she
   wants.
5. **"Just draft it"** from the first screen: one sentence, everything drafted with defaults, then
   review.
5a. **The analysis (§5.1)** runs on every typed answer and is waited for (working tag "Reading your
   details"); it saves her the questions it answers. On failure the usual questions come.
6. **Measured.** What is timed is her active time (the tab visible and in use; time away excluded)
   from "New course" to a **complete draft**: a title, at least one module with lessons, a cover,
   and a price decided (free counts). Both paths are stamped the same way: focus mode and the plain
   form ("Fill it in myself" and the old entry points), next to `/setup`'s funnel stamps
   (`setup_funnel`). Information only, no gate (F5, revised): the stamps stay as built in stage 1.

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

### 7.3 The cover step (F16–F18)

Built on the Designer spec's stage 1 pieces: the `Design` model and `/api/v1/designs/`
(`open_draft`, `keep`, `restore_cover`), `CoverArt`, the photo studio, the curated-image client
(search, generation and its monthly cap) and the own-photos upload path. New: the Designer's
drafting step (four recipes per round, on the `agents` worker once the outline is written, with a
code fallback on failure),
the photo row's search (her photos and the library, with her words), and the cover question in the
course recipe. The live drawing with a cursor, `design_cover` in the chat, the covers digest and
the studio replay stay in the Designer spec's own stage 2 (F18). Whether today's automatic stock
cover on `create_course` stays for the plain form is left to the builder.

### 7.4 Endpoints and runs

Focus-mode turns and drafting run as copilot runs on the `agents` worker (team spec §6.2) so they
survive her leaving and are not cut by Cloudflare's ~100 s request cap. Taps on code-owned
questions are answered synchronously without a run. The creation store is what "Continue your
course" and resume read.

## 8. Stages

Each stage gets its own implementation plan and review. Focus mode stays behind a switch until stage
4 lands, so coaches first meet it whole (cover included, F6); the plain form stays the default
until then.

| Stage | What it adds | Main pieces |
|---|---|---|
| 1. The foundation, with the course (built 2026-10-18) | §4, §5 steps 1–3 and 6 (without the announcement), §6 items 1, 3–6 | recipe + creation store + endpoints; the guide in the dock; focus layout of the course page; live field/row events and the shared hook; draft from the first answer; resume; timing |
| 2. The first answer takes everything | §5.1, §5.3, §6 item 5a | the analysis (typed fields), skipping answered questions, exact counts and titles in the outline, the price on the draft, one clarifying question, follow-up requests at any step; lesson descriptions after "Looks good" and the publish rule for untouched ones (F19–F21) |
| 3. The cover step | §5 step 4, §5.2, §7.3 | the cover question, four drafts (started once the outline is written; code fallback on failure), the photo row (hers, library, upload, said, generated), Use this cover / Four more styles / Later / I'll edit it |
| 4. Price, finish, follow-ups | §5 step 5 (skipped when her first answer gave the price), the announcement offer, follow-ups only if necessary; switch on | price and access step under F11; Marketing's draft; follow-ups only if necessary, with the cap |

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
  follow-up cap and the only-if-necessary rule, resume, and the price rule (F11).
- An e2e spec for the course in focus mode with the model stubbed (as `29-copilot` does), plus a
  few real runs on the dev hub checked by eye.
- The timing stamps (§6.6) read back for a handful of dev runs against the plain form.
- A browser pass on desktop and phone widths, light and dark.
- The publish rule with untouched AI descriptions (F21): refused until a video, or her own edit.

## 11. Left to the builder

- The creation store's fields and the endpoint shapes; event shapes and replay timings (as in both
  specs).
- The wording of questions, buttons, hand-over lines and the follow-up prompt.
- How "All details" shows the rest of the form.
- The follow-up prompt and how it judges "necessary".
- Whether `_give_cover` stays for the plain form.
- The exact background/interactive hub labels for each call.
- The analysis model and its prompt (a typed-extraction call; speed is not a constraint, F5).
- The four styles in the first round, what "Four more styles" varies, and the cover's short line.
- How many photos the row shows, and how her own photos are ranked against library matches.
- The descriptions' prompt, whether they are written in one call or per module, and how "the AI's
  and untouched" is stored on the lesson (a flag or a hash of what was written).

## 12. Open questions for the owner

Revision (2026-10-18 evening): the builder check raised four questions. The owner then relaxed the
speed rule ("slowness is all ok"), which settled two of them: the guide waits for the analysis
(§5.1 Waiting) and every typed answer is analysed (§5.1 Follow-up requests). The other two are my
calls for the owner to check while reading: a module count settles the size, up to 12 × 12 (§5.1
Exact); a library photo is copied into her Media when she taps it (§5.2 The photo).

Asked and answered: the dynamic follow-ups (F4) stay, "only if necessary" (§5 Follow-ups); the
lesson descriptions live in the lesson's text, behind the paywall (§5.3, "let it behind the gate").

The first version's builder check (2026-10-18) raised six questions; all were settled in this
document as my calls, for the owner to check while reading:

1. Delegated price, "Just draft it" and the go-live rule (F11).
2. The price's reasoning uses her own numbers only; no market ranges (F13).
3. What is timed (active time to a complete draft) and the dev comparison before the switch goes on
   (§6 item 6).
4. Asked from an unrelated page, the assistant offers "Start it" instead of opening focus mode (F7).
5. The outline is titles only; no lesson summaries (§2 non-goals).
6. Outline-shaping follow-ups come before the outline drafts; later ones never redraft it (§5).
