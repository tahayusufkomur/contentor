# Student PWA — Design Spec

**Date:** 2026-06-20
**Status:** Draft for review
**Scope owner:** frontend-customer (tenant subdomain app) + backend (push)

## Goal

Make each coach's tenant subdomain app installable to a phone home screen as its
own **branded** Progressive Web App for **students**, usable like a native app:
launches standalone, works (partially) offline, and can re-engage students via
push notifications. Each coach's install looks and feels like *"Coach X's app"*
(their logo, their name, their theme color).

This targets the **student-facing** experience (`/`, `/dashboard`, `/learn`,
`/courses`, `/live-classes`, `/orders`, `/store`, …), **not** the `/admin` coach
panel. The single exception is one small coach-admin surface added in Phase 3 (a
"Send announcement" broadcast composer).

## Scope

**In scope**
- Installable, branded PWA per tenant subdomain (manifest already exists; fix +
  extend it).
- Per-tenant app icons derived from each coach's uploaded logo.
- iOS install support (Safari ignores the manifest; needs apple meta + icon).
- Offline: instant app-shell load, runtime caching of already-viewed content
  (course lists, lesson text, PDFs/downloads), branded offline fallback. Video
  stays online-only.
- Web push for three app-level events: live-class reminder, new content
  published, coach broadcast.
- In-app install affordance (Android prompt + iOS "Add to Home Screen" hint).

**Out of scope (v1)**
- Full downloadable-for-offline courses / offline video.
- Background sync of student progress.
- Chat / video-call notifications — **owned by Stream.io's own push**, not our
  web push. We must not duplicate these.
- PWA treatment of the coach `/admin` panel beyond the broadcast composer.
- Push to coaches (this is student-facing).

## Current state

- `frontend-customer` — Next.js 14 App Router, Tailwind + Radix, `next-intl`
  (`en`, `tr`), served on tenant subdomains via Caddy catch-all.
- `src/app/manifest.ts` — **already exists**: a `force-dynamic`, per-tenant
  manifest (name/short_name = `brand_name`, `theme_color` from tenant theme,
  `display: standalone`, `start_url: "/"`). Next auto-injects
  `<link rel="manifest">`.
- **Gaps that make it non-installable today:**
  - `public/icons/` holds only `.gitkeep`; the manifest points at
    `icon-192/512.png` that **404** → install broken on Android/Chrome.
  - No maskable icon.
  - No iOS support in `src/app/layout.tsx` (no `apple-touch-icon`, no
    `apple-mobile-web-app-*`, no `theme-color`).
  - No `viewport-fit=cover` / safe-area handling.
  - No service worker (no `serwist`/`next-pwa` in deps) → no install prompt, no
    offline, no push transport.
  - No install affordance.
- Tenant config (`/api/v1/admin/config/`, typed `TenantConfig`) exposes
  `brand_name`, `theme`, `meta_description`, **`logo_url`** + **`logo_id`** (S3,
  re-signed on read) — enough for branded icons.
- Admin shell already has a `MobileHeader`; student pages' mobile-readiness is
  **unverified** and audited in Phase 1.
- Backend integration points (verified):
  - Live events: `apps/live/models.py` — `LiveClass`, `LiveStream`, `ZoomClass`,
    `OnsiteEvent`, each with `scheduled_at` + `duration_minutes`.
  - Content publish: `apps/courses/models.py` `is_published`.
  - Access/enrollment: `apps/core/access.py`.
  - Celery: `config/celery.py` (autodiscover; **no inline beat schedule yet**);
    `celery-beat` service runs in compose.
  - Students: `apps/accounts` `role="student"`, but students live **per-tenant**.

## Architecture decisions

1. **Serwist (`@serwist/next`)** for the service worker — maintained successor to
   `next-pwa`, first-class App Router support, and supports a **custom SW source**
   so precache + runtime caching helpers live alongside our own `push` /
   `notificationclick` handlers in one `src/app/sw.ts`. Disabled in dev.
2. **Per-tenant icons via a dynamic route** that composites the tenant `logo_url`
   onto a padded, theme-colored background using `next/og` `ImageResponse`,
   serving 192 / 512 / maskable / 180-apple variants, cache-busted by `logo_id`,
   with a generic Contentor fallback when no logo is set.
3. **Single platform-wide VAPID keypair** (not per-tenant). All tenants share the
   `contentor.app` backend; each subscription row is linked to `(tenant, student)`.
   Notification **branding comes from the payload** (title + tenant logo icon),
   not from VAPID. Simpler than per-tenant keys; identical UX.
