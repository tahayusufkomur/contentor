# Superadmin Platform Inbox — Design

**Date:** 2026-07-06
**Status:** Approved, pending spec review

## Summary

Give the superadmin (platform operator) the same two-way inbox that coaches
have, operating on the **public/shared schema** and tied to the platform's own
support addresses rather than to any tenant. Coaches and prospects who email
platform-support / unclaimed `@contentor.app` addresses land in a Gmail-style
inbox inside the superadmin panel (`frontend-main`), where the operator can
read, reply, compose, and handle attachments.

Scope: **full parity minus the address-picker settings tab** (the platform
address is fixed in config). Mirror the **current-`main`** coach component set
(base folders / reply / compose / attachments) — NOT the unmerged
`feat/inbox-gmail` upgrade.

## Background / Current State

- **Coach inbox** — `frontend-customer/src/app/admin/inbox` +
  `backend/apps/mailbox`. Two-way email, **tenant-scoped** (per-coach schema),
  fed by a Cloudflare Email Worker → `inbound/` webhook, tied to the coach's
  custom domain or claimed `<x>@contentor.app` platform address.
- **Superadmin panel** — `frontend-main`. Has `admin/email` but that is only
  **outbound campaigns** (`apps.platform_email`). No inbox exists.
- **Key enablers already present:**
  - `apps.mailbox` is TENANT-only in `SHARED_APPS`/`TENANT_APPS`
    (`backend/config/settings/base.py`).
  - The `inbound` webhook (`backend/apps/mailbox/views.py`) already runs at the
    apex → **public schema**, resolving recipients via `CustomDomain` then
    `resolve_platform_recipient`, and **drops** unresolved mail.
  - `send_message` couples to a tenant via exactly one line:
    `from_email, _ = sending_identity(connection.tenant)`.
  - `IsSuperUser` permission exists (`apps.core.permissions`) and is already
    used across `apps.platform_email`.

## Approach

**Approach A — dual-list `mailbox` as a shared + tenant app.** Chosen over a
parallel `platform_mailbox` clone (duplicates services/inbound/attachments) and
an owner-abstraction refactor (rewrites live coach code — too risky/slow). A
maximizes reuse: models, serializers, services, inbound, and attachments are all
shared; the platform inbox is simply the same models queried in the public
schema.

## Components

### 1. Backend tenancy & models
- Add `apps.mailbox` to `SHARED_APPS` (keep it in `TENANT_APPS`).
- django_tenants then creates `Conversation` / `Message` / `MessageAttachment`
  in the **public schema** as well. Those public rows are the platform inbox.
- **No model changes.** `Conversation.student` FK resolves against the shared
  `accounts.User` table (already in `SHARED_APPS`); it is nullable, so prospects
  with no account are fine.
- Migration: `migrate_schemas --shared` creates the tables in public. Existing
  per-tenant tables are untouched (already created under `TENANT_APPS`).

### 2. Inbound routing (one new fall-through)
- Current chain in `inbound` view: live `CustomDomain` → `resolve_platform_
  recipient` → **drop** (`return 200`).
- New behavior: when both resolvers return `None` **and** the recipient domain
  equals the configured platform support domain, call `receive_inbound(...)`
  **without** `tenant_context`, landing the message in the public-schema
  platform inbox.
- Domain gate uses a setting — reuse `PLATFORM_MAIL_DOMAIN` (currently
  `""`-defaulted in `base.py:345`) or add `PLATFORM_SUPPORT_DOMAIN`. **Decision:
  gate on `PLATFORM_MAIL_DOMAIN`** so claimed coach addresses (resolved first)
  and platform/unclaimed addresses share one domain; a distinct
  `PLATFORM_SUPPORT_DOMAIN` is only introduced if support mail must live on a
  different domain.
- Claimed coach `<x>@contentor.app` still resolves first → routes to tenant,
  unchanged. Foreign domains still drop.
- Signature verification (`X-Mailbox-Signature`) unchanged.

### 3. Read / reply / compose / attachments API
- New include `path("api/v1/platform/mailbox/", include("apps.mailbox.urls_platform"))`
  in `config/urls.py`, guarded by `IsSuperUser`.
