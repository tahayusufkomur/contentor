# Brand Name As Wizard Step 1 — Design

**Date:** 2026-07-14
**Status:** Design approved, pending plan
**Feature area:** Pre-wizard signup (`frontend-main/src/app/signup/`)

## 1. Overview

Today, brand name, name, and email are collected together on one plain form
(`SignupForm` → `AuthShell`) before the wizard ever appears — visually and
structurally disconnected from the wizard that follows. User testing flagged
this: "This giving brand name part can also be included in onboarding
process. Like first step. User can also see how brand name will look."

This splits the anonymous signup form into two screens that render inside
the wizard's own shell:

1. **Brand name** — free text, with a live preview of how it'll render in a
   real page mockup as the coach types.
2. **Your name + email** — the same two fields the form collects today,
   minus brand name.

Email verification still gates the rest of the wizard exactly as it does
today — this is a **presentation and sequencing** change, not a change to
when an account becomes real. No Tenant row exists, and no email is sent,
until step 2 submits (same as today's single-screen form).

### Goals
- Brand name entry feels like genuinely the first step of the wizard (same
  shell, same progress chrome), not a separate form bolted on before it.
- The coach sees a live preview of their brand name before committing to it.
- No regression on today's fast "this name is taken" feedback — checked
  before advancing past step 1, not after filling in name+email too.

### Non-goals
- The already-logged-in "create another platform" flow (single brand-name
  field, `authenticatedName` set, no email step) is unchanged. It's a
  different, simpler case — the tested feedback was about new-coach signup.
- No change to `creator_signup_verify`, wizard-token issuance, or
  `WizardFlow` — the real wizard (niche → ... → review) is untouched; it
  still starts fresh at `business.niche` once the coach verifies.
- No change to the abandoned-wizard recovery-email feature — it operates on
  tenants that already exist (post-verification), which this doesn't affect.

## 2. Frontend

### Step 1 — Brand name

New component, rendered inside the existing (token-free, purely
presentational) `WizardShell` — same header, progress bar, back-button
chrome the real wizard uses. Aside panel reuses the wizard's existing
`LivePreview` component (`frontend-main/src/app/signup/verify/wizard/previews.tsx`),
called as `<LivePreview answers={{}} brand={brandName} />` — `answers={{}}`
lets `LivePreview`'s existing `swatch()`/`fontStack()` helpers fall back to
their defaults (ocean theme, Inter) since no niche/theme is chosen yet, so
this needs no new preview code, just the existing component fed a live
`brand` string.

Continue button is NOT auto-advance (free text, unlike the wizard's
single-select steps) — same as the existing `describe` step's pattern.
Clicking Continue:
1. Client-side: reject empty/whitespace-only input.
2. Calls the new `POST /api/v1/onboarding/check-brand-name/` (below). If
   taken, shows an inline error (reusing the existing `brand_taken` message
   key) and stays on step 1. If available, advances to step 2.

### Step 2 — Your name + email

Same fields, labels, and placeholders as today's form (`nameLabel`,
`namePlaceholder`, `emailLabel`, `emailPlaceholder` — all already in
`messages/{en,tr}/auth.json`, reused as-is). Also rendered inside
`WizardShell` for chrome continuity. Submitting calls the *existing*
`POST /api/v1/onboarding/signup/` (`creator_signup`) unchanged — it already
re-validates slug availability defensively and mints the signup token +
sends the verification email; `brand_name` in the request body now comes
from step 1's component state instead of a same-screen field. On success,
shows the existing "Check your email" state (unchanged).

### File changes
- Modify: `frontend-main/src/app/signup/signup-form.tsx` — the
  `!isAuthenticated` branch becomes a 2-step flow (local `step` state:
  `"brand" | "contact" | "email-sent"`); the `isAuthenticated` branch
  (single brand-name field, `AuthShell`) is untouched.
- No changes to `frontend-main/src/app/signup/page.tsx` (still decides
  `authenticatedName` server-side, same prop contract).

## 3. Backend

### New endpoint: `POST /api/v1/onboarding/check-brand-name/`

Public, throttled, read-only. Mirrors the exact slug-availability check
`creator_signup` already does at the top of its handler — extracted so step
1 can call it without minting a token or sending an email.

- Request: `{"brand_name": "Acme Yoga Studio"}`.
- Response: `200 {"available": true}` or `200 {"available": false, "detail": "<localized brand_taken message>"}`.
- `400` if `brand_name` is missing/blank (`brand_required` message key,
  already exists in `apps/core/i18n_helpers.py`).
- Throttle scope `brand_name_check`, rate `30/min` (generous — read-only, no
  email sent, but still capped against slug-enumeration scraping). New
  `BrandNameCheckThrottle(ClientIpAnonThrottle)` in `apps/core/throttling.py`,
  same pattern as the existing `WizardRecoverThrottle`/`WizardLogoThrottle`.
- `@authentication_classes([])` + `AllowAny` (project rule for public
  endpoints — `AllowAny` alone is not enough).

### `creator_signup` (existing, unchanged)

Already re-checks slug availability itself before minting a token, so it
stays correct even if a brand name becomes taken in the gap between step 1's
check and step 2's submit (race-safe today, stays race-safe).

## 4. Testing

- Backend: `test_check_brand_name.py` — available name → `200 {available: true}`;
  taken name (existing tenant fixture) → `200 {available: false}`; blank →
  `400`; throttle trips after 30 calls/min (mirrors the existing
  `test_signup_throttle.py` pattern).
- Frontend: no automated test (this app has no unit/component test runner —
  see the precedent set in the mockup-screenshots plan's Global Constraints;
  every other wizard step is verified the same way). Manual verification:
  walk `/signup` end to end for both a fresh brand name and an
  already-taken one, confirm the inline error keeps the coach on step 1,
  confirm step 2 → verification email → wizard flow is unchanged from today.
- e2e: three spec files fill the signup form directly and each need their
  own update to the new two-screen flow (fill brand name, click continue,
  fill name+email, click continue) — `signupThroughVerify` in
  `e2e/specs/01-signup-onboarding.spec.ts` and the identically-named-but-
  separate local function in `e2e/specs/19-wizard-recovery.spec.ts` (NOT a
  shared helper — each file defines its own copy), plus the inline signup
  steps in `e2e/specs/23-wizard-ai-logo.spec.ts` (no helper function there
  at all). Same pattern as the auto-advance fix earlier this session, which
  needed the same three files touched individually for the same reason.
