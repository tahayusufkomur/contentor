# Agent team studio — design

Date: 2026-10-17 · Status: approved by the owner in conversation the same day ("Build it, I loved
it") · Builds on `2026-10-13-coach-admin-refactor-design.md` (its Phases 0–3 are done; its Phases 4
and 5 are absorbed here as rungs 3 and 2)

## 1. Intent

The landing sells a team: "Everyone you'd need to hire, already at work", six specialists. The
creator studio (`/admin`) shows one generic "Assistant". This design makes the studio agent-centric:
six AI specialists, each running a section of the studio she already knows. She can pick any of
them and ask for anything in their area. They do the work in the page she has open, in front of
her, and she approves whatever reaches her students.

Most of the machinery exists: one copilot engine with 25 actions behind review cards, page context,
"Describe it" on the create pages, History with undo, and background jobs that already do team work
(class reminders, scheduled announcements and campaigns, blog autopilot). What is missing is the
team itself, live work on the page, and real hands for three of the six roles. On 2026-10-17 the
25 actions split Designer 14, Content Creating Specialist 6, Marketing Specialist 4, Community
manager 1, Financial Strategist 0, Assistant 0.

The throwaway mockup the owner approved is `.superpowers/brainstorm/87800-1792236450/content/live-building.html`
(git-ignored; open it in a browser and press Play). It is the reference for the feel of §5.

## 2. Goals, non-goals, anti-goals

Goals

- She meets six named specialists in the studio. Each owns a section; the section she is in picks
  who answers first; she can pick anyone.
- Work happens live in the page she has open, the screen follows the work, and she can see which
  specialist is doing what.
- Nothing reaches students until she presses Publish, Schedule, Send or Keep, and every change can
  be undone.
- Over the ladder (§7) each specialist can help with anything in its area, works without being
  asked, and acts on its own only where she allows it.

Non-goals

- A chat-only studio. Every page keeps working by hand (D3 of the 2026-10-13 spec stands).
- Human names, faces or invented personalities. A specialist is a role with a colour and an icon.
- Folding the Help tab ("Ask Contentor", with a human behind it) into the engine.
- A plan check or paywall on the team (D1 of the 2026-10-13 spec stands).

Anti-goals: it fails even if it works when

- the specialists are costumes, six names on the same chat with no distinct work;
- a specialist quotes a number it did not read from her data, or says it did something it did not;
- anything reaches students that she did not approve;
- her screen is pulled away while she is doing something else;
- the team creates work for her, such as a morning list of thirty items to triage.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| T1 | The six: **Designer, Content Creating Specialist, Marketing Specialist, Community manager, Financial Strategist, Assistant**, spelled exactly so. | Owner |
| T2 | The team lives inside the existing studio, each specialist running one section; pages stay. | Owner |
| T3 | The ladder of §7, starting with rung 1 (the team, working live) and rung 3 (the standup). | Owner |
| T4 | Live building as in the approved mockup (§5.2). | Owner |
| T5 | Speed and hub capacity are not design limits: make it work first, make it faster later. This replaces D2 of the 2026-10-13 spec for this work. | Owner |
| T6 | New things are built as drafts in front of her. Anything students can already see, and anything with no draft state, changes only as a suggestion she keeps. Site pages get a preview step. | Proposed, accepted by the owner |
| T7 | Work goes on when she leaves the page; she gets a "ready for you" note; several specialists may work at once. | Proposed, accepted |
| T8 | While a specialist works on a record she cannot edit that record until the work ends or she presses Stop; the rest of the studio stays usable. | Proposed, accepted |
| T9 | Live building ships in rung 1 for what the specialists can already do; every skill added in rung 2 is live from its first day. | Proposed, accepted |
| T10 | The landing uses the same six names, and the course-drafting line moves from its Assistant card to the Content Creating Specialist. | Proposed, accepted |
| T11 | One engine underneath. A specialist is a lens on it (a prompt section, the data it is shown, and the work signed with its name), not a separate bot. | Proposed, accepted |
| T12 | Messages to students belong to two specialists: the Marketing Specialist (launches, selling) and the Community manager (classes, community, welcomes). A message is signed by whichever of the two wrote it. In rung 1 a message draft carries title, text, link, audience (all students), "also send as email" and a proposed send time; she presses Schedule. No header image: the Announcement model has no image field. | Builder check, settled here |
| T13 | Undo for kept changes. Field edits to a course, class or post (title, description, price, time, place) get a snapshot undo, refused once the record has changed again. Removing modules or lessons and publishing stay final, as today, and their Keep button says so before she presses it. "Undo all" compares against the state the run left, so the run's own follow-up writes (a cover after the course) do not block it. | Builder check, settled here |
| T14 | No student-level data reaches the model in rung 1. The Students digest is counts only; names are shown by the studio from the database, never sent to the provider. Whether names or message text may go to the AI provider is the owner's call before rung 2's reply drafts (§12, Q1). | Builder check, settled here |
| T15 | One plain price in rung 1; a launch price ("$39 until Nov 2" in the mockup) arrives with discount codes in rung 2. A run prices a draft only under /setup's rule (`setup_flow._may_price`: a paid plan is active, or she told the interview she sells). Otherwise the draft stays free and the Financial Strategist says what it would charge once selling opens, so a run never adds a go-live blocker (`setup_items._has_paid_content` counts paid drafts). | Builder check, settled here |
| T16 | The landing change (T10) renames the six and rewrites the title, text and tools lines of two cards: Content Creating Specialist (was Producer: courses, classes and live teaching) and Financial Strategist (was Cashier: prices from her own numbers, payouts to her Stripe). Their animated scenes stay. Claims stay true to what ships. | Builder check, settled here |

