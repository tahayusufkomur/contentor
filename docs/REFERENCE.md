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

Think "Kajabi / Teachable / Podia", built for a global English market,
self-hosted on a home server.

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
Celery (worker + beat) on Redis, Gunicorn for HTTP. Realtime chat/video is via
LiveCraft (sibling product `../livecraft`, self-hosted LiveKit) embedded by iframe, so the app serves no WebSockets of its own.

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
       /api,/static,apex/admin     │        apex      │        every other host (tenants)    │
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

One region, `global` (the `region` column and JWT claim are kept so another can be added
later): domain `slug.contentor.app`, schema `slug`, locale `en`. **Currency** is decided
once at tenant creation from the coach's country (Cloudflare's `CF-IPCountry`): eurozone →
`EUR`, anything else → `USD`; it is immutable afterwards. `User` uniqueness is
**`(email, region)`**.

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
  `role ∈ {owner, coach, student}`, `region = global`, `preferred_locale`,
  `accessible_regions` (superadmin admin scoping), `payment_customer_id`, `is_staff`,
  `is_superuser`. Custom `UserManager`, email is the username field.
- **`Tenant`** [P] (`apps/core/models.py`, extends `TenantMixin`) — one row per coach
  site. `slug` (unique, validated against `RESERVED_SLUGS`), `schema_name`, `region`
  (immutable), `billing_currency` (locked at first checkout), `plan` → `PlatformPlan`,
  `subdomain`, `stripe_account_id` (Connect — for future marketplace payouts),
  `provisioning_status ∈ {pending, provisioning, ready,
  failed}`, `is_demo`, `template_niche`, `template_goals`, `template_seed_status ∈
  {pending, seeding, ready, skipped, failed}`. Property `is_subscription_active` →
  True iff a `PlatformSubscription` exists with status in `{trialing, active, past_due}`.
  `requires_plan` (set at signup since 2026-10-16) means no Free plan to fall back on:
  `is_paused` (no trial or plan) hides the site from visitors and opens the admin on the
  plan picker.
- **`Domain`** [P] (extends `DomainMixin`) — maps an FQDN to a tenant; `ssl_status ∈
  {pending, active, error}`.
- **`PlatformPlan`** [P] — coach-facing plan (Starter/Pro; Free retired 2026-10-16,
  `is_active=False`, kept for the tenants that still have it). Quotas:
  `max_students`, `max_storage_gb`, `max_streaming_hours`, `max_campaign_emails`;
  `transaction_fee_pct` (platform's cut of student payments — used by the future
  marketplace); `is_live_enabled`; `prices` JSONB `{ "USD": {amount_cents, stripe_price_id},
  "EUR": {…} }`. `get_price(currency)` and `is_free` helpers.
- **`PlatformSubscription`** [P] — the coach→platform subscription. OneToOne to `Tenant`,
  FK to `User` + `PlatformPlan`. `status ∈ {incomplete, trialing, active, past_due,
  canceled}`, `provider ∈ {stripe, bypass, manual}`, Stripe ids, period fields,
  `cancel_at_period_end`. New coaches start Starter as a 14-day Stripe trial (card at
  Checkout before their site is built, `monetization.trial_days_for`); a trial runs the plan's features but cannot
  sell (`is_paid_active` needs `active`).
- **`TenantUsage`** [P] — monthly metering rollup `(tenant, month)`: `student_count`,
  `storage_bytes`, `streaming_minutes`, `emails_sent`.
- **`WebhookEvent`** [P] — idempotency record, unique `(provider, provider_event_id)`.

### 4.2 Content (`apps.courses`, `apps.downloads`, `apps.media`)

