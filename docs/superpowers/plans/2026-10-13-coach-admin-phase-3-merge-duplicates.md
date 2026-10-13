# Coach Admin Phase 3 (Merge duplicates) Implementation Plan

**Goal:** Each job in the admin has one page: one list and one form for every class and event, one
"New message" and one sent/scheduled list across announcements and email, a Store that can create a
membership and shows real payments, and one Media page with one way to upload.

**Spec:** `docs/superpowers/specs/2026-10-13-coach-admin-refactor-design.md` (§5.1, §6 Phase 3, §7).
Executed inline; one commit per task.

## Global constraints

- The four live models stay, and so do the announcement and email backends (§9). This phase merges
  pages, not tables.
- Every page keeps working by hand (D3); "Describe it" stays where Phase 2 put it.
- One name per page: the sidebar, the tab, the `<h1>` and search read the same `nav.items.*` key.
  The palette stays derived from the nav (`lib/__tests__/admin-palette.test.ts`).
- Old URLs keep working (D7): a page that moves leaves a redirect page that carries its query
  string. `lib/__tests__/admin-links.test.ts` must stay green.
- New and changed strings go through `messages/en/admin.json` (D6); strings inside moved code are
  not swept.
- Loading conventions (root `CLAUDE.md`): `PageState`, `useAsyncAction`, `<Button loading>`,
  `NavLink` / `useNavigate`, `StaleContainer` for refinements.
- Shared checkout: commit only the files a task names; `pre-commit run --files …` then
  `git commit --no-verify`.

## Tasks

### 1. Money: memberships she can create, and a real payments list

Backend: `apps/billing/views/plans.py`, `views/payments.py`, `serializers/plans.py`, `urls.py`,
`tests/test_store_admin.py` (new).

- `POST /billing/plans/` and `PATCH /billing/plans/<id>/` for the owner (`PlanWriteSerializer`:
  name, description, price > 0, `billing_interval_months` 1–36, `is_active`). The currency is the
  tenant's charge currency, never input. No delete: a plan is switched off, because subscriptions
  point at it. A new price or cycle mints a new Stripe price at the next checkout (existing code).
- The owner sees switched-off plans: `GET /billing/plans/?all=1` (ignored for anyone else, so the
  public pricing page is unchanged even when she browses her own site) and `GET /billing/plans/<id>/`.
- `GET /billing/sales/` for the owner: marketplace payments (never the coach's own Contentor
  charges), newest first, limit/offset pages, each with the student's id, name and email.
- Tests: a student cannot create or edit a plan; the currency in the body is ignored; price 0 and
  37 months are refused; `?all=1` shows a switched-off plan to the owner only; the sales list
  leaves out platform charges and refund rows, pages, and refuses a student.

Frontend: `app/admin/store/page.tsx`, `app/admin/store/plans/[id]/page.tsx`,
`messages/en/admin.json`.

- `/admin/store/plans/new` and `/admin/store/plans/<id>` are one form: name, description, price,
  cycle (monthly, yearly, or a number of months), on sale or not, and the existing content picker.
