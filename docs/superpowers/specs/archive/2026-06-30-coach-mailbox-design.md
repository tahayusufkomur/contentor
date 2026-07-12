# Coach Mailbox — Design

**Date:** 2026-06-30
**Status:** Approved design, pre-implementation

## Summary

A two-way email inbox for coaches. Inbound student email lands in an in-app
threaded mailbox; coaches read and reply from there, sending from their chosen
address (e.g. `info@gorkemhanci.com`). The full two-way mailbox is gated on the
coach owning a **custom domain**. Coaches without a custom domain get a
**send-only** inbox (compose from `no_reply@contentor.app`, no receiving) plus an
upsell to buy a domain.

This reuses the custom-domain onboarder's existing sending (Resend), DNS, and
Cloudflare Email Routing infrastructure. The only new external moving part is a
Cloudflare Email Worker that forwards inbound mail to a contentor webhook.

## Decisions (locked)

- **Inbound mechanism:** Cloudflare Email Worker → contentor webhook. (Chosen over
  Resend Inbound because Cloudflare Email Routing is already provisioned per zone;
  Resend remains the *sending* path only.)
- **No custom domain:** send-only. No inbound mailbox without a custom domain.
  Sending uses `no_reply@contentor.app`.
- **Mailbox model:** one inbox per coach. The chosen address (`info@`, `support@`,
  …) is the sending identity; the catch-all rule feeds ALL inbound mail at the
  domain into that single inbox.
- **Organization:** threaded conversations, Gmail-style. Inbound sender is
  auto-linked to an existing student account when the email matches.
- **Compose scope:** reply to threads **and** start a new email to any address
  (with a student picker for convenience).
- **Attachments:** out of scope for v1 (text/HTML only; inbound attachments
  ignored).

## How the Route53 domain routes through Cloudflare (context)

Route53 is **only the registrar**. During provisioning, DNS authority is delegated
to Cloudflare by repointing the domain's nameservers
(`provisioning._step_dns_zone` → `registrar.set_nameservers`). From then on
Cloudflare is authoritative DNS for the domain, and ALL records live in the
Cloudflare zone:

- Web: `CNAME @ → tunnel.contentor.app` (proxied).
- Outbound auth: Resend SPF/DKIM + `send.` MX (`_step_email_auth`).
- Inbound: Cloudflare Email Routing's own MX records, installed by
  `enable_email_routing()` → `POST /zones/{zone}/email/routing/dns`.

Inbound mail to `info@gorkemhanci.com` therefore resolves via Cloudflare's MX,
hits Cloudflare Email Routing, and the **catch-all rule** decides the action.
**The mailbox feature changes exactly one thing:** the catch-all action in
`apps/domains/cloudflare/client.py` from `{"type": "forward", "value": [gmail]}`
to `{"type": "worker", "value": [worker]}`. No registrar / nameserver / MX change.

Precondition: Cloudflare Email Routing requires the zone to be **active** (NS
delegation propagated). Provisioning already waits for this via `_step_ssl`, so by
the time a coach is live the only thing to flip is the rule action.

## Architecture & data flow

### Inbound (custom-domain coaches)

```
student → info@gorkemhanci.com
  → Cloudflare Email Routing catch-all (already provisioned)
  → Cloudflare Email Worker (NEW; one account-level script, reused across all zones)
  → POST /api/v1/mailbox/inbound/   (HMAC-signed)
  → Django webhook (PUBLIC schema): verify signature
       → resolve recipient domain → Tenant via CustomDomain
       → schema_context(tenant):
            find/create Conversation (by counterparty email + reply headers)
            store inbound Message
            auto-link counterparty email → student account if present
            bump unread_count / last_message_at
```

- Webhook is `AllowAny` + HMAC signature (shared secret with the Worker),
  idempotent on `message_id`.
- Unknown / unverified / mailbox-disabled recipient domain → respond `200` and
  drop (do not leak which domains exist; do not retry).

### Outbound

Generalize `apps/core/email.py::send_email` to accept an optional `from_email`
(today it hardcodes `settings.RESEND_FROM_EMAIL`). The mailbox sends from
`{local_part}@{domain}` (the domain is already Resend-verified by
`_step_email_auth`); no-domain coaches send from `no_reply@contentor.app`.

Threading headers set on send: `Message-ID`, and on replies `In-Reply-To` +
`References`. The outbound message is stored as a `Message` (direction=outbound)
with the Resend `provider_id`.

## Data model

### New tenant app `apps.mailbox` (per-tenant schema)

**Conversation**
- `subject`
- `student` — nullable FK to the tenant's student/user
- `counterparty_email`, `counterparty_name`
- `last_message_at`
- `unread_count`
- `is_archived`, `is_spam`

**Message**
- `conversation` FK
- `direction` — `inbound` | `outbound`
- `from_email`, `to_email`
- `text`, `html`
- `message_id`, `in_reply_to`, `references` — for threading
- `provider_id` — Resend send id (outbound)
- `is_read`
- `created_at`

### Public schema (on `apps.domains.CustomDomain`)

- `mailbox_local_part` — chosen local part, default `info`
- `mailbox_enabled` — bool

These live on the public `CustomDomain` because the inbound webhook runs in the
public schema and must validate/resolve the recipient before switching into the
tenant schema. The chosen sending identity is `{mailbox_local_part}@{domain}`.

## Coach UI (frontend-customer, `/admin/inbox`)

Gmail-style, non-technical-friendly (per the coach-UX constraint — no raw headers
or paths):

- Conversation list (left): student avatar/name (or raw email if unlinked),
  snippet, unread badge.
- Thread pane (right): chronological messages, reply box at the bottom.
- **New message** composer: reply, or compose to a picked student / typed address.
- No-domain coaches: inbox shows **Sent only** + a banner *"Add a custom domain to
  receive replies."* Compose still works (from `no_reply@contentor.app`).

## Provisioning change

Add a **"Choose your email address"** step to the custom-domain flow: the coach
types the local part and sees `___@theirdomain.com` live; we validate and store
`mailbox_local_part` / `mailbox_enabled`. Provisioning then binds the Worker to
the zone's catch-all rule. This replaces the current silent default of
`forward_to_email = coach's account email`.

## Error handling, spam, testing

- **Spam:** rely on Cloudflare filtering for v1; coaches can archive / mark spam /
  delete in the UI. Bulk filtering deferred.
- **Tests** follow the existing fakes pattern (`DOMAINS_BYPASS_ENABLED`): a fake
  Worker-binding and a fake inbound-POST helper. Cover: tenant resolution from
  recipient domain, threading match (new vs. reply), student auto-linking,
  outbound `from_email` + headers, no-domain send-only path, webhook signature
  rejection, idempotency on `message_id`, drop-on-unknown-domain.
- **Deploy note:** `apps.mailbox` is a new TENANT app → requires
  `migrate_schemas --tenant`. The deploy entrypoint historically ran only
  `--shared`; confirm the `--tenant` entrypoint fix is in place before deploying.

## Phasing

1. **Model + outbound** — `apps.mailbox` models, generalized `send_email`,
   send/store/thread. Works for all coaches.
2. **Inbound pipeline** — Cloudflare Email Worker + webhook + tenant resolution +
   student linking; swap catch-all action `forward` → `worker`.
3. **Coach UI** — inbox / thread / composer + the address-choosing provisioning
   step.
4. *(later)* Attachments, spam folder.

## Out of scope (v1)

Attachments; multiple named mailboxes; shared-team inbox; rich spam management;
inbound addresses on `contentor.app` (no-domain coaches stay send-only).
