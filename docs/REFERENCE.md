# Contentor — Reference

> The single source of truth for understanding Contentor. Pairs with [GLOSSARY.md](GLOSSARY.md)
> (terminology) and [../CLAUDE.md](../CLAUDE.md) (operational commands & rules).
>
> **Status of this doc:** current state is verified against the code (June 2026).
> Anything about the future is marked **(inferred)** where it comes from reading the
> code/specs rather than a confirmed decision — see [§16 Open questions](#16-open-questions).

---

## 1. What Contentor is

**Contentor is a multi-tenant SaaS that lets a "coach" (a content creator) sign up,
get their own branded subdomain, and sell courses, downloadable resources, and live
sessions to their "students" — and market to them by email.**

Think "Kajabi / Teachable / Podia", built for two markets at once (a global English
market and a Turkish market), self-hosted on a home server.

Every coach is a **tenant**: a fully isolated PostgreSQL schema with its own content,
students, branding, and billing. One Django backend + two Next.js frontends serve all
tenants; the tenant is resolved per-request from the hostname.

### The three roles

| Role | Who | Where they live | Notes |
|---|---|---|---|
| **Superadmin** | The platform owner (you) | `public` schema, `is_superuser` | Manages tenants, plans, platform billing via Django admin + `frontend-main/admin`. |
| **Coach** | The tenant owner — a paying customer | `public` schema (`role=coach`) **and** their tenant schema (`role=owner`, `is_staff`) | Exists in *both* schemas. Runs their site from `frontend-customer/admin`. |
| **Student** | An end user inside one tenant | That tenant's schema only (`role=student`) | Created on first magic-link / Google login. Consumes content. |

### Two "products" inside one platform

There are **two distinct subscription concepts** — keep them straight, they are the
single most common source of confusion:

1. **Coach → Platform** (`PlatformSubscription`, public schema): the coach pays
   Contentor monthly for a plan (Free / Starter / Pro). **Live today** via Stripe.
2. **Student → Coach** (`Subscription` / `Payment`, tenant schema): a student pays a
   coach for access to content. Models exist; **real money collection is not built yet**
   (the marketplace milestone — see [§15](#15-roadmap-inferred)).

---

## 2. Tech stack & topology

**Backend:** Django 5.1 + Django REST Framework, `django-tenants` (schema-per-tenant),
Celery (worker + beat) on Redis, Daphne/Channels for WebSockets, Gunicorn for HTTP.

**Frontends:** two independent Next.js 14 (App Router) apps — `frontend-main` and
`frontend-customer` — Tailwind + Radix UI, `next-intl` for i18n.

**Data:** PostgreSQL 17, Redis 7 (cache + Celery broker), Hetzner S3-compatible object
storage (`contentor-prod` bucket) via boto3.

**Edge:** a single Caddy edge container in both dev and prod; prod is fronted by a shared
Cloudflare Tunnel. TLS terminates at Cloudflare.

```
                          ┌─────────────── Browser (tenant subdomain or apex) ───────────────┐
                          │                                                                   │
                  Cloudflare edge (TLS)                                                       │
                          │ cloudflared (HTTP)                                                │
                  ┌───────▼────────┐                                                          │
                  │     Caddy      │  Caddyfile routes by host + path (both dev and prod)     │
                  └───┬────────┬───┘                                                          │
       /api,/static,apex/admin     │        apex + tr. │        every other host (tenants)    │
                  ┌───▼───┐    ┌───▼─────────┐    ┌────▼──────────────┐                       │
                  │Django │    │ nextjs-main │    │ nextjs-customer    │◄──── SSR fetch ───────┘
                  │       │    │ (marketing) │    │ (tenant portal)    │   (sends X-Tenant-Domain)
                  └───┬───┘    └─────────────┘    └────────────────────┘
        ┌─────────────┼───────────────┐
   ┌────▼───┐   ┌──────▼─────┐   ┌─────▼──────┐
   │Postgres│   │   Redis    │   │ Celery     │
   │  (17)  │   │ cache+broker│  │ worker+beat│
   └────────┘   └────────────┘   └────────────┘
```

**Services** (`docker-compose.yml` dev / `docker-compose.prod.yml` prod):
`caddy`, `postgres`, `redis`, `django` (Gunicorn :8000), `nextjs-main` (:3000),
`nextjs-customer` (:3000), `celery-worker`, `celery-beat`. Dev adds an optional
`--profile monitoring` (Prometheus, Grafana, Loki, cAdvisor).

> **Path note:** the canonical repo is `~/ws/projects-in-progress/contentor`. It is
> symlinked into the fleet at `~/ws/projects-active/home-server/contentor`. Both point
> at the same files.

---

## 3. Multi-tenancy & regions — the core mental model

This is the heart of the system. Internalize it before changing anything.

### Schema-per-tenant

- `SHARED_APPS` live in the **`public`** schema: `django_tenants`, Django contrib,
  `rest_framework`, `corsheaders`, **`apps.core`** (tenants/plans/billing-platform/
  middleware/routers/access), **`apps.accounts`** (the `User` model + auth).
- `TENANT_APPS` live in **per-tenant schemas**: `apps.tenant_config`, `apps.courses`,
  `apps.downloads`, `apps.live`, `apps.media`, `apps.billing`, `apps.email_campaigns`
  (plus contrib + `accounts` for isolation).
- `apps.core.routers.TenantRouter` + `django_tenants.routers.TenantSyncRouter` keep
  tenant-only tables out of `public`.
- `Tenant.auto_create_schema = False` — schemas are created **manually** during async
  provisioning, not on model save.

### Regions

Two regions, set at signup and **immutable**: `global` and `tr`.

| | Domain shape | Schema name | Default locale | Default currency |
|---|---|---|---|---|
| **global** | `slug.contentor.app` | `slug` | `en` | `USD` |
| **tr** | `slug.tr.contentor.app` | `tr_slug` | `tr` | `TRY` |

The `tr_` schema prefix means the *same* brand slug can exist independently in both
regions. `User` uniqueness is **`(email, region)`** — the same person can be a coach in
both regions as two separate `User` rows.

### How the tenant is resolved per request

Middleware order (`config/settings/base.py`):
`RegionResolverMiddleware` → `HeaderAwareTenantMiddleware` → `DemoReadOnlyMiddleware` → …
→ `TenantRateLimitMiddleware`.

1. **`RegionResolverMiddleware`** parses the host (via `apps.core.region_utils.resolve_host`)
   into `request.region`, `request.tenant_slug`, `request.host_locale`.
2. **`HeaderAwareTenantMiddleware`** picks the schema:
   - **`X-Tenant-Domain` header first** (set by Next.js SSR), then fall back to the
     `Host` header (browser requests). *Why:* Node's `undici` silently drops a custom
     `Host`, so SSR `fetch` to `http://django:8000` would otherwise resolve to `public`.
   - **`/api/webhooks/*` forces `public`** and skips tenant resolution (Stripe hits the
     apex with no tenant context; the handler resolves the tenant from
     `metadata.tenant_id`).
3. **`DemoReadOnlyMiddleware`** rejects mutating requests on demo tenants (`is_demo=True`)
   unless the path is under `/api/v1/demo/*`.

**Key gotcha:** in Next.js, build the tenant domain from the slug
(`${slug}.${BASE_DOMAIN}`) inside `generateMetadata` / `manifest.ts` — `getTenantDomain()`
returns empty there.

---

## 4. Domain model

Notation: **[P]** = public schema, **[T]** = per-tenant schema. FKs to `User` from tenant
models point at the shared `accounts.User` table.

### 4.1 Public schema (`apps.core`, `apps.accounts`)

- **`User`** [P] (`apps/accounts/models.py`) — platform user. Unique on `(email, region)`.
  `role ∈ {owner, coach, student}`, `region ∈ {global, tr}`, `preferred_locale`,
  `accessible_regions` (superadmin admin scoping), `payment_customer_id`, `is_staff`,
  `is_superuser`. Custom `UserManager`, email is the username field.
- **`Tenant`** [P] (`apps/core/models.py`, extends `TenantMixin`) — one row per coach
  site. `slug` (unique, validated against `RESERVED_SLUGS`), `schema_name`, `region`
  (immutable), `billing_currency` (locked at first checkout), `plan` → `PlatformPlan`,
  `subdomain`, `stripe_account_id` (Connect — for future marketplace payouts),
  `iyzico_submerchant_id` (future), `provisioning_status ∈ {pending, provisioning, ready,
  failed}`, `is_demo`, `template_niche`, `template_goals`, `template_seed_status ∈
  {pending, seeding, ready, skipped, failed}`. Property `is_subscription_active` →
  True iff a `PlatformSubscription` exists with status in `{active, past_due}`.
- **`Domain`** [P] (extends `DomainMixin`) — maps an FQDN to a tenant; `ssl_status ∈
  {pending, active, error}`.
- **`PlatformPlan`** [P] — coach-facing plan (Free/Starter/Pro). Quotas:
  `max_students`, `max_storage_gb`, `max_streaming_hours`, `max_campaign_emails`;
  `transaction_fee_pct` (platform's cut of student payments — used by the future
  marketplace); `is_live_enabled`; `prices` JSONB `{ "USD": {amount_cents, stripe_price_id},
  "TRY": {…} }`. `get_price(currency)` and `is_free` helpers.
- **`PlatformSubscription`** [P] — the coach→platform subscription. OneToOne to `Tenant`,
  FK to `User` + `PlatformPlan`. `status ∈ {incomplete, active, past_due, canceled}`,
  `provider ∈ {stripe, bypass}`, Stripe ids, period fields, `cancel_at_period_end`.
- **`TenantUsage`** [P] — monthly metering rollup `(tenant, month)`: `student_count`,
  `storage_bytes`, `streaming_minutes`, `emails_sent`.
- **`WebhookEvent`** [P] — idempotency record, unique `(provider, provider_event_id)`.

### 4.2 Content (`apps.courses`, `apps.downloads`, `apps.media`)

- **`Course`** [T] → `Module` [T] → `Lesson` [T] (the content tree). `Course` has
  `instructor`, `slug`, `pricing_type ∈ {free, paid}`, `price`, `is_published`, thumbnail.
- **`Video`** [T] — reusable S3 asset (`s3_key`, duration, size). Referenced by `Lesson`,
  and by `LiveClass`/`LiveStream` as a recording.
- **`Enrollment`** [T] — student↔course access, unique `(user, course)`, denormalized
  `payment_id`.
- **`Progress`** [T] — per-`(user, lesson)` `watched_seconds` + `completed`.
- **`DownloadFile`** [T] — a sellable/free downloadable (`file_url`, `pricing_type`, `price`).
- **`Photo`** [T] (`apps.media`) — image asset (UUID pk, `s3_key`); thumbnails for
  courses/videos/live events/branding.

### 4.3 Live (`apps.live`)

All four share `_EventStatusMixin` (computes `draft → scheduled → live/ongoing → ended`
from `scheduled_at` + `duration_minutes`):

- **`LiveClass`** [T] — interactive Stream.io call (1:N video + chat); auto-generated
  unique `room_name`; optional `recording` → `Video`, `auto_recording`.
- **`LiveStream`** [T] — one-way Stream.io broadcast.
- **`ZoomClass`** [T] — external Zoom meeting (`zoom_link`, `zoom_meeting_id`); no SDK.
- **`OnsiteEvent`** [T] — in-person event (`location`, `address`, `max_capacity`).

### 4.4 Billing (`apps.billing` — tenant-scoped, student↔coach)

> Models live in `apps/billing/models/core.py` (there is no top-level `billing/models.py`).

- **`SubscriptionPlan`** [T] — a coach-defined membership tier (name, price, currency).
- **`SubscriptionPlanAccess`** [T] — GenericFK junction granting a plan access to any
  content item. **This is the mechanism behind dual-access pricing.**
- **`Subscription`** [T] — student↔plan, `status ∈ {active, past_due, expired}`, supports
  `pending_plan` (change at next cycle).
- **`Payment`** [T] — a transaction. `payment_type ∈ {one_time, subscription, refund}`,
  `status ∈ {pending, completed, failed, refunded, partially_refunded}`, `provider ∈
  {iyzico, stripe, bypass}`, `platform_fee`, `submerchant_payout`, `original_payment`
  (refund link), and a **cross-schema** `platform_subscription` FK
  (`db_constraint=False`).
- **`PaymentItem`** [T] — line item (GenericFK to the purchased content).
- **`Bundle`** / **`BundleItem`** [T] — a discounted grouping of content (GenericFK items).

### 4.5 Email & config

- **`EmailCampaign`** [T] / **`CampaignRecipient`** [T] (`apps.email_campaigns`) —
  a campaign references a MailCraft `template_id`, a `recipient_filter` JSON, and tracks
  per-recipient delivery. `CampaignStatus ∈ {sending, sent, partial, failed}`.
- **`TenantConfig`** [T] (`apps.tenant_config`) — singleton per tenant: `brand_name`,
  `logo`, `theme ∈ {ocean, ember, forest, sunset, violet, slate}`, `dark_mode_enabled`,
  `font_family`, `custom_css`, `enabled_modules`, `navbar_config`, `landing_sections`,
  `default_locale`, `onboarding_completed`, `emailcraft_api_key`, plus per-tenant Zoom
  OAuth (`zoom_refresh_token` encrypted, `zoom_connected`, `zoom_connected_email`).

### 4.6 Relationship sketch

```
[public]  User(email,region)──< PlatformSubscription >──Tenant──> PlatformPlan
                                                          │ 1:N
                                                          └──< Domain
[tenant]  Course──< Module──< Lesson >──Video        SubscriptionPlan──< SubscriptionPlanAccess ─(GenericFK)→ any content
            │         │                               Subscription >──student(User)
            └──< Enrollment >──student(User)          Payment──< PaymentItem ─(GenericFK)→ any content
            └──< Progress                             Bundle──< BundleItem ─(GenericFK)→ any content
          LiveClass / LiveStream / ZoomClass / OnsiteEvent ──> Photo (thumbnail)
          EmailCampaign──< CampaignRecipient
          TenantConfig (1 per schema)
```

---

## 5. Authentication & authorization

JWT-based, no Django sessions for the API. Token in the **`contentor_access_token`**
httpOnly cookie (also accepted as `Authorization: Bearer`).

- **JWT claims** (`apps/accounts/tokens.py`): `user_id`, `tenant_id` (= schema name),
  `role`, `region`, `exp` (7 days), `iat`. HS256 with `SECRET_KEY`.
- **`TenantJWTAuthentication`** is the **default DRF auth class**. It verifies the token,
  checks `tenant_id == connection.tenant.schema_name`, and **rejects cross-region tokens**
  (`CrossRegionRejection` → the Next.js middleware 302-redirects to the correct apex).
- **`AdminJWTBackend`** lets a valid `is_staff` JWT log into Django admin passwordlessly.

> **Critical rule:** because `TenantJWTAuthentication` is the *default*, any public
> endpoint (magic-link, OAuth, signup, webhooks) **must** set `@authentication_classes([])`.
> `AllowAny` alone is not enough — the auth class still runs and can reject the request.

### Auth flows

- **Magic link (students):** `POST /api/v1/.../magic-link-request/` (mints a 15-min token,
  emails a `/callback?token=…` link) → `POST /…/magic-link-verify/` (creates the `User`
  as `role=student` in the tenant schema if new, sets the cookie). Demo tenants get the
  callback URL directly instead of an email.
- **Google OAuth:** `…/google-login/` returns a signed-state Google URL → `…/google-callback/`
  exchanges the code, resolves the tenant from the signed state, creates/gets the user,
  redirects to `origin/callback?token=…`.
- **Coach signup → tenant provisioning:** see [§8](#8-onboarding--provisioning).

### Permissions

`apps/core/permissions.py`: `IsOwner`, `IsCoachOrOwner`, `IsSuperUser`. Default permission
is `IsAuthenticated`; public views override with `AllowAny`.

---

## 6. Content access — dual-access pricing

A coach can make any **paid** item available *both* as a one-off purchase *and* via a
subscription plan. `pricing_type` is only `{free, paid}`; subscription access is a
separate, additive link via `SubscriptionPlanAccess`.

`apps.core.access.ContentAccessService.get_access_info(user, content)` resolves access in
this order and returns an `AccessInfo`:

1. **owner/coach** → always allowed (`access_reason="owner"`)
2. **free** content → allowed
3. **direct purchase** → a completed `PaymentItem` for this content
4. **bundle** → owned via a `BundleItem`
5. **active subscription** → an `active` `Subscription` whose plan links the content
6. otherwise **no access**, with `unlock_methods`:
   - `["purchase"]` if paid and not in any plan
   - `["purchase", "subscribe"]` if paid and linked to ≥1 plan

`bulk_check_access` batches these queries to avoid N+1 in list endpoints.

---

## 7. Billing in depth

### 7.1 Coach → Platform (live today)

- **Plans:** Free / Starter / Pro. **Pricing is code-controlled today:** amounts live in
  `seed_plans.py` (`PLAN_AMOUNTS`) → Stripe Prices auto-provisioned per currency (env
  `STRIPE_PRICE_*` are optional pins). The main app's superadmin `/admin/plans` page is
  **read-only** (`GET /api/v1/platform/plans/`), so changing a price today means editing
  code + re-deploy. Making this **editable from the superadmin panel** is a confirmed
  requirement — see §15.
- **One European Stripe account** serves both currencies; `Tenant.billing_currency`
  selects the right `stripe_price_id` from `PlatformPlan.prices`.
- **Provider abstraction:** `apps/billing/providers/` — `PaymentProvider` ABC,
  `StripeProvider`, and a `BypassProvider` (dev, gated by `BILLING_BYPASS_ENABLED`;
  **prod refuses to boot if bypass is true**).
- **Endpoints:** `/api/v1/billing/platform/checkout/`, `/subscription/`, `/cancel/`,
  `/portal/`, `/invoices/`. **Webhooks:** `POST /api/webhooks/stripe/` — public schema,
  unauthenticated, signature-verified, idempotent via `WebhookEvent`.
- **Lifecycle:** `incomplete → active → past_due → canceled`; a daily Celery-beat
  `cleanup_past_due_subscriptions` downgrades stale `past_due` tenants to Free after
  `PAST_DUE_GRACE_DAYS`.

### 7.2 Quotas

`apps/core/quotas.py` defines `enforce_max_students` / `…_storage_gb` / `…_streaming_hours`
/ `…_campaign_emails`, plus `SubscriptionInactive` / `QuotaExceeded` exceptions.
**Today these are log-only (Phase 0).** Phase 3 wires them into the write paths and
returns HTTP **402** (`QUOTA_EXCEEDED` / `SUBSCRIPTION_INACTIVE`). See [§15](#15-roadmap-inferred).

### 7.3 Student → Coach (the M2 marketplace — confirmed, not yet built)

The tenant-scoped `Subscription` / `Payment` / `Bundle` models and the `iyzico` provider
choice exist; `Tenant.stripe_account_id` / `iyzico_submerchant_id` are the reserved
submerchant handles. The confirmed M2 design: **iyzico submerchants for TR, Stripe Connect
for global**, with the **coach as merchant of record** — funds settle to the coach's
connected/submerchant account and the platform automatically takes `transaction_fee_pct`
(recorded in `submerchant_payout`). The collection flow itself is not built yet.

---

## 8. Onboarding & provisioning

1. `POST /api/v1/onboarding/signup/` `{email, name, brand_name}` → validates, derives a
   slug, checks per-region uniqueness, mints a 15-min **signup token**, emails verification.
2. `POST /api/v1/onboarding/signup/verify/` `{token}` → creates the **`Tenant`** + **`Domain`**
   rows in `public` with `provisioning_status="pending"`. *Schema not yet created.*
3. The coach answers a **niche questionnaire** and either:
   - `POST /api/v1/onboarding/seed-from-template/` `{token, niche, goals}` → records the
     niche, sets `template_seed_status="seeding"`, enqueues `provision_tenant.delay(…, niche)`; or
   - `POST /api/v1/onboarding/skip-template/` → `template_seed_status="skipped"`, provisions
     without seeding.
4. **`provision_tenant`** Celery task (`apps/core/tasks.py`): marks `provisioning`, calls
   `create_schema()` (runs migrations), creates the coach `User` in `public` (`role=coach`)
   and the owner `User` + `TenantConfig` in the tenant schema (`role=owner`, `is_staff`),
   optionally seeds the niche template **as drafts**, then marks `ready`. Retries up to 3×.
5. Frontend polls `GET /api/v1/onboarding/status/?slug=…` until `ready`.

**Niche templates** live under `apps/core/management/commands/demo_data/<niche>.py`
(each exposes `TENANT`, `CONFIG`, `COURSES`, `DOWNLOADS`, `SUBSCRIPTION_PLANS`, `BUNDLES`,
live events…). `seed_template_into_tenant` merges config and creates content as unpublished
drafts so the coach reviews before going live. `available_niches()` auto-discovers them.

---

## 9. Integrations

| Integration | Purpose | Where | Key env |
|---|---|---|---|
| **Stream.io** | Live video + chat (LiveClass interactive, LiveStream broadcast); per-user JWTs; auto-recording | `apps/live/stream_service.py` | `GETSTREAM_API_KEY`, `GETSTREAM_API_SECRET`, `NEXT_PUBLIC_GETSTREAM_API_KEY` |
| **Zoom OAuth** | Per-tenant Zoom connection; refresh token (Fernet-encrypted) on `TenantConfig`; access token cached `tenant:{schema}:zoom_access_token` | `apps/live/urls_zoom.py`, views | `ZOOM_TOKEN_ENCRYPTION_KEY` (+ a single shared Zoom marketplace app) |
| **MailCraft** | Sibling email-builder SaaS (`mailcraft.contentor.app`); coaches design templates in an embedded iframe; campaigns render per-recipient via its `/render` API | `apps/email_campaigns/emailcraft_client.py`, `django-contentor-email-builder` | `EMAILCRAFT_BASE_URL`, `EMAILCRAFT_TOKEN`, per-tenant `emailcraft_api_key` (`mc_live_*`) |
| **Resend** | Transactional + campaign email delivery | `apps/core/email.py` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| **S3 / Hetzner** | Media storage; presigned single-PUT + multipart uploads; path `tenants/{slug}/{category}/…` | `apps/core/storage.py`, `views_upload.py`, `views_multipart.py` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_ENDPOINT`, `AWS_PRESIGNED_EXPIRY` |
| **Stripe** | Coach→platform billing (see §7) | `apps/billing/providers/stripe_provider.py` | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` |
| **Google OAuth** | Social login | `apps/accounts/views.py` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |

---

## 10. Frontend architecture

Two App-Router apps. Both: `next-intl`, host-based locale (no `/en/` URL prefix),
Tailwind, Radix, `sonner` toasts, JWT in the `contentor_access_token` cookie, and a
`next.config` rewrite of `/api/v1/*` to Django so the browser needs no CORS.

### `frontend-main` — the **main app** (apex + superadmin)

> "Main app" = where coaches register/log in and where the superadmin runs the platform.


- Routes: `/`, `/pricing`, `/demo`, `(auth)/{signup,signup/verify,login,callback}`,
  `/dashboard`, `/admin/{tenants,tenants/[slug],plans,billing,settings,health}`.
- Routed on `Host(contentor.app)` / `Host(tr.contentor.app)` (and `localhost`/`tr.localhost`).
- Apex-only — **no** `X-Tenant-Domain`; talks to the `public` schema.
- House design system: OKLCH tokens, 7 themes (light/matte/graphite·/midnight/dark),
  Geist fonts. (See the `house-design-system` skill.)
- API helpers in `src/lib/api/` (`billing-platform.ts`, `onboarding.ts`); cookie name +
  `DJANGO_API_URL` in `src/lib/constants.ts`.

### `frontend-customer` — the **coach app** (tenant portal + coach admin)

> "Coach app" = where each coach's own site runs (storefront + student portal + their admin).


- Route groups: `(public)` (home, courses, plans, store, calendar, faq, about),
  `(auth)`, `(student)` (dashboard, learn/[slug], live-classes, checkout), `/live/[id]`,
  and `/admin/*` (courses, billing+bundles, downloads, videos, photos, live, email,
  students, pages, design, settings).
- Routed via the wildcard catch-all (every non-apex host).
- **`src/middleware.ts`** extracts the tenant slug from the subdomain and sets
  `x-tenant-slug` + `x-tenant-domain` headers (dev override via `x-dev-tenant`).
- **`src/lib/api-server.ts`** `serverFetch` attaches the JWT + **`X-Tenant-Domain`** on
  every SSR call (the multi-tenancy linchpin); `src/lib/api-client.ts` `clientFetch` uses
  same-origin cookies and special-cases demo read-only `403`s into a sign-up toast.
- **Theming is per-tenant:** `TenantConfig` (theme/font/custom_css) → `src/lib/themes.ts`
  `generateThemeCSS()` → injected via `TenantThemeStyle`; config cached ~60s by domain.
- Adds Stream.io SDKs (`@stream-io/video-react-sdk`, `stream-chat`).

---

## 11. Infrastructure & deployment

### Dev

`make dev` (compose up --build, hot-reload). Caddy (parametrized `Caddyfile`, `CONTENTOR_DOMAIN=localhost`) routes `/api/v1`, `/api/health`,
`/api/webhooks` and `/static/*` → Django; apex + `tr.localhost` → `nextjs-main`; every other host (tenant subdomains) → `nextjs-customer`.
Useful: `make dev-reset`, `make migrate` / `make migrate-shared` / `make makemigrations`,
`make seed`, `make test`, `make lint`, `make format`, `make shell`, `make health-check`.
(Full list: `make help`.)

### Prod (home server)

- Self-contained `docker-compose.prod.yml` (NOT an override) running
  `config.settings.prod`. One `contentor-caddy` edge container on the external `edge`
  network; everything else internal with **no published host ports**.
- The parametrized `Caddyfile` does all routing: `/api/*`, `/static/*`, apex
  `/django-admin/*` → Django; apex + `tr.` → `nextjs-main`; every other host → `nextjs-customer`.
- TLS at Cloudflare; cloudflared→Caddy→Django is HTTP, Caddy forces
  `X-Forwarded-Proto: https`; WhiteNoise serves admin static.
- **Only the Gunicorn entrypoint** runs migrations + `collectstatic` + `seed_plans`;
  Daphne/Celery skip them to avoid races (`backend/scripts/entrypoint.sh`).
- **Deploy:** from the Mac, `cd ~/ws/home-server && ./deploy.sh contentor` (rsync + build
  + up + health). Tunnel ingress: `./deploy.sh edge`. Secrets in `.env.prod` (gitignored,
  rsynced; template `.env.prod.example`).

---

## 12. Environment variables (categories)

Templates: `backend/.env.example`, root `.env.example` (dev), `.env.prod.example` (prod).

- **Platform/Django:** `CONTENTOR_DOMAIN`, `CONTENTOR_SUPERUSERS`, `DJANGO_SETTINGS_MODULE`,
  `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` (must include `django` for SSR), `DJANGO_DEBUG`.
- **DB/Cache:** `POSTGRES_*`, `REDIS_URL`, `CELERY_BROKER_URL`.
- **Frontend (baked):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BASE_DOMAIN`,
  `NEXT_PUBLIC_GETSTREAM_API_KEY`.
- **Email:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAILCRAFT_BASE_URL`, `EMAILCRAFT_TOKEN`.
- **Storage:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`,
  `AWS_ENDPOINT`, `AWS_PRESIGNED_EXPIRY`.
- **Live:** `GETSTREAM_API_KEY`, `GETSTREAM_API_SECRET`, `ZOOM_TOKEN_ENCRYPTION_KEY`.
- **OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **Billing:** `BILLING_BYPASS_ENABLED` (**false in prod**), `PAST_DUE_GRACE_DAYS`,
  `BILLING_FREE_PLAN_NAME`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,PRO}_{USD,TRY}` (optional pins).

> ⚠️ Live secrets are currently committed to `.env.prod` across the fleet and were exposed
> in-session — **rotate** S3, Stripe, Resend, Stream.io, and `DJANGO_SECRET_KEY`. (See the
> "secrets to rotate" memory.)

---

## 13. Conventions & gotchas (read before coding)

1. **Public endpoints need `@authentication_classes([])`** — `AllowAny` is not enough.
2. **SSR fetches must send `X-Tenant-Domain`** — `undici` drops custom `Host`; without it
   you hit `public`.
3. **Build tenant domains from the slug** in `generateMetadata`/`manifest.ts`.
4. **Webhooks** mount **outside** `/api/v1` and outside auth, and force the `public` schema.
5. **`region` and `billing_currency` are immutable** once set.
6. **Only Gunicorn runs migrations** — never add migrate steps to Daphne/Celery entrypoints.
7. **`make migrate` = all tenant schemas; `make migrate-shared` = public only.** A new
   shared model needs both paths considered.
8. **Quotas are log-only today** — don't assume a limit is enforced until Phase 3.
9. **`BILLING_BYPASS_ENABLED=true` is dev-only; prod refuses to boot with it.**
10. **Two "subscriptions"** — `PlatformSubscription` (coach→platform, public) vs
    `Subscription` (student→coach, tenant). Never conflate.
11. Repo rules (CLAUDE.md): don't create new `.md` files unless asked; pre-commit must be
    clean; verify `make dev` before claiming done; never commit unless asked.

---

## 14. Recent feature history (`docs/superpowers/`)

Per-tenant Zoom OAuth + meeting settings (Mar 19), course-form consolidation + inline edit
panel (Mar 22), dual-access pricing (Mar 22), email campaigns + panel improvements
(Mar 24–25), bilingual TR/EN (May 11), and platform subscription payments (May 12 — the
5-phase Stripe billing plan). Each has a `plans/` and `specs/` doc.

---

## 15. Roadmap (confirmed June 2026)

Two tracks, confirmed by the owner:

- **Finish platform billing (Phases 2–4):** lifecycle/dunning UI, **Phase 3 quota
  enforcement** (turn today's log-only gates into hard **402**s), Phase 4 bilingual
  receipts + Prometheus metrics + admin support tooling.
- **M2 marketplace (student → coach payments):** a **region-split provider model —
  iyzico submerchants for TR, Stripe Connect for global**. The **coach is the merchant of
  record**; funds settle to the coach's connected/submerchant account and the platform
  automatically takes `transaction_fee_pct` (recording `submerchant_payout`). Uses the
  reserved `iyzico_submerchant_id` / `stripe_account_id` fields and the `iyzico` provider
  choice. Confirmed shape: **Stripe Connect Express, direct charges** (coach = merchant of
  record, owns refunds/disputes); **Free coaches can never get paid** — charging students
  requires a paid plan + active subscription; marketplace fee **Starter 5% / Pro 4%**;
  platform keeps its fee on refund. Full breakdown:
  [marketplace-and-feature-completeness plan](superpowers/plans/2026-06-07-marketplace-and-feature-completeness.md).

- **Admin-managed pricing (main app):** make platform plan pricing **editable from the
  superadmin panel** instead of `seed_plans.py`. Today `/admin/plans` is read-only and
  `platform_plans` is GET-only; this needs a `POST`/`PATCH` path on `PlatformPlan`
  (amount, limits, `transaction_fee_pct`, `is_live_enabled`) plus edit UI. **Design
  caveat:** Stripe Prices are immutable — changing an amount must **create a new Stripe
  Price and swap `PlatformPlan.prices[currency].stripe_price_id`** (and decide whether
  existing subscribers migrate or keep their old price). Owner wants full pricing control
  here.

**Priority lens: global-first** (English/USD leads; TR follows in lockstep — the codebase
is already bi-region, so global is mainly the tie-breaker for sequencing).

**Explicitly _not_ on the near-term roadmap:** migrating the bespoke sibling sites into
Contentor (they stay separate — see §16), a dedicated "go-live" push, or net-new
content/live feature depth.

---

## 16. Resolved decisions & remaining unknowns

Clarified with the owner (June 2026):

| Question | Decision |
|---|---|
| Near-term roadmap | **M2 marketplace + finish platform billing (Phase 3–4).** Not: sibling migration, feature depth, a go-live push. |
| Sibling sites (`gorkemHanciYoga`, `zeyneple.art`, …) | **Separate products that only share infra** (the `contentor-prod` bucket / home server). Not Contentor tenants; no merge planned. |
| Revenue model | **Both layers** — coach Free/Starter/Pro subscriptions (live now) + a marketplace `transaction_fee_pct` cut on student sales (M2). |
| M2 provider | **iyzico for TR, Stripe Connect for global.** |
| Marketplace funds flow | **Coach is merchant of record**; platform skims `transaction_fee_pct`. |
| Market focus | **Global-first** (TR in lockstep). |
| Terminology | **coach + student** (canonical). |
| Doc audience | You + Claude, future sessions — keep dense/technical. |

Still genuinely open (fill in when decided):

1. **Concrete Starter / Pro prices** per currency (USD/TRY) — seeded amounts live in
   `seed_plans.py` (`PLAN_AMOUNTS`); confirm they're final.
2. **M2 vs. Phase 3–4 sequencing** — which of the two confirmed tracks ships first.
3. **Marketplace fee rate(s)** — the actual `transaction_fee_pct` per plan tier.