## 4. The team

| Specialist | Runs (studio section) | Can do today | Adds over the ladder |
|---|---|---|---|
| Designer | Site | Pages and sections, look, navbar, logo, photos, covers | Re-checks the site after big changes (`site_qa`) |
| Content Creating Specialist | Teach | Courses with full outlines, curriculum changes, classes and weekly series, publishing a course | Lesson text, worksheets and PDFs to download, class plans, download titles and descriptions |
| Marketing Specialist | Reach out | Articles (draft, edit, publish), the site's search text | Email campaigns, launch email series, social posts she copies and posts herself |
| Community manager | Students | Announcement drafts; class reminders already go out on their own | Inbox reply drafts, welcomes for new students, win-back messages for quiet ones, community posts, flags for students going quiet |
| Financial Strategist | Money | Nothing yet (prices change only through a course or event edit) | Prices from her real numbers, memberships, bundles, discount codes (a product feature that does not exist yet), sales and payout reports, follow-up on failed payments |
| Assistant | Today and Settings; also the site assistant students talk to | Answers | Hands her question to the right specialist, studio how-to, learns from what students asked the site assistant |

Who signs which work. Every action kind has one owner, from a static map that a unit test keeps
complete (it fails when an action kind has no owner):

- Designer: `edit_pages`, `add_block`, `remove_block`, `move_block`, `edit_block_fields`,
  `toggle_block`, `duplicate_block`, `edit_style`, `edit_navbar`, `set_block_image`, `set_logo`,
  `note_photo`, `set_course_cover`, `set_event_cover`.
- Content Creating Specialist: `create_course`, `edit_course`, `edit_curriculum`, `publish_course`,
  `create_event`, `edit_event`.
- Marketing Specialist: `create_blog_post`, `edit_blog_post`, `publish_blog_post`, `edit_seo`.
- Community manager and Marketing Specialist: `draft_announcement`, signed by whichever wrote it (T12).
- Financial Strategist: a change whose only field is a price, and the price step inside a course or
  event the Content Creating Specialist builds.
- Assistant: answers only.

Each specialist has a fixed colour and icon (data, not theme tokens), legible on the studio's light
and dark backgrounds. The mockup's colours are the starting point: violet, teal, orange, rose,
green, blue.

## 5. The experience

### 5.1 The team panel

The docked panel's "Assistant" tab becomes **Team**. The Setup, Help and History tabs stay.

- Six faces across the top. The one answering is highlighted, with its name, its job in one line,
  and why it is answering ("Answers first in Teach", or "You picked them").
- Who answers: her own pick, while she has made one in this conversation; otherwise the specialist
  of the section she is in (Today and Settings: Assistant; Teach: Content Creating Specialist;
  Students: Community manager; Reach out: Marketing Specialist; Money: Financial Strategist; Site:
  Designer). When one specialist offers follow-up work that belongs to another (the launch email
  after a course) and she accepts, the other takes over.
- One conversation for the whole team. Every reply shows who wrote it. Each specialist shows three
  or four starters for what it can do now, with no model call to show them.
- A face pulses while that specialist is working; several can pulse at once.
- History rows show the face of the specialist whose work it was. Undo is unchanged.

The site editor (the public site with `?edit=1`) keeps its click-to-select copilot, which there
speaks as the Designer and shows the Designer's work live in its canvas.

### 5.2 Live work on the page

