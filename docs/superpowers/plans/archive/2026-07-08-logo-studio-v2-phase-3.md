# Logo Studio v2 — Phase 3: Freeform-lite Canvas Editor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the panel-only editor with direct manipulation: click an element (mark / name / tagline) on a real canvas to select it — bounding box + corner scale handles, drag with snap guides, arrow-key nudge — while the right panel becomes contextual (selected element's controls; global Layout/Palette/Badge when nothing is selected).

**Architecture:** The editor step splits into three focused components. `studio-canvas.tsx` renders the clean `LogoRenderer` (export ref untouched) plus a **separate pointer-events-none SVG overlay** with the same viewBox for the selection box and snap guides, and absolutely-positioned corner-handle divs (computed from `getBBox()` of the `[data-part]` groups). `studio-panel.tsx` is the contextual rail — the existing Phase-1/2 control sections reorganized by selection. `studio-editor.tsx` composes canvas + context previews + panel and owns the `selected` state. `logo-studio.tsx` keeps only shell state (steps, save, upload). The editor step becomes conditionally mounted (`step === "editor"`), not CSS-hidden — `getBBox()` returns zeros inside `display:none`.

**Interaction contract:**
- Pointer down on a `[data-part]` group selects it and begins a move-drag (no more "Adjust placement" mode). Empty-canvas click deselects.
- Move: offsets clamp ±120, snap-to-zero under 6 units per axis (v1 behavior); while an axis is snapped, the overlay draws a center guide line through the element's slot.
- Corner handles: uniform scale around the element center, `clamp(0.4, 3.0, base * dist/baseDist)`.
- Keyboard on the focused canvas: arrows nudge ±1 (±10 with Shift), Escape deselects and `stopPropagation()`s so the dialog's document-level Escape-close doesn't fire.
- Panel: `null` → hint + Name/Tagline text inputs + Layout + Palette (24 swatches, custom color, text colors) + Badge (7 shapes + **new outline toggle**) + "Get new ideas". `name`/`tagline` → that element's text input, font vibes, weight/case/tracking, color, size slider. `mark` → mark pickers (initials styles / abstract / icons / upload), icon style, mark color, size slider.

**Spec:** §3 Step 3 of `docs/superpowers/specs/2026-07-08-logo-studio-v2-design.md`.

## Global Constraints

Same as Phase 2: branch `feat/logo-studio-v2-phase-3` from main; shared tree (verify branch before commits); no `npm install`; vitest + build green per commit; never push.

## Tasks

### Task 1: `studio-canvas.tsx` (selection, drag, handles, guides, nudge)
- Create `frontend-customer/src/components/logo/studio-canvas.tsx`.
- Props: `{ recipe, selected, onSelect, onChange(recipe), dark, onToggleDark, logoSvgRef }`.
- Bounding boxes via `svg.querySelector('[data-part="…"]').getBBox()` in a `useLayoutEffect` on `[recipe, selected]`; convert viewBox→px with `renderedWidth / logoViewBox(layout).w`.
- Commit: `feat(logo-v2): canvas with click-select, drag, scale handles, snap guides`

### Task 2: `studio-panel.tsx` + `studio-editor.tsx` + shell rewire
- Create both; move every existing control section out of `logo-studio.tsx`'s rail into the panel's contextual branches; add the badge outline toggle and per-element color/scale controls; editor mounts conditionally.
- `logo-studio.tsx` keeps: steps, brief/wall state, save/upload/error, font loading, a11y. Passes `onUploadMark`, refs, and `onGetNewIdeas` down.
- Commit: `feat(logo-v2): contextual editor panel + composed editor step`

### Task 3: e2e + gates + merge
- Extend `15-logo-studio.spec.ts` after the Customize step: click the name element inside the canvas (`[data-part="name"]`), assert the selection box (`data-testid="selection-box"`) appears; press `ArrowRight` ×3 and assert the saved PATCH carries `elements.name.offset[0] >= 3`; the font controls visible while name selected.
- Full gates (pytest unchanged, vitest, build, e2e, prettier) → merge to local main, delete branch.

## Exit criteria
Direct manipulation works for all three elements across all five layouts; no "Adjust placement" mode remains; exports stay clean (overlay never serializes); all suites green; merged to local main.
