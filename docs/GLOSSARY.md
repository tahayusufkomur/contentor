# Contentor — Glossary

Shared vocabulary for talking and writing about Contentor. Pairs with
[REFERENCE.md](REFERENCE.md). Terms are grouped by theme; **bold** = the canonical word
to use in conversation, code, and commits.

> When two words mean the same thing, the **bold** one is preferred. Flag drift: the code
> sometimes says "content creator" where we now say **coach**.

---

## People & roles

- **Coach** — the tenant owner; a paying customer who runs a site on Contentor. (Older
  copy says "content creator / creator" — prefer **coach**.) In code: `User.role` is
  `coach` in the public schema and `owner` in the tenant schema (same person, two rows).
- **Student** — an end user inside one coach's tenant who consumes/buys content.
  `User.role = student`, exists only in that tenant's schema.
- **Superadmin** — the platform operator (you). `is_superuser` in the public schema;
  manages tenants, plans, and platform billing.
- **Owner** — the in-tenant identity of a coach (`role=owner`, `is_staff=True`). Same human
  as the public-schema "coach"; distinct row in the tenant schema.

## Apps & surfaces

> Two Next.js frontends, each with its own `/admin`. The owner's conversational names are
> **main app** and **coach app** — use these; the directory names are the implementation.

- **Main app** — `frontend-main`. The **apex** site (`contentor.app` / `tr.contentor.app`)
  where coaches **discover Contentor, see pricing, sign up, and log in**, and where the
  **superadmin** runs the platform. Talks only to the `public` schema.
- **Coach app** — `frontend-customer`. The tenant-facing application that **runs each
  coach's own site** on their subdomain (`slug.contentor.app`): the public storefront +
  **student** portal *and* the coach's own admin. Tenant-scoped (sends `X-Tenant-Domain`).
- **Superadmin panel** — the `/admin/*` area **inside the main app**, gated to
  `IsSuperUser`. Manages tenants, **platform plans & pricing**, and platform billing.
  (Backend: `/api/v1/platform/*`.)
- **Coach admin** — the `/admin/*` area **inside the coach app**, where a coach manages
  their courses, billing, students, design, and email. *Distinct from the superadmin panel
  — both apps have an `/admin`; never conflate them.*
- **Notifications** (`apps.notifications`) — tenant-scoped web push + coach broadcast
  announcements (one-off or recurring) to students, plus email opt-out tracking.
- **Community** (`apps.community`) — tenant-scoped student social feed (posts, comments,
  reactions) with report-driven auto-hide and a coach moderation queue.
- **Blog** (`apps.blog`) — tenant-scoped coach blog on the public tenant site, with an AI
  topic queue and an autopilot generation schedule.
- **Mailbox** — dual-schema messaging (`apps.mailbox`): public rows = superadmin platform
  inbox, tenant rows = coach↔student/lead mail, both sharing the same `Conversation`/
  `Message` models.
- **Domains** (`apps.domains`) — public-schema custom-domain registration, pricing, and
  provisioning (registrar + Cloudflare + Resend) for a tenant's own domain.
- **Platform email** (`apps.platform_email`) — public-schema mirror of the coach email-
  campaign feature, used by the superadmin to email coaches via the platform's own
  MailCraft org.
- **Admin Kit** (`apps.adminkit`) — no models; the shared framework (`platform_site` /
  `studio_site`) that turns other apps' registered `ModelAdmin`s into API endpoints for
  the two admin SPAs.
- **Tags** (`apps.tags`) — tenant-scoped, coach-defined free-text labels scoped per
  content type; admin-only organization, never shown to students.
- **Filters** (`apps.filters`) — tenant-scoped, coach-defined structured filter
  groups/options meant to surface as student-facing browse facets.
- **Usage** (`apps.usage`) — tenant-scoped PWA-vs-browser session tracking for students,
  rolled up into an admin usage-adoption summary.

## Tenancy

- **Tenant** — one coach's isolated site = one PostgreSQL **schema** + one `Tenant` row.
  The unit of isolation.
- **Schema (schema-per-tenant)** — a PostgreSQL namespace holding all of one tenant's
  tables. Managed by **django-tenants**. `public` is the shared schema.
- **`public` schema** — the shared schema holding `SHARED_APPS` (`User`, `Tenant`,
  `PlatformPlan`, `PlatformSubscription`, …).
- **django-tenants** — the library implementing schema-per-tenant routing and migration.
- **Region** — `global` or `tr`. Immutable per tenant. Sets the domain shape, default
  locale, default currency, and the `tr_` schema prefix.
- **Slug** — the URL-safe tenant identifier (e.g. `gorkem-yoga`). Unique per region; the
  subdomain and schema name derive from it. Validated against **reserved slugs**.
- **Reserved slugs** — names a tenant can't take (`api`, `admin`, `www`, `tr`, `public`, …).
- **Apex** — the root marketing domain: `contentor.app` (global) / `tr.contentor.app` (TR).
  Served by `frontend-main`.
- **Tenant subdomain** — `slug.contentor.app` / `slug.tr.contentor.app`. Served by
  `frontend-customer`.
