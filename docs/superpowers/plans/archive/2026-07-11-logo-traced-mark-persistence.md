# Logo Studio Traced Mark Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traced (Gemini-generated, vectorized) icon mark that a coach picks at the icon stage of Design-with-AI must still be the mark used in the name stage, tagline stage, editor, and exported brand kit — not silently discarded and recompiled from Claude-authored elements the moment the coach advances past the icon-selection wall.

**Architecture:** Reuse the existing `_inherit_traced_paths(draft_designs, result)` helper in `backend/apps/tenant_config/logo_converse.py` (added for the within-stage critique keep-rule) for a new purpose: cross-stage inheritance. A new `_pinned_reference_designs(pinned)` helper turns the client-supplied `pinned` payload into a `draft_designs`-shaped list — one entry from `pinned.mark_elements`/`pinned.mark_paths` (icon → name), one from `pinned.lockup`'s own `elements`/`paths` (name → tagline) — re-validating any path data through the existing `_validate_custom_paths` injection whitelist before trusting it, since this data has round-tripped through the browser. `converse_turn` calls this for every non-icon stage. The one frontend change is adding `mark_paths: state.pinnedIcon?.paths` to the pinned payload in `studio-chat.tsx`; the `lockup` field already carries paths today, so the name → tagline half needs no frontend change.

**Tech Stack:** Django 5.1 backend (pytest, run inside the `django` container), Next.js/TypeScript frontend. Full spec: `docs/superpowers/specs/2026-07-11-logo-traced-mark-persistence-design.md`.

## Global Constraints

- Repo root: `/Users/tahayusufkomur/ws/projects-active/home-server/contentor`. All `docker compose` / `make` commands run from there. The dev stack must be up.
- Tests run inside the container: `docker compose exec django pytest <path> -v`. Full suite: `make test`. Lint: `make lint` (pre-commit must pass with zero issues).
- **Shared working tree:** other agents may move HEAD. Before every commit, run `git branch --show-current` and `git status` — expect branch `main`; if the branch or staged state looks foreign, STOP and ask rather than commit.
- `pinned.mark_paths` and `pinned.lockup.paths` are client-supplied, untrusted JSON. They MUST be re-validated through `_validate_custom_paths` (already imported in `logo_converse.py`) before ever being written into a `result.designs[i]["paths"]`. Never trust them directly. On validation failure, drop the entry — the design keeps its freshly recompiled paths (fail open, identical to today's behavior).
- Do not touch `logo_image.py`, `logo_trace.py`, `apply_image_marks`, or `logo_recipe.py`'s caps/whitelist regex — those are already correct and reviewed. This plan only changes how `converse_turn` sources `_inherit_traced_paths`'s first argument for non-icon stages, plus the one-line frontend payload addition.
- Never create new `.md` files beyond what's already written (this plan + its spec). Never commit unless the step says to commit. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Backend — inherit pinned traced paths across stage transitions

**Files:**
- Modify: `backend/apps/tenant_config/logo_converse.py` (new `_pinned_reference_designs` after `_inherit_traced_paths`, ~line 264; `converse_turn`'s tail, ~line 329-332)
- Modify: `backend/apps/tenant_config/tests/test_logo_converse.py`

**Interfaces:**
- Consumes: `_validate_custom_paths(paths) -> list | None` (already imported at the top of `logo_converse.py`); `_inherit_traced_paths(draft_designs, result) -> TurnResult` (already defined in this file, unchanged).
- Produces: `_pinned_reference_designs(pinned: dict) -> list[dict]` — a `draft_designs`-shaped list (each entry `{"elements": ..., "paths": ...}`), used only by `converse_turn`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/tenant_config/tests/test_logo_converse.py` (this file already has `_ICON_TURN`, `_NAME_TURN`, `_mock_structured`, and the `TestConverseTurn` class from earlier in the file — reuse them, don't redefine):

```python
# --- pinned traced-path inheritance across stage transitions ---------------
# _NAME_TURN's design spreads _ICON_TURN["designs"][0] verbatim, so its
# "elements" is exactly [{"type": "circle", "cx": 50, "cy": 50, "r": 30}] —
# the same fixture used below as the "pinned" side of the match.
_TRACED_PATHS = [{"d": "M 10.0 10.0 C 20.0 10.0 30.0 20.0 30.0 30.0 Z", "fill": "mark"}]


def test_name_stage_inherits_pinned_icon_traced_paths(monkeypatch, settings):
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    pinned = {
        "mark_elements": _ICON_TURN["designs"][0]["elements"],
        "mark_paths": _TRACED_PATHS,
    }
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] == _TRACED_PATHS


def test_name_stage_recompiles_when_pinned_elements_dont_match(monkeypatch, settings):
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    pinned = {
        "mark_elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 99}],  # different radius
        "mark_paths": _TRACED_PATHS,
    }
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] != _TRACED_PATHS


