# Logo Studio: Session Persistence, Undo/Redo & AI Refinement — Design

**Date:** 2026-07-10
**Status:** Approved direction (product owner picked: whole-design refinement,
separate 20/month refinement quota, silent restore), pending implementation plan.
**Builds on:** `2026-07-10-logo-studio-ai-trigger-design.md` (shipped) and
`2026-07-10-logo-brand-pack-quality-design.md` (shipped, merged to main).

## Problem

Three gaps coaches hit today:

1. **Refresh loses everything.** The studio's state (brief, generated walls,
   editor draft) lives only in React state. A refresh, tab close, or session
   hiccup throws away the brief they typed and — worse — the AI pack they
   spent a generation on.
2. **No undo in the editor.** Every tweak (color, layout, scale, text) is
   destructive; the only escape is closing the studio and starting over.
3. **AI stops at the wall.** Once a coach picks a tile, refinement is manual.
   There's no way to tell the designer "warmer colors, rounder mark, more
   premium" — the highest-value moment for AI is exactly this iteration loop.

## Design

### 1. Refresh-safe session (`lib/logo/studio-session.ts`)

A new pure module following the `lib/cart.ts` localStorage pattern
(`typeof window` guard, try/catch everywhere, JSON roundtrip).

- **Key:** `contentor_logo_studio` — localStorage is per-origin and every
  tenant is its own subdomain, so tenant scoping is free.
- **Schema (versioned):**
  ```ts
  { v: 1, savedAt: number, step: "brief"|"ideas"|"editor",
    brief: Brief, wallSeed: number,
    pack: BrandPack | null, packSeed: number | null,   // raw pack, not 18 recipes
    recipe: LogoRecipe | null }                        // editor draft
  ```
  Walls are *re-derived* on restore (`composeWall(brief, wallSeed)`,
  `composeFromPack(pack, brief, packSeed)`) — storing seeds + the raw pack
  keeps the blob small and one source of truth.
- **Write:** debounced (~500 ms) on any tracked state change while the studio
  is open.
- **Restore:** on studio open, a valid saved session restores silently to its
  saved step. The Brief step gains a small "Start over" action that clears
  storage and resets state.
- **Clear:** on successful "Use this logo" save, and on schema-version or
  >14-day-old (`savedAt`) mismatch (the server pack cache is 30 days, so a
  re-submit of the same brief within it is a free cache hit anyway).
- **Never stored:** JWTs, brand-pack status/quota (always refetched), undo
  history (fresh stack after refresh — deliberate simplification).

### 2. Editor undo/redo

A small pure history helper (`lib/logo/history.ts`): `{ past, present,
future }` over the editor's single `LogoRecipe` draft, exposed in
`logo-studio.tsx` only while `step === "editor"`.

- **API:** `push(next, coalesceKey?)`, `undo()`, `redo()`, `canUndo/canRedo`,
  `reset(baseline)`. Cap 100 entries.
- **Coalescing:** callers pass a stable key per control (e.g. `"name-text"`,
  `"mark-scale"`, `"badge-color"`); consecutive pushes with the same key
  within 400 ms replace the top entry instead of stacking, so slider drags
  and typing become one undo step each.
- **Keyboard:** Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z and Ctrl+Y redo. The
  listener is intercepted globally while the editor step is open — including
  inside text inputs — so there is exactly one undo history (the coalesced
  field entries make text undo behave as expected). Listener detaches when
  the studio closes or leaves the editor step.
- **Buttons:** undo/redo icons with disabled states at the top of
  `studio-panel.tsx` for discoverability.
- **Baseline:** entering the editor (`handleCustomize`) resets history to the
  chosen recipe. Every mutation path — panel controls, palette/mark swaps,
  and AI refinements (§3) — lands as a history entry, so a bad refinement is
  one Cmd+Z away.

### 3. AI refinement — prompt the designer from the editor

**UX.** A prompt box in the editor panel (paid tenants, same gate/reason codes
as the Brand Pack): *"Tell the designer what to change — e.g. softer colors,
a rounder mark, more premium."* Submit → inline sparkle/progress (single-design
calls are much smaller than a pack) → the refined design replaces the draft as
one undoable step, with the model's one-sentence rationale shown. Quota line:
"14 AI refinements left this month."