- Memberships tab: "New membership" (also the empty state's action); switched-off plans listed.
- Payments tab: date, student (links to her page, where refunds are), what was bought, amount in
  its own currency, status, receipt. "Load more" pages.
- Bundles tab shows each bundle's own currency in place of a hard-coded `$`.

### 2. Media: one page, one way to upload

Backend: `apps/media/serializers.py`, `apps/courses/serializers.py`, `apps/downloads/serializers.py`,
`apps/core/tests/test_upload_validation.py`.

- The three create endpoints (`POST /photos/`, `/courses/videos/`, `/downloads/`) accept a storage
  key as given, while `/upload/complete/` checks it belongs to the tenant. They get the same check
  (`is_tenant_scoped_key`): a coach must not be able to register another tenant's file and be
  handed a signed link to it.
- `VideoCreateSerializer` accepts `file_size`, so a batch-uploaded video stops showing as 0 bytes.
- Tests: each endpoint refuses a foreign key and a `..` key, and accepts its own.

Frontend: `app/admin/media/page.tsx` (new), `components/admin/media/{photos-view,videos-view}.tsx`
(the two old page bodies), `components/admin/batch-dropzone.tsx`, `components/admin/media-browser.tsx`,
`app/admin/{photos,videos}/page.tsx` (redirects), `app/admin/downloads/page.tsx`, `lib/admin-nav.ts`,
`lib/admin-palette.ts`, `lib/copilot/starters.ts`, `messages/en/admin.json`, the nav vitests.

- `/admin/media` with a Photos | Videos switch (`?type=videos`); Site's nav shows one "Media" item.
  `/admin/photos` and `/admin/videos` redirect.
- One drop zone on the page takes both: an image becomes a photo, a video becomes a video, anything
  else is refused by name. It sends the file's size, uploads three at a time, shows why a file
  failed, and "Clear finished" leaves running uploads alone. A video goes up in parts with retries
  (the existing multipart endpoints), so the separate "Upload one video" panel is deleted.
- Repairs in the shared browser: Edit works in gallery view (it did nothing there); deleting asks
  first; "select all" + delete on Videos and Downloads respects the tag filter (it deleted every
  match of the search).
- Downloads keeps its own form (title and price come before the file) but records the file's size
  and its "open" link asks the API for a signed link.

### 3. Messages: one "New message", one list

Backend: `apps/notifications/serializers.py` (list rows gain `also_email`, `sent_at`),
`apps/email_campaigns/views.py` (reading the campaign list must not provision a MailCraft account),
`apps/core/copilot/{content,context}.py`, `apps/live/content_calendar.py`, `tenant_config/help_kb.md`,
their tests.

Frontend: `app/admin/messages/` (new: `page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `email/new`,
`email/[id]`, `email/templates` — the last four are the existing pages moved),
`components/admin/messages/message-list.tsx` (new), `lib/messages.ts` + vitest (new),
`lib/email-api.ts`, redirect pages under `app/admin/{notifications,email}/`, `lib/admin-nav.ts`,
`lib/admin-palette.ts`, `lib/copilot/starters.ts`, `components/setup/catalog.ts`,
`components/admin/students/student-drawer.tsx`, `messages/en/admin.json`, the nav vitests,
`e2e/specs/06-announcements.spec.ts`.

- Reach out shows "Messages" and "Blog". `/admin/messages` is one list of everything sent or
  scheduled, announcements and designed emails together, newest first, each row saying where it
  went (app, app + email, email), its state and its numbers. Tabs beside it: Repeating, Templates.
- "New message" opens the existing composer on its own page (`/admin/messages/new`); "Design an
  email" is the advanced path beside it (`/admin/messages/email/new`, the MailCraft wizard).
  A draft from the assistant opens straight in the composer (`?draft=<id>`).
- `mergeMessages(announcements, campaigns)` is pure: one status vocabulary (draft, scheduled,
  sending, sent, partly sent, failed), one date per row, and a "send now" still in flight reads as
  sending rather than "Scheduled" with a blank date. Vitest covers the mapping and the order.
- If the email service is unreachable the list still shows announcements, with a quiet note.
- A scheduled designed email can be cancelled from the list (the API allowed it; no page offered it).
- Every old address redirects with its query string: `/admin/notifications`, `/admin/notifications/<id>`,
  `/admin/email`, `/admin/email/compose`, `/admin/email/templates`, `/admin/email/campaigns/<id>`.

Not in this task (decided while planning): a plain email that skips the app. "Also send as an
email" on a message covers the plain case and the designer covers email-only; a third path would
need a channel flag through the announcement model, feed and push. The two audience pickers stay
as they are for the same reason: the spec merges the entry and the list, not the backends.

### 4. Classes & events: one list, one form, the calendar as a view

Backend: `apps/live/views.py` + `config/urls.py` (`GET /api/v1/admin/events/`),
`apps/live/content_calendar.py` (a calendar item links to its own event),
`apps/core/copilot/context.py`, `apps/live/tests/test_admin_events.py` (new),
`apps/live/tests/test_content_calendar.py`.

- `GET /api/v1/admin/events/` (coach or owner): the four models in one page-able list. It reads
  only each row's id and sort key from the four tables, merges and slices in Python, then
  serializes that page with each kind's existing serializer, adding `kind`
  (`live | stream | zoom | onsite`, the assistant's vocabulary) and `computed_status`.
  Params: `search`, `tags`, `ordering` (`scheduled_at` default, `created_at`, `title`, each with
  `-`), `when` (`upcoming` | `past`), `limit`, `offset`. Undated drafts sort last and count as
  upcoming; a class that is live now is upcoming whatever its start time.
- Create, update, delete, start and stop stay on the four existing endpoints.
- Tests: all four kinds come back with their kind; search and tags span kinds; upcoming and past
  split on the clock with drafts in upcoming; date order puts drafts last; a page boundary falls
  between kinds correctly; a student is refused.

Frontend: `app/admin/live/page.tsx`, `components/admin/live/{events-list,event-form,kinds}.tsx`
(new), `components/admin/live/shared.tsx`, delete `components/admin/live/{classes,streams,zoom,
onsite}-tab.tsx`, `components/admin/calendar/unified-calendar.tsx`, `app/admin/calendar/page.tsx`
(redirect), `lib/admin-nav.ts`, `lib/admin-nav-gate.ts`, `lib/admin-palette.ts`,
`lib/copilot/starters.ts`, `messages/en/admin.json`, the nav vitests, `e2e/specs/{25,29}`.

- One list: status, title, when, where (live class, stream, Zoom, or the place), price, actions.
  Upcoming | Past switch, soonest first; search, tags and sort as before. Row actions follow the
  kind: Go live / Join / End, Open Zoom, Edit.
- One form for create and edit, driven by a `kinds` table: "Where it happens" picks the kind (fixed
  once created, since a row cannot change table) and shows that kind's own fields (record it; the
  Zoom link; place, address and capacity). The access choices follow the kind too.
- Repairs carried by the rewrite: a date, a capacity or a price can be cleared on edit;
  "record it" can be changed after creation; the server's own message shows when a save is
  refused; a delete that was refused (only the owner may delete) is reported instead of toasted as
  done; prices show in the tenant's currency; a past Zoom class or in-person event reads "Ended".
- List | Calendar switch on the same page (`?view=calendar`); `/admin/calendar` redirects and
  leaves the nav. A calendar item's "Manage" link opens that event's form.
- Deep links: `?event=<id>&kind=<kind>` opens the form (`?tab=` from older links still maps to its
  kind); `?new=1` opens an empty one.

Not in this task: the form keeps reading its date field in the browser's time zone while the
assistant reads times in the coach's site zone. They differ only when she travels; unifying them
changes how every existing form reads a time, and gets its own change.

### 5. Verification and wrap-up

- `make test-changed`, `make test-frontend`, `make typecheck`, `make lint`; `npm run gen:api` and a
  read of the generated diff.
- Dev stack at desktop and 375 px, as the coach: create and edit one event of each kind and see it
  in the calendar view; upload a photo and a video through the one drop zone; send a message with
  the email box ticked, open a draft from the assistant, cancel a scheduled email; create a
  membership, switch it off, and read the payments list. Every old URL lands on its new page.
- e2e: `00-smoke`, `06-announcements`, `12-downloads`, `25`, `27`, `29-copilot`, `02-courses`,
  `05-media`.
- One independent read-only review of the commit range before deploying.
- Spec status line, `help_kb.md`, the copilot's `ADMIN_PAGES`, delete this plan.
