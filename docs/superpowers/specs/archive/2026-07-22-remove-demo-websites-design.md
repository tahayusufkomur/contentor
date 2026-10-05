# Remove demo websites & view-as; add a comprehensive 3-tenant dev seed

**Date:** 2026-07-22
**Status:** Design approved — pending implementation plan

## Goal

We no longer offer live "demo websites" to prospective customers. Remove that
entire system — the demo tenants, the public `/demo` gallery, the "view as
coach / view as student" role toggle, the read-only demo middleware, and the
`is_demo` tenant flag. Replace it, for local development only, with **3 richly
seeded tenants on the free / starter / pro plans** so any product feature can be
exercised without a marketing-scale demo.

Net effect: the demo-website + view-as + read-only subsystem is deleted; the
proven content-generation logic in the old seeder is repurposed (not rewritten)
into the new dev seed, and extended to cover features it never seeded.

## Non-goals / explicitly kept

These share the word "demo" but are **not** the marketing-demo system and stay:

- **Start-from-template onboarding.** A real coach's own tenant is seeded with
  starter content at signup. Keep `core/demo/seed_template.py`,
  `demo_seed/registry.py`, `demo_seed/data/*.json`, and the SeededObject
  "erase starter content" flow (`tenant_config/demo_content.py`,
  `components/setup/*`, `DemoBadge`). The word "Demo" remains visible to coaches
  in that flow — accepted, it is part of the kept onboarding feature.
- **Superadmin support impersonation** (`accounts/impersonation.py`,
  `impersonate/*` routes/UI). Separate system, still used for support.
- `demo_seed` app stays registered — it is now purely the shared niche-content
  library (registry + JSON + `calendar_content.py`).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Keep start-from-template onboarding? | **Keep** |
| Dev-tenant seed richness | **Comprehensive** — every feature testable |
| Remove `is_demo` field + `DemoReadOnlyMiddleware`? | **Remove fully** (with migration) |
| Niche spread across the 3 tenants | **Three different niches** |
| Free/starter seed depth | **Scale to plan tier** (pro = full) |
| e2e primary fixture slug | **Keep `demo-yoga`** (minimize e2e churn) |

## Part 1 — Deletions (the demo-website + view-as system)

### Backend — delete files
- `apps/core/demo/views.py` — `demo_enter` "view as" endpoint + `DEMO_COACH_EMAIL` / `DEMO_STUDENT_EMAIL` / `ROLE_REDIRECTS`.
- `apps/core/demo/urls.py` — `/api/v1/demo/enter/` route (and its `include` in the core urlconf).
- `apps/core/middleware/demo_readonly.py` — `DemoReadOnlyMiddleware`.
- `apps/demo_seed/management/commands/seed_demo_tenant.py` — content logic is repurposed into the new seeder (Part 3), then this file is removed.
- `apps/demo_seed/management/commands/seed_all_demos.py`.
- `apps/demo_seed/management/commands/backfill_demo_calendar.py`.
- `apps/demo_seed/tests/test_calendar_content.py` moves/adapts if `calendar_content.py` is reused by the new seeder (keep coverage).
- **NOT deleted (correction):** `scripts/mirror_demo_assets.py`, the `seed-demo-assets`
  Makefile target, and the mirror calls in `make dev`/`make dev-reset` all stay — the
  niche JSONs reference `demo/photos/*` / `demo/videos/*` object keys that exist in dev
  MinIO only via this mirror, and the new seeder reuses those JSONs. The prod bucket's
  `demo/*` objects remain the read-only source and must never be deleted.
- **Modified, not deleted:** `apps/accounts/management/commands/issue_login_token.py`
  imports `DEMO_COACH_EMAIL`/`DEMO_STUDENT_EMAIL` from the deleted `core/demo/views.py`
  and looks up the synthetic view-as users — it must be rewired to resolve
  coach → the tenant's real owner (`role="owner", is_staff=True`) and
  student → any seeded `role="student"` user BEFORE the views file is deleted.
  All e2e auth (`e2e/helpers/auth.ts`) and the flowmap crawler
  (`tools/flowmap/crawler/auth.js`) mint logins through this command.

### Backend — remove `is_demo` fully
- `apps/core/models.py` — drop `Tenant.is_demo`.
- New migration in `apps/core/migrations/` to remove the column (field was added in `0007_tenant_is_demo.py`; a `RemoveField` migration is required — do not edit historical migrations).
- `config/settings/base.py` — remove `DemoReadOnlyMiddleware` from `MIDDLEWARE`, and `DEMO_READONLY_ENABLED` (lines ~381-384).
- `config/settings/dev.py` — remove `DEMO_READONLY_ENABLED`.
- Remove every `is_demo` branch: `apps/core/admin_panels.py` (list_filter/fields), `apps/core/contact/views.py` (demo no-op email), `apps/core/preview/views.py` (demo→published), `apps/accounts/views.py` (demo-slug bypass — see dev-login note), `apps/tenant_config/serializers.py` (`is_demo`, `demo_readonly`, `demo_niche` exposure; keep the real `niche` derivation), **`apps/core/onboarding/recovery.py:92`** (the `is_demo=False` queryset filter — the wizard-recovery beat job raises `FieldError` after the migration if this is missed), and the `{"is_demo": True}` override in `apps/core/tests/test_wizard_recovery.py`.
- `apps/core/management/commands/seed_wizard_mockup_tenant.py` — replace `is_demo=True` with **`is_published=True`** (the mockup tenant passed the customer-app publish gate only via `is_demo`; `is_published` defaults `False`, so without this the wizard screenshot captures render the preview-gate page).

