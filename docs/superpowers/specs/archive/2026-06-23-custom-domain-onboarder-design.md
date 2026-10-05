# Custom Domain Onboarder + Coach Inbox — Design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Scope owner:** platform (coach → Contentor billing + provisioning)

## Summary

Let a coach attach a **custom domain** to their tenant platform from the
marketing/coach app. The coach searches for a domain; we check availability and
pricing via **AWS Route 53 Domains**, sell it to them as a **yearly Stripe
subscription** (our cost × 1.20, rounded up to the whole currency unit), then
provision it end-to-end: register the domain, move its nameservers to
**Cloudflare**, route it through the existing Cloudflare Tunnel → Caddy →
`nextjs-customer`, and wire up email.

Email is first-class: the domain ships with **sender authentication** (send
campaign/transactional mail as `coach@theirdomain.com` via Resend) and a
**built-in inbox** in the coach dashboard — inbound mail is received via a
**Cloudflare Email Worker**, stored per-tenant, and the coach reads and replies
in-app (replies sent through Resend).

Because **we own the domain**, we control its nameservers and run it as a normal
Cloudflare **zone**. Universal SSL issues the cert automatically and a single
proxied DNS record rides the existing tunnel catch-all — **no Cloudflare for
SaaS / custom-hostname cert dance required.**

## Goals

- Coach can search → purchase → go live on a custom domain without touching DNS.
- One predictable yearly price with a transparent 20% brokerage margin.
- Platform emails send from the coach's domain.
- Coach receives and replies to student email inside Contentor.
- Registrar and Cloudflare access sit behind mockable interfaces so CI never
  makes real purchases or DNS changes.

## Non-goals (this feature)

- **Connect an existing domain** the coach already owns elsewhere (would need
  Cloudflare for SaaS custom hostnames). Fast-follow.
- **More than one** custom domain per tenant.
- **Hosted mailboxes** (IMAP/webmail, per-seat). Out of scope; the inbox is a
  Contentor-native conversation view, not a general mail host.
- Inbox folders/labels, multi-agent assignment, search beyond basic filtering.

## Assumptions

- Credentials for AWS (Route 53 Domains + IAM), Cloudflare (API token with
  Zone + Email Routing + Workers scope), and Resend are provided via env/secrets
  (`.env.prod` + dev settings). `bypass`/fake impls are used in dev/CI.
- The Cloudflare Tunnel ingress has a **catch-all** rule routing any proxied
  hostname to `contentor-caddy:80`. **Must verify** during Phase 1; if ingress is
  per-hostname, provisioning adds a tunnel hostname route as an extra step.
- Route 53 `RegisterDomain` registrant contact defaults from the coach's account
  profile, with a wizard step to review/override.
- Tenant routing already resolves by `Host` header via django-tenants `Domain`
  rows (confirmed in `apps/core/models.py`).

---

## Architecture

Two delivery phases under one design. Phase 2 depends on Phase 1's zone +
sender-auth being in place.

### Provider/service abstractions (mirror `apps/billing/providers`)

- **`registrar`** interface: `check_availability(name)`,
  `suggest(name)`, `get_price(tld)`, `register(domain, contact, nameservers)`,
  `set_nameservers(domain, ns)`, `renew(domain)`, `get_status(domain)`.
  - `Route53Registrar` (boto3, `route53domains` client).
  - `BypassRegistrar` (deterministic fake for dev/CI — configurable
    availability + fixed prices, no network).
- **`cloudflare` service** interface: `create_zone(domain)`,
  `get_nameservers(zone)`, `upsert_dns_record(...)`, `enable_email_routing(...)`,
  `set_catch_all_worker(...)`. Real impl wraps the Cloudflare API; a fake impl
  for tests.
- **`resend` domain helper**: `create_domain()`, `get_verification_records()`,
  `get_status()` — extends the existing Resend usage in `apps.email_campaigns`.

These are resolved through small factories (`get_registrar()`,
`get_cloudflare()`), selected by settings, exactly like `get_provider()` in
billing.

### Schema placement

- **Public schema** (SHARED_APPS) — domains + billing are platform concerns:
  new app **`apps.domains`** holds `CustomDomain`, the annual subscription
  linkage, the wizard API, provisioning Celery tasks, and webhook handlers.
- **Tenant schema** (TENANT_APPS) — inbox is tenant content: new app
  **`apps.inbox`** holds `Conversation`, `Message`, `Attachment`.
- Routing reuses the existing django-tenants **`core.Domain`** row (created at
  the end of provisioning) for `Host` → tenant resolution.

---

## Phase 1 — Domain onboarder

### Coach flow (wizard in `frontend-main` coach area)