def test_name_stage_ignores_hostile_pinned_paths(monkeypatch, settings):
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    hostile = [{"d": 'M0 0 url("x") Z', "fill": "mark"}]  # fails the injection whitelist
    pinned = {"mark_elements": _ICON_TURN["designs"][0]["elements"], "mark_paths": hostile}
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] != hostile
    assert design["paths"]  # still compiled through the trust boundary, not empty


def test_name_stage_without_mark_paths_recompiles_as_before(monkeypatch, settings):
    """No mark_paths sent at all (old client, or icon stage never picked) —
    byte-identical to pre-fix behavior."""
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    _mock_structured(monkeypatch, _NAME_TURN)
    pinned = {"mark_elements": _ICON_TURN["designs"][0]["elements"]}
    result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"]
    assert design["paths"] != _TRACED_PATHS


def test_tagline_stage_inherits_pinned_lockup_traced_paths(monkeypatch, settings):
    """The name -> tagline half: pinned.lockup carries the whole previously-
    picked design, paths included (no frontend change needed for this half)."""
    settings.LOGO_AI_MODEL = "claude-sonnet-5"
    tagline_turn = {**_NAME_TURN, "message": "One line to finish it."}
    _mock_structured(monkeypatch, tagline_turn)
    pinned = {"lockup": {**_NAME_TURN["designs"][0], "paths": _TRACED_PATHS}}
    result = logo_converse.converse_turn("tagline", {"brand_name": "Flow"}, [], pinned, "go")
    (design,) = result.designs
    assert design["paths"] == _TRACED_PATHS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_converse.py -v -k "pinned_icon or dont_match or hostile_pinned or without_mark_paths or pinned_lockup"`
Expected: FAIL — all 5 new tests fail because `converse_turn` doesn't yet look at `pinned.mark_paths`/`pinned.lockup.paths`; `design["paths"]` will be whatever `_NAME_TURN`'s compiled elements produce for every case, so the `== _TRACED_PATHS` assertions fail and the `!=` assertions in the "recompiles" tests may spuriously pass — that's expected and fine, the two `==_TRACED_PATHS` tests are the ones proving RED here.

- [ ] **Step 3: Implement**

In `backend/apps/tenant_config/logo_converse.py`, add directly after `_inherit_traced_paths` (~line 264, before `def apply_image_marks`):

```python
def _pinned_reference_designs(pinned):
    """The client's `pinned` payload may carry a prior stage's traced mark —
    `mark_paths` (icon -> name) or the whole previous lockup design under
    `lockup` (name -> tagline). Both are client-supplied, untrusted JSON (they
    round-tripped through the browser), so any path data is re-validated
    through _validate_custom_paths (the same injection whitelist every other
    mark path crosses) before being offered to _inherit_traced_paths. A
    validation failure just drops that entry — the design falls back to its
    freshly recompiled, safe paths."""
    out = []
    mark_elements = pinned.get("mark_elements")
    mark_paths = pinned.get("mark_paths")
    if mark_elements and mark_paths:
        validated = _validate_custom_paths(mark_paths)
        if validated:
            out.append({"elements": mark_elements, "paths": validated})
    lockup = pinned.get("lockup") if isinstance(pinned.get("lockup"), dict) else {}
    lockup_elements = lockup.get("elements")
    lockup_paths = lockup.get("paths")
    if lockup_elements and lockup_paths:
        validated = _validate_custom_paths(lockup_paths)
        if validated:
            out.append({"elements": lockup_elements, "paths": validated})
    return out
```

Change `converse_turn`'s tail (currently):

```python
    result = _validate_turn(stage, parsed, cost)
    if stage == "icon":
        result = apply_image_marks(result)
    return result
```

to:

```python
    result = _validate_turn(stage, parsed, cost)
    if stage == "icon":
        result = apply_image_marks(result)
    else:
        result = _inherit_traced_paths(_pinned_reference_designs(pinned), result)
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_converse.py apps/tenant_config/tests/test_logo_converse_views.py -v`
Expected: all pass — the 5 new tests plus every pre-existing test in both files (pre-existing name/tagline tests never send `mark_paths`, so `_pinned_reference_designs` returns `[]` for them and `_inherit_traced_paths([], result)` is a no-op, byte-identical to before this change).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # expect: main — STOP if not
git add backend/apps/tenant_config/logo_converse.py backend/apps/tenant_config/tests/test_logo_converse.py
git commit -m "feat(logo-v2): inherit pinned traced mark paths across icon->name->tagline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — forward the pinned icon's traced paths

**Files:**
- Modify: `frontend-customer/src/components/logo/studio-chat.tsx` (the `pinned` object inside `runTurn`, ~line 220)

**Interfaces:**
- Consumes: `state.pinnedIcon: ConverseDesign | null` (`chat-state.ts`, unchanged) — `ConverseDesign.paths: BrandPackPath[]` already exists (`composer.ts`).
- Produces: the `pinned.mark_paths` field the backend's `_pinned_reference_designs` (Task 1) now reads.

- [ ] **Step 1: Add the field**

In `frontend-customer/src/components/logo/studio-chat.tsx`, inside `runTurn`, change:

```ts
        pinned: {
          mark_elements: state.pinnedIcon?.elements,
          lockup: state.pinnedLockup ?? undefined,
        },
