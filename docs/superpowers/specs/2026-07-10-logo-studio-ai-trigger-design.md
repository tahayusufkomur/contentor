# Logo Studio: Explicit AI Trigger + Progress — Design

**Date:** 2026-07-10
**Status:** Approved design, pending implementation plan

## Problem

The Logo Studio's AI "Brand Pack" (paid-tier: bespoke marks + palettes from
one gated Claude call, see `docs/superpowers/specs/2026-07-08-logo-ai-brand-pack-design.md`)
auto-fires the moment a coach submits the Brief, alongside the instant
deterministic wall of 24 ideas. In practice this is invisible: the coach
lands on a full wall of usable ideas immediately, and the small "Sketching
custom marks for {brand}…" line above it goes unnoticed. Combined with a
real generation time of ~106–134s, a coach has no way to tell AI generation
happened at all, is in progress, or is even a feature that exists.

Separately, when the AI provider is temporarily unavailable
(`brandPackStatus.reason === "disabled"`), the current frontend renders
**nothing** — no banner, no error, no upsell. A paid, eligible coach in that
state sees the exact same "nothing happened" experience as the auto-fire
case, for a different underlying reason.

## Goal

Replace the silent auto-fire with an explicit "Generate with AI" trigger the
coach consciously clicks, and give the ~2-minute wait real (if
approximated) progress feedback. Fix the silent "disabled" case as part of
the same banner rework, since it's the same code path and the same
underlying confusion.

## Design

### 1. Interaction flow

The Ideas step keeps rendering the deterministic wall instantly (unchanged).
The banner area above it — currently two flat conditionals
(`aiLoading` paragraph, `aiNotice` paragraph) — becomes one state machine:

- **Idle** (`eligible && enabled && remaining > 0`, no wall yet): a banner
  with a "✨ Generate AI logos for {brand}" button and description text
  "Bespoke marks + palettes, made for your brand — takes about 2 minutes."
- **Generating** (after click, until response lands): button replaced by a
  progress bar + rotating status text (see §3).
- **Done** (`aiWall` set): banner disappears entirely; the existing "Made
  for {brand}" AI tile row renders above the deterministic wall — unchanged
  from today.
- **Error** (`source === "error"`): banner reverts to the idle button state;
  description text replaced with "Couldn't reach the design studio — try
  again." Retrying costs no quota — `packs_used` (and therefore
  `remaining`) only increments on a **successful** pack
  (`record_successful_pack`, called only in the success path of
  `logo_brand_pack`); the per-attempt USD kill-switch (`record_attempt_cost`)
  is a separate, invisible-to-the-coach budget concern.
- **Quota exhausted** (`remaining <= 0`): no button; quiet note "You've used
  this month's 5 AI logo generations. More next month."
- **Provider disabled** (`reason === "disabled"`, i.e. `eligible && !enabled`):
  the backend already returns this reason distinctly
  (`_brand_pack_status` in `views.py`), but the frontend's `BrandPackStatus`
  type never branches on it — `studio-wall.tsx` only checks
  `reason === "upgrade_required"`, so this case silently renders nothing
  today. Fix: no button; quiet note "AI logo generation is temporarily
  unavailable — your ideas below are ready to use."
- **Not eligible** (`reason === "upgrade_required"`): unchanged — existing
  upsell card with the Upgrade link.

Leaving the Ideas step (Brief/Editor tabs, closing the studio) does not
cancel an in-flight generation. Returning to Ideas before it resolves shows
the still-running progress bar — this already works today via the
`aiRequestIdRef` staleness guard in `logo-studio.tsx` and needs no changes.

### 2. Component/code changes

- **`logo-studio.tsx`**: delete the auto-fire — remove
  `void fetchAiIdeas();` from `startIdeas()`. `fetchAiIdeas` is otherwise
  unchanged; it becomes the callback passed to `StudioWall` as
  `onGenerateAi`.
- **`studio-wall.tsx`**: replace the current `aiLoading` /
  `aiNotice` paragraphs with one new subcomponent, `AiGenerateBanner`,
  covering every state in §1 except `showUpsell` (which stays exactly as
  it is, untouched, still gated on `reason === "upgrade_required"`).
  `AiGenerateBanner` receives `brandPackStatus`, `aiLoading`, `aiNotice`,
  `aiWall`, `brandName`, and `onGenerateAi`, and derives which of the states
  in §1 to render. Placed colocated in `studio-wall.tsx` (it's small and has
  no reuse outside this file) rather than a new file.
