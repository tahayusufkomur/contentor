# Setup Assistant v2 — always-on guide, per-object checklist, demo-content erase

**Date:** 2026-07-05
**Status:** approved (4 design decisions confirmed with user: floating assistant, registry-tagged demo erase with badges, auto+manual check logic, no AI — deterministic checklist)
**Builds on:** `2026-07-05-onboarding-smoothing-design.md` (shipped to local main: handoff login, 4-step SetupGuideCard, "general" template, monetize nudges)
**Scope:** `frontend-customer` (admin + tenant site edit mode), `apps.tenant_config`, `apps.core.demo.seed_template`

## Problem (analysis)

The 4-step Setup Guide shipped in the previous package has structural gaps:

1. **Not always-on.** It is one card on the `/admin` dashboard. On every other
   admin page and in the site builder the coach is unguided. After dismissal it
   is invisible everywhere except a small dashboard link.
2. **Too coarse.** "Make it yours" is a single boolean (`onboarding_completed`,
   which flips on the *first* builder save) even though the builder has exactly
   six fixed pages (`home, about, courses, pricing, faq, contact`). "Add your
   first course" (`has_content = Course.exists() OR DownloadFile.exists()`)
   **self-completes at signup** because every template seeds courses — the step
   is born checked and teaches nothing.
3. **Demo content is untracked, so it can't be erased.** `seed_template.py`
   creates ~12 draft courses (cycled with "— Volume N" suffixes), downloads,
   subscription plans, bundles, live events on a repeating schedule, plus up to
   **40 filler videos and 60 filler photos** — none carry any "seeded" marker.
   A coach who wants to start clean must hand-delete dozens of objects with no
   way to tell demo from real. The filler media also pollutes the photo/video
   libraries the coach uses daily.
4. **Missing steps.** Design/theme, live events, custom domain, studio email
   address, first announcement, and inviting/sharing with students exist as
   features but appear nowhere in the guide.
5. Small frictions found on the way: the `pricing` builder page renders at
   `/plans` (deep links must use `/plans`); the publish shortcut
   (`#publish-card`) only works on the dashboard; the tenant site already has a
   floating bottom-right EditButton, so a second floating bubble there would
   collide.

## Goals

1. **Always-on Setup Assistant** — a floating progress bubble on every `/admin`
   page, and a progress row inside the site-builder edit sidebar, both opening
   the same slide-over checklist panel.
2. **Per-object checklist** — one checkbox per builder page, per look/branding,
   per content object type, payments, publish, plus optional "nice to have"
   items; each auto-detected where possible and manually tickable everywhere.
3. **Demo-content lifecycle** — every seeded object is registered at seed time;
   admin lists show a "Demo" badge; one "Remove demo content" action deletes
   everything the coach hasn't touched (edited objects survive the erase and
   lose their badge then).

Non-goals: AI/chat assistant, lifecycle emails, changes to publish mechanics,
student-facing UI (assistant renders only for owner/coach), backfilling demo
registries for pre-existing prod tenants (best-effort command provided, not
auto-run).

## Architecture overview

Three pillars, one data flow:

```
seed_template.py ──registers──▶ SeededObject registry (tenant schema)
                                      │
                 ┌────────────────────┼──────────────────────┐
                 ▼                    ▼                      ▼
   GET admin/demo-content/   POST demo-content/erase/   setup-status v2
   (ids + counts → badges)   (fingerprint-guarded)      (items array)
                                                             │
                                                             ▼
                                              useSetupStatus() hook
                                              ├─ floating bubble (AdminShell)
                                              ├─ edit-sidebar progress row
                                              ├─ slide-over panel (shared Sheet)
                                              └─ slim dashboard summary card
```

## A. Demo-content registry (the keystone)

**New tenant model** `apps.tenant_config.models.SeededObject`:

```python
class SeededObject(models.Model):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64)          # str(pk); safe for int or UUID pks
    fingerprint = models.CharField(max_length=64)        # sha256 of canonical content
    niche = models.CharField(max_length=64, blank=True, default="")
    seeded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("content_type", "object_id")]
```

