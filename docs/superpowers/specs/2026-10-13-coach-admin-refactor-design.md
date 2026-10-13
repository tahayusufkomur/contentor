# Coach admin refactor — design

Date: 2026-10-13 · Status: direction agreed in chat, spec awaiting owner review

## 1. Goal

The coach admin (`/admin` in `frontend-customer`) should feel like the continuation of `/setup`:
the assistant drafts, the coach approves, and a page exists to review and fine-tune rather than to
fill in a blank form. Today it is a conventional CRUD panel with the assistant bolted on the side.

What the owner said (2026-10-13): the admin is not focused, not user friendly, over-complicated,
and uses little AI although strong AI capacity sits behind it.

Success looks like:

- A coach sees at most 7 sidebar items, and every page has one name (sidebar = title = search).
- There is one assistant entry in the admin, and it knows which page and record she is on.
- A course with a full outline, or a class series, is created from one sentence and one or two
  confirmations.
- Nothing in the admin shows invented data and no admin link leads to a 404.
- Home shows what needs her today whenever something does.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | The admin assistant is available to every coach, whatever her plan. A paywall may come later. So: no plan check and no monthly cap now; one `availability()` seam in the copilot views is where a paywall would go. An abuse throttle and a hub label are still added (Phase 2). | Owner, 2026-10-13 |
| D2 | Design for the slow provider. A hub turn takes about 5–15 s, has no token streaming and competes for about three interactive slots. Every AI door is therefore "ask → draft → review card", never typing-speed chat, and no form may block on AI. The same design works unchanged on the Anthropic API. | Constraint |
| D3 | Every page keeps working by hand. AI is an accelerator on top, so a busy hub or a future paywall never locks a coach out of her own data. | Constraint |
| D4 | `/setup`, the student portal, the site editor's internals and the superadmin are out of scope. | Scope |
| D5 | `/admin/m` (raw data) stays for staff via impersonation but leaves the coach's search. | Assumption |
| D6 | New and changed strings go through next-intl (`messages/en/admin.json`); the existing hard-coded English is not swept. | Assumption |
| D7 | Old URLs keep working through redirects — 18 prod tenants and testers know the current ones. | Assumption |

## 3. Findings (audit of 2026-10-13)

All 32 `/admin` routes were walked as a coach on the dev tenant; claims below were checked in code.

### 3.1 No focus

`app/admin/page.tsx` shows four lifetime counters, the setup checklist, the publish card and an
app-install chart. Nothing about today's class, an unanswered message, a new sale, a pending report
or a draft awaiting review. The setup checklist is rendered three times (dashboard card, floating
bubble, site editor).

### 3.2 Organised by table, not by job

- 20 sidebar items in 7 sections (`lib/admin-nav.ts`), a ⌘K palette with its own hard-coded 25
  entries (`components/admin/command-palette.tsx`), and two stacked floating bubbles.
- A class or event: four tabs split by technology (live class, stream, Zoom, on-site), each a
  separate ~500-line component with an 8–10 field form; a read-only calendar page; an orphan
  `/admin/live-streams` page nothing links to.
- Telling students something: Email (3-screen wizard), Announcements (up to ~13 inputs), Inbox and
  community posts, with two template systems and two audience pickers.
- Money: `/admin/billing` has five tabs mixing what the coach pays Contentor with what students
  pay her; the "Store" nav item opens the same page; Payouts is separate; payments appear in four
  places.
- Files: Photos (sidebar, behind "+ more"), Videos (palette only), Downloads (separate), with
  three different upload mechanics.
- Settings holds only timezone and mailbox; other settings live on eight other screens.
- Most pages have three names: "Students" (sidebar) / "Student CRM & Engagement" (title) /
  "Students & Enrollees" (palette). Titles such as "Photo Asset Library — copy CDN links" are
  developer language.
- A free coach's sidebar carries a wall of "Paid" locks; the Marketing section is locked until
  publish while the publish checklist sends her there.

### 3.3 Broken or fake

| Defect | Where |
|---|---|
| Student drawer invents a "Pro Coach Pass, $49/mo" subscription, course progress and activity lines when the API returns none | `components/admin/students/student-drawer.tsx:139-160, 393-442` |
| Students filter tabs (Active, At-risk, New) set state nothing reads | `app/admin/students/page.tsx:76` |
| Five links, including the setup item "Start selling", go to `/admin/billing/subscription`, which has no route (404) | `components/setup/catalog.ts:54`, `app/admin/blog/page.tsx:96`, `app/admin/live/page.tsx:53`, `components/logo/logo-studio.tsx:562`, `components/logo/studio-chat.tsx:658` |
| Batch video upload posts to `/api/v1/videos/`, which is not mounted (videos live under `/api/v1/courses/videos/`), with a hard-coded 60 s duration | `components/admin/batch-dropzone.tsx:88-97` |
| Billing → Payments tab is a static empty state | `app/admin/billing/page.tsx:464-470` |
| Student subscription plans can be created and priced only in "Raw Data Models" | `apps/billing/admin_panels.py:11-28` |
| Photos "Batch Upload" button changes only its own label; Videos' identically named button toggles a different panel | `app/admin/photos/page.tsx:53`, `app/admin/videos/page.tsx:250` |
| `?recipient=` from the student drawer is ignored by email compose | `app/admin/email/compose/page.tsx:43-48` |
| Saving a bundle returns to the Subscription tab | `app/admin/billing/bundles/new/page.tsx:59` |
| Course-created toast says "saved as a draft" even when "Publish immediately" was on | `components/admin/course-form.tsx:141-157` |

