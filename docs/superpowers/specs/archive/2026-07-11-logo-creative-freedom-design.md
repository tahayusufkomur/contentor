# Logo Studio: Creative Freedom Upgrade (Brand Pack v3) — Design

**Date:** 2026-07-11
**Status:** Approved direction from product owner ("AI's options are so limited — it can't
freely create; it's always a combination of things"), designed in-session.
**Builds on:** `2026-07-08-logo-ai-brand-pack-design.md` (architecture unchanged) and
`2026-07-10-logo-brand-pack-quality-design.md` (element compiler, kept and extended).

## Problem

The v2 quality upgrade fixed precision but capped expressiveness. Three stacked layers
make every pack read as "combinations of predefined things":

1. **Radial-geometry-only vocabulary.** The model can only place circles, rings,
   dot-rings, dot-grids, rounded rects, polygons, and arcs. The freehand `path` escape
   hatch is capped at 400 chars and discouraged by the prompt. The pipeline is
   fills-only — line art (a huge share of professional logo styles) is unreachable.
2. **Prescribed mark families.** Every pack must contain exactly one mark from each of
   6 fixed families (dot pattern, arc system, letterform, ...). Packs are structurally
   formulaic; the AI never invents its own concepts.
3. **Dice-rolled lockups.** `composeFromPack` multiplies 6 marks × 3 palettes into 18
   tiles, randomly assigning layout/badge/font from fixed catalogs. The AI designs
   ~30% of each logo (mark geometry + palette); randomness assembles the rest. Color
   mapping is hard-coded (badge=primary, mark=ink, ...). Typography is never designed
   (always weight 700, tracking 0, case none). The catalog has no script fonts.

### Capability anchors (reference logos supplied by the product owner)

| Reference | Class | Target outcome |
|---|---|---|
| Adobe "A" | Solid geometry + negative-space letterform | ✅ Fully achievable (core competency) |
| "Beauty" butterfly (flat interpretation) | Layered organic petals + script wordmark | ✅ Achievable: petals/mirror + Script fonts. The reference's glossy 3D gradients are a non-goal (marks stay flat fills — recolorable, dark-mode-safe) |
| Line-art butterfly + tracked-out caps | Continuous-line ribbon + soft fill patches | ✅ Achievable with the new `curve` primitive + `mirror` combinator |
| Yoga figure (flowing line illustration) | Hand-drawn figurative illustration | ⚠️ Simplified cousins possible (curve + mirror); the reference's hand-drawn fidelity is documented as out of reach — that class is image-model territory (rejected: vector-only constraint holds) |

## Constraints (decided)

- **Vector-only.** The recipe pipeline (editor, exports, dark-mode recolor) stays.
  No raster image-gen.
- **One AI call per pack**, 2–3× current output-token budget is acceptable
  (`max_tokens` 8000 → 16000). Quota, attempt-cost billing, budget kill-switch,
  `LOGO_AI_MODEL`: unchanged.
- **The saved recipe v2 shape does not change.** Only the Brand Pack payload changes.
  `migrate.ts`, `validate_recipe`, exports, and the editor contract are untouched.
  The injection trust boundary (`_PATH_D_RE` whitelist, `MARK_CUSTOM_MAX_PATHS=8`,
  `MAX_D_LEN=2000`) is unchanged.

## Design

### 1. Generation contract: complete designs, not marks × palettes

`_BrandPack` (backend/apps/tenant_config/logo_ai.py) becomes:

```
_BrandPack:
  designs: list[_Design]        # 8 complete logos
  palettes: list[_Palette]      # 3, unchanged — "one brand family at three volumes"
  tagline: str                  # unchanged
  font_vibe: FontVibe           # pack-level fallback only

_Design:
  concept: str                  # FIRST field — forces think-before-draw
  elements: list[_Element]      # mark geometry (compiled server-side, as today)
  rationale: str                # coach-facing one-liner (unchanged semantics)
  layout: Literal[horizontal, stacked, emblem, horizontal_reversed, name_only]
  badge_shape: Literal[none, circle, rounded, squircle, hexagon, shield, diamond]
  badge_outline: bool
  font: str                     # from the real catalog, sent in the prompt
  typography: _Typography       # case / tracking / weight — designed per brand voice
  palette_index: int            # 0–2 into pack palettes (clamped)
  color_roles: _ColorRoles      # which palette role paints each slot

_Typography:
  case: Literal[none, upper, title]
  tracking: float               # clamped -0.1..0.4
  weight: Literal[400, 500, 600, 700, 800]

_ColorRoles:                    # roles resolve to hex client-side from the design's palette
  badge:       Literal[primary, secondary, accent, ink, white]
  mark:        Literal[primary, secondary, accent, ink, white]
  mark2:       Literal[primary, secondary, accent, ink, white]
  mark_accent: Literal[primary, secondary, accent, ink, white]
  text:        Literal[primary, secondary, ink]     # never white — must read on a white card
  tagline:     Literal[primary, secondary, accent, ink]
```

- `FontVibe` gains `"Script"` (backend Literal + `catalog.ts` type).
- Server validation: mark elements compile + validate through the existing
  `_validate_pack_mark` → `validate_recipe` boundary, untouched. `palette_index`
  clamps into range. `font` passes through as a bounded string — the client falls
  back to the design's vibe pool if the name doesn't match the catalog (fonts are a
  client-side catalog; a `KEEP IN SYNC` comment ties the prompt's font list to
  `catalog.ts`).
- A design whose mark fails validation entirely is dropped (as today); a pack with
  zero surviving designs raises `BrandPackError`.
- `PROMPT_VERSION → 5` busts the 30-day result cache (versioned key already handles it).

### 2. Prompt v5: free concepts instead of prescribed families

- The 6 mandatory families become an **inspiration menu** of visual devices
  (dot systems, arc systems, negative space, letterform, continuous line, bilateral
  organic, layered, pure geometric, ...). The hard rules are: 8 designs, each rooted
  in a distinct concept for THIS brand's name/niche/vibe, and **no two designs may
  share their primary visual device**. The anti-repetition lever moves from a
  template to a constraint.
- Each design's `concept` is written before its geometry (schema field order enforces
  think-before-draw — the single-call version of a two-phase concept/draft pipeline).