Registered types (top-level objects only — Modules/Lessons cascade with their
Course): `Course`, `DownloadFile`, `SubscriptionPlan`, `Bundle`, `LiveClass`,
`LiveStream`, `ZoomClass`, `OnsiteEvent`, `Photo`, `Video`.

**Fingerprint** = sha256 over a canonical JSON of the object's coach-editable
fields (exclude pk / created_at / updated_at / counters). For `Course` the
fingerprint additionally folds in its modules' titles and each lesson's
`(title, order, content_html, video_url)` so editing a lesson protects the
whole course. One shared helper (`fingerprint_for(obj)`) is used by both the
seeder and the erase endpoint — never two implementations.

**Why fingerprints, not `updated_at`:** only `Course`/`Module`/`Lesson` have
`updated_at`; downloads, live models, photos, and videos have `created_at`
only. Fingerprints work uniformly, require zero migrations on content models,
and survive `.save()` calls that don't change anything.

**Seeder changes** (`apps/core/demo/seed_template.py`):

- After each create, call `_register(obj, niche)` (bulk-create the registry
  rows at the end of the transaction for efficiency).
- Registration covers *everything* the seeder creates, including the filler
  videos/photos from `_seed_extra_videos` / `_seed_extra_photos`.
- **Volume reduction (recommended, one-line constants):** `TARGET_COURSES`
  12 → 6, `TARGET_VIDEOS` 40 → 16, `TARGET_PHOTOS` 60 → 24. Six real-looking
  courses still sell the aha; 60 identical stock photos in the coach's own
  media library never did.

**Backfill (QA convenience, manual):** management command
`backfill_seed_registry` — inside a named tenant schema, registers objects that
are recognizably demo (any `s3_key`/`thumbnail_url`/`file_url` starting with
`demo/`, plus courses whose title matches the tenant's `template_niche` module
titles, including "— Volume N" variants). Best-effort; run consciously per
tenant. Prod currently has no real coaches, so new signups get exact tracking
and old test tenants can be backfilled or ignored.

## B. Demo-content endpoints

Mounted with the other tenant-admin routes under `/api/v1/admin/`
(`IsCoachOrOwner`):

**`GET /api/v1/admin/demo-content/`**

```json
{
  "present": true,
  "counts": {"courses": 12, "downloads": 2, "live_events": 14, "plans": 1,
              "bundles": 1, "videos": 38, "photos": 52},
  "ids": {"courses": ["3", "4"], "downloads": ["1"], "live_classes": ["2"],
           "live_streams": [], "zoom_classes": [], "onsite_events": [],
           "plans": [], "bundles": [], "videos": ["9"], "photos": ["11"]}
}
```

`ids` lets the frontends render "Demo" badges by membership — no serializer
changes across five apps. `live_events` in `counts` is the sum of the four
live types (dialog copy stays simple).

**`POST /api/v1/admin/demo-content/erase/`** — single transaction, in order:

1. Bundles → SubscriptionPlans → live events (4 types) → Courses →
   DownloadFiles, then Videos, then Photos (dependents before dependencies).
2. Per registry row: object missing → drop row. `fingerprint_for(obj)` differs
   from stored → **coach edited it: keep the object, drop the row** (loses the
   badge, survives every future erase). Else delete object + row.
3. **Reference guard for media:** skip (keep + drop row) any Photo still
   referenced by a surviving Course/live-event thumbnail, `TenantConfig.logo`,
   or a photo id inside `TenantConfig.pages` JSON; skip any Video still
   referenced by a surviving Lesson.
4. **Never delete bucket objects.** Seeded rows point at shared platform
   `demo/*` keys used by every tenant. DB rows only.
5. Response: per-type deleted/kept counts. Frontend shows a toast and
   invalidates its hooks.

## C. Setup-status v2 (the checklist brain)

Same route (`GET/PATCH /api/v1/admin/setup-status/`), new shape — the old
4-boolean shape has exactly one consumer (SetupGuideCard), replaced in this
package, and neither side is deployed to real coaches yet.

### Item catalog

Core items (count toward progress; `optional: false`):

