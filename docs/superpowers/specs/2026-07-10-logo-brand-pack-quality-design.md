# Logo Brand Pack: Generation Quality ("Wow") Upgrade — Design

**Date:** 2026-07-10
**Status:** Approved direction from product owner ("logos are repetitive, amateur, ugly — coaches should say Wow, and it shouldn't cost us much"), designed in-session.
**Builds on:** `2026-07-08-logo-ai-brand-pack-design.md` (architecture unchanged) and
`2026-07-10-logo-studio-ai-trigger-design.md` (UX, implemented).
**References:** [op7418/logo-generator-skill](https://github.com/op7418/logo-generator-skill)
(design methodology, adopted) and [Nutlope/logocreator](https://github.com/Nutlope/logocreator)
(style-preset prompt directives, adopted; its Flux image-gen path is NOT adopted — raster
output breaks the recipe editor/exports and costs 5–20× more, per the 07-08 spec's non-goals).

## Problem

Three verified root causes of "repetitive, amateur, ugly" packs:

1. **Freehand bezier soup.** `STATIC_PROMPT` v1 asks the model to hand-write raw
   SVG `d` strings. LLMs are unreliable at freehand coordinate geometry: arcs
   don't close, curves wobble, nothing is optically aligned. Precise patterns
   (a ring of 12 dots at exact polar coordinates) are practically impossible to
   emit as raw path text — and precision is exactly what reads as "professional".
2. **No design methodology in the prompt.** v1 has ~10 lines of mechanical rules
   and two mediocre exemplars. No principles of simplicity, negative space,
   proportion, focal point, or variant diversity — the things the
   logo-generator-skill's `design_patterns.md` codifies from analyzing 100+
   professional marks.
3. **3 marks, no diversity allocation.** Nothing stops all 3 marks being the
   same idea (typically a monogram + a squiggle). The skill's method demands 6+
   variants, each from a *different* pattern family.

## Design

### 1. Element-based marks, compiled server-side (the core fix)

The structured-output schema changes from "list of raw paths" to "list of typed
geometric elements". A new pure module `apps/tenant_config/logo_geometry.py`
compiles each element into exact filled-path `d` strings (all trig/arc math in
Python, not in the model). The model does *design* — placement, sizes, counts,
angles; Python does *drafting*.

Element types (each also carries `fill: mark|mark2|accent` and optional `opacity`):

| type | params | compiles to |
|---|---|---|
| `circle` | cx, cy, r | filled disc (two-arc subpath) |
| `ring` | cx, cy, r, thickness | annulus (two discs, evenodd) |
| `dot_ring` | cx, cy, radius, count, dot_r, start_deg | N discs at exact polar coords — one path |
| `dot_grid` | cx, cy, cols, rows, pitch, dot_r, skip[] | grid of discs, skip-list cells omitted (dot-matrix letters, asymmetric clusters) — one path |
| `rounded_rect` | cx, cy, w, h, rx, rotate_deg | rounded rect / capsule (rx=h/2), rotation baked into coords |
| `polygon` | cx, cy, r, sides, rotate_deg, thickness? | regular n-gon, filled or outlined (thickness>0 → evenodd ring) |
| `arc` | cx, cy, r, thickness, start_deg, sweep_deg, round_caps | annular sector, optionally round-capped — the "stroked arc" of the skill's patterns as a fill |
| `path` | d, fill_rule | freehand escape hatch for organic shapes / custom letterforms (validated as today) |

- Compiled output is plain `{d, fill, fill_rule, opacity}` paths → the existing
  `validate_recipe` injection boundary, the 30-day cache shape, the client
  contract (`BrandPackMark.paths`), `composeFromPack`, renderer, and every
  export path are **unchanged**. Zero frontend changes for quality.
- The compiler clamps all numerics (viewBox 0–100, radii, counts, pitches).
  **Decided during implementation:** the pydantic schema stays deliberately
  loose (no numeric `Field` bounds) — a single out-of-range number must not
  fail the whole pack at parse time; the compiler's clamps are the contract.
  `MARK_CUSTOM_MAX_PATHS=8` / `MAX_D_LEN=2000` hold (largest compiled
  element, a 6×6 dot grid, ≈ 1.4k chars).
- ≤ 6 elements per mark (the skill's "max 5–6 total shapes" rule, enforced
  structurally, not rhetorically).

### 2. STATIC_PROMPT v2 — the skill's methodology, condensed (~1.8k tokens)

`PROMPT_VERSION = 2` (busts the result cache; the versioned key already handles this).

- **Non-negotiable principles** (from design_patterns.md Part 0): 1–2 core
  elements; ≥40% negative space; element weights 2.5–4 units; intentional
  asymmetry; single focal point; structural stability (dense repetition or
  solid mass, never 2 thin floating lines); rounded negative-space cuts;
  restraint (no decoration that doesn't justify itself).
- **Six-variant allocation** (Part 5): exactly 6 marks, one from each family —
  (1) pure geometric, (2) dot pattern (ring/grid/cluster), (3) arc/line system,
  (4) negative space (subtraction), (5) letterform (geometric abstraction or
  dot-matrix letter of the brand initial), (6) layered/mixed composition — and
  vary density/weight/symmetry across them. This is the anti-repetition lever.
- **Style-directive table** (logocreator's `styleLookup`, adapted): one curated
  directive per studio chip — Minimal, Bold, Elegant, Playful, Organic, Tech —
  in the static prompt (cache-safe); the coach's chosen chips keep arriving in
  the user turn and select which directives apply.
- **Exemplars in the element schema** (the "single biggest quality lever" per
  the 07-08 spec, now hand-curated): 3 few-shot marks — a concentric dot-ring
  mark, an arc-system mark, a negative-space monogram.
- Palette guidance unchanged in spirit, plus one harmony rule (60-30-10, ink
  contrast) sentence.

### 3. Pack size: 6 marks × 3 palettes = 18 tiles

`composeFromPack` already iterates marks × palettes generically — no client
change. `max_tokens` stays 6000: elements-JSON is *more* token-compact than raw
`d` strings (a 24-dot ring is one ~25-token element instead of a ~700-char path).
Cost per pack stays ≈ $0.02 (Haiku) / $0.05–0.08 (Sonnet); CLI provider $0.
Salvage rule unchanged: marks that fail validation are dropped; ≥1 mark +
≥1 palette still ships.

### 4. Both providers, one prompt

Nothing provider-specific: the methodology lives in the shared `STATIC_PROMPT`
consumed by `core_ai.structured`, so the CLI (local dev, subscription, $0) and
the Anthropic API (prod) get identical design instructions. This *is* the
"use the skill locally and with the Anthropic API" requirement — the skill's
knowledge is baked into the feature prompt rather than requiring the CLI's
skill loader (which the API path couldn't use).

## Non-goals

- No raster/image-model generation (logocreator's Flux path) — see 07-08 non-goals.
- No showcase-image generation (the skill's Nano Banana phase) — the studio's
  wall/editor/dark-preview/export already fill that role.
- No API-contract, gating, quota, or budget changes.
- No new frontend work beyond what the trigger-UX spec already shipped.

## Verification

- Unit tests (pytest): compiler geometry (dot_ring polar coords, arc sector
  closure, rotation, clamps), whitelist-regex compliance of every compiled `d`,
  element→path fill-role passthrough, plus existing `test_logo_ai.py` suite
  adapted to the new schema.
- **Eval wall (go/no-go, per 07-08 §11.1):** generate packs for ~6 real briefs
  via the CLI provider (free), render marks to an HTML wall, product owner
  reviews for wow/variety. If the marks don't beat v1, iterate the prompt
  before shipping.
- **Pre-prod check:** one real `anthropic`-provider call with the discriminated
  element union before enabling in prod — the SDK's schema transform should
  handle the tagged `anyOf`, but this is the only part the CLI path can't prove.