- Reuse the **same handler logic** rather than duplicating view bodies. Factor
  the permission out: extract the shared handler bodies so both the coach URL
  set (`IsCoachOrOwner`) and the platform URL set (`IsSuperUser`) call them, or
  apply a combined permission on a second `urls_platform` module. Superadmin
  requests hit the apex → public schema, so the existing querysets operate on
  platform rows with no extra tenant plumbing.
- The `settings/` endpoint is **excluded** from the platform URL set (no
  address-picker for the fixed platform address).

### 4. Send path (from-address)
- Parametrize `send_message` with an optional explicit `from_email`.
  - Coach path: unchanged — omit the arg, keep `sending_identity(connection.
    tenant)`.
  - Platform path: pass a fixed `settings.PLATFORM_SUPPORT_FROM`
    (e.g. `support@contentor.app`; new setting).
- Outbound goes through the existing `send_email`/Resend, threaded via
  `Message-ID` / `In-Reply-To` / `References` exactly as coach mail.

### 5. Frontend (`frontend-main`)
- Copy the base mailbox components into
  `frontend-main/src/components/admin/mailbox/` (separate Next app — no
  cross-app import) and add `frontend-main/src/app/admin/inbox/page.tsx`.
- Repoint the fetch base path to `/api/v1/platform/mailbox/`; drop the
  settings/address-picker piece.
- Add an "Inbox" nav entry in the superadmin sidebar next to the existing
  Email (campaigns) section.
- House design system tokens already apply; no restyle needed.

### 6. Cloudflare Email Worker (ops)
- The worker must POST platform-support / catch-all mail to the apex `inbound/`
  webhook (it already does for claimed addresses).
- Confirm the catch-all Email Routing rule targets the webhook rather than
  Gmail-forward — this is the ops step that actually diverts mail. Claimed
  coach addresses keep routing to their tenant via the same webhook.

## Data Flow

**Inbound:** student/prospect → `<support-or-unclaimed>@contentor.app` →
Cloudflare Email Worker → POST apex `inbound/` (signed) → resolver: CustomDomain?
→ claimed platform address? → **else public-schema platform inbox** →
`receive_inbound` creates `Conversation` + `Message` (+ attachments) in public.

**Outbound:** superadmin reply/compose → `POST /api/v1/platform/mailbox/...`
(`IsSuperUser`) → `send_message(from_email=PLATFORM_SUPPORT_FROM)` → Resend →
threaded reply; `Message` (direction=outbound) written to public schema.

## Error Handling
- Non-superadmin on `/platform/mailbox/*` → 403 (`IsSuperUser`).
- Invalid inbound signature → 401 (unchanged).
- Unresolved + non-platform domain → drop with 200 (no leak; unchanged).
- Duplicate `message_id` → idempotent no-op (existing `receive_inbound` guard).
- Send failure → `RuntimeError` surfaced as 5xx / error toast (existing).

## Testing
**Backend**
- Inbound to an unclaimed support address on `PLATFORM_MAIL_DOMAIN` lands in the
  public-schema inbox.
- Inbound to a claimed coach `<x>@contentor.app` still routes to the tenant.
- Inbound to a foreign domain still drops (200, nothing stored).
- Superadmin can list / read / reply / compose / attach in the public schema.
- Non-superadmin gets 403 on every `/platform/mailbox/` route.
- `send_message` from-address override sends from `PLATFORM_SUPPORT_FROM`
  without touching the coach path.

**Frontend**
- Mirror the coach inbox component tests (list, thread view, compose,
  attachments) against the platform endpoint.

## Risks / Careful Steps
1. **Shared migration** — dual-listing a live app; verify `migrate_schemas
   --shared` creates public tables without disturbing tenant tables. Note the
   deploy-entrypoint tenant-migration gotcha (shared vs tenant runs).
2. **Worker catch-all rule** — the ops change that actually diverts support mail
   from Gmail to the app; must not clobber claimed-address routing.

Everything else is additive and leaves the live coach mailbox untouched.

## Out of Scope
- The address-picker / mailbox settings tab.
- The `feat/inbox-gmail` upgrade (rich text / search / collapsible threads) —
  re-sync separately if/when that branch merges.
- Aggregate read-only oversight of every tenant's mailbox.