- **New subcomponent `AiGenerateProgress`** (also colocated in
  `studio-wall.tsx`): owns a local `startedAt` ref set on mount, a
  `setInterval` ticking every second, and looks up the current
  bar-percent/status-text pair from the checkpoint table in §3. Naturally
  resets each time a generation starts, since it mounts fresh (only
  rendered while `aiLoading` is true).

No backend or API changes. `core.ai.structured` (both providers) is a
single blocking call — the progress bar is a frontend time-based
approximation, not real server progress. A true progress signal would
require converting the brand-pack call to a polling job or SSE stream,
which is out of scope here (see Non-goals).

### 3. Progress checkpoints

Shared table drives both the bar fill and the status text, keyed by
elapsed seconds since the click. Based on the measured real-world
generation time of 106–134s (CLI/haiku provider, dev container):

| elapsed | bar % | status text |
|---|---|---|
| 0–10s | 8% | Sketching your marks… |
| 10–25s | 25% | Sketching your marks… |
| 25–50s | 45% | Choosing brand colors… |
| 50–80s | 65% | Choosing brand colors… |
| 80–110s | 80% | Polishing the details… |
| 110s+ | 90% (holds) | Almost there… |

The bar never fake-completes to 100% — it holds at 90% indefinitely past
110s until the real response lands (success, error, or timeout), at which
point the banner either disappears (success) or reverts to the idle button
(error).

### 4. Testing

**Correction from the initial draft, found during implementation
planning:** `frontend-customer` has zero React component tests anywhere
(`@testing-library/react` isn't a dependency; no `*.test.tsx` file exists
in the app). The prior wording below assumed component-render tests and
fake-timer coverage that don't fit this codebase's actual conventions —
this section replaces that assumption with what's actually testable here,
matching the existing pattern (`src/lib/logo/__tests__/*.test.ts`, pure
logic only, e.g. `composer.test.ts`).

- **Frontend (vitest, pure logic only)**: the state-derivation logic is
  extracted into a plain function, `deriveAiBannerState`, in a new
  `lib/logo/ai-banner.ts` module (not inside the component file) precisely
  so it's unit-testable the way this codebase already tests logic. It
  covers every `brandPackStatus.reason`/`aiLoading`/`aiWall`/`aiNotice`
  combination (idle, generating, hidden-once-results-exist,
  error-via-notice, quota-exhausted, disabled, upgrade-required). The
  progress-checkpoint lookup (`progressForElapsed`) is tested directly
  against the table in §3, including the boundary seconds. The actual
  `AiGenerateBanner` JSX and its elapsed-seconds timer are thin,
  untested-by-unit-test glue around these two functions — verified by
  `tsc --noEmit` plus the manual browser pass below, consistent with how
  the rest of the Logo Studio's interactive components are verified today.
  `logo-studio.tsx`: `startIdeas()` no longer calls `fetchAiIdeas`
  automatically; clicking the new button does (verified in the browser
  pass — asserting "no network call before the click" needs a live
  Network-tab check, not a unit test).
- **No new e2e coverage.** A Playwright assertion that the button renders
  for a paid tenant would need a disposable paid-tenant fixture; the only
  existing mechanism (`PATCH /api/v1/platform-admin/tenants/<pk>/` as
  superadmin, exercised in `test_tenant_plan_grant.py`) isn't wired into
  the e2e helpers today, and building that fixture is a separable piece of
  test infrastructure, not part of this UI change. Real AI generation
  (~2 min) was already known to be impractical to assert end-to-end. This
  path is manually/browser verified instead, the same way the original
  Brand Pack feature was verified before it shipped.

## Non-goals

- No change to `logo_brand_pack` / `logo_brand_pack_status` API contracts.
- No real backend progress (job/polling/SSE) — the progress bar is a
  frontend approximation only.
- No change to plan-tier eligibility logic (`has_paid_platform_plan`
  already means "starter or pro" — confirmed against `seed_plans.py`,
  which defines exactly those two paid plans).
- No change to the deterministic wall, the Editor step, or the AI tile
  rendering (`AiWallCard`, `composeFromPack`) once results land.
- No new testing infrastructure (`@testing-library/react`, e2e paid-tenant
  fixtures) — see §4.