4. **Per-origin SW = structural tenant isolation.** Each subdomain registers its
   own service worker with its own Cache Storage, so cross-tenant cache leakage is
   prevented by construction. We still only cache safe, non-user-specific GETs.
5. **Push subscriptions are per-tenant** → new `apps.notifications` **tenant app**
   (not `accounts`, which is SHARED).

## Phase 1 — Installable branded app

**Outcome:** Installs to home screen on Android + iOS with the coach's logo/name,
launches standalone, no offline behavior yet.

- **Icon route** `src/app/pwa-icon/route.ts`
  - Query: `?size=192|512|180` and `?purpose=any|maskable`.
  - Resolves tenant via existing header/slug helpers, fetches `logo_url`,
    renders via `ImageResponse`: background = theme color (or white), logo
    centered; `maskable` adds ~20% safe-zone padding.
  - No logo → generic Contentor mark.
  - `Cache-Control: public, max-age=86400, immutable`; URL carries `logo_id` (or
    a hash) so a logo change busts the cache.
- **Manifest** (`src/app/manifest.ts`) — point `icons` at the route; add a
  `maskable` entry; add `id`, `scope: "/"`, `orientation`, `categories`,
  `lang`. Keep `start_url: "/"`.
- **Layout metadata** (`src/app/layout.tsx`)
  - `generateViewport()` (async, per-tenant): `themeColor` from theme,
    `viewportFit: "cover"`.
  - `generateMetadata()`: add `appleWebApp: { capable: true, statusBarStyle,
    title: brand_name }` and `icons.apple` → icon route at 180.
- **Safe-area CSS** in `globals.css`: honor `env(safe-area-inset-*)` for the
  standalone shell (header/nav/bottom).
- **Install affordance** `components/shared/install-prompt.tsx` (client):
  - Android/desktop: capture `beforeinstallprompt`, show a dismissible
    "Install app" button; call `prompt()` on click.
  - iOS Safari (not standalone): show a one-time "Add to Home Screen" hint
    (Share → Add to Home Screen). Dismissal persisted in `localStorage`.
  - Hidden when already running standalone.
- **Mobile audit:** verify the key student routes are usable on a phone; fix
  obvious breakages (overflow, tap targets). Scoped to what's needed for "usable
  from the home screen," not a redesign.
- **i18n:** new strings → `messages/en.json`, `messages/tr.json`.

**Testing:** Lighthouse "installable" passes; `curl -H "Host: <tenant>"`
manifest returns tenant branding; icon route returns valid PNG with and without a
logo; apple/theme-color meta present in HTML; install button appears on Android,
hint on iOS, neither in standalone.

## Phase 2 — Offline

**Outcome:** App shell loads instantly; already-viewed content readable offline;
branded offline fallback for the rest. Video online-only.

- **Wire Serwist:** add `@serwist/next` + `serwist`; compose with the existing
  `withNextIntl` in `next.config.mjs`; `swSrc: "src/app/sw.ts"`,
  `swDest: "public/sw.js"`; `disable` in dev.
- **`src/app/sw.ts`:** Serwist instance with `defaultCache` plus explicit runtime
  caching rules:

  | Request | Strategy | Notes |
  |---|---|---|
  | Navigations (HTML) | NetworkFirst | Fallback to precached `/offline` on failure |
  | `/_next/static/*`, fonts | CacheFirst | Immutable build assets |
  | Public content GET `/api/v1/*` (catalog, lessons the student can view) | NetworkFirst, short TTL | **Skip** responses that are user-specific / carry `Set-Cookie` / `Cache-Control: private` |
  | Images & PDFs / downloads (S3) | StaleWhileRevalidate | Capped entries + max-age |
  | Video, auth, checkout, Stripe, Stream.io | **NetworkOnly** | Never cache |

- **Offline fallback:** precache an `/offline` route (branded, tenant theme).
- **Tenant/auth safety:** per-origin isolation (decision 4); additionally a
  denylist for auth/checkout/personal endpoints; only cache idempotent,
  non-private GETs.
- **Update UX:** on new SW, show a subtle "Update available — refresh" toast
  (sonner) rather than silent swap.

**Testing:** DevTools offline → shell + a previously-viewed lesson render;
uncached route shows the branded offline page; confirm Cache Storage scoped to
the subdomain; confirm auth'd/checkout responses are never served stale.

## Phase 3 — Web push

**Outcome:** Students opt in (post-install) and receive notifications for the three
events; coaches can broadcast.

### Backend — new `apps.notifications` (tenant app)
- **Model `PushSubscription`:** `user` (student FK), `endpoint` (unique),
  `p256dh`, `auth`, `user_agent`, `created_at`. Migration via `make
  makemigrations` + `migrate_schemas`.
