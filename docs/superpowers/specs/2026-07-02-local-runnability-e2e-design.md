# Fully-local runnability + Playwright e2e suite — Design

**Date:** 2026-07-02
**Status:** Approved (user), pending implementation plan

## Goal

`make dev` boots a Contentor stack where every feature works locally with no
external accounts except Stripe test mode. `make e2e` runs a Playwright suite
covering all major user journeys; `make e2e-stripe` additionally runs real
Stripe test-mode payment flows.

## Current state (analysis summary)

Working locally today via `make dev` (Caddy on `localhost`, wildcard
`*.localhost` tenant subdomains): signup/onboarding, course creation, calendar,
announcements, mailbox, PWA (manifest + `sw.js` + VAPID), demo tenant seeder
(`seed_all_demos`), payments via the bypass provider.

Gaps:

| Feature | Gap |
|---|---|
| Media/S3 | Presigned URLs hit real Hetzner bucket; no local object store |
| Live class | `apps/live/stream_service.py` requires real GetStream keys; no fake |
| Payments | Dev `.env` holds LIVE Stripe keys (must become test keys); price IDs hard-coded via env |
| Email | Resend HTTP API only; e2e cannot read magic links / verification mail |
| Google OAuth | Real creds only; not automatable in e2e (accepted, out of scope) |
| E2E | No suite exists; only flowmap's crawler (`tools/flowmap/walk.js` has reusable per-role login logic) |

## Part A — Close local-runnability gaps

### A1. MinIO for S3
- New `minio` service in `docker-compose.yml` (dev only), bucket auto-created
  on startup, port 9000 published.
- Django talks to `minio:9000` internally; presigned URLs must be
  browser-reachable, so presigning uses a new "external endpoint" setting
  (`localhost:9000`) in `apps/core/storage.py`.
- Result: uploads, downloads, and course media work offline.

### A2. Fake Stream service for live classes
- New `LIVE_FAKE_ENABLED` setting: defaults to true in dev **when no GetStream
  key is set**; real keys take precedence when present.
- Fake twin of `stream_service.py` returns deterministic call IDs / tokens /
  user upserts, so create/list/join live class works up to the video canvas.

### A3. Stripe test mode (both payment layers)
- **Platform billing** (coach subscribes to Contentor, `StripeProvider`):
  test-mode `sk_test_`/`pk_test_` keys in `.env` (user supplies; live keys
  rotated out). New `seed_stripe_test` management command creates test-mode
  Products/Prices and persists their IDs, replacing hard-coded
  `STRIPE_PRICE_*` envs.
- **Marketplace** (student buys from coach, Stripe Connect `connect.py`):
  Express test accounts created **programmatically via the API** for seeded
  coach tenants (approved over driving Stripe's hosted onboarding UI).
- Webhooks via existing `make stripe-listen` (Stripe CLI).
- `BILLING_BYPASS_ENABLED=false` for Stripe runs; bypass remains the
  zero-config default for plain `make dev`.

### A4. Local email sink
- Dev-only email transport that stores outbound mail in the DB, plus a
  dev-only endpoint to fetch the latest message for a recipient.
- Enables e2e to complete magic-link login and signup verification without a
  real inbox. Production Resend path untouched.

### A5. Google OAuth
- Unchanged: optional real creds. E2E uses password / magic-link paths.

## Part B — Playwright e2e suite (`e2e/` top-level package)

- `e2e/playwright.config.ts`: baseURL `http://localhost`; two projects —
  `main` (marketing app on apex) and `customer` (tenant subdomains, e.g.
  `demo.localhost`).
- **Global setup:** health-check stack; `seed_plans` + dedicated deterministic
  e2e tenant (reusing `seed_demo_tenant` machinery); cached storage-state auth
  for coach / student / superadmin (login flow ported from flowmap `walk.js`).
- **Specs per feature:**
  - signup + onboarding → tenant creation
  - course creation (coach) + consumption (student)
  - calendar (public views + event detail)
  - live class create/join (fake mode)
  - media upload + download (MinIO)
  - announcements
  - mailbox
  - PWA: manifest validity, service-worker registration, offline page
  - website-builder pages
  - impersonation (superadmin→coach, coach→student)
- **`@stripe`-tagged specs:** coach subscription via real test Checkout
  (4242 card), marketplace purchase via Connect, webhook-driven state
  assertions. Auto-skipped when the Stripe listener isn't running.
- **Make targets:** `make e2e` (all-local, Stripe specs skipped),
  `make e2e-stripe` (requires listener + test keys, runs everything).

## Error handling / risks

- Working tree has uncommitted changes in signup/onboarding files (concurrent
  agent work). Build on top; never revert. Work on a feature branch, verifying
  branch + base before any commit (shared-working-tree convention).
- Stripe test keys are a hard external prerequisite the user must supply;
  everything else needs zero credentials.
- Presigned-URL dual-endpoint (internal vs browser) is the main MinIO
  gotcha — covered by A1's external-endpoint setting.
- Fake stream mode must never activate when real keys are configured, and
  must be impossible in prod settings.

## Testing

- Backend: unit tests for fake stream service, email sink, storage external
  endpoint, `seed_stripe_test` (mocked Stripe).
- E2E suite itself is the integration proof; each Part A gap gets at least one
  spec exercising it end-to-end.
- Verification gate: `make dev` clean boot + full `make e2e` green before
  claiming done.
