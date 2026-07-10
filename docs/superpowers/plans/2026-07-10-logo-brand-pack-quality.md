# Logo Brand Pack Quality Upgrade — Implementation Plan

> Spec: `docs/superpowers/specs/2026-07-10-logo-brand-pack-quality-design.md`.
> Executed in-session by the designing agent; checkboxes track progress.

**Goal:** Marks that make coaches say "wow": element-based structured output
compiled server-side to exact filled paths, driven by a prompt that embeds the
logo-generator-skill's design methodology. No API/client contract changes.

### Task 1: `logo_geometry.py` — element compiler (TDD)

- [x] Failing tests in `backend/apps/tenant_config/tests/test_logo_geometry.py`:
  circle/ring/dot_ring/dot_grid/rounded_rect/polygon/arc/path compile to `d`
  strings that (a) match `_PATH_D_RE`, (b) stay within viewBox after clamps,
  (c) hit exact expected coordinates for the trig cases (12-dot ring at 30°
  steps, arc sector endpoints), (d) respect skip-lists and rotation.
- [x] Implement `compile_elements(elements) -> list[path dict]` (pure, no Django).
- [x] Tests green.

### Task 2: New schema + STATIC_PROMPT v2 in `logo_ai.py`

- [x] Pydantic element union with `Field` numeric bounds; `_Mark.elements`
  (≤6) replaces `_Mark.paths`; compile → existing `_validate_pack_mark` boundary.
- [x] `STATIC_PROMPT` v2 per spec §2 (principles, 6-family allocation,
  style-directive table for the 6 studio chips, 3 element-schema exemplars);
  `PROMPT_VERSION = 2`; 6 marks requested.
- [x] Adapt `test_logo_ai.py` fixtures to elements; suite green
  (`make test` scope: `apps/tenant_config/tests/test_logo_ai*.py`).

### Task 3: Eval wall (go/no-go)

- [x] Generate packs for ~6 varied real briefs via the CLI provider ($0).
- [x] Render marks to a static HTML eval wall; review for variety/precision/wow
  vs v1; iterate prompt if any family collapses or geometry disappoints.

### Task 4: End-to-end verification

- [x] `make test` (backend suites touched) + frontend `vitest`/`tsc` still green.
- [x] Dev-stack browser pass: paid tenant → explicit Generate button → progress
  checkpoints → 18-tile "Made for {brand}" row renders; free tenant still sees
  the upsell (covers the trigger-UX plan's Task 4 walkthrough too).