- **VAPID:** one platform keypair in env (`VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); public key added to `.env.example` +
  `.env.prod.example`.
- **API (`/api/v1/notifications/`):**
  - `GET vapid-key/` → public key (AllowAny).
  - `POST subscribe/` / `POST unsubscribe/` → authenticated student;
    upsert/delete by endpoint.
- **Send service** (`pywebpush`): builds payload `{title, body, icon (tenant
  logo), badge, url, tag}`, sends per subscription, deletes on `404/410`. Runs in
  the correct tenant schema context.
- **Triggers** (each → a Celery task, tenant-aware):
  1. **Live-class reminder** — beat task (every 5 min) scans live events with
     `scheduled_at` in the next ~15 min not yet reminded; a `reminder_sent` flag
     dedupes; fan-out to eligible students (`apps/core/access.py`). Adds a beat
     schedule to `config/celery.py`, iterating tenants.
  2. **New content published** — hook on `Course.is_published` False→True (and
     new lessons) → fan-out to enrolled students.
  3. **Coach broadcast** — `POST /api/v1/admin/notifications/broadcast/`
     (owner/coach only) → fan-out custom message to all tenant students.

### Frontend
- **Opt-in** `components/shared/push-optin.tsx`: shown only when standalone
  (installed) and supported (iOS ≥ 16.4 gate). Soft prompt → on accept,
  `Notification.requestPermission()` → `pushManager.subscribe({ applicationServerKey })`
  → `POST subscribe/`. Dismissal persisted; settings toggle to opt out.
- **SW handlers** in `src/app/sw.ts`: `push` → `showNotification(...)` from
  payload; `notificationclick` → focus existing client or open `data.url`.
- **Coach broadcast UI** — minimal composer under `/admin` (e.g.
  `/admin/notifications`): message + send, owner/coach gated.
- **i18n:** opt-in + settings strings in `en`/`tr`.

**Testing:** backend unit tests — subscribe/unsubscribe; send service cleans up
`410`; each trigger targets the right students, builds the right payload, runs in
tenant context; reminder dedupe. Frontend manual — permission flow, receive +
click opens correct URL; verify Stream.io chat/call push not duplicated; iOS
gating correct.

## Cross-cutting concerns

- **Multi-tenancy:** icon route, manifest, push tasks all resolve the tenant from
  the request/schema; reuse existing tenant helpers; never assume a single
  tenant. Beat tasks iterate tenants explicitly.
- **Auth:** push endpoints use the default `TenantJWTAuthentication`; `vapid-key`
  is `AllowAny`.
- **i18n:** every new user-facing string lands in both `en` and `tr`.
- **Error handling:** icon route + send service degrade gracefully (fallback
  icon; drop dead subscriptions). SW never breaks navigation if caching fails.
- **Pre-commit:** must pass clean (ruff + prettier + secret scan); no secrets in
  committed env examples.

## Testing strategy

- Phase 1 & 2 are largely verified in-browser (Lighthouse, DevTools offline,
  per-tenant `curl`) plus `make dev` smoke.
- Phase 3 backend gets pytest coverage (models, API, send service, triggers,
  tenant context, dedupe). Frontend push is verified manually on real devices
  (Android Chrome + installed iOS PWA).
- Each phase ends with `make dev` verification before "done" (per CLAUDE.md).

## Rollout & sequencing

- **Three independent implementation plans**, one per phase; each ships on its
  own. Phase 2 depends on Phase 1; Phase 3 depends on Phase 2 (needs the SW).
- **Subagent-driven implementation:** each plan is decomposed into discrete,
  independently-verifiable tasks dispatched to subagents.
- Phase 3 is the heaviest (backend + frontend + admin surface); it may itself
  split into 3a (subscription plumbing + opt-in) and 3b (triggers + broadcast)
  during planning.

## Risks / open questions

- **iOS push** only works once installed (Safari ≥ 16.4) → opt-in must be
  post-install; messaging must set expectations.
- **Serwist × next-intl** config composition needs care (both wrap
  `next.config`).
- **`ImageResponse` fetching signed S3 logos** adds latency → rely on the icon
  cache; consider a tiny in-memory/edge cache.
- **Beat tenant iteration** cost + reminder dedupe correctness at scale.
- **Order push vs existing email** — confirm we want both or push is redundant
  (cheap to drop trigger #3 if so).
- **Mobile-readiness of student pages** — Phase 1 audit may surface more UI work
  than expected; keep fixes scoped.