- **`X-Tenant-Domain`** — the header Next.js SSR sends to Django to name the target tenant
  (because Node's `undici` drops a custom `Host`). The multi-tenancy linchpin.
- **Provisioning** — the async creation of a tenant's schema + owner + config
  (`provision_tenant` Celery task). Tracked by `provisioning_status`.
- **Demo tenant** — a read-only marketing sandbox (`is_demo=True`); writes are blocked by
  `DemoReadOnlyMiddleware`.

## Content

- **Course → Module → Lesson** — the content tree. A course has modules; a module has
  lessons; a lesson plays a **Video** and/or shows HTML.
- **Video** — a reusable S3 video asset (`s3_key`); also used as a live-event recording.
- **Photo** — an image asset in S3 (UUID-keyed); thumbnails and branding.
- **Download** (`DownloadFile`) — a sellable or free downloadable resource (PDF, etc.).
- **Live event** — umbrella for the four live types below, all with a computed status
  (`draft → scheduled → live/ongoing → ended`):
  - **LiveClass** — interactive Stream.io video call (1:N + chat).
  - **LiveStream** — one-way Stream.io broadcast.
  - **ZoomClass** — an external Zoom meeting (link only, no SDK).
  - **OnsiteEvent** — an in-person event (location, capacity).
- **Enrollment** — a student's access record to a course.
- **Progress** — a student's per-lesson watch/completion record.
- **Niche template** — a pre-built starter pack of content (courses, plans, events) for a
  vertical (yoga, fitness, …), seeded as **drafts** at onboarding. Lives under
  `demo_data/<niche>.py`.

## Billing & access

- **Platform plan** (`PlatformPlan`) — a coach-facing tier: **Free / Starter / Pro**.
  Carries quotas + `transaction_fee_pct` + multi-currency `prices`.
- **Platform subscription** (`PlatformSubscription`) — the **coach → platform** Stripe
  subscription. Public schema. Statuses: `incomplete / active / past_due / canceled`.
- **(Coach) subscription plan** (`SubscriptionPlan`) — a **coach-defined membership tier**
  sold to students. Tenant schema. *Different from a platform plan.*
- **Subscription** (`Subscription`) — a **student → coach** recurring membership. Tenant
  schema. (Money collection = future marketplace.)
- **Dual-access pricing** — any **paid** item can be unlocked by *either* a one-off
  purchase *or* a subscription plan. Implemented via `SubscriptionPlanAccess`.
- **`pricing_type`** — `free` or `paid` (only these two). Subscription access is additive,
  not a pricing type.
- **Payment / PaymentItem** — a transaction and its line items (GenericFK to content).
- **Bundle** — a discounted group of content items sold together.
- **Quota** — a plan limit (`max_students`, `max_storage_gb`, `max_streaming_hours`,
  `max_campaign_emails`). **Log-only today**; enforced (HTTP 402) in Phase 3.
- **`transaction_fee_pct`** — the platform's percentage cut of a student's payment to a
  coach (for the future marketplace).
- **Submerchant / payout** — the coach as a payment-provider sub-account; `submerchant_payout`
  is what they receive after the platform fee. (iyzico / Stripe Connect — future.)
- **Bypass** — a dev-only payment provider that fakes an active subscription
  (`BILLING_BYPASS_ENABLED`). Prod refuses it.
- **Dunning** — the past-due → grace → downgrade-to-Free sweep (`PAST_DUE_GRACE_DAYS`,
  Celery beat).
- **`WebhookEvent`** — idempotency record so a replayed Stripe webhook is a no-op.

## Auth

- **JWT** — the auth token in the `contentor_access_token` cookie; claims include
  `user_id`, `tenant_id`, `role`, `region`.
- **`TenantJWTAuthentication`** — the default DRF auth class; scopes the token to the
  current tenant and rejects cross-region tokens.
- **Magic link** — passwordless student login via an emailed one-time token.
- **Cross-region rejection** — refusing a token whose `region` ≠ the request's region; the
  frontend redirects to the correct apex.

## Integrations & infra

- **Stream.io / GetStream** — the live video + chat provider (LiveClass/LiveStream).
- **MailCraft** — the **sibling** email-builder SaaS (`mailcraft.contentor.app`,
  project `emailBuilder`) that Contentor embeds for campaign templates.
- **`django-contentor-email-builder`** — the package that embeds the MailCraft iframe in
  Django admin.
- **Resend** — the transactional/campaign email **sending** service.
- **Hetzner object storage** — the S3-compatible store (`contentor-prod` bucket) for media.
- **Presigned upload / multipart upload** — direct-to-S3 upload patterns (single PUT vs.
  large-file chunked).
- **Caddy** — the prod edge reverse proxy on the home server. (**Traefik** is the dev one.)
- **Cloudflare Tunnel / cloudflared** — exposes the home server to the internet; terminates
  TLS at Cloudflare's edge.
- **Home server / the fleet** — the old MacBook (Ubuntu) hosting Contentor alongside
  sibling apps; deployed via `~/ws/home-server/deploy.sh`.

## Milestones (as used in specs)

- **M0** — pre-billing foundation.
- **M1** — coach→platform Stripe subscriptions (shipped).
- **M2** — the student→coach **marketplace** (confirmed, not yet built): **iyzico
  submerchants for TR, Stripe Connect for global**; the **coach is merchant of record** and
  the platform takes `transaction_fee_pct`.
- **Phase 0–4** — the sub-steps of the M1 platform-billing plan (Phase 3 = quota
  enforcement; Phase 4 = receipts/metrics/tooling).