1. **Search** — coach enters a name. API → `registrar.check_availability` +
   `registrar.suggest`. Returns available domains, each with the **coach-facing
   yearly price**.
2. **Review registrant** — prefilled from account profile; editable. Required by
   Route 53.
3. **Confirm + pay** — Stripe Checkout, `mode=subscription`, **annual**, in the
   tenant's existing `billing_currency`. Platform Stripe (not Connect).
4. **Provision (async)** — driven by `checkout.session.completed`.
5. **Status screen** — live provisioning steps; ends at "live at coachdomain.com".

### Pricing

```
price_minor = ceil( route53_cost_in_currency * 1.20 )   # rounded up to whole unit
```

- Route 53 costs are USD (`ListPrices`); convert to the tenant's
  `billing_currency` using a configured FX rate/table. The 20% markup + ceil
  rounding absorbs FX noise.
- Snapshot `cost_minor`, `price_minor`, `currency`, and `fx_rate` on the
  `CustomDomain` at purchase for auditability. Renewal re-prices from the
  then-current cost.

### Provisioning state machine (Celery, idempotent + resumable per step)

`searching → paid → registering → dns_zone → dns_records → email_auth → ssl → live`
(plus `failed` with `failed_step`).

On `checkout.session.completed`:
1. `register` at Route 53 with NS = Cloudflare placeholders (or register then
   `set_nameservers`).
2. `create_zone` in Cloudflare; read assigned nameservers; `set_nameservers` at
   Route 53 to match.
3. `upsert_dns_record` — proxied record for apex (+ `www`) pointing through the
   tunnel (catch-all ingress → Caddy → `nextjs-customer`).
4. `email_auth` — create Resend domain; write DKIM/SPF/DMARC records on the zone;
   set up Cloudflare Email Routing forward (fallback) to the coach's contact
   email.
5. `ssl` — poll Cloudflare Universal SSL until active; mirror to
   `core.Domain.ssl_status`.
6. `live` — create the `core.Domain` row (`is_primary` per coach choice),
   mark `CustomDomain.provisioning_status = live`.

Each step checks "already done?" before acting, so a retry resumes safely.

### Billing lifecycle