- The specialist works in the page that shows the thing it is working on. Fields type in, rows
  appear one by one, a cover fades in. A tag in the specialist's colour, with its name and what it
  is doing ("writing", "finding a photo", "pricing"), sits on the part being worked on. A small
  "made by" mark stays on each part afterwards until she leaves the page.
- Specialists bring each other in where she can see it: the Designer adds the cover, the Financial
  Strategist sets the price with one line of reasoning from her real numbers (T15), the Marketing
  Specialist offers the launch message.
- The screen follows the work only when the request was made from the page she is on and she has
  not navigated since. Then the studio opens the thing being built (the new course, then Messages
  for the email). Otherwise her screen never moves: the panel says "ready for you" with a link, and
  Today lists it.
- The panel shows the work as steps with a spinner then a tick, each step signed when another
  specialist does it.
- Stop is always there while a specialist works. Whatever was already made stays as a draft and
  can be undone; suggestions not yet kept are dropped.
- While a record is being worked on, its inputs are read-only and carry the tag (T8).

### 5.3 Build and suggest

One rule decides how a change lands: **can students see the thing yet?**

- **No: build.** Draft courses, draft blog posts and draft announcements (and in later rungs draft
  campaigns and downloads) are written directly as the work happens. The result shows up in the
  normal lists as a draft. Publishing, scheduling and sending stay her buttons. "Undo all" removes
  what the work created, through the existing created-draft undo, which already refuses once she
  has changed or published the draft. Before the site's first go-live, site pages are built
  directly too, as `/setup` does today.
- **Yes, or the thing has no draft state: suggest.** Classes and events (they have no draft
  state), site pages after go-live, look, navbar, logo, search text, and any change to a
  published course, event or post. The work is stored as suggestions. The page shows each one with
  the new value beside the old, highlighted, and Keep or Discard (and Keep all). Keep applies it
  through today's execute path, so it lands in History with its undo. Suggestions survive her
  leaving the page and expire after a few days.
- Site pages under suggest: the site editor's canvas shows the suggested version with a bar naming
  the Designer and offering Keep and Discard. The public site changes only on Keep.

Keeping is one click, the same as applying a card today, but she clicks after seeing the real
result in place instead of a card describing it.

### 5.4 Today: the morning standup (rung 3)

Home shows what each specialist did since her last visit (reminders sent, payments in, an article
the autopilot published, new students) and at most five things that need her, ranked: a class
starting soon with Go live, unanswered messages, open community reports, drafts and suggestions
waiting, payout or publish blockers, the next setup item. Every line carries the face of the
specialist it belongs to. No model call. This is §5.4 of the 2026-10-13 spec, signed. Work
finished while she was away appears here as "ready for you".

## 6. How it works

### 6.1 A specialist is a lens on the one engine

- **Registry.** One static table per app (backend and frontend) of the six: key, name, job line,
  section, colour, icon, starters, owned action kinds. A unit test fails when the two drift (as
  `ACTION_KINDS` is kept in step today).
- **Prompt.** Today's system prompt (the actions and their rules, the platform knowledge) plus one
  section per specialist: who it is, what it owns, how it works, and that it may act outside its
  area because every action is signed by its owner anyway. Each specialist's system prompt is
  byte-identical across tenants, so the prompt cache keeps six warm prefixes instead of one.
  Tenant data stays in the user turn, as today.
- **Data.** Every turn keeps today's digests, plus two new read-only ones so the thin specialists
  have something real to say from rung 1:
  - Money: revenue this month and last, the best-selling courses and plans, her price range,
    active memberships, failed payments.
  - Students: new this week, students quiet for 14 or more days, unanswered inbox threads, open
    community reports.

  Numbers come only from digests (the existing rule). Showing each specialist only its own data is
  a later speed-up (T5).
- **Attribution.** The owner map of §4 signs every step and every History row. History needs no
  migration: the owner follows from the stored action kind.

### 6.2 Runs: the unit of work

A run is one piece of work by the team. In rung 1 her message starts it. Later a routine (rung 4)
or a play (rung 6) starts it too.

- **Stored per tenant:** who asked, which specialist answered, the request and its page context,
  a status (queued → thinking → working → done, stopped or failed), an append-only event log, and
  the run's open suggestions.
- **Runs execute in Celery on a dedicated `agents` queue**, with a worker suited to I/O-bound model
  calls. That way a run survives her closing the tab, never waits behind a two-minute site build on
  the existing two-slot worker, and is not cut off by Cloudflare's ~100 s cap on a browser request.
  Today's copilot turn is a single SSE request; runs replace it for the Team panel.