- New **lockup design** section: what each layout communicates; when a badge earns its
  place; typography voice (tracked-out caps vs. soft title case vs. script);
  color-role contrast rules (light roles on dark badges, ink on white; never
  low-contrast pairs).
- The full font catalog goes into the prompt — 24 families with vibe + a one-line
  character note. Script guidance: name only, never taglines, never uppercase, fits
  personal/beauty/wellness brands.
- Freehand `path` is promoted from discouraged escape hatch to first-class tool for
  letterforms and organic silhouettes; prompt budget 400 → 800 chars (validation caps
  unchanged).
- New-primitive guidance: `curve` ("bend a wire through 4–10 points; the drafting
  engine makes it a perfect ribbon"), `mirror` ("design one wing, get both — perfect
  symmetry"), `cut` ("cut shapes must lie fully inside the shape they cut").

### 3. Vocabulary expansion (backend/apps/tenant_config/logo_geometry.py)

All new types follow the existing pattern: model designs (positions, sizes, angles,
control points), Python drafts (exact math), every numeric clamped, output is plain
whitelisted `d` strings.

**Six new primitives:**

| type | params | compiles to | unlocks |
|---|---|---|---|
| `curve` | points[[x,y]…] (2–10), thickness, round_caps, closed | Catmull-Rom spline through the points, offset ±thickness/2 into a closed filled ribbon; round caps as arc ends | **Line art.** Swooshes done right, continuous-line motifs, simplified figures, wing outlines |
| `star` | cx, cy, points (3–12), outer_r, inner_r, rotate_deg | zigzag polygon | badges, sparks, seals |
| `crescent` | cx, cy, r, cutter_offset, cutter_r, rotate_deg | exact two-arc path from circle-intersection math (not evenodd XOR) | moons, leaves, smiles |
| `petal` | cx, cy, length, width, rotate_deg | vesica/almond from two mirrored cubics | leaves, drops, petals, flames |
| `blob` | cx, cy, r, sides (5–12), seed, irregularity | seeded per-vertex radii + Catmull-Rom smoothing | precise organic forms |
| `wave` | cx, cy, width, amplitude, cycles, thickness, rotate_deg | sampled sine ribbon (closed fill) | water, breath, sound, ribbons |

**Three combinators:**

| construct | semantics |
|---|---|
| `repeat {cx, cy, count (2–16), start_deg, of: element}` | rotational array: re-invokes the child's compiler `count` times with center rotated about (cx,cy) and the child's own angle params advanced by the same step; emits ONE path. Child = any primitive except `path`, `dot_grid`, `dot_ring`, `repeat`, `mirror`. Generalizes dot_ring into a pattern engine (petal flowers, sunbursts, orbiting squares) |
| `mirror {axis_x (default 50), of: element, include_original (default true)}` | bilateral reflection across the vertical line x=axis_x, via param transforms (centers/points reflect, rotations negate, arc starts map to −(start+sweep)); emits ONE path. Same child set as `repeat` (`curve` is allowed in both — its control points transform trivially). Guarantees perfect symmetry for wings, butterflies, figures, open books |
| `cut: true` (flag on any element) | the element's subpaths merge into the **preceding** element's compiled path with `fill_rule: evenodd`; consecutive cuts allowed. The cut element's own `fill`/`opacity` are ignored — it only punches a hole. Negative space on ANY shape, not just hand-written paths. Prompt rule: cuts lie fully inside their base (evenodd is XOR outside it). A leading `cut` with no base element is ignored |

- `curve`/`wave`/`blob` sample density adapts so compiled `d` stays comfortably under
  `MARK_CUSTOM_MAX_D_LEN=2000` (2-decimal `_fmt`, as today).
- `repeat`/`mirror` count toward the ≤6-elements-per-mark budget as one element.
- Existing `_fit_radius` edge-clamping philosophy extends to the new types.

### 4. Script fonts (frontend-customer/src/lib/logo/catalog.ts)

New `"Script"` vibe with four Google families: Dancing Script, Great Vibes, Pacifico,
Caveat (weights per family; several are 400-only — `fontEntry` weight lists handle
this). Plan-time checks: the studio's font loader must include the new families, and
the SVG/PNG export path must render them (same mechanism as existing families).

### 5. Client: materialize, don't dice-roll (frontend-customer/src/lib/logo/composer.ts)

- New `composeDesigns(pack, brief)`: one recipe per design, faithfully applying the
  AI's layout, badge, font, typography, and color roles resolved to hex from
  `palettes[palette_index]`. No randomness. Unknown font names fall back to the
  pack-level `font_vibe` pool (first family), as `composeFromPack` does today.
- **The wall shows 8 genuinely distinct designed logos** (was 18 tiles of 6 shapes ×
  3 recolors). Palette variants remain one click away in the editor via the brand kit
  (the 3 pack palettes still ship).
- **Legacy fallback:** packs persisted in ≤14-day localStorage studio sessions lack
  `designs`; `composeFromPack` is kept so those sessions still restore. Sunset it
  after the session window naturally expires. Server-side cached packs never mix
  shapes (`PROMPT_VERSION` in the cache key).
- `packElementsByIndex` becomes 1:1 (design → tile).

### 6. Refine parity (REFINE_PROMPT + `_RefinedDesign`)

- `_RefinedDesign` gains the same lockup fields: `badge_shape`, `badge_outline`,
  `font`, `typography`, `color_roles` (it already has mark/palette/font_vibe/layout).
- The element vocabulary block is shared with the pack prompt, so all new primitives
  and combinators flow into refine automatically.
- `applyRefinedDesign` applies the full lockup while preserving the coach's name and
  tagline text and manual element placement, as today.

### 7. Cost & limits

- `max_tokens` 8000 → 16000 (8 richer designs ≈ 3–4k output tokens + adaptive-thinking
  headroom). Within the approved 2–3× envelope.
- Everything else in usage accounting is unchanged: per-attempt cost recording, monthly
  tenant quota, global budget kill-switch.

## Non-goals

- Raster/image-model generation (re-affirmed; breaks editor + 5–20× cost).
- Gradient or shaded fills on mark paths (marks stay flat fill-role paths —
  recolorable, dark-mode-safe; badge gradients already exist).
- Hand-drawn-fidelity figurative illustration (the yoga-figure reference class).
  Documented ceiling; revisit only via a future premium image→vectorize tier.
- Stroke attributes in the recipe contract (strokes are *compiled to fills* by
  `curve`; the fills-only contract and its validation stay).
- New layouts, badge shapes, or recipe fields.

## Testing

- **Geometry unit tests:** snapshot + clamp/NaN/degenerate-input tests per new
  primitive; `repeat`/`mirror` transform correctness (angle math, one-path output);
  `cut` evenodd merging incl. leading-cut and consecutive-cut cases; `d`-length
  guards under worst-case params.
- **Schema/validation tests:** pack with lockup fields; out-of-range `palette_index`;
  unknown font passthrough; all-marks-invalid → `BrandPackError`; refine parity.
- **Client tests:** `composeDesigns` (role resolution, font fallback, no-badge
  layouts); legacy-pack fallback through `composeFromPack`; existing recipe parity
  fixtures pass untouched.
- **Eval wall:** regenerate against 3–4 real briefs — include a yoga brand and a
  beauty brand to exercise the capability anchors — and eyeball before/after.
- **E2e:** update the logo-studio spec's wall expectations (tile count 18 → 8).