- Separate annual subscription row tied to the `CustomDomain`. Webhooks
  (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`)
  update status, reusing the existing `WebhookEvent` idempotency table and the
  billing webhook plumbing.
- **Renewal success** → `registrar.renew`, extend `expires_at`.
- **Renewal failure** → Stripe dunning retries; on final give-up we **do not
  renew** at Route 53. Remove the `core.Domain` row so the site falls back to
  `*.contentor.app`; keep the `CustomDomain` row in a `lapsed` state. Coach keeps
  the platform.

### Data model — `apps.domains` (public)

- **`CustomDomain`**: `tenant` (FK), `domain` (unique), `registrar`,
  `registrar_status`, `cloudflare_zone_id`, `resend_domain_id`,
  `forward_to_email`, `cost_minor`, `price_minor`, `currency`, `fx_rate`,
  `provisioning_status`, `failed_step`, `expires_at`, `auto_renew`, `is_primary`,
  timestamps.
- **`DomainSubscription`**: separate annual Stripe subscription state
  (`tenant`, `custom_domain` OneToOne, `provider`, `provider_subscription_id`,
  `provider_customer_id`, `status`, period fields). Mirrors the
  `PlatformSubscription` shape but distinct so platform-plan logic is untouched.
- Registrant contact stored either on `CustomDomain` (JSON) or referenced from
  the account profile; PII minimized.

### API (Phase 1)

- `GET  /api/v1/domains/search/?q=` → availability + suggestions + prices.
- `POST /api/v1/domains/checkout/` → start annual Stripe Checkout.
- `GET  /api/v1/domains/` → current `CustomDomain` + provisioning status.
- `POST /api/v1/domains/{id}/retry/` → resume a failed provisioning step.
- `DELETE /api/v1/domains/{id}/` → cancel subscription + schedule teardown.
- Webhook handling folded into the existing billing webhook endpoint (or a
  dedicated `/api/v1/webhooks/domains/`).
- All coach endpoints gated by `IsCoachOrOwner`, under tenant context.

---

## Phase 2 — Coach inbox

### Inbound pipeline

1. Domain MX records point to **Cloudflare Email Routing**, configured with an
   **Email Worker** as the catch-all handler.
2. The Email Worker receives each message and `POST`s the raw MIME (or parsed
   fields + raw) to **`POST /api/v1/inbound/email/`** on Django, authenticated
   with a shared HMAC secret (and Cloudflare IP allowlist).
3. Django parses sender, recipient, subject, text/html body, headers
   (`Message-ID`, `In-Reply-To`, `References`), and attachments. Attachments are
   stored in S3 via `apps.media`. The endpoint is **public-schema** (it resolves
   the target tenant from the recipient domain), then writes into that tenant's
   schema.

### Addressing & threading

- **Catch-all**: any local-part → the single tenant inbox; the recipient address
  is recorded per message.
- Threading by `Message-ID`/`References`; new threads create a `Conversation`.
- Match `from` address against known student records when possible; badge it.

### Data model — `apps.inbox` (tenant schema)

- **`Conversation`**: `subject`, `last_message_at`, `is_read`,
  `student` (nullable FK), `participant_email`.
- **`Message`**: `conversation` (FK), `direction` (in/out), `from_email`,
  `to_email`, `subject`, `text_body`, `html_body`, `message_id`,
  `in_reply_to`, `headers` (JSON), `created_at`.
- **`Attachment`**: `message` (FK), `filename`, `content_type`, `size`,
  `storage_key` (S3 via `apps.media`).

### Read + reply UI

- Inbox in `frontend-customer` owner/admin area, following the house design
  system (token-only colors, Lucide icons, empty/loading states).
- Conversation list + thread view + composer.
- **Reply** → `POST /api/v1/inbox/conversations/{id}/reply/` sends via **Resend**
  from `coach@theirdomain.com` (authenticated in Phase 1), setting threading
  headers; persists an outbound `Message`.

### Guards

- Per-attachment + total-message size caps (reject/skip oversize).
- Lean on Cloudflare spam filtering; simple block/seen list.
- Inbound endpoint: HMAC verification, size limit, idempotency on `Message-ID`.

### API (Phase 2)

- `POST /api/v1/inbound/email/` — Cloudflare Email Worker webhook (HMAC).
- `GET  /api/v1/inbox/conversations/` — list (tenant-scoped).
- `GET  /api/v1/inbox/conversations/{id}/` — thread + messages + attachments.
- `POST /api/v1/inbox/conversations/{id}/reply/` — send reply via Resend.
- `POST /api/v1/inbox/conversations/{id}/read/` — mark read.

---

## Cross-cutting concerns

### Routing & TLS (Approach A)

- Domain is a full Cloudflare zone we own → Universal SSL auto-issues the cert.
- One proxied apex (+`www`) DNS record → existing tunnel catch-all → Caddy →
  `nextjs-customer`. Caddy needs **no** per-domain config (it already routes any
  non-apex host to the customer app).
- Django resolves the tenant from the `Host` header via the `core.Domain` row.

### Error handling / edge cases

- **Availability race** (taken between search and pay): Route 53 register fails →
  void/refund the Checkout, surface "just taken," reset to `searching`.
- **Partial provisioning failure**: state machine records `failed_step`; retry
  endpoint resumes; admin can also trigger retry.
- **Premium/unsupported TLDs**: filtered from search results (Route 53 supports a
  fixed TLD list; premium pricing flagged).
- **Teardown** on cancel/lapse: remove `core.Domain` row first (fast fallback),
  then best-effort clean up DNS/email; never auto-delete the registered domain
  before `expires_at`.
- **Inbound for an unprovisioned/lapsed domain**: endpoint drops or 404s
  unmatched recipients.

### Security

- All third-party creds via secrets; never logged.
- Inbound webhook: HMAC + IP allowlist + size cap + idempotency.
- Registrant PII minimized and access-controlled.
- Coach endpoints require `IsCoachOrOwner` under tenant context.

### Testing

- Registrar, Cloudflare, Resend, and the inbound Worker all behind interfaces →
  unit + integration tests run against fakes; **no live API calls in CI**
  (matches the `bypass` billing provider).
- Provisioning state-machine test drives every step + failure/retry with the
  fake registrar/Cloudflare.
- Inbound test posts canned MIME (with attachments, threading headers) and
  asserts `Conversation`/`Message`/`Attachment` rows + student matching.
- Reply test asserts a Resend send with correct from/threading headers.

---

## Rollout

1. **Phase 1** behind a feature flag / plan gate; dev uses `bypass` registrar +
   fake Cloudflare/Resend. Verify tunnel catch-all assumption on the home server
   before enabling real registration.
2. Soft-launch with a single real test domain end-to-end (staging creds).
3. **Phase 2** inbox once Phase 1 sender-auth + zone are stable.

## Open items to resolve during planning

- Confirm tunnel ingress is catch-all (vs needs per-hostname route).
- FX source/table for USD→tenant-currency conversion.
- Exact Stripe object shape for the annual domain subscription (standalone
  Product/Price per purchase vs a metered/one-off-per-year price).