### 3.4 AI sits beside the admin

- Supply: the copilot (`apps/core/copilot/`) has 25 action types behind confirm cards with an audit
  log and undo for site edits; plus the site composer, blog generator, Pix4Less image generation
  and vision.
- In the admin only the Blog page has AI on it. The course form has none, although the copilot can
  create a course.
- The copilot is never sent the current page (`components/copilot/copilot-bubble.tsx:373-379`);
  its placeholder on every admin page reads "make this section warmer".
- Per turn it sees pages, theme, up to 30 courses (title and status only), upcoming live and
  on-site events, posts and six counts (`engine.py:724-758`). It sees nothing of individual
  students, revenue, downloads, videos, emails, announcements, community, inbox or plans, and
  cannot change a curriculum after creating it, nor reach streams or Zoom classes.
- Created content (course, event, post, announcement draft) has no undo.
- Five assistant surfaces: "Your AI assistant" (copilot bubble), the setup bubble's Help chat,
  the "Site AI" page (a launcher plus the audit log), "Site assistant" (the student bot's console)
  and the Logo Studio chat.
- Nothing proactive exists except blog autopilot.
- The copilot has no throttle and no hub label, so its runs — and blog autopilot's, a background
  job — take an interactive hub slot. The frontend `ActionKind` union lists 15 of the 25 kinds.

## 4. Approaches considered

1. **Polish only** — fix defects and names, keep the structure. Cheapest; leaves "over-complicated"
   and the AI gap untouched.
2. **Chat-first admin** — the assistant is the main surface, pages secondary. Closest to `/setup`,
   but with 5–15 s turns, no streaming and three interactive slots it would feel slow and would
   stall whenever the hub is busy.
3. **Fewer places with the assistant woven in (chosen)** — pages stay fully usable by hand; the
   assistant is docked on every page and each "create" offers a draft.

## 5. Target design

### 5.1 Navigation

| Place | Holds | Replaces |
|---|---|---|
| Today | What needs her now | Dashboard |
| Teach | Courses · Classes & events (one list; where it happens is a field; calendar is a view) · Downloads | Courses, Live Events (4 tabs), Calendar, Downloads |
| Students | People · Community · Inbox | The same three, grouped |
| Reach out | One "New message" (app announcement and/or email) · Blog | Email, Announcements, Blog |
| Money | Sales, memberships & bundles, payments, payouts | Payouts, Store, four of Billing's five tabs |
| Site | Edit site · Design · Student assistant · Media | My Site section, Site AI, Library |
| Settings (footer) | Timezone, mailbox, her Contentor plan, links to the rest | Settings, Billing's Subscription tab |

Rules:

- One name per page. The search palette is derived from the same nav data, so the names cannot
  drift again; a unit test asserts it.
- A feature her plan lacks shows one quiet lock, on the item only. No section is locked.
- Items for modules she did not choose stay hidden as today (`admin-nav-gate.ts`).

### 5.2 One assistant

One docked panel on the right replaces, inside `/admin`, the copilot bubble, the setup bubble, the
Help chat and the `/admin/site-ai` page. On desktop it pushes the page instead of covering it; on a
phone it is a sheet. On the public site and in the site editor the copilot stays as it is (it
needs the click-to-select tool there).

- Tabs: **Assistant** (chat and action cards), **Setup** (the checklist, while it is incomplete),
  **Help** (the existing Ask Contentor thread with "talk to a human"), **History** (the audit log
  with undo). Phase 1 moves the existing components into the panel; no backend merges.
- Context: the converse body gains `context: {path, record?: {kind, id}}`. The server validates
  it against an allowlist and adds it to the user turn — never to the system prompt, which must
  stay byte-identical across tenants.
- Starter suggestions: a static map from route to three or four prompts, e.g. on Courses "Draft a
  course from an idea" and "Add covers to the courses that have none". No model call to show them.
- Search: typing a page name jumps there; anything else is offered as "Ask the assistant: …".

### 5.3 A draft behind every create

A create entry point gets a one-line "Describe it" field beside the manual form. It calls the
existing converse endpoint with the page context and renders the returned cards inline with the
existing `ActionCard`; confirming opens the created draft in the normal editor. No new endpoint.
Order, by value to the coach and by how much already exists:

| Door | Exists today | To add |
|---|---|---|
| Course from an idea | `create_course` (titles only) | Curriculum editing after creation (modules, lessons) through the existing module and lesson serializers; description and price in the record-scoped digest |
| Class or weekly series | `create_event` (live, on-site), up to 12 cards | Streams and Zoom through their existing create serializers |
| Message to students | `draft_announcement` (no audience, no schedule) | Audience and schedule on the draft; email variant later |
| Inbox reply | — | Draft into the reply editor through `mailbox.services`; never sends |
| Student assistant knowledge | — | Entries proposed from her courses and pages; she reviews each |
| Captions, alt text, tags on upload | `describe_tenant_photo` (copilot uploads only) | Run on library uploads; a no-op when no vision provider is available |
| Download title and description | — | Through `DownloadFileCreateSerializer` |

Created content gets an undo: deleting the draft that audit entry created, while it is still an
unpublished, unmodified draft.

### 5.4 Today

`GET /api/v1/admin/today/` returns a deterministic list of items, each `{kind, title, href,
action?}`: the next class with its "Go live" action, unanswered inbox threads, pending community
reports, drafts awaiting review (blog, announcement, course), new students and sales since her
last visit, payout or publish blockers, and remaining setup items. No model call.

After that works, a background job writes a short brief: up to three suggestions, each carrying a
ready action. It runs only for tenants active in the last seven days, uses a background hub label,
and stores action payloads rather than 30-minute card tokens (tokens are minted when she opens
Today). This part has real design uncertainty and gets its own short spec when Phase 4 starts.

### 5.5 Assistant limits

- Label `contentor:copilot` on copilot runs; blog autopilot moves to a `contentor:compose…` label
  so it rides as background. The hub's own `/rules` can override requested priority, so the rules
  are probed before relying on this.
- A `copilot` DRF throttle scope per user.
- No plan check and no monthly cap (D1).
- The frontend `ActionKind` union is brought in line with the backend's 25 kinds.

## 6. Phases

Each phase is shippable on its own and gets its own implementation plan. Sizes are rough.

| Phase | Scope | Size |
|---|---|---|
| 0. Repairs | Everything in §3.3 that needs no design: remove invented student data; remove the dead filter tabs and the static Payments tab until they are real; redirect `/admin/billing/subscription` to `/admin/billing?tab=subscription`; point batch video upload at the mounted endpoint; fix the two upload buttons, the bundle return tab and the course toast; make `?recipient=` preselect that student in compose's send step; redirect the orphan `/admin/live-streams`. (Done 2026-10-13: the Paid badge on "Site AI" is gone, per D1.) | 1–2 days |
| 1. Shell | New nav (§5.1) with redirects; one name per page; palette derived from nav; the docked assistant panel (§5.2) holding the existing chat, setup, help and history; delete the `/admin/site-ai` page; remove the Marketing lock; a Settings page that links to every setting. Frontend only. | 3–4 days |
| 2. Assistant in the page | `context` on converse and starter suggestions; "Describe it" on course and class/event; curriculum door; undo for created drafts; label, throttle, `ActionKind` (§5.5). | ~1 week |
| 3. Merge duplicates | One Classes & events list and form (the four backend models stay); one message composer entry and one sent/scheduled list across announcements and campaigns, with the designed-email builder as the advanced path; Money (including a real payments list and a page to create student plans) split from "Your plan"; one Media page with one upload mechanic. | 1–2 weeks |
| 4. Today | The deterministic feed, then the background brief (own spec). | ~1 week |
| 5. Remaining doors | Inbox reply drafts, student-assistant knowledge, captions on upload, download descriptions, real student segments. | ~1 week |

Phase 0 comes first because two of its items sit on the path to the first paying coach (the
upgrade links) and one misleads coaches about their own students.

## 7. Verification

- Per phase: `make test-changed`, `make e2e-changed`, `make typecheck`, `make lint`; the changed
  pages checked in the running dev stack at desktop and phone width.
- A unit test that every `/admin/...` href literal in `frontend-customer/src` resolves to a route
  folder or a declared redirect (would have caught the 404).
- A unit test that the palette's entries equal the nav's.
- Backend tests for `context` validation, the curriculum door, draft undo and the throttle.

## 8. Risks

- **Hub capacity.** Admin assistant traffic competes with `/setup` interviews for interactive
  slots. Mitigation: label and throttle (§5.5), and `/setup` keeps priority in the hub's rules.
- **Tester habits.** The nav changes under 18 prod tenants. Mitigation: redirects (D7) and the
  search box finding old names.
- **Shared checkout.** Shell files are edited often by other sessions. Mitigation: small commits
  per phase item; stage only own hunks.
- **Help quality.** Help stays a separate tab and backend in Phase 1 precisely so its answers,
  caps and human handoff do not change; merging it into the copilot is not planned.

## 9. Not doing

- Merging the four live backend models, or the announcement and email backends.
- A chat-only admin.
- Translating the admin, or sweeping existing hard-coded strings.
- A per-coach AI cap or paywall (D1) until the owner asks for one.
- Demoting the manual site editor for every coach now that the assistant is open to all: the
  `hasSiteAi` gate keeps its current meaning until Phase 1 redraws the nav.
