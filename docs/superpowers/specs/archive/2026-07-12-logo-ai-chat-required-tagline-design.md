# Logo Studio — AI chat suggestions must always be complete (require a tagline)

Date: 2026-07-12
Status: approved design, pending implementation plan
Scope: `backend/apps/tenant_config` (AI prompts) + `frontend-customer/src/lib/logo`,
`frontend-customer/src/components/logo` (Design-with-AI chat)

## Context

The prior curated-first plan (`2026-07-12-logo-studio-curated-first-design.md`) made the
Ideas step's curated-gallery path always produce a **complete** logo: mark + brand name +
tagline. The Ideas step has a second path into the same result — the "Design with AI"
chat wizard (`studio-chat.tsx`) — which was out of scope for that plan and was not made
consistent with it.

Today the AI chat path can finish with an **empty tagline**:
- `TAGLINE_STAGE_PROMPT` (`backend/apps/tenant_config/logo_converse.py`) explicitly tells
  the model "If nothing natural fits, one candidate may keep tagline \"\"." — the AI can
  propose a blank candidate directly.
- `studio-chat.tsx` renders a "Skip tagline" button at the tagline stage
  (`showSkipTagline={state.stage === "tagline"}`), which dispatches a `skip_tagline`
  action in `chat-state.ts` that finishes the flow with the tagline left at `""` (its
  value from the earlier name stage, which never sets a tagline).

This means a coach can end up applying an AI-generated logo with a mark and a name but
no tagline — inconsistent with the curated-gallery path, which is now guaranteed
complete. This plan closes that gap.

## Goals

1. The AI can never propose an empty-tagline candidate — every candidate at the tagline
   stage must be a real, non-empty string.
2. Remove the "Skip tagline" escape hatch. In its place: if the coach already typed an
   optional tagline into the Brief step, offer to use that instead of an AI candidate.
   If the Brief has no tagline, there is no skip path — the coach must pick an AI
   candidate.
3. By the time a Design-with-AI session reaches `done: true`, the resulting design
   always has a non-empty tagline — no matter which path (Brief-tagline substitution or
   AI candidate) got it there.

## Non-goals

- No backend migration/backfill of existing coach logos already saved with an empty
  tagline — forward-looking only (per explicit decision).
- No free-text custom-tagline input at the tagline stage — the only two ways to finish
  are picking an AI candidate or (if present) using the Brief's own tagline.
- No change to the `NAME_STAGE_PROMPT` or any other AI stage — this only touches the
  tagline stage's prompt and the tagline stage's UI/state.
- No change to the curated-gallery path (already complete, unaffected).

## Design

### Backend: tighten `TAGLINE_STAGE_PROMPT`

**File:** `backend/apps/tenant_config/logo_converse.py`

Remove the instruction permitting an empty-tagline candidate ("If nothing natural fits,
one candidate may keep tagline \"\"."). Every candidate the model returns for the
tagline stage must be a non-empty string. This is a prompt-text-only change — no schema
change to `ConverseDesign`/`RefinedDesign` (`tagline: string` is unchanged), no new
field, no migration.

### Frontend: replace `skip_tagline` with `use_brief_tagline`

**File:** `frontend-customer/src/lib/logo/chat-state.ts`

- Remove the `skip_tagline` action type and its reducer branch entirely.
- Add a `use_brief_tagline` action carrying the tagline value in its payload, e.g.
  `{ type: "use_brief_tagline"; tagline: string }` — the reducer does not reach into a
  `Brief` object itself (keeps it decoupled from that type, consistent with the other
  actions in this file). The handler sets `tagline` onto the captured `pinnedLockup` and
  marks `done: true`, using the same finishing mechanics the old skip handler used.

**File:** `frontend-customer/src/components/logo/studio-chat.tsx`

- `DesignCard`'s `showSkipTagline: boolean` prop is replaced with `briefTagline?:
  string`. The button renders only when this is a non-empty string after trimming
  whitespace.
- Button label reflects what it actually does — e.g. `Use "Move every day"` (the Brief's
  tagline, truncated if long) — instead of the generic "Skip tagline".
- `onClick` dispatches `use_brief_tagline` with the (trimmed) Brief tagline string.
- When `brief.tagline` is empty, undefined, or whitespace-only, the button does not
  render at all at the tagline stage — the coach's only path forward is picking one of
  the AI's candidates (now guaranteed non-empty by the backend change above).

### Closing the loophole completely

Two changes above close the two known paths to an empty tagline (AI proposing one
directly, and the old skip button). Before considering this done, the implementation
must also sweep `chat-state.ts` for every other place `done: true` is set (e.g. any
other finishing/regenerate/retry paths) and confirm none of them can leave `tagline: ""`
on the finished design. This is a verification step, not a design change — if another
path is found, it must be brought in line with this design (never finish with an empty
tagline), not treated as an acceptable exception.

## Testing

**Backend:** locate and update whatever existing test(s) assert the old
`TAGLINE_STAGE_PROMPT` wording or exercise an empty-tagline AI response as valid;
flip them to assert every returned candidate is non-empty.

**Frontend:**
- `chat-state.ts` tests: replace the `skip_tagline` test with one for
  `use_brief_tagline` (dispatched tagline lands on the finished `pinnedLockup`,
  `done: true`).
- `studio-chat.tsx` tests: cover both states of the tagline-stage button — `briefTagline`
  present (renders, correct label, dispatches correctly) and absent (does not render).

**Edge cases:**
- Whitespace-only `brief.tagline` must not count as "present" — trim before deciding
  whether to show the button.
- Check `e2e/specs/90-logo-eval.spec.ts` (the real-AI eval spec, gated behind
  `LOGO_EVAL=1`) for any reference to skip-tagline behavior or an assumption that empty
  taglines are reachable, and update if so.

## Open items for the implementation plan

- Confirm the exact current test file(s)/line(s) asserting the old prompt/skip behavior
  (backend `apps/tenant_config/tests/`, frontend `chat-state.test.ts`,
  `studio-chat.test.tsx`) — not enumerated here since this design doc was written
  without re-reading test files line-by-line; the plan should locate them precisely.
- Confirm whether `studio-chat.tsx` already receives `brief` as a prop (it does, per the
  curated-first plan's Task 4 wiring) with a `tagline?: string` field (it does, per the
  curated-first plan's Task 6) — no new prop threading should be needed to get
  `brief.tagline` to `DesignCard`, only wiring the existing value through.