| key | group | auto-done when | deep link (client-side) |
|---|---|---|---|
| `page_home` | site | `home` in `setup_progress.pages_edited` | `/` (edit mode) |
| `page_about` | site | ditto `about` | `/about` |
| `page_courses` | site | ditto `courses` | `/courses` |
| `page_pricing` | site | ditto `pricing` | `/plans` |
| `page_faq` | site | ditto `faq` | `/faq` |
| `page_contact` | site | ditto `contact` | `/contact` |
| `look` | site | `setup_progress.look_edited` (theme/font/logo changed) or logo set | `/admin/design` |
| `first_course` | content | a Course exists that is **not** an untouched registry member — short-circuit `Course.objects.exclude(pk in registry).exists()` first; only if that's false compare fingerprints of registered courses | `/admin/courses/new` |
| `demo_cleanup` | content | registry has no rows (i.e. an erase has run — rerunning erase after editing everything deletes nothing but still clears the registry); **item hidden entirely when the tenant was never seeded** (`template_seed_status != "ready"` and registry empty) | opens erase dialog |
| `payouts` | business | `can_monetize(tenant)` | `/admin/payouts` |
| `publish` | live | `tenant.is_published` | `/admin#publish-card` |

Optional items (`optional: true`, listed under "Nice to have", excluded from
the progress fraction; shown only when the module/feature applies):

| key | shown when | auto-done when | link |
|---|---|---|---|
| `first_download` | `downloads` module enabled | non-demo DownloadFile exists | `/admin/downloads` |
| `first_live` | `live` module enabled | non-demo live event (any of the 4 types) exists | `/admin/live` |
| `first_announcement` | always | `Announcement.objects.exists()` (never seeded) | `/admin/notifications` |
| `share_site` | when published | manual only (panel row has a copy-link button) | — |
| `custom_domain` | feature available (the onboarder UI is partial — item stays hidden behind a frontend flag until that feature ships and supplies its link) | active `CustomDomain` for tenant (public-schema query) | hidden for now |
| `studio_email` | paid tier active | `PlatformMailboxAddress` exists for tenant (public schema) | `/admin/inbox` |

Rules: **done = auto OR manual-tick.** Manual tick/untick is allowed on every
item; unticking cannot override a true auto signal (the checkbox just returns
to its detected state). Item titles/descriptions/links live in a frontend
catalog keyed by `key` (i18n via `messages/{en,tr}/admin.json`) — the API
returns state, not copy.

### Response shape

```json
{
  "items": [
    {"key": "page_home", "group": "site", "done": true, "source": "auto", "optional": false},
    {"key": "demo_cleanup", "group": "content", "done": false, "source": null, "optional": false}
  ],
  "progress": {"done": 6, "total": 11},
  "demo_present": true,
  "dismissed": false
}
```

`PATCH {"dismissed": bool}` unchanged. New: `PATCH {"item": "<key>", "done": bool}`
writes the manual override into `setup_progress.manual` (400 on unknown keys).

### Auto-detection storage

New `TenantConfig.setup_progress = JSONField(default=dict)`:

```json
{"pages_edited": ["home", "about"], "look_edited": true,
 "manual": {"page_faq": true}}
```

Written from `TenantConfigViewSet.perform_update`: diff incoming vs stored
`pages[key]` (JSON inequality per page key) → append to `pages_edited`; any
change to `theme` / `font_family` / `logo_url` / `logo` → `look_edited`. The
seeder writes config via `.save()` directly (not the serializer), so template
seeding can never mark pages as coach-edited. Detection is append-only — a
page once edited stays done.

One tenant migration total (SeededObject + setup_progress field).

## D. Frontend — the always-on assistant

All in `frontend-customer` (admin and tenant site are the same Next app, so
one shared panel serves both surfaces).

**`useSetupStatus()` / `useDemoContent()` hooks** — module-level cached fetch
(same pattern as MonetizeNudge), refetch on panel open and after mutating
actions (manual tick, erase, publish). No interval polling — `setup-status`
touches the Stripe-cached connect status, and event-driven refresh is enough.