- **`Course`** [T] → `Module` [T] → `Lesson` [T] (the content tree). `Course` has
  `instructor`, `slug`, `pricing_type ∈ {free, paid, subscription}` (the headline of its ways in, [§6](#6-content-access--ways-in-and-windows)), `price`, `is_published`, thumbnail.
- **`Video`** [T] — reusable S3 asset (`s3_key`, duration, size). Referenced by `Lesson`,
  and by `LiveClass`/`LiveStream` as a recording.
- **`Enrollment`** [T] — student↔course access, unique `(user, course)`, denormalized
  `payment_id`. `granted=True` marks a creator's "Give access", with its own stamp
  `access_starts_at` / `access_ends_at`.
- **`Progress`** [T] — per-`(user, lesson)` `watched_seconds` + `completed`.
- **`DownloadFile`** [T] — a sellable/free downloadable (`file_url`, `pricing_type`, `price`).
- **`Photo`** [T] (`apps.media`) — image asset (UUID pk, `s3_key`); thumbnails for
  courses/videos/live events/branding.

### 4.3 Live (`apps.live`)

All four share `_EventStatusMixin` (computes `draft → scheduled → live/ongoing → ended`
from `scheduled_at` + `duration_minutes`):

- **`LiveClass`** [T] — interactive LiveCraft `meeting` room (1:N video, host moderation); auto-generated
  unique `room_name`; optional `recording` → `Video`, `auto_recording`.
- **`LiveStream`** [T] — LiveCraft `broadcast` room (viewers watch + chat).
- **`ZoomClass`** [T] — external Zoom meeting (`zoom_link`, `zoom_meeting_id`); no SDK.
- **`OnsiteEvent`** [T] — in-person event (`location`, `address`, `max_capacity`).

**Video permissions.** Contentor decides who joins a `LiveClass`/`LiveStream` and as
what (`views._join_response`): the instructor or the tenant owner joins as `host`;
anyone else passing `ContentAccessService` joins as `participant` (class) or
`viewer` (stream), and only while the session is `live`. Everything after that
(token grants, moderation, blocking, and the known abuse risks with their planned
fixes) is LiveCraft's: see `../livecraft/docs/permissions.md`.

### 4.4 Billing (`apps.billing` — tenant-scoped, student↔coach)

> Models live in `apps/billing/models/core.py` (there is no top-level `billing/models.py`).

- **`SubscriptionPlan`** [T] — a coach-defined membership tier (name, price, currency).
- **`SubscriptionPlanAccess`** [T] — GenericFK junction granting a plan access to any
  content item, with its own window (`opens_after_days`, `opens_on`, `closes_after_days`,
  `closes_on`, from the shared `AccessWindowFields`). Read live, anchored at the
  subscription's `created_at`. See [§6](#6-content-access--ways-in-and-windows).
- **`AccessWindow`** [T] — the window of an item's `free` or `buy` way: GenericFK to the
  item, `way ∈ {free, buy}`, the same four optional bounds; unique per `(item, way)`, no row
  means no window. A bundle uses its `buy` row for its sold-once window.
- **`Subscription`** [T] — student↔plan, `status ∈ {active, past_due, expired}`, supports
  `pending_plan` (change at next cycle).
- **`Payment`** [T] — a transaction. `payment_type ∈ {one_time, subscription, refund}`,
  `status ∈ {pending, completed, failed, refunded, partially_refunded}`, `provider ∈
  {stripe, bypass}`, `platform_fee`, `submerchant_payout`, `original_payment`
  (refund link), and a **cross-schema** `platform_subscription` FK
  (`db_constraint=False`).
- **`PaymentItem`** [T] — line item (GenericFK to the purchased content). Carries the
  purchase's stamp, `access_starts_at` / `access_ends_at`, set when the payment completes.
- **`Bundle`** / **`BundleItem`** [T] — a discounted grouping of content (GenericFK items).

### 4.5 Email & config

- **`EmailCampaign`** [T] / **`CampaignRecipient`** [T] (`apps.email_campaigns`) —
  an email: a `draft` holding its own `design` (block JSON), `subject`, `preheader` and
  the `template` it started from, then the record of its send (`recipient_filter`,
  per-recipient delivery). `CampaignStatus ∈ {draft, scheduled, sending, sent, partial, failed}`.
  **`EmailTemplate`** [T] — a design she starts emails from (`source` starter · designer ·
  coach · imported). **`EmailDesignJob`** [T] — a Designer run on an email or template.
- **`TenantConfig`** [T] (`apps.tenant_config`) — singleton per tenant: `brand_name`,
  `logo`, the look (`style` = a site style id from the section manifest, `palette` = one
  of its colourways; colours, fonts and layouts all come from it, and it changes only
  through `POST /api/v1/admin/config/look/`, which restyles the pages), `dark_mode_enabled`,
  `custom_css`, `enabled_modules`, `navbar_config`, `landing_sections`,
  `default_locale`, `onboarding_completed`, `emailcraft_api_key` (legacy: read only by
  `import_mailcraft_templates`), plus per-tenant Zoom
  OAuth (`zoom_refresh_token` encrypted, `zoom_connected`, `zoom_connected_email`).

### 4.7 Notifications (`apps.notifications`)

- Tenant-scoped. `PushSubscription` [T] — a browser's web-push keys per user.
  `LiveReminderLog` [T] — dedupe key so a live event's reminder is sent once.
  `Announcement` [T] — a coach broadcast (title/body/link, `status ∈ {scheduled, sent}`,
  `recipient_count`/`push_sent_count`), optionally spawned by a `RecurringAnnouncement` [T]
  rule (`frequency ∈ {daily, weekly, monthly}`, `next_run_at`). `AnnouncementRecipient`
  [T] — per-user push/email delivery status + `read_at`. `AnnouncementTemplate` [T] —
  coach-saved reusable announcement. `EmailOptOut` [T] — per-tenant email unsubscribe list.
- API: `vapid-key`, `subscribe`/`unsubscribe` (web push), `feed` + `feed/<id>/read` (student
  inbox), `email/unsubscribe` (public, `AllowAny`); coach CRUD for announcements/templates/
  recurring rules lives in `admin_urls.py`/`admin_views.py`.
- Cross-app: `apps.blog`'s autopilot schedule reuses `recurrence.next_occurrence()` from
  this app verbatim.

### 4.8 Community (`apps.community`)

- Tenant-scoped. `CommunitySettings` [T] — singleton feature gate + welcome message.
  `CommunityMember` [T] — 1:1 with `User` (display name, avatar, ban/mute,
  `requires_approval`). `Post` / `Comment` [T] — student-generated content,
  `PostStatus ∈ {visible, pending, hidden, removed}` (auto-hidden past a report
  threshold). `Reaction` [T] — one emoji per member per post XOR comment.
  `Report` [T] — a flagged post/comment (`reason`, `status`, `action_taken`).
- API: `settings`, `me`, `presign` (S3 upload for post images), `posts`/`comments`/
  `reactions`/`reports`, plus a `moderation/*` surface (queue, resolve, pin/unpin, remove,
  ban/mute/require-approval) gated by `is_moderator`. `urls_platform.py` exposes a
  cross-tenant report-count rollup to the superadmin.
- New visible posts/comments fan out via Celery (`tasks.py`) — the likely trigger point for
  `apps.notifications` push, though that wiring lives in the task, not this doc's scope.

### 4.9 Blog (`apps.blog`)

- Tenant-scoped. `BlogPost` [T] — a coach's public post (`slug`, `body_html`, `status ∈
  {draft, published}`, `source ∈ {manual, ai, autopilot}`, optional `cover_photo`).
  `BlogTopicIdea` [T] — AI-suggested topics, generated in batches of 12 to keep topic
  selection free of a per-decision LLM call. `BlogAutopilot` [T] — singleton hands-off
  generation schedule, field-shape mirrors `RecurringAnnouncement`.
- API: anonymous `posts/` + `posts/<slug>/` (served on the tenant's public site), a coach
  `ModelViewSet` (`BlogPostAdminViewSet`), and AI endpoints `blog_ai_status`,
  `blog_generate`, `blog_topics`, `blog_topic_dismiss`, `blog_autopilot` (`IsCoachOrOwner`).
  A superadmin equivalent lives under `urls_platform.py`/`platform_views.py`.
- Cross-app: depends on `apps.notifications.recurrence.next_occurrence()` for the autopilot
  schedule, `apps.media.Photo` for cover images, and `apps.courses.Course` +
  `apps.tenant_config.TenantConfig` for AI brand-brief context.

### 4.10 Mailbox (`apps.mailbox` — dual-listed)

- Same models run in both `SHARED_APPS` (public schema = the **superadmin's own platform
  inbox**) and `TENANT_APPS` (tenant schema = the **per-coach mailbox**) — see
  `backend/config/settings/base.py`. `Conversation` [P+T] — a thread keyed by
  counterparty email (unique open conversation per counterparty). `Message` [P+T] —
  inbound/outbound, threaded via `message_id`/`in_reply_to`. `MessageAttachment` [P+T] —
  `message` FK is null between composer upload and send.
- API: `conversations/` list+detail+`reply`, `compose/`, `attachments/` upload, and a
  signed `inbound/` webhook (`AllowAny`, HMAC-verified in `signing.py`) that the Cloudflare
  Email Routing worker posts to. `mailbox_settings` reads/writes the coach's custom-domain
  local part or platform-domain address. `urls_platform.py` mounts the same actions for the
  superadmin (`IsSuperUser`), minus `settings`/`inbound`.
- The `inbound` webhook always resolves at the apex host: it looks up `apps.domains.
  CustomDomain` (public schema) or a `PlatformMailboxAddress`, then explicitly enters
  `tenant_context`/`schema_context` before storing the message — required because both
  schemas now have mailbox tables.

### 4.11 Domains (`apps.domains`)

- Public schema. `CustomDomain` [P] — a tenant's registered custom domain: registrar/
  Cloudflare/Resend ids, `provisioning_status` (`pending → registering → dns_zone →
  dns_records → email_auth → ssl → live` / `failed` / `lapsed`), pricing in minor units +
  `fx_rate`, `mailbox_local_part`/`mailbox_enabled`. `PlatformMailboxAddress` [P] — a paid
  coach's claimed `<local_part>@PLATFORM_MAIL_DOMAIN` address; kept-but-inert if the
  subscription lapses. `DomainSubscription` [P] — the Stripe subscription billing a
  custom domain's recurring renewal cost.
- API: the same logic mounted twice — tenant-scoped (`/api/v1/domains/*`, resolves
  `connection.tenant`) and account-scoped (`/api/v1/me/tenants/<slug>/domain/*`, resolves
  the tenant by slug + `owner_email` from the public-schema apex JWT) — `search`,
  `checkout` (Stripe), `current`, `retry`, `destroy`.
- Cross-app: `billing.py` drives `apps.billing`'s Stripe Connect checkout; `provisioning.py`/
  `tasks.py` orchestrate the registrar + Cloudflare zone/DNS/SSL steps; `apps.mailbox`
  reads `CustomDomain`/`PlatformMailboxAddress` to resolve inbound mail and sending identity.

### 4.12 Platform email (`apps.platform_email`)

- Public schema. Mirrors `apps.email_campaigns` for the platform's own outbound campaigns
  to coaches, on the same email engine in Contentor's kit (`brand.platform_kit`).
  `PlatformEmailTemplate` [P] — a design. `PlatformEmailCampaign` [P] — a draft with its
  `design`/`subject`/`preheader`, then its send (`recipient_filter`/status, reusing
  `CampaignStatus`/`RecipientStatus`). `PlatformCampaignRecipient` [P] — per-recipient
  delivery outcome, the coach stored denormalized (`user_id`/`user_name`/`user_email`).
  `PlatformEmailConfig` [P] — legacy MailCraft key, read only by `import_mailcraft_templates`.
- API (superadmin only, `IsSuperUser`): `brand`, `render`, `templates` CRUD,
  `recipient-options`, `campaigns` (drafts) + `send`/`test`/`recipients`.

### 4.13 Admin Kit (`apps.adminkit`)

- No models. Supplies the generic admin-site framework every other app's
  `admin_panels.py` registers against: `AdminSite` (`sites.py`) turns registered
  `ModelAdmin`s into viewsets (list/create/retrieve/update/destroy/`meta`/`actions`/
  `autocomplete`) under a namespace. Two singleton sites: `platform_site` (superadmin SPA,
  `IsSuperUser`, public-schema models) and `studio_site` (coach admin SPA,
  `IsCoachOrOwner`, `tenant_only=True`). `AppConfig.ready()` autodiscovers each app's
  `admin_panels` module (mirrors Django's own `admin.py` autodiscovery without clashing
  with it).
- API: mounted via `urls_platform.py`/`urls_studio.py` — `<namespace>/meta/` plus
  per-registered-model CRUD/`meta`/`actions`/`autocomplete` routes generated from each
  `ModelAdmin` (`options.py`, field/relation introspection in `introspection.py`).
- Every tenant/public app with an admin surface (`apps.billing`, `apps.courses`, …)
  depends on `adminkit` to expose itself to the two admin SPAs; it has no models of its own.

### 4.14 Tags (`apps.tags`)

- Tenant-scoped. `Tag` [T] — a flat, coach-defined free-text label scoped to one content
  type (`course`/`video`/`photo`/`download`/`event` — the four live-event models share the
  `event` pool). Unique per `(scope, slug)`; auto-slugified with de-dupe suffixing.
- API (`IsCoachOrOwner`): list+create (dedupes by name within a scope instead of creating
  a near-duplicate) and retrieve/update/delete.
- Distinct from `apps.filters`: tags are unstructured admin-only organization and never
  surface to students.

### 4.15 Filters (`apps.filters`)

- Tenant-scoped. `FilterGroup` [T] — a coach-defined structured filter dimension (e.g.
  "Level"); `applies_to ∈ {course, event, both}`, ordered. `FilterOption` [T] — a
  selectable value within a group (e.g. "Beginner"); unique per group.
- API (`IsCoachOrOwner`): `groups/` and `options/` list+create+detail; options filterable
  by group.
- The structured, student-facing counterpart to `apps.tags` (browse facets on course/event
  catalogs), as opposed to tags' unstructured admin-only labels.

### 4.16 Usage (`apps.usage`)

- Tenant-scoped. `UsageEvent` [T] — one row per `(user, mode, platform, day)` recording
  whether a student session came from the installed PWA or the browser, and which
  platform (`ios`/`android`/`desktop`/`other`).
- API: `record_usage` (`IsAuthenticated`, students only — no-ops for coach/owner roles)
  upserts today's row and updates `User.last_display_mode`/`last_platform`/`first_pwa_at`;
  `usage_summary` (`IsCoachOrOwner`, mounted via `admin_urls.py`) aggregates PWA-vs-browser
  session counts and a daily series over a configurable window, plus a global
  `installed_students` count from `apps.accounts.User`.

### 4.17 Relationship sketch

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

## 6. Content access — ways in and windows

A sellable item (course, download, live class, live stream, on-site event, Zoom class,
bundle) has one or more **ways in**, each with an optional **window**:

- **free** — everyone (with no window), or everyone during a window;
- **buy** — sold once at `price`;
- **plans** — included in ticked subscription plans (`SubscriptionPlanAccess`);
- **granted** — given to one student by the creator (courses only, not set on the item).

A window opens and closes after N days from when that student got in (a purchase: when the
payment completed; a plan: `Subscription.created_at`; free: `User.date_joined`; a grant: when
it was given) or on a calendar date read in the creator's zone (`TenantConfig.timezone`;
opens at 00:00 of that day, closes at 23:59:59). Months are 30 days, a year 365, days are the
stored unit (1 to 3650).

**One writer.** `apps.billing.ways` owns the structure
`{"free": {"window"}, "buy": {"price", "window"}, "plans": [{"plan_id", "window"}]}`:
`ways_of(item)` reads it, `set_ways(item, ways, actor=…)` validates and writes it in one
transaction (the `AccessWindow` rows, the plan links, `price`, and the `pricing_type`
headline) and refuses an empty set; `describe(ways)` says it in plain words. `ALLOWED`
limits the ways per kind: a Zoom class is free only, a bundle is sold once only. Only the
owner may change which plans include an item or a bundle's terms. The creator's Access
section loads and saves through `GET/PUT /api/v1/admin/access/<kind>/<pk>/`
(`apps/billing/views/access.py`; coach or owner); `pricing_type`/`price` on an item payload
remain a shorthand, applied through `apply_shorthand`. `pricing_type` is now only the
headline: `free` (the free way, no window), `paid` (sold on its own), `subscription` (in
plans, not sold on its own).

**Order of checks.** `apps.core.access.ContentAccessService.get_access_info(user, content)`
(one path with `bulk_check_access`, which batches the queries for list endpoints) returns an
`AccessInfo`:

1. **owner/coach** → always allowed (`access_reason="owner"`)
2. **free** → open when there is no free window and the headline is `free`, or the window is
   open for the student (anchored at `User.date_joined`; a visitor only meets calendar dates)
3. **an open purchase** → `PaymentItem` of this item (`completed` or `partially_refunded`,
   not refunded), bounded by its stamp (`purchased`); or of a bundle containing it, by the
   bundle's stamp (`bundle`)
4. **an open grant** → an active `Enrollment` with `granted=True`, bounded by its stamp
   (`granted`)
5. **an open plan link** → the student's `active` `Subscription` (period not yet ended) to a
   plan that links the item, with the link's window anchored at the subscription's `created_at`
   (`subscription`)
6. otherwise **no access**.

A way counts while its window is open. When several are open the winner is the first that
never closes, else the one that closes last; `access_reason` and `access_ends_at` come from
it. With no access, `opens_at` is the soonest start of the student's own ways still ahead
(a waiting purchase, grant or plan), and `access_ends_at` is when the last one closed
("Your access ended on …").

**What a locked item offers.** `unlock_methods` is `["purchase"]` when sold on its own (the
headline is `paid`), plus `"subscribe"` when an *active* plan links the item. The old rule
"a subscription item with no plan linked means any active subscription" is gone: data
migration `billing 0010` linked such items to every active plan so nobody lost access.
`get_unlock_options(content)` carries the same ways with their windows: `free` (only a free
window), `purchase` (price and `buy` window), `bundles` (active ones containing it) and
`plans` (active plans only, each with its link's window). A plan that is off sale keeps its
existing members' access but is never offered.

**Purchases keep their terms.** `grant_access_for_payment` (`apps/billing/views/payments.py`,
both the bypass and the Stripe webhook) stamps each `PaymentItem` without a stamp from
`ways.stamp(item, paid_at)`, the item's (or bundle's) `buy` window as it is then; a webhook
replay finds it stamped and leaves it. `payment_initialize` refuses an item while
`holds_purchase` says a purchase is open or not yet open (a closed one lets the student buy
again). `subscribe` refuses only when the student has an `active`, not cancelled
subscription to that plan whose `current_period_end` is still in the future.

**Give access.** `POST` to the student's grant-access endpoint (`student_grant_access` in
`apps/accounts/views.py`, coach or owner) takes a `course_id` and optionally `for_days`
(1 to 3650) or `until` (a calendar date still to come, ends 23:59:59 in the creator's zone),
not both; neither means theirs to keep. It sets `Enrollment.granted`, `access_starts_at` =
now and `access_ends_at`.

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
- **Embedded Checkout:** with `STRIPE_PUBLISHABLE_KEY` set, every plan and student checkout
  session is `ui_mode=embedded` (returns `client_secret`, plus `stripe_account` for a direct
  charge); `packages/shared/src/checkout/embedded-checkout.tsx` mounts Stripe's form beside our
  photo panel (Contentor's for coach plans, the coach's look for students). Unset, it falls back
  to the hosted page (`checkout_url`). Custom-domain checkout stays hosted.
- **Lifecycle:** `incomplete → active → past_due → canceled`; a daily Celery-beat
  `cleanup_past_due_subscriptions` downgrades stale `past_due` tenants to Free after
  `PAST_DUE_GRACE_DAYS`.

### 7.2 Quotas

`apps/core/quotas.py` defines `enforce_max_students` / `…_storage_gb` / `…_streaming_hours`
/ `…_campaign_emails`, plus `SubscriptionInactive` / `QuotaExceeded` exceptions.
**Today these are log-only (Phase 0).** Phase 3 wires them into the write paths and
returns HTTP **402** (`QUOTA_EXCEEDED` / `SUBSCRIPTION_INACTIVE`). See [§15](#15-roadmap-inferred).

### 7.3 Student → Coach (the M2 marketplace — confirmed, not yet built)

The tenant-scoped `Subscription` / `Payment` / `Bundle` models exist;
`Tenant.stripe_account_id` is the connected-account handle. The confirmed M2 design:
**Stripe Connect**, with the **coach as merchant of record** — funds settle to the coach's
connected/submerchant account and the platform automatically takes `transaction_fee_pct`
(recorded in `submerchant_payout`). The collection flow itself is not built yet.

---

## 8. Onboarding & provisioning

1. `POST /api/v1/onboarding/signup/` `{email, name, brand_name}` → validates, derives a
   slug, checks per-region uniqueness, mints a 15-min **signup token**, emails verification.
2. `POST /api/v1/onboarding/signup/verify/` `{token}` → creates the **`Tenant`** + **`Domain`**
   rows in `public` with `provisioning_status="pending"`. *Schema not yet created.* A tenant
   that needs a plan (every signup since 2026-10-16) answers `needs_card` and is built only
   once its trial runs: `POST /api/v1/onboarding/signup/checkout/` `{token}` opens the Starter
   trial's Stripe Checkout (each new tenant gets its own trial), back to `/signup/verify`
   with `session_id`, which verify syncs; the `PlatformSubscription` post_save signal
   (`core.signals`) then enqueues `provision_tenant` once.
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
6. **Cancel / delete (coach-initiated).** Rules live in `apps/core/onboarding/cancel.py`
   (`check_deletable` / `delete_platform`): refused (`409`, `detail` = code) for a live paid plan
   (`paid_plan`), a connected Stripe account (`payments_connected`), a custom domain
   (`custom_domain`) or an in-flight, non-stuck provisioning (`provisioning`). Otherwise the schema,
   public rows and `tenants/<slug>/` media are removed. Two entry points, both needing
   `{"confirm": "<slug>"}`: `DELETE /api/v1/me/tenants/<slug>/` (apex dashboard, owner by email;
   `GET /me/tenants/` reports `delete_blocker`) and `POST /api/v1/admin/setup-flow/cancel/`
   (tenant host, owner role only, only while `/setup` is active — "Cancel setup" in the setup menu).
   The nightly abandoned-signup cleanup is separate.

**Niche templates** live under `backend/apps/demo_seed/data/<niche>.json`
(each carries `TENANT`, `CONFIG`, `COURSES`, `DOWNLOADS`, `SUBSCRIPTION_PLANS`, `BUNDLES`,
live events…). `seed_template_into_tenant` merges config and creates content as unpublished
drafts so the coach reviews before going live. `available_niches()` auto-discovers them.

---

## 9. Integrations

| Integration | Purpose | Where | Key env |
|---|---|---|---|
| **LiveCraft** (own product, `../livecraft`) | Live video: Contentor creates rooms and join links (host / participant / viewer) over its API-key API and iframes the room; LiveCraft owns the UI, moderation, chat and recording, and posts signed `recording.ready` callbacks to `/api/webhooks/livecraft/` | `apps/live/livecraft.py`, `apps/live/webhooks.py` | `LIVECRAFT_URL`, `LIVECRAFT_API_KEY` (`LIVECRAFT_FAKE` dev/tests) |
| **Zoom OAuth** | Per-tenant Zoom connection; refresh token (Fernet-encrypted) on `TenantConfig`; access token cached `tenant:{schema}:zoom_access_token` | `apps/live/urls_zoom.py`, views | `ZOOM_TOKEN_ENCRYPTION_KEY` (+ a single shared Zoom marketplace app) |
| **MailCraft** | Sibling email-builder SaaS (`mailcraft.contentor.app`). No longer called at runtime: its engine was ported into `apps.email_campaigns`; only the one-off template import reads it | `apps/email_campaigns/management/commands/import_mailcraft_templates.py` | `EMAILCRAFT_BASE_URL`, per-tenant `emailcraft_api_key` (legacy) |
| **Resend** | Transactional + campaign email delivery | `apps/core/email.py` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| **S3 / Hetzner** | Media storage; presigned single-PUT + multipart uploads; path `tenants/{slug}/{category}/…`. Download links are signed only for the current tenant's prefix and the shared `demo/` + `platform/` prefixes (`is_signable_key`, `SHARED_KEY_PREFIXES`); any other key comes back as `""` with a `storage: refused to sign` warning in the logbook | `apps/core/storage.py`, `views_upload.py`, `views_multipart.py` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_ENDPOINT`, `AWS_PRESIGNED_EXPIRY` |
| **Stripe** | Coach→platform billing (see §7) | `apps/billing/providers/stripe_provider.py` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` |
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
- Routed on `Host(contentor.app)` (and `localhost`).
- Apex-only — **no** `X-Tenant-Domain`; talks to the `public` schema.
- Look: the shared token sheet `packages/shared/src/styles/tokens.css` (both apps).
  Marketing is light-only, with two dark cinematic chapters on the landing; brass
  accent `--marketing-accent` = `oklch(0.52 0.12 65)`; Geist in both apps. The coach
  studio (`frontend-customer` admin) deliberately leaves the house design system.
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
- **Theming is per-tenant:** `TenantConfig` (style/palette/custom_css) → `src/lib/site-styles.ts`
  `styleRootCss(siteLook(style))` → injected via `TenantThemeStyle`; config cached ~60s by
  domain. A site with no style yet wears the default look (`siteLook` / `sections.default_style`).
- **The coach admin (`/admin`) wears one look for every tenant:** under `/admin` that
  injected sheet is switched off (`ThemeProvider`, plus the root layout on a full load), so
  the admin shows the app's own house light/dark tokens (`styles/globals.css`).
- **One light/dark for site and admin:** the site's toggle and the admin's are the same
  next-themes value (`THEME_STORAGE_KEY`, localStorage). A site with `dark_mode_enabled`
  off is forced light for visitors (`ThemeProvider`), but the coach's admin is never forced.
- Embeds LiveCraft rooms in an iframe (`components/live/live-frame.tsx`); no video SDKs of its own.

---

## 11. Infrastructure & deployment

### Dev

`make dev` (compose up --build, hot-reload). Caddy (parametrized `Caddyfile`, `CONTENTOR_DOMAIN=localhost`) routes `/api/v1`, `/api/health`,
`/api/webhooks` and `/static/*` → Django; apex → `nextjs-main`; every other host (tenant subdomains) → `nextjs-customer`.
Useful: `make dev-reset`, `make migrate` / `make migrate-shared` / `make makemigrations`,
`make seed`, `make test`, `make test-changed` / `make e2e-changed` (diff-scoped runs
via `scripts/select_tests.py` + `e2e/impact-map.json`), `make lint`, `make format`,
`make shell`, `make health-check`.
(Full list: `make help`.)

### Prod (home server)

- Self-contained `docker-compose.prod.yml` (NOT an override) running
  `config.settings.prod`. One `contentor-caddy` edge container on the external `edge`
  network; everything else internal with **no published host ports**.
- The parametrized `Caddyfile` does all routing: `/api/*`, `/static/*`, apex
  `/django-admin/*` → Django; apex → `nextjs-main`; every other host → `nextjs-customer`.
- TLS at Cloudflare; cloudflared→Caddy→Django is HTTP, Caddy forces
  `X-Forwarded-Proto: https`; WhiteNoise serves admin static.
- **Only the Gunicorn entrypoint** runs migrations + `collectstatic` + `seed_plans`;
  Celery (worker + beat) skips them to avoid races (`backend/scripts/entrypoint.sh`).
- **Deploy:** from the Mac, `cd ~/ws/home-server && ./deploy.sh contentor` (rsync + build
  + up + health). Tunnel ingress: `./deploy.sh edge`. Secrets in `.env.prod` (gitignored,
  rsynced; template `.env.prod.example`).
- **Marketing media:** `frontend-main/public/media/*` filenames are not hashed; prod
  serves them behind a Cloudflare cache rule (7-day edge TTL, 1-day browser TTL).
  After any re-encode, purge the `/media/*` prefix at the edge or visitors see the old
  footage for up to a week. Pipeline in `scripts/footage/`: `record.ts` → `encode.sh`
  → `manifest.mjs` (their headers are the runbook; `make footage` prints it). Budgets
  are enforced by `frontend-main/src/lib/__tests__/media-budget.test.ts` and
  `landing-media.test.ts`.

---

## 12. Environment variables (categories)

Dev reads the root `.env` (template `.env.example`). Prod secrets live in Cloudflare KV (fleet `scripts/secrets.sh`); `.env.prod.example` documents the keys prod needs.

- **Platform/Django:** `CONTENTOR_DOMAIN`, `CONTENTOR_SUPERUSERS`, `DJANGO_SETTINGS_MODULE`,
  `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` (must include `django` for SSR), `DJANGO_DEBUG`.
- **DB/Cache:** `POSTGRES_*`, `REDIS_URL`, `CELERY_BROKER_URL`.
- **Frontend (baked):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BASE_DOMAIN`.
- **Email:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_DESIGNER_MODEL`, `EMAILCRAFT_BASE_URL` (import only).
- **Storage:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`,
  `AWS_ENDPOINT`, `AWS_PRESIGNED_EXPIRY`.
- **Live:** `LIVECRAFT_URL`, `LIVECRAFT_API_KEY`, `ZOOM_TOKEN_ENCRYPTION_KEY`.
- **OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **Billing:** `BILLING_BYPASS_ENABLED` (**false in prod**), `PAST_DUE_GRACE_DAYS`,
  `BILLING_FREE_PLAN_NAME`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,PRO}_{USD,EUR}` (optional pins).

> ⚠️ Live secrets are currently committed to `.env.prod` across the fleet and were exposed
> in-session — **rotate** S3, Stripe, Resend, LiveCraft, and `DJANGO_SECRET_KEY`. (See the
> "secrets to rotate" memory.)

---

## 13. Conventions & gotchas (read before coding)

1. **Public endpoints need `@authentication_classes([])`** — `AllowAny` is not enough.
2. **SSR fetches must send `X-Tenant-Domain`** — `undici` drops custom `Host`; without it
   you hit `public`.
3. **Build tenant domains from the slug** in `generateMetadata`/`manifest.ts`.
4. **Webhooks** mount **outside** `/api/v1` and outside auth, and force the `public` schema.
5. **`region` and `billing_currency` are immutable** once set.
6. **Only Gunicorn runs migrations** — never add migrate steps to Celery worker/beat entrypoints.
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
(Mar 24–25), bilingual TR/EN (May 11, since removed), and platform subscription payments (May 12 — the
5-phase Stripe billing plan). Each has a `plans/` and `specs/` doc.

---

## 15. Roadmap (confirmed June 2026)

Two tracks, confirmed by the owner:

- **Finish platform billing (Phases 2–4):** lifecycle/dunning UI, **Phase 3 quota
  enforcement** (turn today's log-only gates into hard **402**s), Phase 4 bilingual
  receipts + Prometheus metrics + admin support tooling.
- **M2 marketplace (student → coach payments):** **Stripe Connect**. The **coach is the merchant of
  record**; funds settle to the coach's connected/submerchant account and the platform
  automatically takes `transaction_fee_pct` (recording `submerchant_payout`). Uses the
  `stripe_account_id` field. Confirmed shape: **Stripe Connect Express, direct charges** (coach = merchant of
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

**Priority lens: global-first** (English; USD and EUR).

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
| Revenue model | **Both layers** — coach Starter/Pro subscriptions after a 14-day Starter trial (no Free plan for coaches since 2026-10-16) + a marketplace `transaction_fee_pct` cut on student sales (M2). |
| M2 provider | **Stripe Connect.** |
| Marketplace funds flow | **Coach is merchant of record**; platform skims `transaction_fee_pct`. |
| Market focus | **Global-first.** |
| Terminology | **coach + student** (canonical). |
| Doc audience | You + Claude, future sessions — keep dense/technical. |

Still genuinely open (fill in when decided):

1. **Concrete Starter / Pro prices** per currency (USD/EUR) — seeded amounts live in
   `seed_plans.py` (`PLAN_AMOUNTS`); confirm they're final.
2. **M2 vs. Phase 3–4 sequencing** — which of the two confirmed tracks ships first.
3. **Marketplace fee rate(s)** — the actual `transaction_fee_pct` per plan tier.