- **Events** (shapes left to the builder) cover: thinking; a reply; a step started or finished, with
  its specialist; a draft record created (kind, id, link); a field written; a row added (a module, a
  lesson); a suggestion stored; done, with a summary; failed.
- **The client** starts a run, then polls its events since the last one it saw, sub-second while a
  run is active and the studio is open, and not at all otherwise. The panel and the page read the
  same events. `/setup` already works this way: Celery builds pages and the client polls.
- **Writes and events have different grain.** A step's write stays one atomic server operation
  (`create_course` creates the course, its modules and its lessons together). The events it emits
  are finer (title, description, each module, each lesson) so the page can animate them. Typing is a
  client-side reveal. Streaming partial text from providers that support it is a later speed-up.
- **Stop** marks the run stopped. A model call already under way finishes, and its result is
  dropped. Drafts already written stay and can be undone.
- **Several runs** may be active per tenant. Two runs never work on the same record: the second
  waits or says the record is busy (the builder decides which).
- **Costs:** every model call records spend as today. Her runs keep the interactive hub label
  `contentor:copilot`; routines (rung 4) get a background label.

### 6.3 Pages

Each page that shows a record listens to run events for that record and applies them live, with
the tag, the typing, the new rows and the lock. Rung 1 covers the Courses list, the course
editor, Classes & events, the Messages composer, the blog editor and the site editor's canvas,
plus Home in rung 3. After Keep or Undo, the existing window events (`contentor:assistant-applied`,
`contentor:site-updated`) still reload what changed.

What the code means for this (survey of 2026-10-17):

- **The reveal plays over complete data.** A step's write is atomic, so a page opened during or
  after a run loads the whole record. The live layer replays the run's events over it: fields show
  their text typing in, rows appear in order, the cover fades in, and then the page settles on the
  real values. A page opened after the replay finished just shows the record.