### frontend-main
- Delete `src/app/demo/page.tsx` (the `/demo` gallery) and `src/lib/demos.ts`.
- Remove the `/demo` hero CTA (`components/landing/hero-section.tsx`) and the `/demo` whitelist in `components/shared/help-bubble.tsx`.

### frontend-customer
- Delete `src/components/shared/demo-banner.tsx` and `src/app/api/demo/enter/route.ts`.
- `src/app/layout.tsx` — remove `<DemoBanner/>` import/render and the `config.is_demo === true` published override.
- `src/lib/api-client.ts` — remove the `demo_readonly` 403 handling and `demo-*.` subdomain stripping.
- `src/components/owner/edit-sidebar.tsx:449` — drop the `|| config.is_demo` disjunct.
- `src/types/tenant.ts` — drop `is_demo`, `demo_readonly`, `demo_niche` types (keep `niche`).
- **Keep** `src/components/auth/magic-link-form.tsx`'s `demo_redirect` handling — it is how
  the (now DEBUG-only) dev instant login lands in the browser.

### Makefile
- Remove only `seed-demos` and `seed-demos-force`; clean `.PHONY` + help filter.
  **`seed-demo-assets` and the `mirror_demo_assets` invocations in `dev`/`dev-reset`
  stay** (dev media supply chain), as does the `capture-wizard-mockups: seed-demo-assets`
  prerequisite.

## Part 2 — Kept, untouched
See "Non-goals / explicitly kept" above. `calendar_content.py` (blog + email
seeding) is reused by the new seeder rather than deleted.

## Part 3 — New dev seed: `seed_dev_tenants`

New management command (proposed location `apps/core/management/commands/seed_dev_tenants.py`).
Repurpose the content-generation helpers from the old `seed_demo_tenant.py` into a
`seed_tenant(slug, plan, niche, depth)` function, **stripped of**:
- `Tenant.is_demo` (always `False` now — field is gone),
- the synthetic `demo-coach@` / `demo-student@` view-as users,
- marketing-scale volumes (no 400 photos, no 100+ live events across a 2-year span).

Owner rows mirror **real provisioning** (`apps/core/tasks.py:344`):
`User(email=<owner_email>, name=..., role="owner", is_staff=True, region=<region>)`,
`set_unusable_password()` (login is passwordless). No public-schema coach row is
required for login — the login row lives in the tenant schema; only
`core.Tenant` / `core.Domain` live in public.

Each tenant is created with **`is_published=True`** and **`template_niche=<niche>`**:
the old demo tenants passed the publish gate via `is_demo` and derived `niche` from
their `demo-` slug — both crutches are removed. Without `is_published=True`, anonymous
browsing (e2e spec `13-events-page`, the flowmap crawler) hits the preview gate;
without `template_niche`, the serializer's `niche` becomes `""` and the builder loses
niche-appropriate block defaults.

The three tenants:

| Slug | Plan | Niche | Depth |
|---|---|---|---|
| `demo-fitness` | free | fitness | small catalog, **no live** (live off on free), ≤10 students |
| `demo-pilates` | starter | pilates | mid-tier, live on, bundles/subs |
| `demo-yoga` | pro | yoga | **full coverage** (all features + edge states) |

`demo-` slugs are retained deliberately so e2e's `demo-yoga` fixture and the
DEBUG-only instant-login keep working (see dev-login note).

### Dev login
View-as is gone, so preserve an easy way into each tenant:
- **Premise correction:** the demo-slug instant-login in `apps/accounts/views.py`
  (`magic_link_request`) is **not currently DEBUG-gated** and is email-agnostic — it
  returns a login token for whatever email is posted on any `demo-`-slugged tenant,
  today tolerable only because demo tenants are read-only. With the read-only
  middleware gone, adding a `settings.DEBUG` gate to this branch is a **security
  requirement**, not a convenience. No "repointing" is needed — in dev, post the
  owner's email and get an instant login. Update
  `accounts/tests/test_views.py::test_demo_tenant_returns_demo_redirect` for the gate
  (DEBUG=True → `demo_redirect`; DEBUG=False → normal email flow).
- `issue_login_token` remains the scriptable fallback — after the rewiring described
  in Part 1 (role-based lookup instead of the deleted synthetic-user emails).

## Part 4 — Feature-coverage gaps the seed must fill

The old seeder left entire features unseeded. On **pro** (`demo-yoga`), and
lighter on starter, the new seed adds:

