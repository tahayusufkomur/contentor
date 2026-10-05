# Logo Studio: Traced Mark Persistence Across Stages — Design

## Problem (confirmed, not speculative)

The image-model icon marks feature (`docs/superpowers/specs/2026-07-11-logo-image-mark-vectorize-design.md`,
implemented in commits `782d098..5575d8a`) lets the icon stage of Design-with-AI
draw a candidate's mark with Gemini and vectorize it into richer path data than
Claude's authored `elements` would compile to. This was verified end-to-end in a
real browser session on 2026-07-11 (tenant `assistant-test-studio`, real Gemini +
Claude-CLI calls):

- **Icon stage:** the picked candidate's `paths` were 4 dense, organic traced
  curves — a detailed concentric-swirl mark.
- **Name stage (immediately after picking):** the request's `pinned` payload
  carried `mark_elements` (2 simple primitives) but no path data at all. The
  response's `paths` were a single clean primitive path recompiled from those 2
  elements — visually a plain thin swirl. Deep-equality against the icon-stage
  paths: `false`.

**Root cause:** `apply_image_marks()` (`logo_converse.py`) only runs when
`stage == "icon"`. Every other stage's `converse_turn` call validates the LLM's
returned `elements` and recompiles `paths` from them via
`_validate_pack_mark`/`compile_elements`, with no mechanism to carry a prior
traced result across a stage transition. The existing `_inherit_traced_paths`
keep-rule (added in the same feature) only operates *within* one stage's
draft→critique pass (Task 4 of the original plan) — never across the
icon→name or name→tagline transition.

**Effect:** money is spent on Gemini generation + vectorization
(~$0.10–0.20/icon turn), but the resulting mark is discarded the moment the
coach advances past the icon-selection wall. It is visible only on the
icon-stage preview/chat cards, never in the lockup preview, the editor, or the
exported brand kit.

## Goal

A traced mark that a coach picks at the icon stage must still be the mark in
the final delivered logo (name stage, tagline stage, editor, export) — as long
as the coach doesn't ask for a redraw (a genuine change to the mark's
`elements`), which must still recompile as it does today.

## Non-goals

- No change to the icon stage's generation/tracing pipeline itself
  (`logo_image.py`, `logo_trace.py`, `apply_image_marks`) — those are already
  correct per the 2026-07-11 review.
- No change to `logo_recipe.py`'s caps or the `validate_recipe` whitelist.
- No new caching/token infrastructure. The existing `_cache_draft`/token
  mechanism (`views.py`) only exists for the vision-critique Pass A/Pass B
  flow within one stage call and is absent entirely when
  `AI_PROVIDER=cli` (this dev environment) — it cannot be reused
  cross-stage without provider-specific branching. Don't build it.

## Approach

Reuse the existing `_inherit_traced_paths(draft_designs, result)` helper
(`logo_converse.py`) exactly as-is — it already does the right thing: match a
result design's `elements` against a list of `{"elements", "paths"}` records,
and if a match is found, overwrite that design's `paths` with the matched
record's `paths`. Currently `critique_turn` is the only caller, passing the
server-cached draft's designs as `draft_designs`.

Extend `converse_turn` to build a *synthetic* one-or-two-entry
`draft_designs`-shaped list from the client-supplied `pinned` payload, and call
`_inherit_traced_paths` with it whenever `stage != "icon"`:

- One entry from `pinned.get("mark_elements")` + a **new** `pinned.get("mark_paths")`
  field (relevant when advancing icon → name: the frontend must start
  sending the picked icon design's `paths`, not just its `elements`).
- One entry from `pinned.get("lockup", {})`'s own `elements`/`paths` (relevant
  when advancing name → tagline: the frontend *already* forwards the entire
  previously-picked lockup design as `pinned.lockup`, `paths` included — no
  frontend change needed for this half, it falls out of the existing
  `lockup: state.pinnedLockup ?? undefined` line once the name stage itself
  produces correct `paths` per the fix above).

**Security constraint (load-bearing, do not skip):** `pinned.mark_paths` and
`pinned.lockup.paths` are client-supplied JSON — unlike the critique flow's
server-cached draft, this data has been round-tripped through the browser and
must be treated as untrusted input. Before treating either as a candidate for
`_inherit_traced_paths`, run it through the existing
`_validate_custom_paths(paths)` (already imported in `logo_converse.py`) —
the same injection-whitelist trust boundary every other path in this codebase
crosses. If validation fails (`None`), drop that entry entirely (fail open —
the design keeps its freshly recompiled, safe paths, exactly the pre-fix
behavior). Never pass unvalidated client paths into `result.designs[i]["paths"]`.

## Frontend change

`frontend-customer/src/components/logo/studio-chat.tsx`'s `runTurn` currently
sends:

```ts
pinned: {
  mark_elements: state.pinnedIcon?.elements,
  lockup: state.pinnedLockup ?? undefined,
},
```

Add `mark_paths: state.pinnedIcon?.paths` alongside `mark_elements`. That is
the entire required frontend change — `lockup` already carries the full
design object (paths included) once the name-stage backend fix lands, so the
name→tagline half of this fix needs no frontend change at all.

## Testing

- Backend: extend `test_logo_converse.py` with cases mirroring the existing
  `_inherit_traced_paths`/critique tests (Task 4's
  `test_critique_with_unchanged_elements_keeps_traced_paths` /
  `test_critique_redraw_recompiles_from_new_elements` are the direct
  template) — but for `converse_turn`'s name stage instead of
  `critique_turn`. Cover: matching elements + valid pinned paths → inherited;
  matching elements + invalid/hostile pinned paths → recompiled (fail open);
  non-matching elements (redraw) → recompiled; no `mark_paths` sent at all
  (old clients / icon stage never picked) → recompiled, unchanged from today.
- No fake AI service — `core_ai.structured` mocked exactly as the rest of this
  test file already does.
- Frontend: no new unit test file needed for the one-line payload change
  (`studio-chat.tsx` has no existing component-level test harness — this
  repo's convention for this file is e2e coverage); `make e2e`'s existing
  `15-logo-studio.spec.ts` must still pass, and a manual/optional real-key
  re-run of the same style of browser check used to confirm the original bug
  is the closing verification step.