- **Feed values in, never remount.** Most studio forms copy their record into local state once
  (`CourseForm`, `EventForm`, `AnnouncementCompose`, the blog editor's TipTap body) and pick up an
  outside change only by remounting, which throws away unsaved typing. The course page's existing
  listener remounts its form today. Live pages instead read each live field through one shared hook
  that returns the value to show (partly typed during the replay) and the presence for it. The lock
  (T8) is what makes this safe: nothing can be typed into a record while a run works on it.
- **The site editor autosaves 800 ms after each change and has no draft layer.** `PageConfig` is
  `{blocks}` with only an `enabled` flag, and the only gate is the site-wide `is_published`. The
  suggestion preview therefore renders the proposed pages in the canvas with saving suspended (the
  editor is locked meanwhile), and Keep applies them on the server. Its `SITE_UPDATED_EVENT`
  listener does not cancel a pending autosave today, so an edit made just before an outside change
  can overwrite it. Cancel the pending save there.
- **Closing the docked panel unmounts the chat.** Runs live on the server and the page reads them
  by polling, so a closed panel loses nothing: reopening it reloads the thread and any active runs.
- **No shared polling hook and no presence styling exist yet.** `/setup` polls with a plain
  `setInterval`; the shared Tailwind preset has fade-in and shimmer animations. Both are new shared
  pieces in rung 1b.

### 6.4 Approval and undo

- Build: each created draft gets one History row with today's created-draft inverse; "Undo all" on a
  run undoes all its rows.
- Suggest: Keep mints an execute token from the stored suggestion at that moment and runs today's
  execute path, so the change is audited with its inverse exactly as an applied card is now.
- Publish, schedule and send stay hers, through the buttons that exist.

## 7. The ladder

| Rung | What she gets | Scope | Rough size |
|---|---|---|---|
| 1. The team, working live | §5.1–5.3; real numbers for the Financial Strategist and the Community manager; the landing renamed (T10) | 1a: registry, lens, digests, Team panel, signed History. 1b: runs, live pages, build and suggest, Stop, ready for you | ~2 weeks |
| 2. Hands for everyone | The "adds" column of §4, each live from its first day (T9) | One specialist at a time, the thinnest first: Financial Strategist and Community manager, then the Marketing Specialist's campaigns, then the rest | ~2 weeks |
| 3. Morning standup | §5.4 | A deterministic `GET /api/v1/admin/today/`, then Home | ~1 week |
| 4. Already at work | Routines turn what each specialist notices into ready drafts and suggestions; a weekly "your team this week" email | Runs started by Celery beat, background hub label, only for tenants active in the last 7 days | ~2 weeks |
| 5. Trust dial | For each specialist and routine: "ask me first" (the default) or "do it and tell me" | A setting per routine; autonomous work still lands in History with undo and in the weekly email | ~1 week |
| 6. Team plays | She names a goal ("launch my 6-week course on Nov 2") and the team plans it together over days | Runs with dated steps across specialists, one plan screen, approve all or step by step | ~2–3 weeks |

Order: 1a, 1b, 3, 2, 4, 5, 6. Each rung, and each half of rung 1, gets its own implementation plan
and ships on its own: tests, commit, deploy, verify on prod.

## 8. First build: rungs 1 and 3

Done when, on the dev stack and then on prod:

**1a. The team.**
- The Team tab shows the six with faces, names, jobs, the "why answering" line and per-specialist
  starters. The section picks who answers; her pick overrides it.
- Replies and cards are signed. History rows show the owner's face.
- Asked "How did sales go this month?", the Financial Strategist answers from the Money digest;
  asked "Who went quiet?", the Community manager answers with the count from the Students digest
  and a link to Students (T14). With no data, both say so plainly.
- The landing's team section uses the six names (T10). Its copy keeps the brand rules: "creator",
  never coach, teacher or admin.

**1b. Live work.**
- From the Courses page, "Make a 4-week beginner course for morning yoga" makes the studio open a
  new draft course and fill it in live: title, description, each week and its lessons, the cover
  (signed by the Designer), the price with one line of reasoning (signed by the Financial
  Strategist; under T15's rule, else a free draft and a line about the price it would charge).
  The panel shows the steps and then offers the Marketing Specialist's launch message, which opens
  Messages and fills a draft (T12) that waits for her Schedule.
- The same request made from Messages leaves her on Messages and says "ready for you".
- A weekly class series lands as suggested rows on Classes & events with Keep all; nothing is
  visible to students before Keep.
- A Designer change to a published site shows in the editor canvas as a suggestion with Keep and
  Discard; the public site is unchanged until Keep.
- Stop mid-run keeps the drafts already written. Undo all removes them.
- Closing the tab mid-run and coming back shows the finished work and a "ready for you" line.

**3. Standup.** Home shows the signed "since your last visit" lines and at most five ranked "needs
you" items from real data, including work that finished while she was away.

## 9. Verification

- Backend: each specialist's system prompt is byte-identical across two tenants; the owner map
  covers every action kind; the Money and Students digests report true numbers from fixtures;
  the run lifecycle (start, events in order, stop, failure, two runs refused on one record); the
  build-or-suggest rule; Keep goes through execute and writes an undoable History row; Undo all.
- Frontend: the registry sync test; section-to-specialist routing; the reducer that applies run
  events to page state; lock and Stop behaviour.
- e2e: the course story end to end with a stubbed model (as `29-copilot` stubs turns today), the
  suggest path for an event series, and a few real hub runs checked by hand.
- Every changed page checked in the running dev stack at desktop and phone width, light and dark.

## 10. Risks

- **Concurrency.** A run and her own edit, or two runs, on one record. Mitigation: the lock (T8)
  enforced on the server as well as in the page.
- **Worker capacity and memory on the prod nodes** for the new `agents` worker. Mitigation: a
  thread pool for I/O-bound calls, an explicit `mem_limit`, measured on deploy.
- **Polling load.** Mitigation: poll only while a run is active and the studio tab is visible;
  back off on errors.
- **Hub quota.** Many runs spend quota (the owner reports plenty of profiles). Mitigation: label
  every run and watch the logbook.
- **Suggestion UI on every page** is the biggest UI cost. Mitigation: one shared suggestion bar
  (new beside old, Keep, Discard) first; inline per-field suggestions only where the bar is not
  enough.
- **Tester habits.** 18 prod tenants know the Assistant tab. Mitigation: the tab keeps its place,
  History is unchanged, and the first message explains the team in one line.

## 11. Left to the builder

The event shapes and polling cadence; a table or a JSON column for the event log; how long
suggestions last; the Celery pool and worker settings; the exact colours (contrast-checked in both
studio themes) and icons; the wording of each specialist's prompt section and starters; how long a
"made by" mark stays; whether a second run on a busy record waits or refuses; and how the run
replaces the SSE converse call for the panel while "Describe it" keeps working.

## 12. Open questions for the owner

- **Q1 (before rung 2): may student-level data go to the AI provider?** Reply drafts need the text
  a student wrote; win-back messages and "who went quiet?" read better with first names. Prod's
  model calls run on the agent hub's Gemini accounts. Options: counts only (rung 1's default),
  first names only, or names and message text. Rung 1 does not depend on the answer (T14).