**Floating bubble** (`SetupAssistantBubble`, mounted in `AdminShell`): fixed
bottom-right on every admin page; circular progress ring around "6/11". Click
→ slide-over panel. Hidden when dismissed or when the status fetch fails
(fail-soft, like the current card).

**Edit-sidebar row** (tenant site, edit mode): the existing first-run
"Continue setup →" row becomes a persistent progress row — thin bar +
"Setup · 6 of 11" — that opens the same panel in place. No second floating
button (the EditButton already owns that corner). The row shows while
`!dismissed`, not just first-run.

**Slide-over panel** (`SetupAssistantPanel`, shadcn Sheet, right side):

- Header: title, progress bar, X-of-N, dismiss control.
- Collapsible groups in order: **Your site** (6 pages + look), **Your
  content** (first course, remove demo content), **Getting paid**, **Go
  live**, then **Nice to have** (optional items, visually lighter).
- Each row: check circle (✓ filled when done), title, one-line description,
  chevron. Row click navigates to the deep link; clicking the check circle
  toggles the manual tick. Done rows show muted + strikethrough; auto-done
  rows label "done" subtly, manual ones "marked done".
- `demo_cleanup` row shows live counts ("12 courses, 2 downloads…") and opens
  the erase confirm dialog instead of navigating.
- All-core-done → celebration state ("You're live 🎉") with a copy-site-link
  button, then auto-dismiss (existing PATCH).
- Dismiss ✕ → PATCH `dismissed: true`; bubble and sidebar row disappear; the
  dashboard keeps the existing "Show setup guide" re-entry link.

**Dashboard card**: the current 4-step SetupGuideCard is replaced by a slim
summary — progress bar + the next 3 undone core items + "Open the full guide"
(opens the panel). Same hook, no second fetch.

**Demo badges + erase dialog**:

- Admin list/grid pages for courses, downloads, live events, photos, videos
  render a small "Demo" `Badge` when the row's id is in `useDemoContent().ids`.
- Erase confirm (destructive-action pattern): exact counts per type, the
  sentence "Anything you've edited will be kept.", cancel/destructive buttons.
  Also reachable from `/admin/settings` ("Demo content" section) so it exists
  after the guide is dismissed.

**Copy tone:** non-technical coach voice throughout (existing house rule); en +
tr catalogs.

## Error handling

- Bubble/panel/badges all fail-soft: fetch error → render nothing (admin stays
  usable).
- Erase endpoint: transaction-atomic; any unexpected exception → 500, nothing
  half-deleted; the registry is the retry state (idempotent — rerunning erases
  whatever is still registered and untouched).
- Manual PATCH with unknown item key → 400.
- Public-schema lookups (custom domain, studio email) guarded so a missing
  feature/flag hides the item instead of erroring the whole payload.

## Testing

- **Backend:** seed general template into a test tenant → registry rows exist
  for every type incl. filler media; erase on untouched tenant → content
  counts drop to zero, config/pages untouched, bucket untouched; edit one
  course's lesson then erase → that course survives + unregistered; photo
  referenced from `pages` JSON survives; setup-status v2 — page diff marks
  `pages_edited`, look diff marks `look_edited`, manual PATCH round-trips,
  module gating hides `first_download`/`first_live`, `demo_cleanup` hidden for
  never-seeded tenants, `first_course` stays false while only demo courses
  exist and flips when a real one is created (or a demo one is edited).
- **Frontend:** tsc + build for frontend-customer; browser walk of the full
  funnel: signup → landing → bubble shows correct fraction → edit About page →
  `page_about` auto-checks → create a course → `first_course` checks → erase
  demo (counts correct, badges disappear) → connect payouts (bypass) →
  publish → celebration → dismiss → dashboard re-entry link works.

## Rollout

- 1 tenant migration (entrypoint `--tenant` auto-applies on deploy).
- Existing tenants have no registry rows → `demo_cleanup` hidden,
  `first_course` treats all their content as real (correct for real coaches;
  test tenants can be backfilled).
- Ships on a feature branch; joins the pending deploy batch. No worker, DNS,
  or shared-schema changes.
