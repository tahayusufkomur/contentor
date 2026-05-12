# Platform Subscription Payments (Coach to Platform) Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real Stripe-backed billing for the coach-to-platform relationship — Free / Starter / Pro — for both Global (USD) and TR (TRY) coaches. Hosted Stripe Checkout only, no card data on our servers. Lifecycle, dunning, downgrade-to-Free, and entitlement gates all wired. **M1 is Stripe-only**; iyzico is reserved for the M2 marketplace milestone and is not pre-scaffolded here.

**Architecture:** `PaymentProvider` abstraction + a single `StripeProvider` concrete adapter (and a bypass adapter for dev). One European Stripe account serves both presentment currencies; branch on `Tenant.billing_currency` is purely for selecting the right `stripe_price_id` from `PlatformPlan.prices`. New `PlatformSubscription` and `WebhookEvent` rows in the public schema. Webhooks resolve tenants from `metadata.tenant_id`. Celery beat handles dunning. `Tenant.is_subscription_active` feeds the quota gates.

**Tech Stack:** Django 5.1 + DRF, django-tenants, `stripe-python`, Celery + Redis, Next.js 14 App Router, PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-05-12-platform-subscription-payments-design.md`

---

## File Structure

### Backend — new files

| File | Responsibility |
|---|---|
| `backend/apps/billing/providers/__init__.py` | `PaymentProvider` ABC + `get_provider(tenant)` factory |
| `backend/apps/billing/providers/stripe_provider.py` | Stripe Checkout, Portal, subscription mutations, webhook verification, invoice list |
| `backend/apps/billing/providers/bypass_provider.py` | Dev/test adapter; immediate-active flow gated by `BILLING_BYPASS_ENABLED` |
| `backend/apps/billing/providers/types.py` | `CheckoutSession` dataclass and other value objects |
| `backend/apps/billing/views/platform.py` | `/api/v1/billing/platform/*` endpoints |
| `backend/apps/billing/views/webhooks.py` | `/api/webhooks/stripe/` (public-schema, unauthenticated) |
| `backend/apps/billing/tasks/dunning.py` | Celery beat `cleanup_past_due_subscriptions` |
| `backend/apps/core/quotas.py` | `enforce_max_students` / `enforce_max_storage_gb` / `enforce_max_streaming_hours` / `enforce_max_campaign_emails` |
| `backend/apps/core/migrations/00XX_platform_subscription.py` | `PlatformSubscription` table |
| `backend/apps/core/migrations/00XX_webhook_event.py` | `WebhookEvent` table |
| `backend/apps/core/migrations/00XX_payment_platform_subscription_fk.py` | `Payment.platform_subscription` FK |
| `backend/apps/core/migrations/00XX_backfill_free_plan.py` | Data migration: seed Free plan + attach to plan-less tenants |
| `backend/stripe/portal_config.json` | Versioned Stripe Customer Portal configuration |

### Backend — modified files

| File | Change |
|---|---|
| `backend/apps/core/models.py` | `Tenant.is_subscription_active` property; `PlatformPlan.is_free` property |
| `backend/apps/billing/models/core.py` | `Payment.platform_subscription` FK (nullable, blank). `iyzico` choice stays reserved, unused in M1. |
| `backend/apps/billing/management/commands/seed_plans.py` | Upsert Free + Starter + Pro with USD and TRY `stripe_price_id`s from env; validate IDs via `stripe.Price.retrieve` when `STRIPE_SECRET_KEY` is set |
| `backend/apps/billing/urls.py` | Mount `views/platform.py` under `/api/v1/billing/platform/` |
| `backend/config/urls.py` | Mount `views/webhooks.py` at `/api/webhooks/` outside the v1 prefix and outside `TenantJWTAuthentication` |
| `backend/config/settings/base.py` | New env vars; `CELERY_BEAT_SCHEDULE` for `cleanup_past_due_subscriptions` (daily) |
| `backend/config/celery.py` | Register beat tasks |
| `backend/apps/core/middleware/region.py` | Skip region requirement for `/api/webhooks/*` |
| `backend/apps/core/middleware/tenant.py` | Skip tenant resolution for `/api/webhooks/*` (stay in public schema) |
| `backend/apps/media/views.py` | Wrap `upload_init` in `enforce_max_storage_gb` |
| `backend/apps/live/stream_service.py` | `start_session` calls `enforce_max_streaming_hours` |
| `backend/apps/email_campaigns/views.py` | `send_campaign` calls `enforce_max_campaign_emails` |
| `backend/apps/accounts/serializers.py` | Student-signup serializer calls `enforce_max_students` |
| `backend/apps/core/admin.py` | Inline `PlatformSubscription` on `Tenant` admin; actions "Reset to Free", "Mark active (support override)", "Re-sync from Stripe" |
| `backend/apps/billing/serializers/platform.py` | Serializers for the new endpoints |
| `backend/.env.example` | All env vars from the spec |
| `backend/apps/core/metrics.py` | Prometheus counters `billing_checkout_started/succeeded/failed`, `billing_webhook_received/duplicate/error`, `billing_dunning_downgrade_total` |
| `backend/apps/core/email.py` | Transactional templates: `subscription_activated`, `subscription_canceled`, `dunning_warning`, `subscription_downgraded` (en + tr) |

### Frontend-main — new/modified files

| File | Change |
|---|---|
| `frontend-main/src/lib/api/billing-platform.ts` | `startCheckout(planId)` — POSTs and redirects to `checkout_url` |
| `frontend-main/src/app/pricing/page.tsx` | Wire CTAs to `startCheckout`; show spinner on click; handle `PRICE_NOT_AVAILABLE` |
| `frontend-main/messages/{en,tr}/pricing.json` | "Get Starter", "Processing...", error strings |

### Frontend-customer — new/modified files

| File | Change |
|---|---|
| `frontend-customer/src/lib/api/billing-platform.ts` | `getSubscription`, `getInvoices`, `cancelSubscription`, `openPortal` |
| `frontend-customer/src/app/admin/billing/page.tsx` | Add "Subscription" tab (default landing when `?checkout=success`) |
| `frontend-customer/src/app/admin/billing/subscription/SubscriptionTile.tsx` | Plan, status, currency, next billing date, Cancel button |
| `frontend-customer/src/app/admin/billing/subscription/InvoicesList.tsx` | Paginated list of Stripe invoices with hosted PDF links |
| `frontend-customer/src/app/admin/billing/subscription/PaymentMethodCard.tsx` | "Manage in Stripe" button → `/platform/portal/` → redirect |
| `frontend-customer/src/app/admin/billing/subscription/CancelDialog.tsx` | Confirm modal |
| `frontend-customer/src/app/admin/billing/subscription/ChangePlanDialog.tsx` | Plan picker; calls checkout with the new plan |
| `frontend-customer/src/components/InactiveSubscriptionBanner.tsx` | Sticky banner when `is_subscription_active=false` |
| `frontend-customer/messages/{en,tr}/admin.json` | All subscription strings |

### Infrastructure — modified files

| File | Change |
|---|---|
| `contentor/docker-compose.yml` | Pass `STRIPE_*`, `BILLING_BYPASS_ENABLED`, `PAST_DUE_GRACE_DAYS` into `django`, `celery-worker`, `celery-beat` |
| `contentor/.env.example` | Mirror `backend/.env.example` |
| `contentor/Makefile` | New targets: `make seed-stripe-portal-config`, `make stripe-listen` |
| `contentor/traefik/dynamic/*.yml` | Verify `/api/webhooks/*` is reachable on the platform apex (already covered by `/api/*`) — no auth middleware interposes |

---

## Phases

5 phases. Each is independently mergeable, reversible, and ships a working state. **Stop after each, run `make migrate && make test && make dev`, verify, continue.**

### Phase 0 — Abstraction skeleton + data model + bypass parity

Goal: lay the structural foundation without touching real Stripe APIs. Bypass keeps working under env flag. New tables exist. Old endpoints unchanged.

- [ ] Create `apps/billing/providers/__init__.py` with the `PaymentProvider` ABC and `get_provider(tenant)` factory — returns `BypassProvider` when `BILLING_BYPASS_ENABLED=true`, otherwise `StripeProvider`
- [ ] Create `apps/billing/providers/types.py` with `CheckoutSession` and friends
- [ ] Create `apps/billing/providers/bypass_provider.py` — immediate-active flow; emits a synthetic `WebhookEvent` for parity with the real adapter
- [ ] Stub `apps/billing/providers/stripe_provider.py` — class skeleton whose methods raise `NotImplementedError` (Phase 1 fills them in). **Do not stub iyzico** — it does not exist in M1.
- [ ] Add migrations: `PlatformSubscription`, `WebhookEvent`, `Payment.platform_subscription` FK, backfill Free plan + attach to every plan-less tenant
- [ ] Add `Tenant.is_subscription_active` property and `PlatformPlan.is_free`
- [ ] Wire env vars: `BILLING_BYPASS_ENABLED`, `PAST_DUE_GRACE_DAYS`, `BILLING_FREE_PLAN_NAME`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER_USD`, `STRIPE_PRICE_PRO_USD`, `STRIPE_PRICE_STARTER_TRY`, `STRIPE_PRICE_PRO_TRY` (all default empty)
- [ ] Production settings: refuse `env=prod` + `BILLING_BYPASS_ENABLED=true` with `ImproperlyConfigured`
- [ ] Update `seed_plans` to upsert Free + Starter + Pro with both currencies; validate Stripe IDs via `stripe.Price.retrieve` only when `STRIPE_SECRET_KEY` is set (skip in CI)
- [ ] Create `apps/core/quotas.py` with `enforce_*` helpers — Phase 0 implementation only checks `tenant.is_subscription_active`, returns plan-limit lookups; does **not** yet enforce at call sites
- [ ] Unit tests:
  - `get_provider` returns bypass under env flag, Stripe otherwise
  - `PlatformPlan.prices["USD"].stripe_price_id` and `["TRY"].stripe_price_id` round-trip through the seed command
  - `Tenant.is_subscription_active` False when no `PlatformSubscription`, True when status in {active, past_due}
  - `WebhookEvent` unique constraint on `(provider, provider_event_id)` raises `IntegrityError` on dup
  - Production settings refuse the bypass+prod combination
- [ ] `make migrate && make test && make dev`
- [ ] Manual smoke:
  - Existing pricing page CTA still routes to the legacy bypass flow (unchanged)
  - `python manage.py shell` — create a `PlatformSubscription(provider="bypass", status="active")`; confirm `Tenant.is_subscription_active` flips
  - `make seed` writes Free with empty `prices` and Starter/Pro with both USD + TRY entries

### Phase 1 — Stripe Checkout end-to-end (both currencies)

Goal: a coach in either region can complete a real Stripe Checkout in test mode. Success path lands them on `/admin/billing?checkout=success` with the subscription tile showing Starter active. TR coaches see Stripe in Turkish charging TRY; Global coaches see English charging USD.

- [ ] Implement `StripeProvider.create_checkout_session`: `mode="subscription"`, line item from `plan.prices[tenant.billing_currency].stripe_price_id`, `customer_email=user.email`, `locale=user.preferred_locale` (en|tr), `metadata={tenant_id, plan_id, region}`, success/cancel URLs include `session_id={CHECKOUT_SESSION_ID}`
- [ ] Implement `POST /api/v1/billing/platform/checkout/` view with the `billing_currency` lock-on-first-checkout pattern (derive from region, persist atomically)
- [ ] Implement `POST /api/webhooks/stripe/` — `@authentication_classes([])`, `@csrf_exempt`, public schema; `stripe.Webhook.construct_event` for signature verification
- [ ] Implement webhook handlers for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `invoice.paid` — create/update `PlatformSubscription`, mirror `Tenant.plan`
- [ ] Implement webhook idempotency dispatcher: `WebhookEvent.objects.create` first, `IntegrityError` → 200 OK fast-path
- [ ] Implement `GET /api/v1/billing/platform/subscription/` view
- [ ] Add `frontend-main/src/lib/api/billing-platform.ts` and wire `pricing/page.tsx` CTAs for both regions (region-aware pricing already exists from the bilingual milestone)
- [ ] Add `SubscriptionTile` to `frontend-customer/src/app/admin/billing/page.tsx`; default tab when `?checkout=success`
- [ ] Implement the 30-second post-checkout polling pattern
- [ ] Configure Stripe Dashboard test-mode webhook endpoint pointing at `https://<dev-tunnel>/api/webhooks/stripe/`; store secret in `.env`
- [ ] Add `make stripe-listen` (`stripe listen --forward-to localhost/api/webhooks/stripe/`) for local-dev forwarding
- [ ] **Pre-flight verification (manual, before integration tests):** confirm TRY presentment is enabled on the European Stripe account; document the check in `.env.example`
- [ ] Integration tests:
  - Checkout call from a Global tenant with empty `billing_currency` persists USD and returns a `stripe_checkout_url` with the USD price ID
  - Checkout call from a TR tenant persists TRY and returns a session with the TRY price ID and `locale="tr"`
  - Webhook with valid signature creates `PlatformSubscription(status=active)`, mirrors `Tenant.plan`
  - Webhook replay returns 200, no second `Payment` row
  - Webhook with bad signature returns 400
  - Subscription endpoint returns the active sub; Free tenants get `{status: "free"}`
- [ ] `make migrate && make test && make dev`
- [ ] Manual smoke:
  - Sign up a new Global tenant → land in `/admin` on Free → `/pricing` → Get Starter → Stripe Checkout (English, USD) → card `4242 4242 4242 4242` → tile shows Starter active within 30s
  - Sign up a new TR tenant on `tr.localhost` → `/pricing` (TRY) → Get Starter → Stripe Checkout in Turkish charging TRY → tile shows Starter active

### Phase 2 — Lifecycle (cancel, portal, invoices, dunning)

Goal: a subscription can be canceled in-app, the Stripe Customer Portal opens for both currencies, invoices show, and payment-failure flows into past_due → canceled with the Tenant downgraded to Free.

- [ ] Implement `StripeProvider.cancel_subscription(provider_subscription_id)` (calls `stripe.Subscription.modify(cancel_at_period_end=True)`)
- [ ] Implement `StripeProvider.create_customer_portal_session(provider_customer_id, return_url)`
- [ ] Implement `POST /api/v1/billing/platform/cancel/` and `POST /api/v1/billing/platform/portal/`
- [ ] Implement `GET /api/v1/billing/platform/invoices/` (calls `stripe.Invoice.list`)
- [ ] Add webhook handlers for `invoice.payment_failed` (→ past_due) and `customer.subscription.deleted` (→ canceled)
- [ ] Implement Celery beat `cleanup_past_due_subscriptions` task; daily schedule
- [ ] Implement Free-plan downgrade on terminal cancel (sets `Tenant.plan = Free`)
- [ ] Frontend: wire Cancel button + confirm modal + "Manage in Stripe" portal redirect + `InvoicesList`
- [ ] Frontend: past_due banner with Retry-Payment hint pointing at the portal
- [ ] Check in `stripe/portal_config.json` (with Turkish + English support) and a `make seed-stripe-portal-config` script that POSTs it via `stripe.billing_portal.Configuration.create`
- [ ] Integration tests:
  - Cancel flow flips `cancel_at_period_end=True`; tile shows "cancels on <period_end>"
  - `invoice.payment_failed` → past_due
  - `cleanup_past_due_subscriptions` with `PAST_DUE_GRACE_DAYS=0` flips past_due → canceled and downgrades plan to Free
  - InvoicesList returns rows ordered desc with Stripe invoice IDs and hosted URLs
- [ ] `make migrate && make test && make dev`
- [ ] Manual smoke:
  - `stripe trigger invoice.payment_failed` → tile shows past_due
  - Force-run `cleanup_past_due_subscriptions` → tile shows canceled + Free
  - Stripe Customer Portal: open from a Global tile (English UI); open from a TR tile (Turkish UI)
  - Cancel via in-app button → "cancels on <period_end>"; refund/reactivate via Stripe Dashboard reflects on next event

### Phase 3 — Entitlement enforcement

Goal: tenant-level quotas (`max_students`, `max_storage_gb`, `max_streaming_hours`, `max_campaign_emails`) are actually enforced. Inactive subscriptions hard-block writes; over-quota actions return 402.

- [ ] Flesh out `apps/core/quotas.py`:
  - Each `enforce_*` helper returns silently on OK, raises `QuotaExceeded` on over-limit, raises `SubscriptionInactive` on `is_subscription_active=False`
  - DRF exception handler maps both to 402 with codes `QUOTA_EXCEEDED` and `SUBSCRIPTION_INACTIVE`
- [ ] Wire enforcement into:
  - `apps.accounts.serializers` student signup → `enforce_max_students`
  - `apps.media.views.upload_init` and `apps.courses` upload paths → `enforce_max_storage_gb`
  - `apps.live.stream_service.start_session` → `enforce_max_streaming_hours`
  - `apps.email_campaigns.views.send_campaign` → `enforce_max_campaign_emails`
- [ ] Implement soft-warning thresholds at 80% of any quota: emit a `tenant.quota.warning` signal (Phase 4 wires the email)
- [ ] Frontend: `InactiveSubscriptionBanner` on every `/admin/*` route when subscription status is `canceled` or `past_due` (sticky, dismissible per-session)
- [ ] Frontend: per-resource error toasts on 402 with "Upgrade your plan" CTA
- [ ] Integration tests:
  - Tenant on Free creates 10th student OK, 11th returns 402 `QUOTA_EXCEEDED`
  - Tenant with canceled subscription cannot upload media (402 `SUBSCRIPTION_INACTIVE`)
  - Existing students keep access after downgrade (read paths unaffected)
- [ ] Update existing tests that incidentally create > Free-limit objects to bump the tenant to Starter in test setup
- [ ] `make migrate && make test && make dev`
- [ ] Manual smoke:
  - Tenant on Free: try to invite 11 students → blocked at the 11th
  - Downgrade tenant to Free via admin "Reset to Free" → next media upload blocked
  - Re-upgrade via checkout → upload works again

### Phase 4 — Polish: receipts, observability, i18n, support tooling

Goal: production-ready. Bilingual transactional emails go out. Prometheus tracks every event. Support has admin tools for edge cases.

- [ ] Add Resend transactional templates (en + tr): `subscription_activated`, `subscription_canceled`, `dunning_warning`, `subscription_downgraded`
- [ ] Wire templates to lifecycle events:
  - `subscription_activated` on `incomplete → active`
  - `dunning_warning` on entry to `past_due`
  - `subscription_canceled` on terminal cancel
  - `subscription_downgraded` on dunning-driven downgrade
  - Language selection from `User.preferred_locale`, fallback to `TenantConfig.default_locale`, fallback to region default
- [ ] Add i18n strings for all subscription UI (en + tr); run the existing `check-i18n-parity` CI
- [ ] Add Prometheus counters in `apps/core/metrics.py`:
  - `billing_checkout_started{plan, currency}`
  - `billing_checkout_succeeded{plan, currency}`
  - `billing_checkout_failed{plan, currency, reason}`
  - `billing_webhook_received{event_type, result}`
  - `billing_webhook_duplicate{event_type}`
  - `billing_webhook_error{event_type}`
  - `billing_dunning_downgrade_total`
- [ ] (Optional) Add Grafana dashboard JSON `infrastructure/grafana/billing.json` with panels for the above
- [ ] Django admin tooling on `PlatformSubscription`:
  - Action "Mark active (support override)"
  - Action "Reset to Free"
  - Action "Re-sync from Stripe" (calls `stripe.Subscription.retrieve` and reconciles)
  - Inline display of recent `WebhookEvent` rows
- [ ] Audit log: every admin action emits to the existing audit log app
- [ ] Run `make test && make lint`
- [ ] Update root `contentor/CLAUDE.md` "Architecture / billing" section with the `PaymentProvider` abstraction and webhook routing rules
- [ ] Bump the multi-tenancy memory reference with the webhook-public-schema rule
- [ ] Update `docs/superpowers/specs/2026-05-12-platform-subscription-payments-design.md` Status to `Shipped`

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Stripe rejects TRY presentment for our merchant category | Phase 1 pre-flight check confirms TRY is enabled before integration tests run. Document the verification in `.env.example`. |
| European Stripe account regulatory limits on TR billing | Confirm with Stripe support before going live in TR. Code already supports TRY; the gate is operational, not technical. |
| FX volatility (we settle in EUR, charge in TRY) erodes margin | Accepted cost. TR pricing reviewed quarterly out-of-band. |
| Stripe Customer Portal misconfiguration grants unintended self-service | Portal config checked into `stripe/portal_config.json` and applied via `make seed-stripe-portal-config`; reviewable in PR diff. |
| Webhook race vs success_url redirect leaves frontend showing stale Free state | 30s polling window in customer admin + optimistic Redis hint set by webhook on `Tenant.id`. |
| Celery beat doesn't run in dev, so dunning never fires locally | `make dev` includes `celery-beat`. Manual `python manage.py shell -c "from apps.billing.tasks.dunning import cleanup_past_due_subscriptions; cleanup_past_due_subscriptions()"` for one-shot runs. |
| Downgrade leaves a tenant with active assets exceeding Free limits | Soft downgrade by design — reads unaffected, writes blocked. Banner explains the state. |
| Dunning sweep races with a webhook update on the same row | Both wrap `PlatformSubscription` mutations in `select_for_update`. |
| `BILLING_BYPASS_ENABLED=true` accidentally enabled in production | Settings loader refuses `env=prod` + bypass; CI smoke tests the prod settings file. |
| Stripe price ID typo in env causes wrong-amount charges | `seed_plans` calls `stripe.Price.retrieve` and asserts `currency` and `unit_amount` match expectations. |
| Cross-region webhook misroute | Tenant resolution from `metadata.tenant_id`; `Tenant.billing_currency` asserted against the event's currency before processing. |
| `PaymentProvider` adapter regressions break the bypass path silently | Bypass adapter has its own contract test that runs in CI even without Stripe creds. |
| Tenants with `plan=NULL` exist in production from old seeding | Phase 0 data migration backfills Free; quota gates treat NULL as Free limits as defense-in-depth. |

---

## Rollback Plan

Each phase is individually reversible:

- **Phase 0**: drop the new migrations + delete provider stubs. `Tenant.is_subscription_active` becomes a no-op; bypass keeps working via the legacy `subscribe` endpoint untouched.
- **Phase 1**: revert `pricing/page.tsx` CTA wiring; delete `views/platform.py` + `views/webhooks.py`. The Stripe Dashboard webhook becomes a no-op (404). `PlatformSubscription` rows linger harmlessly.
- **Phase 2**: keep webhooks live (handlers we keep stay registered), revert Cancel/Portal/Invoices UI. Remove the dunning beat task from the schedule without code deletion.
- **Phase 3**: feature-flag the `enforce_*` helpers to no-op via `BILLING_QUOTAS_ENFORCED=false`. All gates pass-through.
- **Phase 4**: revert Prometheus counters, email wiring, admin actions. Core flow unaffected.

---

## Final Validation Checklist (after Phase 4)

- [ ] Global signup → land on Free → `/pricing` → Get Starter → Stripe Checkout (English, USD) → success → tile shows Starter active within 30s
- [ ] TR signup on `tr.localhost` → same flow → Stripe Checkout (Turkish, TRY) → success → tile shows Starter active
- [ ] Stripe webhook duplicate → 200, no dup Payment, `WebhookEvent` duplicate counter increments
- [ ] `invoice.payment_failed` on Stripe → past_due tile + dunning_warning email sent in the coach's locale
- [ ] `cleanup_past_due_subscriptions` with `PAST_DUE_GRACE_DAYS=0` → canceled + Free + subscription_canceled email
- [ ] Cancel button → Stripe Subscription marked `cancel_at_period_end=true`; tile shows "cancels on <period_end>"
- [ ] Stripe Customer Portal opens in Turkish for a TR tenant; in English for a Global tenant
- [ ] Tenant on Free with 10 students cannot add an 11th (402 `QUOTA_EXCEEDED`)
- [ ] Tenant with canceled subscription gets 402 `SUBSCRIPTION_INACTIVE` on media upload
- [ ] All subscription UI strings render in TR on TR tenants; activation email arrives in Turkish for TR coach
- [ ] Prometheus counters tick correctly through one full happy-path flow
- [ ] Bypass flow works in dev (`BILLING_BYPASS_ENABLED=true`) with no Stripe keys
- [ ] Production settings refuse `BILLING_BYPASS_ENABLED=true`
- [ ] `make test` passes; `make lint` clean
- [ ] CLAUDE.md updated; spec status flipped to Shipped
