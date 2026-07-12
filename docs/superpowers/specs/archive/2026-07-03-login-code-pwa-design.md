# Login Code ("Magic PIN") for the Student PWA — Design

**Date:** 2026-07-03
**Status:** Approved (user, option A)

## Problem

Installed PWAs (iOS especially) have a cookie jar separate from the browser.
The magic-link email opens in the browser, so the session lands there and the
installed app stays logged out. Google OAuth works (redirect completes inside
the PWA); magic-link users cannot log in to the installed app at all.

## Solution (approved: option A)

Every login email carries BOTH the existing magic link and a 6-digit code.
The user types the code into the app that requested it, so the session is
created in the right context by construction (Slack/Notion pattern).

Rejected: PWA link-capture tricks (fragile, poor iOS support); passwords
(adds reset flows, breaks the no-password simplicity).

## Backend (`apps/accounts`)

- `magic_link_request` additionally generates a 6-digit numeric code:
  - Cache key `login_code:<tenant_schema>:<email>` (Redis via default cache)
  - Value: `{"hash": sha256(code), "attempts": 0}`, TTL =
    `MAGIC_LINK_EXPIRY_MINUTES` (same as the link)
  - New request overwrites the previous code (last-wins)
- Email template (`apps/core/email.py::send_magic_link`) gains an
  "or enter this code" section — EN and TR copy.
- New endpoint `POST /api/v1/auth/magic-link/verify-code/` `{email, code}`:
  - Public: `@authentication_classes([])` + AllowAny (repo rule)
  - On success: same get-or-create user + JWT/session issuance as
    `magic_link_verify`; code deleted (single-use)
  - Security: hashed compare; max **5 attempts** then key deleted; generic
    error message for all failure modes (no oracle); covered by the existing
    tenant rate-limit middleware for the endpoint itself
- Demo tenants keep the instant-login bypass unchanged (no code needed).

## Frontend (`frontend-customer`)

- `components/auth/magic-link-form.tsx`: after the "check your email" state,
  ALWAYS show a 6-digit code input ("Or enter the code from the email") —
  not PWA-gated; one behavior everywhere.
- Verify-code success flows into the same session-setting path the link
  callback uses (`app/api/auth/verify/route.ts` or its equivalent — the
  implementation plan pins the exact wiring), then redirects to the
  student dashboard.
- i18n: EN + TR strings for the new copy.

## Scope

Tenant login only (frontend-customer — students and coaches share this
form). Coach signup verification on the marketing app is unchanged.

## Testing

- Backend unit: code stored on request; verify success; wrong code;
  expiry; 6th attempt locked out; single-use (second use fails);
  wrong tenant's code rejected; demo bypass unaffected.
- E2E (local suite): new spec — request code, read it from the dev email
  sink, log in via the code path, assert dashboard session; keep the
  existing link-path spec green.

## Error handling

- All verify failures return the same generic 400 message (localized).
- Cache unavailable → code path degrades: request still sends the link
  (code section included only if the code was stored); verify-code returns
  the generic failure. Link login is never blocked by the code feature.
