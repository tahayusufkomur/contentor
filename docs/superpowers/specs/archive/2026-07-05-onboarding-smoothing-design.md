# Onboarding Smoothing — Design

**Date:** 2026-07-05
**Status:** approved (analysis + both design decisions confirmed with user)
**Scope:** signup handoff (frontend-main + apps.core.onboarding), setup guide (frontend-customer /admin + apps.core), questionnaire template (frontend-main + demo_data), monetization nudges (frontend-customer forms)
**Analysis:** delivered in-session 2026-07-05 (funnel map + friction list F1–F8)

## Problem

The coach funnel delivers a strong aha (niche-seeded site) but breaks right after:
the post-provision CTA drops the coach **unauthenticated** onto their **unpublished**
site's "Coming soon" lock screen (F1), then requires a second email round-trip.
After that, nothing tells the coach what remains before going live (F2/F3), skipping
the template yields a blank-slate site (F4), and a Free coach can price content that
students can't actually buy, with no warning (F5).

## Goals (this package)

1. **Auto-login handoff** — one email total; the "Open your studio" click lands the
   coach authenticated on their own site with the edit sidebar open.
2. **Setup Guide** — a state-driven checklist on `/admin` so the coach always knows
   the remaining steps to go live.
3. **No blank slate** — every tenant seeds a real-looking template; "Skip" is
   replaced by a "Something else" niche.
4. **Monetization nudge** — pricing fields warn when students can't purchase yet.

Non-goals: lifecycle emails, guided builder tours, changes to publish/preview
mechanics, `admin/stats` endpoint (pre-existing stub, untouched).

## Design decisions (locked with user)

- First landing after handoff = **coach's public site in edit mode** (the current
  first-run auto-open), NOT /admin. The edit sidebar gains a **"Continue setup →"**
  affordance linking to `/admin` so the guide is one click away.
- **"Skip" is removed** from the questionnaire; an 8th tile **"Something else"**
  (key `general`) seeds a neutral general-coaching template. The `skip_template`
  API endpoint stays (back-compat) but the UI no longer offers it.

## A. Auto-login handoff

**Backend** — new endpoint in `apps/core/onboarding/`:

- `POST /api/v1/onboarding/handoff/` `{token}` (AllowAny, same
  `_resolve_tenant_from_signup_token` guard as seed/skip — the signup token IS the
  email-ownership proof).
- Guards: tenant `provisioning_status == "ready"`, else 409. Token invalid/expired
  → 400 (same as sibling endpoints).
- Mints a magic-link token for the owner:
  `create_magic_link_token(email=tenant.owner_email, tenant_schema=tenant.schema_name, tenant_slug=tenant.slug)`
  (existing 15-min expiry machinery, consumed by the tenant's existing
  `/callback` → `/api/auth/verify` flow — no new auth code).
- Returns `{"login_url": "{SITE_SCHEME}://{fqdn}/callback?token=...&next=/"}` —
  scheme from `settings.SITE_SCHEME` (fixes the hardcoded `http://`, F8). The
  callback's default redirect is `/`; `next` is passed for future-proofing but the
  current callback may ignore it (acceptable — `/` is the desired landing).

**Frontend** (`frontend-main` verify page, `ready` state):

- On entering `ready`, call handoff with the signup token; CTA button uses
  `login_url` when available. If handoff fails (expired token — e.g. user returned
  a day later), **fall back to the current plain domain link** — the lock screen +
  "Site owner? Log in" path remains the safety net.
- CTA copy stays "Open {domain}".

**Edit sidebar** (`frontend-customer/src/components/owner/edit-sidebar.tsx`):

- In first-run mode (`!onboarding_completed`), add a visible **"Continue setup →"**
  button (links `/admin`) so leaving the builder leads to the guide, not a dead end.

## B. Setup Guide

**Backend** — `GET/PATCH /api/v1/admin/setup-status/` (tenant-scoped,
`IsCoachOrOwner`), new module `apps/core/setup.py` + route:

```json
{
  "site_customized": TenantConfig.onboarding_completed,
  "has_content": Course.exists() OR Download.exists(),
  "payments_ready": can_monetize(tenant),          // apps.core.monetization
  "published": tenant.is_published,
  "dismissed": TenantConfig.setup_guide_dismissed  // new field
}
```

- `PATCH {"dismissed": bool}` toggles the flag.
- New `TenantConfig.setup_guide_dismissed = BooleanField(default=False)` —
  **tenant migration** (auto-applies via entrypoint `--tenant`).
- Note: `seed_template._CONFIG_SKIP_KEYS` excludes `onboarding_completed` from
  template CONFIG, so ALL new tenants (seeded or general) start with it False —
  the first-run auto-open and guide step 1 behave identically for everyone.

**Frontend** — `SetupGuideCard` at the top of `/admin` dashboard (above
PublishCard):

- 4 steps, each: icon, title, one-line description, deep link, done-check state.
  1. **Make it yours** → `/` (site opens; first-run sidebar auto-opens while
     incomplete — no extra wiring needed)
  2. **Add your first course or download** → `/admin/courses/new`
  3. **Set up how you get paid** → `/admin/payouts`
  4. **Publish your site** → scrolls/points to PublishCard (`#publish-card`
     anchor id on the existing card)
- Progress line "X of 4 done" + thin progress bar. All-done → celebration state
  (one-time confetti-free "You're live 🎉" row) then the card hides itself
  (auto-PATCH dismissed=true).
- Dismiss ✕ → PATCH dismissed=true; a small "Setup guide" text link in the
  dashboard header un-dismisses (PATCH false). Hidden entirely when dismissed.
- While `setup-status` fetch is loading → skeleton row; on error → render nothing
  (dashboard stays usable).

## C. "Something else" template

- New `backend/apps/core/management/commands/demo_data/general.py` — same module
  shape as `yoga.py` (`TENANT`, `CONFIG`, courses/downloads content), neutral
  coaching copy: welcoming hero, about section, 2 starter courses (e.g. "Welcome —
  Start Here", "Your First Program") with placeholder lessons, 1 sample download.
  Theme: a neutral default. `available_niches()` auto-discovers it.
- Questionnaire (`QuestionnaireStep.tsx`): add tile
  `{ key: "general", Icon: Sparkles }` after the 7 niches; **remove the Skip
  button** and its `skipTemplate` call from the UI (API endpoint remains).
- i18n: add `general` niche label ("Something else") to frontend-main message
  catalogs (en + tr).

## D. Monetization nudge

- Shared `frontend-customer` component `MonetizeNudge`: fetches
  `/api/v1/billing/connect/status/` once on mount (silently no-ops on error);
  renders nothing when `can_monetize` or when the price is empty/0.
- Rendered under the price input in the course form and the download form when
  `price > 0 && !can_monetize`: amber info row — "Students can't purchase yet —
  set up payouts to start selling." → link `/admin/payouts`.
- Exact form file locations resolved at plan time.

## Error handling

- Handoff: any failure → frontend silently falls back to the plain site link
  (current behavior). Endpoint never leaks whether an email/tenant exists beyond
  what verify already does (same token guard).
- Setup-status: read-only aggregation; each boolean from cheap queries
  (`exists()`), connect status may hit Stripe-cached status — reuse the same code
  path the payouts page uses (no extra Stripe calls beyond current behavior).
- MonetizeNudge and SetupGuideCard both fail-soft (render nothing).

## Testing

- Backend: handoff (valid → login_url shape + scheme, not-ready → 409, bad token
  → 400); setup-status (each boolean flips with state; PATCH dismiss); general
  template seeds (niche available, seed populates courses).
- Frontend: typecheck + build; dev-stack browser run of the FULL signup funnel
  (new tenant, "Something else" path): signup → verify → questionnaire →
  ready → **single-click authenticated landing** → edit sidebar → Continue setup
  → guide states flip as steps complete.

## Rollout

- 1 tenant migration (`setup_guide_dismissed`) — entrypoint auto-applies.
- No worker/DNS changes. Frontend-main AND frontend-customer both rebuilt.
- Ships with the existing ~22-commit pending deploy batch.
