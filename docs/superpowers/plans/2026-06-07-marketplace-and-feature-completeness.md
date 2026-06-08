# Student→Coach Marketplace + Feature Completeness — Plan

> Goal of the body of work: make Contentor **functionally complete** — i.e. real money
> moves between students and coaches, the lifecycle around it works, and the superadmin
> can manage pricing without code. Quota *enforcement* (Phase 3 teeth) is explicitly
> **deferred**; this plan is about functionality, not gating.
>
> Companion docs: [../../REFERENCE.md](../../REFERENCE.md), [../../GLOSSARY.md](../../GLOSSARY.md).
> Reference implementation pattern: the shipped M1 coach→platform billing
> (`2026-05-12-platform-subscription-payments.md`) — we mirror its provider/webhook shape.

## The core finding (why this plan is bounded)

The app is **~80% scaffolded**. Cart, store, checkout, `payment_initialize`, `subscribe`,
refunds, access-gating (dual-access `ContentAccessService`), and all content authoring
already work **end-to-end on `provider="bypass"`**. The dominant gap is simply that **no
real payment processor is wired**. So the work is: *replace bypass with Stripe Connect,
complete the lifecycle, fill the missing UIs, and add an admin pricing write-path.*

## Scope

**In:** Stripe-only, **global-first** marketplace (students pay coaches), coach payout
onboarding, real one-time + subscription payments with the platform fee, refunds UI,
receipts/earnings, and admin-managed platform pricing.

**Out / deferred (named, not silently dropped):**
- **iyzico + TR marketplace** — follows once the Stripe path is proven.
- **Quota enforcement (Billing Phase 3) + dunning teeth** — later, per owner.
- **Video transcoding / HLS** — `contentorVideoProcessor` exists but is unintegrated;
  raw S3 playback works today (see §Deferred).
- **Tax/VAT** — coach is merchant of record; out of v1.
- **Pages editor** (`/admin/pages` is "coming soon") — cosmetic, not a money path.