```

to:

```ts
        pinned: {
          mark_elements: state.pinnedIcon?.elements,
          mark_paths: state.pinnedIcon?.paths,
          lockup: state.pinnedLockup ?? undefined,
        },
```

- [ ] **Step 2: Update the request type**

In `frontend-customer/src/lib/logo/converse-api.ts`, change `fetchConverseTurn`'s `pinned` parameter type from:

```ts
  pinned: { mark_elements?: BrandPackElement[]; lockup?: unknown };
```

to:

```ts
  pinned: {
    mark_elements?: BrandPackElement[];
    mark_paths?: BrandPackPath[];
    lockup?: unknown;
  };
```

Add `BrandPackPath` to the existing `import type { BrandPackElement, ConverseDesign } from "@/lib/logo/composer";` line (`import type { BrandPackElement, BrandPackPath, ConverseDesign } from "@/lib/logo/composer";`) — `composer.ts` already exports `BrandPackPath` (used elsewhere in this same file's neighbors).

- [ ] **Step 3: Type-check**

Run: `cd frontend-customer && npm run build` (this repo's convention: `next build` is the TS-clean gate — `frontend-customer/package.json` has no separate `tsc`/`typecheck` script, and `pre-commit`'s ESLint/Prettier hooks are scoped to a `^frontend/` path that doesn't match this directory, so they no-op here).
Expected: build completes with no type errors.

- [ ] **Step 4: Run the existing e2e studio spec to confirm no regression**

Run: `make e2e` (or, faster, target just the one spec: `cd e2e && npx playwright test specs/15-logo-studio.spec.ts`).
Expected: passes exactly as before — this spec doesn't drive a real AI turn, so it can't observe the fix directly, but it does exercise `runTurn`'s code path indirectly through the "Design with AI" panel open/close assertions and must not error.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # expect: main — STOP if not
git add frontend-customer/src/components/logo/studio-chat.tsx frontend-customer/src/lib/logo/converse-api.ts
git commit -m "feat(logo-v2): forward the pinned icon's traced paths to the next stage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: all pass, 0 failures (was 1198/1198 green before this fix; only additions).

- [ ] **Step 2: Lint**

Run: `make lint`
Expected: pre-commit passes with zero issues on the touched files (this repo currently has 2 pre-existing, unrelated lint gaps from other concurrent work — a blog-file ruff-format drift and a stale detect-secrets hit in an unrelated Jul-10 spec doc; neither is introduced by this plan, don't fix them here, just confirm the files this plan touches are clean).

- [ ] **Step 3: Optional real-key browser re-verification**

This repeats, at the user's discretion, the same style of check used to originally confirm the bug (a temporary throwaway Playwright spec against tenant `assistant-test-studio`, capturing the icon-stage and name-stage `logo-converse` responses and diffing their `paths`). It spends real Gemini money again (~$0.10-0.20) — only do this if the user asks for it; the mocked pytest suite in Task 1 already proves the logic deterministically without spending anything. If run, the expected outcome flips from Task 5 of the original plan: the name-stage response's `paths` should now equal the icon-stage response's traced `paths` for the picked candidate (instead of a fresh recompiled shape).

- [ ] **Step 4: Report**

No commit here. Summarize: tests added/passing counts, confirmation that pre-existing tests are byte-identical (no `mark_paths` sent = no behavior change), and whether the optional real-key re-verification was run and what it showed.

---

## Self-review notes (spec ↔ plan)

- Spec's "Approach" (reuse `_inherit_traced_paths`, two synthetic entries from `pinned.mark_elements`/`mark_paths` and `pinned.lockup`) → Task 1.
- Spec's security constraint (re-validate through `_validate_custom_paths`, fail open on rejection) → Task 1's `_pinned_reference_designs` and its hostile-input test.
- Spec's frontend change (`mark_paths` addition, `lockup` needs no change) → Task 2.
- Spec's non-goals (no change to `logo_image.py`/`logo_trace.py`/`apply_image_marks`/`logo_recipe.py`, no new cache/token infra) → respected; Task 1 only touches `converse_turn`'s tail and adds one new pure helper.
- Spec's testing section → Task 1's 5 test cases (inherit / redraw-recompiles / hostile-rejected / no-mark_paths-unchanged / tagline-inherits) plus Task 2's tsc + e2e checks.