**Scope: the whole design.** The model may reshape the mark (elements), adjust
the palette, pick a different in-catalog `font_vibe`, and change layout — a
coach's instruction like "warmer and bolder" usually spans all of them.

**API.** `POST /api/v1/admin/config/logo-refine/`
- Request: `{ recipe: <current draft>, elements?: <mark's source elements>,
  instruction: string ≤300 }`
- Response (always non-empty JSON, same envelope discipline as the pack):
  `{ design | null, source: "ai"|"error"|"quota_exhausted"|"disabled"|"upgrade_required",
  refine_remaining }` where `design` carries `mark paths` (compiled),
  `elements` (for the next refinement round), `palette`, `font_vibe`,
  `layout`, `rationale`.
- `logo-brand-pack/status/` gains `refine_remaining` so the editor can gate
  before calling.

**Element round-trip (key architectural point).** The compiler currently
discards element semantics after producing paths. The brand-pack response now
*also* returns each mark's source `elements` (additive field; bump
`PROMPT_VERSION` to invalidate cached packs of the old shape). The client
keeps elements in the studio session only — **saved recipes and
`validate_recipe` are unchanged**. Refinement sends elements when it has them
(design-level editing, high fidelity); for recipes that predate this or
non-custom marks (icon/initials/abstract), it sends the recipe's current
visual summary instead and the model redesigns a custom mark from it — that's
acceptable degradation, not an error.

**Backend.** New `REFINE_PROMPT` static constant sharing the element
vocabulary + design principles with `STATIC_PROMPT` (extract the shared block
into one constant so the two can't drift; the CI parity concern stays in one
place). Structured output `_RefinedDesign { mark: _Mark, palette: _Palette,
font_vibe, layout: Literal["horizontal", "stacked", "emblem",
"horizontal_reversed", "name_only"], rationale }`. Current
design + brief travel in the user turn (prompt-cache contract: nothing
tenant-specific in `system`). Compiled through `compile_elements` → the same
`validate_recipe` injection boundary as the pack. No result caching —
instruction+state pairs are too unique to be worth cache keys.

**Quota & budget.** `LogoAiUsage` gains `refinements_used`; hard cap **20 per
tenant per month**, charged only on a successful, validated response. Every
attempt's estimated USD still accrues to the existing global monthly
kill-switch — refinements share the same budget ceiling as packs, so the
worst-case bill stays one config value. Failed calls charge budget, never
quota.

**Safety.** The instruction is user text and stays in the user turn,
length-clamped; the output passes the existing whitelist/clamp validation, so
a hostile instruction can at worst produce an ugly-but-safe design.

## Non-goals

- Multi-turn refinement memory (each refinement sees only the current design
  + instruction — no chat history).
- Server-side / cross-device draft persistence (localStorage only).
- Undo outside the editor step (wall shuffles and brief edits are cheap to
  redo; the brief survives via §1 anyway).
- Reference-image uploads or raster generation (unchanged non-goals).
- Persisting `elements` into saved `TenantConfig.logo_recipe` (session-only).

## Testing

- **`studio-session.ts`** (vitest, pure): roundtrip, schema-version discard,
  TTL expiry, corrupted-JSON tolerance, clear-on-save.
- **`history.ts`** (vitest, pure): push/undo/redo ordering, coalesce window
  by key, cap, reset baseline.
- **Refine endpoint** (pytest, mirroring `test_logo_ai_views.py`): gating
  matrix (`upgrade_required`/`disabled`/quota), quota charged on success only,
  budget charged on every attempt, validation salvage → `error`, instruction
  clamp, `refine_remaining` in both endpoints.
- **Prompt/schema**: element round-trip test — pack response includes
  `elements` that recompile to the same paths.
- Component wiring (keyboard shortcuts, restore-on-open, prompt box states)
  is verified by `tsc` + the manual browser pass, per this repo's convention
  (no React component-test infrastructure — see the trigger spec's §4).

## Cost

Refinement calls carry ~1.1k static prompt + ~400 token user turn and return
one design (~500–900 output tokens): ≈ $0.005–0.01 (Haiku) / $0.015–0.03
(Sonnet) per refinement — 20/month worst case adds ≈ $0.20–0.60/tenant
(Sonnet), inside the existing kill-switch. CLI provider in dev remains $0.