## Key decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Grandfather by default**: changing a price creates a *new* Stripe Price and swaps `prices[currency].stripe_price_id`; existing subscribers keep their old price. Migrations are manual, per-subscriber. Applies at **both** levels (platform→coach and coach→student). | ✅ confirmed |
| D2 | Marketplace is **Stripe Connect, global-first**; iyzico/TR deferred. | ✅ confirmed |
| D3 | **Coach is merchant of record**; platform takes `transaction_fee_pct`. | ✅ confirmed |
| D4 | **Monetization is the upgrade lever.** **Free coaches can never get paid in the app** — no payouts, no paid content/subscriptions/bundles; everything they offer must be free. Charging students requires a **paid plan (Starter/Pro) with an active subscription**. Paid tiers carry a marketplace fee, lower on the higher tier: **Starter = 5%, Pro = 4%**. | ✅ confirmed |
| D5 | **Coach handles refunds.** | ✅ confirmed |
| D6 | **Connect account type = Express** (Stripe-hosted onboarding, platform-branded, coach gets a limited payouts dashboard). | ✅ confirmed |
| D7 | **Charge model = direct charges on the connected account** (charge created *on* the coach's account; platform takes `application_fee_amount`). Makes the coach merchant-of-record + dispute/refund owner, matching D3/D5. | ✅ confirmed |
| D8 | **On refund, the platform keeps its application fee** (do *not* set `refund_application_fee`). | ✅ confirmed |
| D9 | Video transcoding **deferred**; integrate `contentorVideoProcessor` (`process.contentor.app`) after the marketplace. Raw S3 playback for now. | ✅ confirmed |

> Before writing any Stripe Connect code, verify the D6/D7 specifics against current Stripe
> docs (Connect account types, direct vs destination charges, `application_fee_amount`,
> `account_links`, dispute/refund liability) — these APIs evolve.

## Architecture

**Money flow (one-time, direct charge):**
```
student → Stripe Checkout (created ON coach's connected acct, stripe_account=acct_X)
        → application_fee_amount = round(total * plan.transaction_fee_pct)
        → funds settle to coach (merchant of record); platform fee → platform balance
webhook (checkout.session.completed / payment_intent.succeeded, from connected acct)
        → mark Payment completed, set provider="stripe", record platform_fee + submerchant_payout
        → _grant_access() (courses, downloads, live, bundle-contents)
```

**Subscriptions:** a Stripe subscription created on the connected account with
`application_fee_percent`; `invoice.paid` renews, `invoice.payment_failed` → `past_due`,
`customer.subscription.deleted` → expire/cancel — all updating the **tenant** `Subscription`
(not `PlatformSubscription`).

**Webhook routing:** Connect events arrive with an `account` field and (for direct charges)
must be read in that connected account's context; resolve the tenant from
`Tenant.stripe_account_id == event.account` (or `metadata.tenant_id`). Keep the existing
`/api/webhooks/stripe/` public-schema + `WebhookEvent` idempotency pattern; add a
Connect-event branch (or a separate `/api/webhooks/stripe/connect/` endpoint).

**Pricing write-path (D1):** a superadmin PATCH on `PlatformPlan` that, when the amount
changes, calls `stripe.Price.create(...)`, writes the new id into `prices[currency]`, and
leaves existing `PlatformSubscription` rows untouched.

## Current state (grounded by the 2026-06-07 audit)

- Backend student payments: `apps/billing/views/payments.py` — `payment_initialize`,
  `subscribe`, `payment_item_refund`, `_grant_access` all exist, **bypass-only**;
  `_grant_access` is **Course-only** (gap).
- Stripe Connect: **none** — `Tenant.stripe_account_id` unused; no `application_fee`,
  `account_links`, `transfer_data`.
- Coach app: monetization authoring (plans, bundles, per-item pricing, dual-access
  linking) **works**; **no payouts UI, no refund UI, no per-student payment view**.
- Student app: cart (`lib/cart.ts`), store, checkout, enroll-button, plans, access-gating
  all **work on bypass**; **no cancel/change subscription, no receipts**.
- Platform billing (coach→platform): checkout + core webhooks **shipped**; portal/cancel
  were `NotImplementedError("Phase 2")` at M1 — confirm current status before Phase E.
- Admin pricing: `platform_plans` is **GET-only**; writes only via Django admin + `seed_plans`.

---

## Phases

Each phase is independently shippable and reversible. **After each: `make migrate &&
make test && make dev`, verify, then continue.** Suggested order is A → B → C → D → E, but
A is independent and can ship anytime.

### Phase A — Admin-managed pricing (main app) — *small, independent, unblocks experiments*

- [ ] Backend: superadmin-only `PATCH`/`POST` on `PlatformPlan` (`apps/core/views_platform.py`)
      for `name`, limits, `transaction_fee_pct`, `is_live_enabled`, and per-currency amounts.
- [ ] On amount change: `stripe.Price.create` + swap `prices[currency].stripe_price_id`
      (D1 grandfathering); never mutate existing `PlatformSubscription` rows.
- [ ] Plan create/archive (respect the `Tenant.plan` PROTECT FK — archive, don't delete).
- [ ] Main-app superadmin UI: edit form on `/admin/plans` (currently read-only cards).
- [ ] Tests: price change creates a new Stripe Price, old subscribers unaffected; archive blocked when tenants attached.

### Phase B — Stripe Connect foundation + coach payout onboarding — *keystone prerequisite*

- [ ] `StripeConnectProvider` (or extend `StripeProvider`): create Express account,
      `account_links` onboarding URL, retrieve account status.
- [ ] Endpoints: `POST /api/v1/billing/connect/onboard/` (returns onboarding URL),
      `GET /api/v1/billing/connect/status/` (charges_enabled / payouts_enabled).
- [ ] Webhook: `account.updated` → persist `charges_enabled`/`payouts_enabled` (add fields
      or derive) and surface readiness.
- [ ] Store `Tenant.stripe_account_id`; resolve tenant from it in the webhook handler.
- [ ] Coach app: **Payouts** page (`/admin/payouts` or under `/admin/billing`) — connect
      CTA, status, link to the Stripe Express dashboard.
- [ ] **Monetization gate (D4)** — a `can_monetize(tenant)` helper, true only when the
      tenant is on a **paid plan** with `is_subscription_active` **and** `charges_enabled`.
      Free-tier tenants can never reach Connect onboarding or publish paid content.
      Enforce server-side on: Connect onboarding, setting any `pricing_type="paid"` / price,
      publishing paid content, and `payment_initialize`/`subscribe` (Phases C/D).
- [ ] Coach app: hide/disable payouts + paid-pricing UI for Free tenants with an
      "Upgrade to start selling" CTA; show the connect-payouts CTA for paid tenants.
- [ ] Tests: onboarding link issued for paid+active only; Free tenant blocked from paid
      content and Connect; status reflects the `account.updated` webhook.

### Phase C — Real one-time checkout via Connect — *the keystone*

- [ ] Replace bypass in `payment_initialize`: create a Stripe Checkout Session **on the
      connected account** with line items from the cart and
      `application_fee_amount = round(total * plan.transaction_fee_pct)` (D4/D7).
- [ ] Return `checkout_url`; student redirected to hosted Checkout (3DS handled by Stripe).
- [ ] Webhook branch for connected-account `checkout.session.completed` /
      `payment_intent.succeeded` → mark `Payment` completed, set `provider="stripe"`,
      record `platform_fee` + `submerchant_payout`, idempotent via `WebhookEvent`.
- [ ] **Fix `_grant_access`** to grant **all** content types (course → Enrollment;
      download/live access; bundle → expand to contents), not just Course.
- [ ] Keep `BILLING_BYPASS_ENABLED` working for dev/CI parity (bypass short-circuits to a
      synthetic completed Payment as today).
- [ ] Frontend: checkout page redirects to Stripe; success page polls for access (mirror
      the M1 30s polling pattern); cart cleared on success.
- [ ] Tests: a paid course purchase on a connected test account grants access via webhook;
      fee split recorded; replay is a no-op; bypass path still green.

### Phase D — Student subscriptions via Connect (recurring lifecycle)

- [ ] `subscribe` creates a Stripe subscription on the connected account with
      `application_fee_percent`; persist provider ids on the tenant `Subscription`.
- [ ] Webhooks → tenant `Subscription`: `invoice.paid` (extend period), `invoice.payment_failed`
      (`past_due`), `customer.subscription.deleted` (expire/cancel).
- [ ] Cancel endpoint (`cancel_at_period_end`) + change-plan via existing `pending_plan`.
- [ ] Coach→student price changes follow D1 (new Price; existing students grandfathered).
- [ ] Student app: subscription card (status, renews/cancels-on date), Cancel + Change-plan.
- [ ] Tests: subscribe → active; failed invoice → past_due; cancel → cancels at period end;
      plan change applies next cycle.

### Phase E — Refunds (coach UI) + receipts/earnings — *round out*

- [ ] Wire the existing refund endpoint to a **real Stripe refund** on the connected
      account; honor D8 (keep platform fee unless set otherwise).
- [ ] Coach app: refund UI (per-student / per-payment view) exposing the refund endpoint;
      add per-student payment history (audit found `/admin/students` is roster-only).
- [ ] Coach **earnings/payout dashboard** (aggregate `Payment.submerchant_payout`, pending
      vs settled — pull from Stripe balance/payouts).
- [ ] Student **order history + receipts** (Stripe-hosted invoice/receipt links).
- [ ] Tests: refund reverses access appropriately; earnings totals match; receipts resolve.

---

## Deferred / decide-later

- **iyzico + TR marketplace** — mirror Phases B–E with iyzico submerchants once Stripe is
  proven. `Tenant.iyzico_submerchant_id` + `provider="iyzico"` are reserved.
- **Quota enforcement (Billing Phase 3) + dunning teeth** — the existing log-only
  `apps/core/quotas.py` gates become 402s; the in-app upgrade-wall is the upsell surface.
- **Video transcoding / HLS** — today coaches upload to S3 and students get raw presigned
  playback (works, but no compression/adaptive bitrate/auto-thumbnails). The standalone
  **`contentorVideoProcessor`** (Django + Airflow + FFmpeg, at `process.contentor.app`) is
  a working transcoder that is *not* wired in. Integration option (later): trigger it on
  upload-complete, store processed variants on `Video`, serve an HLS manifest, generate
  thumbnails. **Decision D9: defer.**
- **Pages editor**, photos/videos as sellable products — out of the money path.

## Open decisions to confirm before/within each phase

Resolved: D6 Express, D7 direct charges, D8 platform keeps the fee on refund,
D4 fees Starter 5% / Pro 4%, **Free can never monetize** (gate built in Phase B),
D9 video transcoding deferred. Still open:

1. **Starter / Pro subscription prices** (USD monthly) — needed for Phase A and the
   pricing UI. (TR/TRY follows later with the TR marketplace.)

## Risks

| Risk | Mitigation |
|---|---|
| Connect liability/MoR nuance differs from assumption | Confirm D6/D7 against Stripe docs in Phase B before building; spike a test connected account. |
| Webhook context for connected accounts (the `account` field, direct-charge event reads) | Resolve tenant by `stripe_account_id`; reuse `WebhookEvent` idempotency; integration-test replays. |
| Coaches can take payments before payouts are enabled | Phase B gate on `charges_enabled`. |
| Price-swap accidentally migrates existing subscribers | D1 is forward-only by construction; test that old subs keep their Price. |
| Bypass parity rot once Stripe lands | Keep the bypass adapter + its contract test green in CI (as M1 did). |
| `_grant_access` still partial → paid downloads/live don't unlock | Explicit task in Phase C with per-type tests. |