- **mailbox** — `Conversation`, `Message`, `MessageAttachment`.
- **community** — `CommunitySettings` (enabled), `CommunityMember`, `Post`, `Comment`, `Reaction`, one `Report`.
- **notifications** — `Announcement`, `RecurringAnnouncement`, `AnnouncementRecipient`, `AnnouncementTemplate`, an `EmailOptOut`, a `PushSubscription`.
- **usage** — `UsageEvent` rows so analytics dashboards render.
- **filters** — `FilterGroup` / `FilterOption` + assigned to courses/events.
- **tags** — `Tag` + assigned to courses/videos/photos/downloads.
- **tenant_config assistant** — `AssistantConfig`, `AssistantKnowledgeEntry`, `AssistantLink`.
- **blog** — `BlogTopicIdea`, `BlogAutopilot` (in addition to the existing 8 `BlogPost`s from `calendar_content`).
- **edge billing states** — a refunded `Payment`, a `past_due` / `cancel_at_period_end` `Subscription`.
- Minor: `Lesson.is_free_preview`, live `recording_url`, `filter_options`/`tags` M2Ms.

Counts favor **breadth over bulk** — a handful of each so every screen has data,
not marketing-scale volume.

## Part 5 — Wiring

- `apps/core/management/commands/seed_plans.py` — remove the demo auto-seed block
  (lines ~205-218). It seeds only plans + public tenant + superusers again.
- `make seed` — `seed_plans` → `seed_dev_tenants` → `seed_curated_logos`.
- **e2e** — `e2e/global-setup.ts` calls `seed_dev_tenants` instead of
  `seed_all_demos` and still probes `demo-yoga.localhost`. Because the pro slug
  stays `demo-yoga`, the 9 specs referencing `demo-yoga` / `demo_yoga` need no
  data-model repointing — verify each still passes (some rely on specific
  seeded content that must survive the trim). Also verify `13-events-page`
  (anonymous browse — exercises the new `is_published=True` path; its
  "View as calendar" link assertion is legitimate copy, not view-as — don't
  strip it). `e2e/helpers/auth.ts` needs no changes once `issue_login_token`
  is rewired.
- **`e2e/impact-map.json`** — `"demo_seed": "none"` becomes wrong: after this
  change `seeding_helpers.py` feeds every spec's fixture data, so seeder edits
  must re-run the data-dependent suite (drop the key for fail-closed behavior,
  or map it to the data-dependent specs; verify with the selector self-test in
  `make lint`).

## Part 6 — Decommission the legacy prod demo tenants

Prod hosts a marketing demo tenant per niche. After this release they would
linger publicly routable at `demo-*.contentor.app`, no longer read-only, and the
magic-link API still auto-registers students against them regardless of the UI
preview gate. A new one-off ops command `decommission_demo_tenants` (dry-run by
default, `--yes` to delete) identifies them via the registry niches'
`TENANT["schema_name"]` and drops schema + domains + tenant row. Deploy runbook:
run it with `--yes` on prod after `make deploy`. The prod bucket's `demo/*`
media objects are **not** deleted — they stay as the read-only source for
`mirror_demo_assets.py`.

## Testing

- Backend: update/replace `apps/demo_seed/tests/*` and the `is_demo`-referencing
  tests (`core/tests/test_wizard_recovery.py`, etc.). New tests for
  `seed_dev_tenants`: creates 3 tenants on the right plans, no `is_demo` (field
  gone), owner logins present, gap-features seeded on pro, free tenant has no
  live classes.
- `make migrate` applies the `is_demo` removal cleanly on a fresh DB and on an
  existing seeded DB.
- Run `make dev` + `make seed`, then smoke each of the 3 tenants and every
  gap-filled feature screen.
- `make e2e` green (esp. the `demo-yoga` specs).
- `npm run gen:api` in frontend-customer after serializer edits — review the
  `api-generated.ts` diff (the `is_demo`/`demo_readonly` fields drop out).

## Risks

- **Trimming seed volume breaks a specific e2e spec** that assumed old counts.
  Mitigation: keep whatever specific fixtures the 9 `demo-yoga` specs assert on;
  verify spec-by-spec.
- **`is_demo` removal migration** on the home-server prod DB — prod has real
  tenants; the `RemoveField` is safe (drops an unused column) but must be part
  of the normal `make deploy` migrate step. The known queryset consumers
  (`onboarding/recovery.py`, the old seed commands) must be edited/deleted in the
  same release or they raise `FieldError` at runtime.
- **e2e auth is a single point of failure** — `issue_login_token` must be rewired
  before `core/demo/views.py` is deleted, or every spec's login breaks on
  ImportError.
- **Leftover prod demo tenants** — without Part 6 they stay routable, writable,
  and student-registrable. Decommission explicitly; keep the bucket's `demo/*`
  objects (mirror source).
- **Hidden `is_demo` consumers** beyond the mapped set — grep sweep before
  claiming done (`is_demo`, `demo_readonly`, `demo_niche`, `demo_enter`,
  `DemoBanner`, `/demo`, `seed_all_demos`, `seed_demo_tenant`, `demo_redirect`,
  `DEMO_COACH_EMAIL`).
