# Coach "Publish the App" Control — Design Spec

**Date:** 2026-06-20
**Status:** Draft for review

## Goal

Give a coach a control in their admin to **publish / unpublish their app** (go live or hide behind the preview gate) and manage the **preview password** used to share the site before launch. This wires up the publish gate that already exists end-to-end except for the coach-facing UI.

## What already exists (no backend work)

- `Tenant.is_published` (bool, default `False`) + `Tenant.preview_password` (str) — the publish gate (migration `core/0012_tenant_publish_gate`). New tenants start unpublished; existing/demo tenants were backfilled to published.
- `GET /api/v1/me/tenants/` (`IsAuthenticated`, owner-by-email scoped) → list of the owner's tenants, each with `slug`, `is_published`, `has_preview_password`, `studio_url`, `name`, `region`, `is_active`.
- `PATCH /api/v1/me/tenants/<slug>/` (`IsAuthenticated`, ownership enforced) → accepts `is_published` (coerced to bool) and/or `preview_password` (string, truncated to 128; `""`/null clears it); returns the updated `{is_published, has_preview_password, ...}`.
- The student app (`frontend-customer`) already reads `is_published`/`has_preview_password` from the tenant config and renders a `PreviewGate` when unpublished (owners and visitors with the valid preview password/cookie pass). So toggling publish takes effect on the student app's next config load — **nothing else to build server-side.**

**Therefore this feature is frontend-only**, in `frontend-customer`'s coach admin.

## Scope

**In scope (v1)**
- A `PublishCard` on the coach dashboard (`frontend-customer/src/app/admin/page.tsx`), placed prominently at the top (above the stat cards).
- Publish / unpublish toggle (with a confirm dialog on unpublish).
- Preview-password management: set, change, clear.
- Show the live/preview URL with a "View site" link + copy.

**Out of scope**
- Any backend change (endpoints + gate already exist).
- App-store packaging (TWA/PWABuilder) and student install-promotion — separate features.
- Per-page publishing or scheduled publishing.
- Changing where the gate is enforced (already handled by `PreviewGate`).

## Components & data flow

**`PublishCard`** (new client component, e.g. `frontend-customer/src/components/admin/publish-card.tsx`), rendered by `admin/page.tsx`.

- **Read:** on mount, `clientFetch<Tenant[]>("/api/v1/me/tenants/")`. Select the current tenant: the entry whose `new URL(t.studio_url).host === window.location.host`; if none matches and there is exactly one tenant, use it; otherwise render nothing. (A non-owner "coach" gets an empty list → the card renders nothing, which is correct — publishing is an owner action.) Loading → a `Skeleton`; fetch failure → render nothing (never break the dashboard).
- **Write:** `clientFetch("/api/v1/me/tenants/<slug>/", { method: "PATCH", body: JSON.stringify({...}) })`. Update local state from the response. On error, show a `sonner` toast and keep the prior state.

**State-driven UX:**

- **Unpublished:** an amber status ("Not published yet — your app is hidden behind a preview gate") + a primary **"Publish app — go live"** button (`PATCH {is_published:true}`). Below, a "Share a preview" area: the preview URL (`studio_url`) with copy, and a preview-password field.
- **Published:** a green "● Live" status + the live URL (`studio_url`) with **View site** (opens in a new tab) and copy, and a secondary **"Unpublish"** button that calls `window.confirm("Your site will be hidden from students until you publish again.")` (the admin's established confirm pattern — see `admin/email/templates` delete) before `PATCH {is_published:false}`.
- **Preview password** (shown in both states; primarily useful while unpublished): if `has_preview_password`, show "A preview password is set" with a **Clear** action (`PATCH {preview_password:""}`); always offer a text input + **Save** to set/change it (`PATCH {preview_password:value}`). The existing password is never returned by the API, so the UI only sets a new one or reports that one exists.

## Error handling & edge cases

- PATCH failure → toast (`sonner`, already used in admin), state unchanged.
- Multiple owned tenants: the host-match selects the current one; the card manages only that tenant.
- No matching/owned tenant (non-owner coach, or odd host): render nothing.
- Publish/unpublish is idempotent server-side; the button reflects the latest server response.

## Conventions

- **Hardcoded English** UI strings, matching the coach dashboard page and the Phase-B App-adoption card (the coach dashboard is not internationalized).
- Reuse existing UI primitives: `Card`, `Button`, `Skeleton`, `Input`, `sonner` toast, `lucide-react` icons, and `window.confirm` for the unpublish confirmation (the admin has no dialog component — `window.confirm` is the established pattern). **No new dependency.**

## Testing

- No backend changes → no backend tests.
- Frontend has no test runner; verification is `cd frontend-customer && npm run build` plus manual: as the owner on the tenant subdomain, the dashboard shows the card reflecting current status; **Publish** flips the student app out of the `PreviewGate` (verify by loading the public site in a logged-out/incognito session); **Unpublish** restores the gate; setting a preview password lets an incognito visitor unlock the preview with it; **Clear** removes it.

## Risks / open questions

- **Tenant selection by host match** assumes `studio_url`'s host equals `window.location.host` on the admin (true in dev `<slug>.localhost` and prod `<slug>[.tr].contentor.app`). The single-tenant fallback covers the common case regardless.
- **Provisioning state** is intentionally ignored — the publish gate is independent of provisioning; a coach may publish whenever they choose.
