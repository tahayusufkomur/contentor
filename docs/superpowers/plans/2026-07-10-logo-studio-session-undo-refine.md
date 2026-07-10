# Logo Studio: Session Persistence, Undo/Redo & AI Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three gaps from the design doc: a refresh-safe localStorage session for the Logo Studio, undo/redo in the editor, and an AI "refine this design" prompt box that lets a coach iterate on their logo with natural-language instructions.

**Architecture:** Three additive layers on the existing Logo Studio (`frontend-customer/src/components/logo/`, `frontend-customer/src/lib/logo/`, `backend/apps/tenant_config/`). (1) A pure localStorage module (`studio-session.ts`) restores/clears studio state, mirroring the existing `lib/cart.ts` pattern. (2) A pure undo/redo reducer (`history.ts`) wired into `logo-studio.tsx`'s existing `patch`/`onUpdate` callbacks via a new optional `coalesceKey` parameter. (3) A new gated `POST /api/v1/admin/config/logo-refine/` endpoint mirrors the existing `logo-brand-pack/` endpoint's gating/quota/budget pattern exactly (same `LogoAiUsage` model, new `refinements_used` column), and a shared prompt constant is extracted out of `logo_ai.py`'s `STATIC_PROMPT` so the pack and refine prompts can't drift apart. The AI Brand Pack response gains an additive `elements` field per mark (the pre-compile geometry) so refinement can hand the model back exactly what it drew last time.

**Tech Stack:** Django 5.1 + DRF + pydantic (backend, `apps/tenant_config`), Next.js 14 + React + TypeScript (frontend-customer), Vitest (frontend unit tests), pytest (backend tests).

## Global Constraints

- Never store JWTs, brand-pack status/quota, or undo history in the localStorage session (spec's explicit non-goals).
- Session key: `contentor_logo_studio`, schema version `1`, discard on version mismatch or `savedAt` older than 14 days.
- Undo history: cap 100 entries, coalesce same-key pushes within 400ms, reset baseline whenever the editor step is entered.
- Refinement quota: 20/tenant/month, separate from the Brand Pack's 5/tenant/month, both charged against the same global `LOGO_AI_MONTHLY_BUDGET_USD` kill-switch.
- Refinement never uses the 30-day result cache the Brand Pack endpoint uses (instruction+state pairs are too unique).
- Coach instruction text is clamped to 300 chars server-side before it ever reaches the prompt.
- `pre-commit` (ruff + prettier + the repo's other hooks) must pass with zero issues before any commit.

---

## Task 1: Extract shared prompt constant + element round-trip on Brand Pack marks (backend)

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py`
- Test: `backend/apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py` (new)

**Interfaces:**
- Produces: `logo_ai._ELEMENT_VOCABULARY_AND_PRINCIPLES` (str constant), `logo_ai._validate_pack_mark(item) -> {"rationale": str, "paths": list[dict], "elements": list[dict]} | None` (gains the `"elements"` key — used by Task 4's refine flow and Task 7's frontend types).

- [ ] **Step 1: Extract the shared element-vocabulary/design-principles block out of `STATIC_PROMPT`**

In `backend/apps/tenant_config/logo_ai.py`, replace the `STATIC_PROMPT` definition (lines 56–188) with a shared constant plus two prompts built from it:

```python
PROMPT_VERSION = 4

_ELEMENT_VOCABULARY_AND_PRINCIPLES = """## How marks are built

You compose each mark from geometric ELEMENTS. A drafting engine converts \
them into mathematically precise vector shapes — you design (choose forms, \
positions, sizes, angles), it drafts (does all coordinate math perfectly). \
The canvas is a 0-100 square: keep compositions visually centered near \
(50,50) and leave at least 10 units of empty margin on every side. Angle \
convention: 0 degrees points straight up, positive angles turn clockwise.

Element types:
- circle {cx, cy, r} — a solid dot.
- ring {cx, cy, r, thickness} — a circle outline (thickness is the band width).
- dot_ring {cx, cy, radius, count, dot_r, start_deg} — `count` dots spaced \
perfectly evenly around a circle. Effortless rhythm and precision.
- dot_grid {cx, cy, cols, rows, pitch, dot_r, skip: [indices]} — a dot grid \
centered on (cx, cy); `skip` removes cells by row-major index, sculpting \
shapes, letters, or asymmetric clusters out of the grid.
- rounded_rect {cx, cy, w, h, rx, rotate_deg} — rounded rectangle; \
rx = h/2 makes a capsule. Rotate for dynamism.
- polygon {cx, cy, r, sides, rotate_deg, thickness} — regular polygon; \
thickness 0 = solid, greater = outline band only.
- arc {cx, cy, r, thickness, start_deg, sweep_deg, round_caps} — a thick \
partial ring segment; round_caps true gives soft rounded ends.
- path {d, fill_rule} — freehand FILLED path for organic shapes or custom \
letterforms when no primitive fits. Absolute commands (M L H V C S Q T A Z), \
under 400 characters, closed shapes only, no strokes. Use fill_rule \
"evenodd" to cut negative space out of a solid form.

Every element also takes fill: "mark" (primary, the default), "mark2", or \
"accent" — and optional opacity (0.12-0.35 for quiet background texture, \
0.5-0.8 for secondary depth).

## Non-negotiable design principles

1. EXTREME SIMPLICITY — 1-2 core ideas, at most 5 elements. One perfect \
element beats five mediocre ones.
2. GENEROUS NEGATIVE SPACE — at least 40% of the canvas stays empty; \
emptiness is part of the design.
3. PRECISE WEIGHTS — ring/arc thickness 2.5-5, dots r 2-6, at least 6 units \
of clear space between separate elements.
4. VISUAL TENSION — perfect symmetry is boring: add one intentional \
imbalance (an offset accent dot, an interrupted ring, a heavier side).
5. SINGLE FOCAL POINT — the eye must know where to look first.
6. STRUCTURAL STABILITY — the mark needs visual mass: a solid shape, a \
thick outline, or dense repetition. Never a couple of thin floating slivers.
7. RESTRAINT — every element must justify its existence; no decoration.
8. FAVICON TEST — no meaningful feature smaller than ~3 units; the mark \
must survive a 48px render."""

STATIC_PROMPT = (
    """You are a senior brand-identity designer producing a Brand Pack for a \
coaching brand: 6 bespoke logo marks and 3 brand color palettes. The coach \
sells courses and community under this brand — every mark must look like it \
came from a serious studio engagement, never from a clipart library.

"""
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## The 6 marks — one per family, no repeats

1. PURE GEOMETRIC — solid shapes, rings, or overlap compositions.
2. DOT PATTERN — dot_ring (possibly two concentric, different dot sizes) or \
dot_grid with a sculpted skip-list.
3. ARC SYSTEM — 2-4 arcs with rhythm: nested sweeps, offset starts, motion, \
orbits, growth curves.
4. NEGATIVE SPACE — one solid form with a meaningful cutout (evenodd path) \
that draws the symbol with what ISN'T there.
5. LETTERFORM — the brand's first initial abstracted into geometry (path) \
or rendered as a dot_grid letter via skip — capture the letter's structural \
DNA, never mimic a font glyph.
6. LAYERED — a quiet low-opacity texture (dot_grid or dot_ring) behind one \
bold foreground element.

Across the 6, vary density (sparse to dense), weight (light to bold), and \
symmetry (make 2-3 clearly asymmetric). Tie each mark to THIS brand's niche \
and name: pick a real concept (growth, calm, connection, strength, focus, \
warmth...) and let the geometry express it. Never a generic swoosh, \
sparkle, or globe. At least one mark must use a second fill role ("mark2" \
or "accent") for tonal depth.

## Style directives

Apply the directives whose style names appear in the brief:
- Minimal: single fill role, medium weights, maximum negative space, timeless.
- Bold: heavy solid masses, thick bands (4-6), high contrast, confident.
- Elegant: thin rings and arcs (2.5-3), wide spacing, refined proportions.
- Playful: rounded everything, bouncy asymmetric dot clusters, capsules, \
tilted elements.
- Organic: soft freehand curves, wave-like arcs, natural rhythms, no rigid \
grids.
- Tech: precise grids, node-and-connection feel, dot matrices, structured \
geometry.
If the brief lists no styles, default to Minimal plus whatever voice the \
niche suggests.

## Rationale

One sentence per mark, addressed to a non-technical coach, saying why it \
fits their brand. Plain words. No design jargon.

## Palettes

3 palettes, 4 hex roles each: primary (dominant brand color — riff on the \
given theme color by shifting hue, saturation, or depth; don't repeat it \
identically across all 3), secondary, accent, and ink (dark, readable on \
white, clearly darker than primary). Think 60-30-10: primary carries, \
secondary supports, accent punctuates. The 3 palettes should feel like one \
brand family at three volumes (e.g. calm / classic / vivid). Marks are \
drawn in these colors on white cards, so secondary and accent must stay \
clearly visible on white — no near-white pastels; when in doubt, darken.

## Tagline & typography

One short tagline — empty string if nothing natural fits; never force it. \
font_vibe: the single best fit among Modern, Elegant, Bold, Playful, Minimal.

## Example marks (element JSON)

{"rationale": "Energy radiating from one warm center — a community growing \
outward from your practice.", "elements": [{"type": "dot_ring", "cx": 50, \
"cy": 50, "radius": 15, "count": 6, "dot_r": 3.5}, {"type": "dot_ring", \
"cx": 50, "cy": 50, "radius": 27, "count": 12, "dot_r": 2.5, "start_deg": \
15, "opacity": 0.65}, {"type": "circle", "cx": 50, "cy": 50, "r": 4.5, \
"fill": "accent"}]}

{"rationale": "Two paths sweeping upward at their own pace — coaching that \
meets each student where they are.", "elements": [{"type": "arc", "cx": 50, \
"cy": 58, "r": 30, "thickness": 5, "start_deg": 250, "sweep_deg": 150, \
"round_caps": true}, {"type": "arc", "cx": 50, "cy": 58, "r": 19, \
"thickness": 5, "start_deg": 265, "sweep_deg": 115, "round_caps": true, \
"fill": "mark2"}, {"type": "circle", "cx": 66, "cy": 24, "r": 3.5, "fill": \
"accent"}]}

{"rationale": "A rising peak carved out of a steady circle — progress held \
inside consistency.", "elements": [{"type": "path", "d": "M50 14 A36 36 0 1 \
0 50.1 14 Z M36 62 L50 38 L64 62 L57 62 L50 50 L43 62 Z", "fill_rule": \
"evenodd"}]}"""
)
```

`PROMPT_VERSION` bumps from `3` to `4` — the pack response shape is about to
change (Step 2 adds `elements`), so cached packs from before this change
must not be served under the new shape.

- [ ] **Step 2: Make `_validate_pack_mark` return the source elements alongside paths**

Replace the existing `_validate_pack_mark` function (lines 322–340) with:

```python
def _validate_pack_mark(item):
    """Compile one Brand Pack mark's geometric elements into exact filled
    paths (logo_geometry), then run them through validate_recipe (the same
    injection whitelist a saved recipe's custom mark passes through).
    Returns a validated ``{rationale, paths, elements}`` dict — ``elements``
    is the pre-compile source geometry, returned so the client can hand it
    back on a future AI refinement round without re-deriving it from paths
    (see logo-refine/) — or None if every path was invalid — the whole mark
    is dropped, not degraded."""
    elements = [e if isinstance(e, dict) else e.model_dump() for e in item.elements]
    dummy = {
        **_DUMMY_RECIPE,
        "mark": {
            "type": "custom",
            "rationale": item.rationale,
            "paths": compile_elements(elements),
        },
    }
    shaped = validate_recipe(dummy)
    if shaped["mark"]["type"] != "custom":
        return None
    return {
        "rationale": shaped["mark"]["rationale"],
        "paths": shaped["mark"]["paths"],
        "elements": elements,
    }
```

- [ ] **Step 3: Write the element round-trip test**

Create `backend/apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py`:

```python
"""Brand Pack marks now carry their source `elements` alongside compiled
`paths` (see docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md
§ element round-trip). This guarantees the client can hand `elements` back
on a future refinement call and get the exact same geometry it started with.
"""

from apps.tenant_config import logo_ai
from apps.tenant_config.logo_geometry import compile_elements


def test_validate_pack_mark_returns_elements_that_recompile_to_same_paths():
    item = logo_ai._Mark(
        rationale="Two dots facing each other.",
        elements=[
            {"type": "circle", "cx": 30, "cy": 50, "r": 5},
            {"type": "circle", "cx": 70, "cy": 50, "r": 5, "fill": "accent"},
        ],
    )
    result = logo_ai._validate_pack_mark(item)
    assert result is not None
    assert result["elements"] == [
        {"type": "circle", "cx": 30, "cy": 50, "r": 5, "fill": "mark", "opacity": None},
        {"type": "circle", "cx": 70, "cy": 50, "r": 5, "fill": "accent", "opacity": None},
    ]
    recompiled = compile_elements(result["elements"])
    assert [p["d"] for p in recompiled] == [p["d"] for p in result["paths"]]


def test_validate_pack_mark_drops_mark_when_nothing_survives_validation():
    item = logo_ai._Mark(rationale="x", elements=[])
    assert logo_ai._validate_pack_mark(item) is None
```

- [ ] **Step 4: Run the tests**

```bash
docker compose exec django pytest apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py apps/tenant_config/tests/test_logo_ai_views.py -v
```

Expected: all pass. (`test_logo_ai_views.py` passes unchanged — it mocks
`generate_brand_pack` entirely, so it never exercises `_validate_pack_mark`.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py
git commit -m "feat(logo-ai): extract shared prompt block, return mark elements alongside paths"
```

---

## Task 2: `LogoAiUsage.refinements_used` + settings + refine_remaining on status (backend)

**Files:**
- Modify: `backend/apps/core/models.py`
- Create: `backend/apps/core/migrations/0022_logoaiusage_refinements_used.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/apps/tenant_config/views.py`
- Modify: `backend/apps/tenant_config/tests/test_logo_ai_views.py`

**Interfaces:**
- Produces: `LogoAiUsage.refinements_used` (int field), `settings.LOGO_AI_MONTHLY_REFINE_LIMIT` (int), `_brand_pack_status(tenant)` response gains `"refine_remaining": int`.

- [ ] **Step 1: Add the model field**

In `backend/apps/core/models.py`, in `LogoAiUsage` (around line 363), add the field right after `packs_used`:

```python
    packs_used = models.PositiveIntegerField(default=0)
    refinements_used = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
```

- [ ] **Step 2: Generate and inspect the migration**

```bash
docker compose exec django python manage.py makemigrations core
```

Expected: creates `apps/core/migrations/0022_logoaiusage_refinements_used.py`
depending on `0021_platformkbentry`, with a single `AddField` op for
`refinements_used` on `LogoAiUsage`. Open the generated file and confirm it
contains only that one `AddField` operation — if `makemigrations` picked up
unrelated model drift, stop and investigate before continuing.

- [ ] **Step 3: Add the settings constant**

In `backend/config/settings/base.py`, right after `LOGO_AI_MONTHLY_PACK_LIMIT` (line 240):

```python
LOGO_AI_MONTHLY_PACK_LIMIT = int(os.environ.get("LOGO_AI_MONTHLY_PACK_LIMIT", "5"))
LOGO_AI_MONTHLY_REFINE_LIMIT = int(os.environ.get("LOGO_AI_MONTHLY_REFINE_LIMIT", "20"))
```

- [ ] **Step 4: Add `refine_remaining` to `_brand_pack_status`**

In `backend/apps/tenant_config/views.py`, replace `_brand_pack_status` (lines 227–242):

```python
def _brand_pack_status(tenant):
    month = logo_ai._current_month()
    eligible = tenant.has_paid_platform_plan
    budget_ok = logo_ai.global_spend(month=month) < Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD))
    enabled = core_ai.available()[0] and budget_ok
    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    remaining = max(0, settings.LOGO_AI_MONTHLY_PACK_LIMIT - usage.packs_used)
    refine_remaining = max(0, settings.LOGO_AI_MONTHLY_REFINE_LIMIT - usage.refinements_used)
    if not eligible:
        reason = "upgrade_required"
    elif not enabled:
        reason = "disabled"
    elif remaining <= 0:
        reason = "quota_exhausted"
    else:
        reason = None
    return {
        "enabled": enabled,
        "eligible": eligible,
        "remaining": remaining,
        "reason": reason,
        "refine_remaining": refine_remaining,
    }
```

- [ ] **Step 5: Fix the existing status test that asserts the exact dict**

In `backend/apps/tenant_config/tests/test_logo_ai_views.py`, `test_full_quota_for_fresh_paid_tenant` (line 117–120):

```python
    def test_full_quota_for_fresh_paid_tenant(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.data == {
            "enabled": True,
            "eligible": True,
            "remaining": 5,
            "reason": None,
            "refine_remaining": 20,
        }
```

- [ ] **Step 6: Run the tests**

```bash
docker compose exec django pytest apps/tenant_config/tests/test_logo_ai_views.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/0022_logoaiusage_refinements_used.py \
  backend/config/settings/base.py backend/apps/tenant_config/views.py backend/apps/tenant_config/tests/test_logo_ai_views.py
git commit -m "feat(logo-ai): add refinements_used quota column and refine_remaining on status"
```

---

## Task 3: Refine AI call + accounting (backend)

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py`
- Test: `backend/apps/tenant_config/tests/test_logo_refine_views.py` (new — the view test in Task 4 also lands here)

**Interfaces:**
- Consumes: `_ELEMENT_VOCABULARY_AND_PRINCIPLES`, `_Mark`, `_Palette`, `_validate_pack_palette`, `_validate_pack_mark`, `core_ai.structured(*, system, user, output_model, model, max_tokens)`, `core_ai.AiError` (all from Task 1 / existing `logo_ai.py`).
- Produces: `logo_ai.REFINE_PROMPT` (str), `logo_ai._RefinedDesign` (pydantic model), `logo_ai.RefineError(Exception)` (`.cost_usd` attr), `logo_ai.RefineResult` (`.design`, `.cost_usd` attrs), `logo_ai.refine_design(recipe: dict, elements: list[dict] | None, instruction: str) -> RefineResult` (raises `RefineError`), `logo_ai.record_successful_refinement(tenant_schema, month=None) -> None`.

- [ ] **Step 1: Add `REFINE_PROMPT`, `_RefinedDesign`, and the recipe-summary helper**

In `backend/apps/tenant_config/logo_ai.py`, after `STATIC_PROMPT`'s closing `"""` (right before `class _ElementBase`), add:

```python
REFINE_PROMPT = (
    """You are a senior brand-identity designer refining ONE existing logo \
design for a coaching brand, following the coach's instruction. You may \
reshape the mark, adjust the palette, pick a different font vibe, and \
change the layout — treat the instruction as license to touch whichever of \
those the coach's words imply (e.g. "warmer and bolder" usually spans all \
of them). Redesign a complete, cohesive whole — never a half-applied patch.

"""
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## Your task

You'll receive the CURRENT design — either its source elements (redesign \
from these, keeping what still fits and changing what the instruction asks \
for) or, if no elements are available, a plain-text summary (design a new \
custom mark that captures the same brand from scratch, guided by the \
summary and the instruction). You'll also receive the coach's INSTRUCTION.

Return one refined design: the mark (as elements, same vocabulary as \
above), a 4-hex-role palette, the single best-fit font_vibe (Modern, \
Elegant, Bold, Playful, or Minimal), a layout (horizontal, stacked, emblem, \
horizontal_reversed, or name_only), and a one-sentence rationale — plain \
words, addressed to the coach, saying what you changed and why."""
)


class _RefinedDesign(BaseModel):
    mark: _Mark
    palette: _Palette
    font_vibe: Literal["Modern", "Elegant", "Bold", "Playful", "Minimal"]
    layout: Literal["horizontal", "stacked", "emblem", "horizontal_reversed", "name_only"]
    rationale: str
```

Note: `_RefinedDesign` references `_Mark`/`_Palette`, which are defined
later in the file (after `STATIC_PROMPT`, around line 275/280) — move
`_RefinedDesign`'s definition (and `REFINE_PROMPT`, which doesn't need
`_Mark`/`_Palette`) to just **after** the `_Palette` class definition
instead, i.e. insert this whole block right before `class _BrandPack(BaseModel):`.

- [ ] **Step 2: Add `RefineError`, `RefineResult`, and the recipe-summary helper**

Right after the `BrandPackResult` class (line 306–309), add:

```python
class RefineError(Exception):
    """Raised when a refine call completed but left nothing usable (the
    mark's paths all failed validation). Carries the estimated cost of the
    (already-billed) call so callers can still record it against the global
    budget kill-switch."""

    def __init__(self, message, cost_usd=0.0):
        super().__init__(message)
        self.cost_usd = cost_usd


class RefineResult:
    def __init__(self, design, cost_usd):
        self.design = design
        self.cost_usd = cost_usd


_MARK_SUMMARY = {
    "custom": lambda m: m.get("rationale") or "a custom AI-drawn mark",
    "icon": lambda m: f"the '{m.get('icon')}' icon",
    "initials": lambda m: f"the brand's initials, {m.get('style')} style",
    "abstract": lambda m: f"an abstract '{m.get('family')}' shape",
    "image": lambda m: "an uploaded image mark",
}


def _describe_recipe(recipe):
    """Plain-text summary of the current editor draft for the refine
    prompt's user turn — used when no source `elements` are available
    (image/icon/initials/abstract marks, or a recipe that predates the
    elements round-trip). Best-effort: recipe is untrusted request input,
    every field is read defensively."""
    mark = recipe.get("mark") if isinstance(recipe.get("mark"), dict) else {}
    describe = _MARK_SUMMARY.get(mark.get("type"), lambda m: "no mark")
    colors = recipe.get("colors") if isinstance(recipe.get("colors"), dict) else {}
    return (
        f"Layout: {recipe.get('layout')}. Mark: {describe(mark)}. "
        f"Mark color: {colors.get('mark')}. Text color: {colors.get('text')}. "
        f'Name: "{recipe.get("name")}". Tagline: "{recipe.get("tagline")}".'
    )
```

- [ ] **Step 3: Add `refine_design`**

Right after `generate_brand_pack` (after line 393, before the "Usage
accounting" section comment), add:

```python
def refine_design(recipe, elements, instruction):
    """One gated, uncached Claude call -> a refined design (mark, palette,
    font_vibe, layout — whole-design scope). Raises RefineError (carrying
    the estimated cost) on provider failure or if the refined mark's paths
    don't survive validation. `elements` is capped defensively: it's
    untrusted request input, only ever used as descriptive prompt text
    (never compiled or persisted directly), but a hostile payload shouldn't
    be able to inflate the prompt without bound."""
    if elements:
        bounded = json.dumps(elements[:12])[:4000]
        current = f"Current mark elements (redesign these): {bounded}"
    else:
        current = f"Current design summary (no source elements available — design a new custom mark): {_describe_recipe(recipe)}"
    user_content = f'{current}\n\nCoach\'s instruction: "{instruction}"'
    try:
        parsed, cost, _ = core_ai.structured(
            system=REFINE_PROMPT,
            user=user_content,
            output_model=_RefinedDesign,
            model=settings.LOGO_AI_MODEL,
            max_tokens=3000,
        )
    except core_ai.AiError as exc:
        raise RefineError(str(exc), cost_usd=exc.cost_usd) from exc

    mark = _validate_pack_mark(parsed.mark)
    if not mark:
        raise RefineError("refined mark validation left nothing usable", cost_usd=cost)

    design = {
        "mark": mark,
        "palette": _validate_pack_palette(parsed.palette),
        "font_vibe": parsed.font_vibe,
        "layout": parsed.layout,
        "rationale": str(parsed.rationale or "")[:300],
    }
    return RefineResult(design, cost)
```

Note `mark` already carries `"elements"` (Task 1's `_validate_pack_mark`
change) alongside `"rationale"`/`"paths"` — that's what the client keeps
for the *next* refinement round, so `design` doesn't need a separate
top-level `elements` key.

Add the `json` import at the top of the file:

```python
import json
from datetime import UTC, datetime
```

- [ ] **Step 4: Add `record_successful_refinement`**

Right after `record_successful_pack` (end of file), add:

```python
def record_successful_refinement(tenant_schema, month=None):
    """Charged only after a successful, validated refinement — failed calls
    never consume a coach's monthly quota."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(refinements_used=F("refinements_used") + 1)
```

- [ ] **Step 5: Sanity-check the module imports cleanly**

```bash
docker compose exec django python -c "from apps.tenant_config import logo_ai; print(logo_ai.REFINE_PROMPT[:40]); print(logo_ai._RefinedDesign)"
```

Expected: prints the prompt's first 40 chars and the pydantic model repr, no
import errors.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py
git commit -m "feat(logo-ai): add refine_design AI call, RefineError, refinement accounting"
```

---

## Task 4: `logo_refine` view + URL (backend)

**Files:**
- Modify: `backend/apps/tenant_config/views.py`
- Modify: `backend/apps/tenant_config/urls.py`
- Create: `backend/apps/tenant_config/tests/test_logo_refine_views.py`

**Interfaces:**
- Consumes: `logo_ai.refine_design`, `logo_ai.RefineError`, `logo_ai.record_successful_refinement`, `logo_ai.record_attempt_cost`, `logo_ai.global_spend`, `logo_ai.tenant_usage`, `logo_ai._current_month`, `core_ai.available`, `settings.LOGO_AI_MONTHLY_REFINE_LIMIT`, `settings.LOGO_AI_MONTHLY_BUDGET_USD`, `IsCoachOrOwner`.
- Produces: `POST /api/v1/admin/config/logo-refine/` → `{"design": dict | None, "source": "ai"|"disabled"|"upgrade_required"|"quota_exhausted"|"error", "refine_remaining": int}`.

- [ ] **Step 1: Add the `logo_refine` view**

In `backend/apps/tenant_config/views.py`, right after `logo_brand_pack` (end
of file, after line 303), add:

```python
@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_refine(request):
    """One gated Claude call -> a refined design (mark/palette/font/layout)
    from the coach's free-text instruction on their current editor draft.
    Always a non-empty JSON body. No result caching (see
    docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md)."""
    tenant = connection.tenant
    month = logo_ai._current_month()

    if not core_ai.available()[0]:
        return Response({"design": None, "source": "disabled", "refine_remaining": 0})
    if not tenant.has_paid_platform_plan:
        return Response({"design": None, "source": "upgrade_required", "refine_remaining": 0})

    data = request.data if isinstance(request.data, dict) else {}
    recipe = data.get("recipe") if isinstance(data.get("recipe"), dict) else {}
    elements = data.get("elements") if isinstance(data.get("elements"), list) else None
    instruction = str(data.get("instruction") or "").strip()[:300]

    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    refine_remaining = max(0, settings.LOGO_AI_MONTHLY_REFINE_LIMIT - usage.refinements_used)

    if not instruction:
        return Response({"design": None, "source": "error", "refine_remaining": refine_remaining})
    if refine_remaining <= 0:
        return Response({"design": None, "source": "quota_exhausted", "refine_remaining": 0})

    if logo_ai.global_spend(month=month) >= Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD)):
        logger.warning("logo refine: monthly budget kill-switch tripped (%s)", month)
        return Response({"design": None, "source": "disabled", "refine_remaining": refine_remaining})

    try:
        result = logo_ai.refine_design(recipe, elements, instruction)
    except logo_ai.RefineError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo refine: validation left nothing usable")
        return Response({"design": None, "source": "error", "refine_remaining": refine_remaining})
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo refine: AI call failed")
        return Response({"design": None, "source": "error", "refine_remaining": refine_remaining})

    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    logo_ai.record_successful_refinement(tenant.schema_name, month=month)
    return Response({"design": result.design, "source": "ai", "refine_remaining": refine_remaining - 1})
```

- [ ] **Step 2: Wire the URL**

In `backend/apps/tenant_config/urls.py`, add `logo_refine` to the import
from `.views` and register the path:

```python
from .views import (
    TenantConfigView,
    admin_stats,
    help_bot_chat,
    help_bot_status,
    logo_brand_pack,
    logo_brand_pack_status,
    logo_refine,
    setup_status,
)
```

```python
    path("config/logo-brand-pack/", logo_brand_pack, name="logo-brand-pack"),
    path(
        "config/logo-brand-pack/status/",
        logo_brand_pack_status,
        name="logo-brand-pack-status",
    ),
    path("config/logo-refine/", logo_refine, name="logo-refine"),
```

- [ ] **Step 3: Write the gating matrix + behavior tests**

Create `backend/apps/tenant_config/tests/test_logo_refine_views.py`,
mirroring `test_logo_ai_views.py`'s fixtures exactly:

```python
"""Logo Studio AI refinement endpoint: paid-tier gate, monthly quota
(separate from the Brand Pack's), no result cache, and the shared global
budget kill-switch. Anthropic itself is always mocked via
``logo_ai.refine_design`` — no real network access.
"""

from decimal import Decimal

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import LogoAiUsage, PlatformPlan, PlatformSubscription
from apps.tenant_config import logo_ai

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"

_FAKE_DESIGN = {
    "mark": {"rationale": "A rising line.", "paths": [{"d": "M0 0 Z", "fill": "mark"}], "elements": [{"type": "path", "d": "M0 0 Z"}]},
    "palette": {"name": "Sunrise", "primary": "#e11d48", "secondary": "#f97316", "accent": "#fbbf24", "ink": "#111827"},
    "font_vibe": "Elegant",
    "layout": "stacked",
    "rationale": "Warmed the palette and gave the mark more lift.",
}

_RECIPE = {
    "layout": "horizontal",
    "name": "Test Brand",
    "tagline": "",
    "mark": {"type": "initials", "style": "plain"},
    "colors": {"mark": "#111827", "text": "#111827"},
}


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@refinetest.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


@pytest.fixture()
def coach_client(coach):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture()
def paid_tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name="Refine Test Paid", price_monthly=19, transaction_fee_pct=5)
        owner = User.objects.create_user(
            email="refine-owner@x.com",
            name="Owner",
            password="x",
            role="owner",  # noqa: S106
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_shared():
    def _scrub():
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Refine Test Paid").delete()
            User.objects.filter(email="refine-owner@x.com").delete()
            LogoAiUsage.objects.all().delete()

    _scrub()
    yield
    _scrub()


def _mock_success(monkeypatch, cost_usd=Decimal("0.02"), design=None):
    calls = []

    def fake(*args, **kwargs):
        calls.append((args, kwargs))
        return logo_ai.RefineResult(design or _FAKE_DESIGN, cost_usd)

    monkeypatch.setattr(logo_ai, "refine_design", fake)
    return calls


class TestLogoRefine:
    def test_disabled_without_api_key(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = ""
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "warmer colors"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data == {"design": None, "source": "disabled", "refine_remaining": 0}
        assert calls == []

    def test_upgrade_required_for_free_tenant(self, coach_client, tenant_ctx, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "warmer colors"},
            format="json",
        )
        assert resp.data["source"] == "upgrade_required"
        assert calls == []

    def test_blank_instruction_is_an_error_and_does_not_call_anthropic(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "   "},
            format="json",
        )
        assert resp.data["source"] == "error"
        assert calls == []

    def test_success_records_quota_and_cost_and_returns_design(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        _mock_success(monkeypatch, cost_usd=Decimal("0.02"))
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "elements": [{"type": "path", "d": "M0 0 Z"}], "instruction": "warmer and bolder"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.data["source"] == "ai"
        assert resp.data["design"] == _FAKE_DESIGN
        assert resp.data["refine_remaining"] == 19

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.refinements_used == 1
        assert row.usd_spent == Decimal("0.02")

    def test_quota_exhausted_blocks_new_refinement(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        for _ in range(20):
            logo_ai.record_successful_refinement(paid_tenant.schema_name, month=logo_ai._current_month())
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "more premium"},
            format="json",
        )
        assert resp.data == {"design": None, "source": "quota_exhausted", "refine_remaining": 0}
        assert calls == []

    def test_error_records_cost_but_not_quota(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"

        def raise_error(*args, **kwargs):
            raise logo_ai.RefineError("nothing usable", cost_usd=Decimal("0.01"))

        monkeypatch.setattr(logo_ai, "refine_design", raise_error)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "rounder mark"},
            format="json",
        )
        assert resp.data["source"] == "error"
        assert resp.data["design"] is None

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.refinements_used == 0
        assert row.usd_spent == Decimal("0.01")

    def test_generic_exception_records_zero_cost_and_does_not_propagate(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"

        def raise_generic(*args, **kwargs):
            raise RuntimeError("network blip")

        monkeypatch.setattr(logo_ai, "refine_design", raise_generic)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "rounder mark"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["source"] == "error"

        row = logo_ai.tenant_usage(paid_tenant.schema_name, month=logo_ai._current_month())
        assert row.refinements_used == 0
        assert row.usd_spent == 0

    def test_global_budget_kill_switch_blocks_new_refinement(
        self, coach_client, paid_tenant, settings, monkeypatch
    ):
        settings.ANTHROPIC_API_KEY = "test-key"
        settings.LOGO_AI_MONTHLY_BUDGET_USD = 1.0
        logo_ai.record_attempt_cost(paid_tenant.schema_name, Decimal("1.5"), month=logo_ai._current_month())
        calls = _mock_success(monkeypatch)
        resp = coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "more premium"},
            format="json",
        )
        assert resp.data["source"] == "disabled"
        assert calls == []

    def test_instruction_is_clamped_to_300_chars(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = "test-key"
        seen = {}

        def fake(recipe, elements, instruction):
            seen["instruction"] = instruction
            return logo_ai.RefineResult(_FAKE_DESIGN, Decimal("0.02"))

        monkeypatch.setattr(logo_ai, "refine_design", fake)
        coach_client.post(
            "/api/v1/admin/config/logo-refine/",
            {"recipe": _RECIPE, "instruction": "x" * 500},
            format="json",
        )
        assert len(seen["instruction"]) == 300

    def test_status_endpoint_reports_refine_remaining(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        logo_ai.record_successful_refinement(paid_tenant.schema_name, month=logo_ai._current_month())
        resp = coach_client.get("/api/v1/admin/config/logo-brand-pack/status/")
        assert resp.data["refine_remaining"] == 19
```

- [ ] **Step 4: Run the tests**

```bash
docker compose exec django pytest apps/tenant_config/tests/test_logo_refine_views.py apps/tenant_config/tests/test_logo_ai_views.py -v
```

Expected: all pass.

- [ ] **Step 5: Run the full backend suite once to confirm no regressions**

```bash
docker compose exec django pytest -n auto
```

Expected: all pass (no unrelated failures introduced by the migration or
the shared prompt refactor).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/views.py backend/apps/tenant_config/urls.py backend/apps/tenant_config/tests/test_logo_refine_views.py
git commit -m "feat(logo-ai): add gated logo-refine/ endpoint with its own quota + budget checks"
```

---

## Task 5: Frontend types + `applyRefinedDesign` + `refine-api.ts` client

**Files:**
- Modify: `frontend-customer/src/lib/logo/composer.ts`
- Modify: `frontend-customer/src/lib/logo/brand-pack-api.ts`
- Create: `frontend-customer/src/lib/logo/refine-api.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/composer.test.ts`

**Interfaces:**
- Produces: `composer.ts` → `BrandPackElement` (type), `BrandPackMark.elements?: BrandPackElement[]`, `packElementsByIndex(pack: BrandPack): (BrandPackElement[] | undefined)[]`, `RefinedDesign` (interface), `applyRefinedDesign(recipe: LogoRecipe, design: RefinedDesign): LogoRecipe`. `brand-pack-api.ts` → `BrandPackStatus.refine_remaining: number`. `refine-api.ts` → `fetchLogoRefine(recipe: LogoRecipe, elements: BrandPackElement[] | null, instruction: string): Promise<RefineResponse>`.

- [ ] **Step 1: Extend `BrandPackMark` and add `packElementsByIndex`**

In `frontend-customer/src/lib/logo/composer.ts`, replace the `BrandPackMark`
interface (lines 479–482) and add a new type + helper right after
`composeFromPack` (after line 572):

```ts
/** A mark's pre-compile source geometry — opaque to the client (never
 * interpreted, only ever round-tripped to the logo-refine/ endpoint). Shape
 * mirrors backend/apps/tenant_config/logo_ai.py's `_Element` union. */
export type BrandPackElement = Record<string, unknown>;

export interface BrandPackMark {
  rationale: string;
  paths: BrandPackPath[];
  /** Present on packs generated after the elements round-trip shipped;
   * absent on older cached packs. */
  elements?: BrandPackElement[];
}
```

```ts
/** Parallel index into the flattened `marks x palettes` order composeFromPack
 * builds recipes in — the single source of truth for that pairing, reused
 * by logo-studio.tsx to know which source elements (if any) back a given
 * AI wall tile, for handing to logo-refine/ later. */
export function packElementsByIndex(
  pack: BrandPack,
): (BrandPackElement[] | undefined)[] {
  const out: (BrandPackElement[] | undefined)[] = [];
  for (const mark of pack.marks) {
    for (let i = 0; i < pack.palettes.length; i++) out.push(mark.elements);
  }
  return out;
}

/** The logo-refine/ endpoint's response payload — a compact design (not a
 * full LogoRecipe) that applyRefinedDesign folds onto the current draft. */
export interface RefinedDesign {
  mark: BrandPackMark;
  palette: BrandPackPalette;
  font_vibe: FontVibe;
  layout: RecipeLayout;
  rationale: string;
}

/** Applies an AI refinement to the current editor draft: reshapes the mark,
 * repalettes, and swaps to a font in the new font_vibe's pool (keeping the
 * current family if it already fits) — everything else on the recipe
 * (name, tagline text, badge, element placement) is left untouched. */
export function applyRefinedDesign(
  recipe: LogoRecipe,
  design: RefinedDesign,
): LogoRecipe {
  const fontPool = LOGO_FONTS.filter((f) => f.vibe === design.font_vibe).map(
    (f) => f.family,
  );
  const fonts = fontPool.length ? fontPool : LOGO_FONT_FAMILIES;
  const font = fonts.includes(recipe.typography.name.font)
    ? recipe.typography.name.font
    : fonts[0]!;
  const entry = fontEntry(font);
  const weight: FontWeight = entry.weights.includes(700)
    ? 700
    : entry.weights[entry.weights.length - 1]!;
  const paths: CustomMarkPath[] = design.mark.paths.map((p) => ({
    d: p.d,
    fill: p.fill ?? "mark",
    fill_rule: p.fill_rule,
    opacity: p.opacity,
  }));
  return {
    ...recipe,
    layout: design.layout,
    mark: { type: "custom", rationale: design.mark.rationale, paths },
    typography: {
      name: { ...recipe.typography.name, font, weight },
      tagline: { ...recipe.typography.tagline, font, weight: 500 },
    },
    colors: {
      ...recipe.colors,
      palette_id: null,
      badge: { type: "solid", color: design.palette.primary },
      mark: design.palette.ink,
      mark2: design.palette.secondary,
      mark_accent: design.palette.accent,
      text: design.palette.ink,
      tagline: design.palette.secondary,
    },
  };
}
```

- [ ] **Step 2: Add `refine_remaining` to `BrandPackStatus`**

In `frontend-customer/src/lib/logo/brand-pack-api.ts`:

```ts
export interface BrandPackStatus {
  enabled: boolean;
  eligible: boolean;
  remaining: number;
  reason: "upgrade_required" | "quota_exhausted" | "disabled" | null;
  refine_remaining: number;
}
```

- [ ] **Step 3: Create the refine API client**

Create `frontend-customer/src/lib/logo/refine-api.ts`:

```ts
// Thin client for the Logo Studio AI refinement endpoint (paid-tier
// feature). See backend/apps/tenant_config/views.py logo_refine.
import { clientFetch } from "@/lib/api-client";
import type { BrandPackElement, RefinedDesign } from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";

export type RefineSource =
  | "ai"
  | "disabled"
  | "upgrade_required"
  | "quota_exhausted"
  | "error";

export interface RefineResponse {
  design: RefinedDesign | null;
  source: RefineSource;
  refine_remaining: number;
}

export function fetchLogoRefine(
  recipe: LogoRecipe,
  elements: BrandPackElement[] | null,
  instruction: string,
): Promise<RefineResponse> {
  return clientFetch<RefineResponse>("/api/v1/admin/config/logo-refine/", {
    method: "POST",
    body: JSON.stringify({ recipe, elements, instruction }),
  });
}
```

- [ ] **Step 4: Add a composer test for `packElementsByIndex` and `applyRefinedDesign`**

Append to `frontend-customer/src/lib/logo/__tests__/composer.test.ts`:

```ts
import {
  applyRefinedDesign,
  composeFromPack,
  packElementsByIndex,
  type BrandPack,
  type RefinedDesign,
} from "@/lib/logo/composer";
import { defaultRecipe } from "@/lib/logo/catalog";

describe("packElementsByIndex", () => {
  it("aligns each recipe's index to its source mark's elements", () => {
    const pack: BrandPack = {
      marks: [
        { rationale: "a", paths: [], elements: [{ type: "circle" }] },
        { rationale: "b", paths: [] },
      ],
      palettes: [
        { name: "p1", primary: "#111827", secondary: "#111827", accent: "#111827", ink: "#111827" },
        { name: "p2", primary: "#111827", secondary: "#111827", accent: "#111827", ink: "#111827" },
      ],
      tagline: "",
      font_vibe: "Minimal",
    };
    const byIndex = packElementsByIndex(pack);
    const recipes = composeFromPack(pack, { brandName: "X", niche: "", styleChips: [] }, 1);
    expect(recipes).toHaveLength(4);
    expect(byIndex).toEqual([
      [{ type: "circle" }],
      [{ type: "circle" }],
      undefined,
      undefined,
    ]);
  });
});

describe("applyRefinedDesign", () => {
  it("reshapes the mark, palette, layout, and font while keeping name/tagline", () => {
    const recipe = defaultRecipe("Zeynep Yoga", "#1a56db");
    const design: RefinedDesign = {
      mark: { rationale: "warmer", paths: [{ d: "M0 0 Z", fill: "mark" }] },
      palette: { name: "Warm", primary: "#c2410c", secondary: "#e11d48", accent: "#fbbf24", ink: "#111827" },
      font_vibe: "Bold",
      layout: "stacked",
      rationale: "Warmed the palette and gave the mark more weight.",
    };
    const next = applyRefinedDesign(recipe, design);
    expect(next.name).toBe(recipe.name);
    expect(next.tagline).toBe(recipe.tagline);
    expect(next.layout).toBe("stacked");
    expect(next.mark).toEqual({ type: "custom", rationale: "warmer", paths: [{ d: "M0 0 Z", fill: "mark", fill_rule: undefined, opacity: undefined }] });
    expect(next.colors.mark).toBe("#111827");
    expect(next.colors.palette_id).toBeNull();
  });
});
```

- [ ] **Step 5: Run the tests**

```bash
cd frontend-customer && npx vitest run src/lib/logo/__tests__/composer.test.ts
```

Expected: all pass, including the two new `describe` blocks.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/lib/logo/composer.ts frontend-customer/src/lib/logo/brand-pack-api.ts \
  frontend-customer/src/lib/logo/refine-api.ts frontend-customer/src/lib/logo/__tests__/composer.test.ts
git commit -m "feat(logo-studio): add elements round-trip types, applyRefinedDesign, refine API client"
```

---

## Task 6: `lib/logo/history.ts` — pure undo/redo reducer

**Files:**
- Create: `frontend-customer/src/lib/logo/history.ts`
- Create: `frontend-customer/src/lib/logo/__tests__/history.test.ts`

**Interfaces:**
- Produces: `EditHistory<T>` (interface: `{past, present, future}`), `createHistory<T>(initial: T): EditHistory<T>`, `push<T>(h: EditHistory<T>, next: T, coalesceKey?: string | null, now?: number): EditHistory<T>`, `undo<T>(h: EditHistory<T>): EditHistory<T>`, `redo<T>(h: EditHistory<T>): EditHistory<T>`, `canUndo<T>(h: EditHistory<T>): boolean`, `canRedo<T>(h: EditHistory<T>): boolean`, `reset<T>(baseline: T): EditHistory<T>`.

- [ ] **Step 1: Write the failing tests**

Create `frontend-customer/src/lib/logo/__tests__/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  reset,
  undo,
} from "@/lib/logo/history";

describe("history", () => {
  it("starts empty with no undo/redo available", () => {
    const h = createHistory(0);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("push then undo returns to the previous value and enables redo", () => {
    const h1 = push(createHistory(0), 1);
    const h2 = undo(h1);
    expect(h2.present).toBe(0);
    expect(canUndo(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);
  });

  it("redo replays the value undo stepped back from", () => {
    const h1 = push(createHistory(0), 1);
    const h2 = undo(h1);
    const h3 = redo(h2);
    expect(h3.present).toBe(1);
    expect(canRedo(h3)).toBe(false);
  });

  it("a fresh push after undo drops the redo branch", () => {
    const h1 = push(createHistory(0), 1);
    const h2 = undo(h1);
    const h3 = push(h2, 2);
    expect(h3.present).toBe(2);
    expect(canRedo(h3)).toBe(false);
    expect(undo(h3).present).toBe(0);
  });

  it("undo/redo on an empty stack is a no-op", () => {
    const h = createHistory(0);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("coalesces consecutive pushes with the same key within the window", () => {
    let h = createHistory("a");
    h = push(h, "ab", "typing", 1000);
    h = push(h, "abc", "typing", 1100);
    expect(h.present).toBe("abc");
    expect(canUndo(h)).toBe(true);
    const back = undo(h);
    expect(back.present).toBe("a"); // one coalesced step, not two
  });

  it("does not coalesce across the coalesce window", () => {
    let h = createHistory("a");
    h = push(h, "ab", "typing", 1000);
    h = push(h, "abc", "typing", 1500); // 500ms later, window is 400ms
    expect(undo(h).present).toBe("ab");
    expect(undo(undo(h)).present).toBe("a");
  });

  it("does not coalesce a null key", () => {
    let h = createHistory(0);
    h = push(h, 1, null, 1000);
    h = push(h, 2, null, 1001);
    expect(undo(h).present).toBe(1);
    expect(undo(undo(h)).present).toBe(0);
  });

  it("caps the past stack at 100 entries", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 105; i++) h = push(h, i, null, i);
    expect(h.past).toHaveLength(100);
    expect(h.past[0]!.value).toBe(5); // oldest 5 entries dropped
  });

  it("reset replaces the whole history with a fresh baseline", () => {
    let h = createHistory(0);
    h = push(h, 1, null, 1);
    h = push(h, 2, null, 2);
    const baselined = reset(h.present + 100);
    expect(baselined.present).toBe(102);
    expect(canUndo(baselined)).toBe(false);
    expect(canRedo(baselined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-customer && npx vitest run src/lib/logo/__tests__/history.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/logo/history'`.

- [ ] **Step 3: Write the implementation**

Create `frontend-customer/src/lib/logo/history.ts`:

```ts
// Pure undo/redo reducer for the Logo Studio editor's single-recipe draft.
// No React, no side effects — logo-studio.tsx owns the state slot and calls
// these functions directly. See
// docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md.

const COALESCE_WINDOW_MS = 400;
const MAX_ENTRIES = 100;

interface HistoryEntry<T> {
  value: T;
  key: string | null;
  at: number;
}

export interface EditHistory<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
}

export function createHistory<T>(initial: T): EditHistory<T> {
  return { past: [], present: initial, future: [] };
}

/** Pushes `next` as the new present. If `coalesceKey` matches the top of
 * `past` and the gap since that entry is under the coalesce window, the top
 * entry is replaced instead of a new one being added — so a slider drag or
 * a burst of keystrokes on the same field becomes one undo step. Any
 * push always clears `future` (a fresh edit branches off, redo is gone). */
export function push<T>(
  history: EditHistory<T>,
  next: T,
  coalesceKey: string | null = null,
  now: number = Date.now(),
): EditHistory<T> {
  const top = history.past[history.past.length - 1];
  const coalesce =
    coalesceKey !== null &&
    top !== undefined &&
    top.key === coalesceKey &&
    now - top.at < COALESCE_WINDOW_MS;
  // Coalescing keeps the ORIGINAL pre-burst value as the undo target (only
  // the timestamp refreshes, extending the window) — otherwise each
  // coalesced push would overwrite it with the previous keystroke's
  // intermediate value, and undo would only ever step back one keystroke.
  const entry: HistoryEntry<T> = coalesce
    ? { value: top!.value, key: coalesceKey, at: now }
    : { value: history.present, key: coalesceKey, at: now };
  const past = coalesce
    ? [...history.past.slice(0, -1), entry]
    : [...history.past, entry].slice(-MAX_ENTRIES);
  return { past, present: next, future: [] };
}

export function undo<T>(history: EditHistory<T>): EditHistory<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: previous.value,
    future: [
      { value: history.present, key: previous.key, at: previous.at },
      ...history.future,
    ],
  };
}

export function redo<T>(history: EditHistory<T>): EditHistory<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0]!;
  return {
    past: [...history.past, { value: history.present, key: next.key, at: next.at }],
    present: next.value,
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: EditHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: EditHistory<T>): boolean {
  return history.future.length > 0;
}

/** Replaces the whole history with a fresh baseline — no past, no future.
 * Used whenever the editor step is (re-)entered with a new starting recipe
 * (a different history than "this recipe is the first present value",
 * which is what createHistory already does — reset exists as the named,
 * intention-revealing call for "throw away an existing history"). */
export function reset<T>(baseline: T): EditHistory<T> {
  return createHistory(baseline);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend-customer && npx vitest run src/lib/logo/__tests__/history.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/history.ts frontend-customer/src/lib/logo/__tests__/history.test.ts
git commit -m "feat(logo-studio): add pure undo/redo history reducer"
```

---

## Task 7: `lib/logo/studio-session.ts` — refresh-safe localStorage session

**Files:**
- Create: `frontend-customer/src/lib/logo/studio-session.ts`
- Create: `frontend-customer/src/lib/logo/__tests__/studio-session.test.ts`

**Interfaces:**
- Consumes: `Brief` (from `composer.ts`), `BrandPack`, `BrandPackElement` (from `composer.ts`), `LogoRecipe` (from `types/logo`).
- Produces: `StudioSession` (interface), `loadStudioSession(): StudioSession | null`, `saveStudioSession(session: Omit<StudioSession, "v" | "savedAt">): void`, `clearStudioSession(): void`.

- [ ] **Step 1: Write the failing tests**

Create `frontend-customer/src/lib/logo/__tests__/studio-session.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStudioSession,
  loadStudioSession,
  saveStudioSession,
} from "@/lib/logo/studio-session";
import { defaultRecipe } from "@/lib/logo/catalog";
import type { Brief } from "@/lib/logo/composer";

const BRIEF: Brief = { brandName: "Zeynep Yoga", niche: "yoga", styleChips: [] };
const RECIPE = defaultRecipe("Zeynep Yoga", "#1a56db");
const KEY = "contentor_logo_studio";

describe("studio-session", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when nothing is saved", () => {
    expect(loadStudioSession()).toBeNull();
  });

  it("round-trips a saved session", () => {
    saveStudioSession({
      step: "editor",
      brief: BRIEF,
      wallSeed: 42,
      pack: null,
      packSeed: null,
      recipe: RECIPE,
      elements: null,
    });
    const loaded = loadStudioSession();
    expect(loaded?.step).toBe("editor");
    expect(loaded?.brief).toEqual(BRIEF);
    expect(loaded?.wallSeed).toBe(42);
    expect(loaded?.recipe).toEqual(RECIPE);
  });

  it("discards a session from a different schema version", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 999, savedAt: Date.now(), step: "editor", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: RECIPE, elements: null }),
    );
    expect(loadStudioSession()).toBeNull();
  });

  it("discards a session older than 14 days", () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: fifteenDaysAgo, step: "editor", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: RECIPE, elements: null }),
    );
    expect(loadStudioSession()).toBeNull();
  });

  it("keeps a session younger than 14 days", () => {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: tenDaysAgo, step: "editor", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: RECIPE, elements: null }),
    );
    expect(loadStudioSession()).not.toBeNull();
  });

  it("tolerates corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadStudioSession()).toBeNull();
  });

  it("tolerates a missing/malformed shape", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now() }));
    expect(loadStudioSession()).toBeNull();
  });

  it("clear removes the saved session", () => {
    saveStudioSession({ step: "brief", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: null, elements: null });
    clearStudioSession();
    expect(loadStudioSession()).toBeNull();
  });

  it("never throws when localStorage.setItem throws (quota exceeded)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() =>
      saveStudioSession({ step: "brief", brief: BRIEF, wallSeed: 1, pack: null, packSeed: null, recipe: null, elements: null }),
    ).not.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend-customer && npx vitest run src/lib/logo/__tests__/studio-session.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/logo/studio-session'`.

- [ ] **Step 3: Write the implementation**

Create `frontend-customer/src/lib/logo/studio-session.ts`:

```ts
// Refresh-safe Logo Studio session: brief, chosen AI pack, and the editor
// draft survive a reload/tab-close. Follows the lib/cart.ts localStorage
// pattern (per-origin key, typeof window guard, try/catch everywhere), but
// stricter: writes are guarded too, since a corrupted or full localStorage
// must never break the studio. See
// docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md.
import type { BrandPack, BrandPackElement, Brief } from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";

const STORAGE_KEY = "contentor_logo_studio";
const SCHEMA_VERSION = 1;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type StudioStep = "brief" | "ideas" | "editor";

export interface StudioSession {
  v: 1;
  savedAt: number;
  step: StudioStep;
  brief: Brief;
  wallSeed: number;
  /** Raw pack, not the 18-24 recipes composeFromPack multiplies it into —
   * walls are re-derived on restore from pack + packSeed + brief. */
  pack: BrandPack | null;
  packSeed: number | null;
  /** The editor's current draft, or null if the coach hasn't reached the
   * editor yet this session. */
  recipe: LogoRecipe | null;
  /** The editor draft's mark's source elements, if it came from an AI pack
   * mark and hasn't since been mark-swapped — fed to logo-refine/ so a
   * refinement redesigns from the same geometry it started with. */
  elements: BrandPackElement[] | null;
}

function isStudioStep(value: unknown): value is StudioStep {
  return value === "brief" || value === "ideas" || value === "editor";
}

export function loadStudioSession(): StudioSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioSession>;
    if (parsed.v !== SCHEMA_VERSION) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      return null;
    }
    if (!isStudioStep(parsed.step)) return null;
    if (!parsed.brief || typeof parsed.wallSeed !== "number") return null;
    return {
      v: 1,
      savedAt: parsed.savedAt,
      step: parsed.step,
      brief: parsed.brief,
      wallSeed: parsed.wallSeed,
      pack: parsed.pack ?? null,
      packSeed: parsed.packSeed ?? null,
      recipe: parsed.recipe ?? null,
      elements: parsed.elements ?? null,
    };
  } catch {
    return null;
  }
}

export function saveStudioSession(
  session: Omit<StudioSession, "v" | "savedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StudioSession = { ...session, v: SCHEMA_VERSION, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage disabled, full, or private-mode-restricted — session
    // persistence degrades to "no restore," never breaks the studio.
  }
}

export function clearStudioSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend-customer && npx vitest run src/lib/logo/__tests__/studio-session.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/studio-session.ts frontend-customer/src/lib/logo/__tests__/studio-session.test.ts
git commit -m "feat(logo-studio): add refresh-safe localStorage session module"
```

---

## Task 8: Wire undo/redo into the editor

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Modify: `frontend-customer/src/components/logo/studio-editor.tsx`
- Modify: `frontend-customer/src/components/logo/studio-panel.tsx`

**Interfaces:**
- Consumes: `createHistory`, `push`, `undo`, `redo`, `canUndo`, `canRedo` (from Task 6's `lib/logo/history.ts`).
- Produces: `StudioEditorProps.onPatch: (part, coalesceKey?) => void`, `StudioEditorProps.onUpdate: (updater, coalesceKey?) => void`, plus new `canUndo`/`canRedo`/`onUndo`/`onRedo` props threaded through `StudioEditor` → `StudioPanel`.

- [ ] **Step 1: Add history state, undo/redo handlers, and the coalesce-aware `patch`/`updateRecipe` to `logo-studio.tsx`**

In `frontend-customer/src/components/logo/logo-studio.tsx`, add the import:

```ts
import { canRedo, canUndo, createHistory, push, redo, reset, undo, type EditHistory } from "@/lib/logo/history";
```

(`createHistory` is used once, for the `editHistory` state's initial
value; every later "start a fresh baseline" call — entering the editor
with a new recipe, restoring a session — uses `reset`, which does the same
thing but reads as "throw away history" at the call site.)

Replace the `recipe` state declaration and the `patch` function (lines
57–59 and 122–123) with:

```ts
  const [recipe, setRecipe] = useState<LogoRecipe>(() =>
    seedRecipe(config, theme.primaryHex),
  );
  const [editHistory, setEditHistory] = useState<EditHistory<LogoRecipe>>(() =>
    createHistory(recipe),
  );
```

(leave the rest of the existing declarations — `saving`, `error`, refs — in
place), then replace `const patch = (part) => setRecipe((r) => ({...}))`
with:

```ts
  function patch(part: Partial<LogoRecipe>, coalesceKey?: string) {
    const next = { ...recipe, ...part };
    setRecipe(next);
    setEditHistory((h) => push(h, next, coalesceKey ?? null));
    if (part.mark) setActiveElements(null);
  }

  function updateRecipe(updater: (r: LogoRecipe) => LogoRecipe, coalesceKey?: string) {
    const next = updater(recipe);
    setRecipe(next);
    setEditHistory((h) => push(h, next, coalesceKey ?? null));
    if (next.mark !== recipe.mark) setActiveElements(null);
  }

  function handleUndo() {
    setEditHistory((h) => {
      const next = undo(h);
      setRecipe(next.present);
      return next;
    });
  }

  function handleRedo() {
    setEditHistory((h) => {
      const next = redo(h);
      setRecipe(next.present);
      return next;
    });
  }
```

(`setActiveElements` is added in Task 10 — for this task, temporarily
comment out those two lines or proceed straight to Task 10 before running
`tsc`, since it introduces the state. The plan executes tasks in order, so
by the time you build, Task 10 has already added `activeElements`.)

- [ ] **Step 2: Reset history whenever the editor step is (re-)entered**

Replace `handleCustomize` (lines 190–193):

```ts
  function handleCustomize(chosen: LogoRecipe) {
    setRecipe(chosen);
    setEditHistory(reset(chosen));
    setStep("editor");
  }
```

And in the re-seed effect (lines 114–120), reset history alongside recipe:

```ts
  useEffect(() => {
    if (!open) return;
    const seeded = seedRecipe(config, theme.primaryHex);
    setRecipe(seeded);
    setEditHistory(reset(seeded));
    setBrief((b) => ({ ...b, brandName: config.brand_name || b.brandName }));
    setStep(isRecipe(config.logo_recipe) ? "editor" : "brief");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
```

- [ ] **Step 3: Add the global Cmd/Ctrl+Z keyboard listener, scoped to the editor step**

Add a new `useEffect` right after the existing Escape-key effect (after
line 298):

```ts
  // Undo/redo — active only while the editor step is open (including
  // inside text inputs, so typed edits are undoable too). Detaches when
  // the studio closes or leaves the editor step. handleUndo/handleRedo
  // read editHistory via functional setState, so this listener never goes
  // stale even though editHistory isn't a dependency.
  useEffect(() => {
    if (!open || step !== "editor") return;
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, step]);
```

- [ ] **Step 4: Update `StudioEditorProps`/`StudioEditor` to accept and pass through the coalesce key + undo/redo**

In `frontend-customer/src/components/logo/studio-editor.tsx`:

```ts
interface StudioEditorProps {
  recipe: LogoRecipe;
  onPatch: (part: Partial<LogoRecipe>, coalesceKey?: string) => void;
  onUpdate: (updater: (r: LogoRecipe) => LogoRecipe, coalesceKey?: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  primaryHex: string;
  onGetNewIdeas: () => void;
  onUploadMark: (file: File) => void;
  logoSvgRef: React.RefObject<SVGSVGElement>;
  markSvgRef: React.RefObject<SVGSVGElement>;
}
```

Destructure the four new props in `StudioEditor(...)`'s parameter list,
change the canvas drag's `onChange` to coalesce (line 85):

```ts
          onChange={(next) => onUpdate(() => next, "canvas-drag")}
```

and pass everything through to `<StudioPanel>` (lines 140–148):

```tsx
      <StudioPanel
        recipe={recipe}
        selected={selected}
        onPatch={onPatch}
        onUpdate={onUpdate}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        primaryHex={primaryHex}
        onGetNewIdeas={onGetNewIdeas}
        onUploadMark={onUploadMark}
      />
```

- [ ] **Step 5: Render undo/redo buttons and thread coalesce keys through `studio-panel.tsx`**

In `frontend-customer/src/components/logo/studio-panel.tsx`:

Add `Redo2, Undo2` to the lucide-react import (line 4):

```ts
import { Redo2, Undo2, Upload, Wand2 } from "lucide-react";
```

Update `StudioPanelProps` (lines 56–64):

```ts
interface StudioPanelProps {
  recipe: LogoRecipe;
  selected: ElementKey | null;
  onPatch: (part: Partial<LogoRecipe>, coalesceKey?: string) => void;
  onUpdate: (updater: (r: LogoRecipe) => LogoRecipe, coalesceKey?: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  primaryHex: string;
  onGetNewIdeas: () => void;
  onUploadMark: (file: File) => void;
}
```

Replace the top of `StudioPanel` (lines 68–79) to render the undo/redo row:

```tsx
export function StudioPanel(props: StudioPanelProps) {
  const { selected, canUndo, canRedo, onUndo, onRedo } = props;
  return (
    <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          className="rounded-md border p-1.5 text-muted-foreground hover:border-foreground disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
          className="rounded-md border p-1.5 text-muted-foreground hover:border-foreground disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
      {selected === null && <GlobalControls {...props} />}
      {(selected === "name" || selected === "tagline") && (
        <TextControls {...props} element={selected} />
      )}
      {selected === "mark" && <MarkControls {...props} />}
    </div>
  );
}
```

Now add coalesce keys at the continuous-input call sites. In
`TextControls`, update `patchTypography` to accept a key (lines 92–99):

```ts
  const patchTypography = (part: Partial<TextStyle>, coalesceKey?: string) =>
    onUpdate(
      (r) => ({
        ...r,
        typography: {
          ...r.typography,
          [element]: { ...r.typography[element], ...part },
        },
      }),
      coalesceKey,
    );
```

The name/tagline text input's `onChange` (lines 114–120):

```ts
          onChange={(e) =>
            onPatch(
              element === "name"
                ? { name: e.target.value }
                : { tagline: e.target.value },
              element === "name" ? "name-text" : "tagline-text",
            )
          }
```

The letter-spacing slider (lines 197–199):

```ts
            onChange={(e) =>
              patchTypography({ tracking: Number(e.target.value) }, `${element}-tracking`)
            }
```

The size slider (lines 210–222):

```ts
            onChange={(e) =>
              onUpdate(
                (r) => ({
                  ...r,
                  elements: {
                    ...r.elements,
                    [element]: {
                      ...r.elements[element],
                      scale: Number(e.target.value),
                    },
                  },
                }),
                `${element}-scale`,
              )
            }
```

The custom color `<input type="color">` (lines 250–262):

```ts
            onChange={(e) =>
              onPatch(
                {
                  colors: {
                    ...recipe.colors,
                    palette_id: null,
                    [colorKey]: e.target.value,
                  },
                },
                `${colorKey}-color`,
              )
            }
```

In `MarkControls`, the mark color input (lines 434–446):

```ts
            onChange={(e) =>
              onPatch(
                {
                  colors: {
                    ...recipe.colors,
                    palette_id: null,
                    mark: e.target.value,
                  },
                },
                "mark-color",
              )
            }
```

The mark scale slider (lines 451–465):

```ts
              onChange={(e) =>
                onUpdate(
                  (r) => ({
                    ...r,
                    elements: {
                      ...r.elements,
                      mark: { ...r.elements.mark, scale: Number(e.target.value) },
                    },
                  }),
                  "mark-scale",
                )
              }
```

The secondary/accent color inputs (lines 481–486, 490–500):

```ts
                onChange={(e) =>
                  onPatch(
                    { colors: { ...recipe.colors, mark2: e.target.value } },
                    "mark2-color",
                  )
                }
```

```ts
                onChange={(e) =>
                  onPatch(
                    { colors: { ...recipe.colors, mark_accent: e.target.value } },
                    "mark-accent-color",
                  )
                }
```

In `GlobalControls`, the name/tagline inputs (lines 548, 559) — same keys
as `TextControls` so typing in either view coalesces as one field:

```ts
          onChange={(e) => onPatch({ name: e.target.value }, "name-text")}
```
```ts
          onChange={(e) => onPatch({ tagline: e.target.value }, "tagline-text")}
```

The custom badge color input (lines 606–613):

```ts
            onChange={(e) =>
              onPatch(
                {
                  colors: {
                    ...recipe.colors,
                    palette_id: null,
                    badge: { type: "solid", color: e.target.value },
                  },
                },
                "badge-color",
              )
            }
```

All other call sites (font/weight/case pickers, palette swap, layout,
badge shape, badge outline, initials/abstract/icon mark swaps, upload) are
discrete one-click actions — leave them calling `onPatch`/`onUpdate` with
no third argument; each click is already exactly one undo step.

- [ ] **Step 6: Update the `<StudioEditor>` call site in `logo-studio.tsx`**

Replace the `<StudioEditor>` render (lines 419–430):

```tsx
              {step === "editor" && (
                <StudioEditor
                  recipe={recipe}
                  onPatch={patch}
                  onUpdate={updateRecipe}
                  canUndo={canUndo(editHistory)}
                  canRedo={canRedo(editHistory)}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  primaryHex={theme.primaryHex}
                  onGetNewIdeas={() => setStep("brief")}
                  onUploadMark={handleMarkUpload}
                  logoSvgRef={logoSvgRef}
                  markSvgRef={markSvgRef}
                />
              )}
```

- [ ] **Step 7: Typecheck**

```bash
cd frontend-customer && npx tsc --noEmit
```

Expected: no errors related to `logo-studio.tsx`, `studio-editor.tsx`, or
`studio-panel.tsx`. (If Task 10's `activeElements` state hasn't landed yet
because you're executing strictly in order, you will see two errors about
`setActiveElements` not existing — that's expected until Task 10; if
executing tasks out of order, stub `const setActiveElements = (_: unknown) => {};` temporarily is NOT needed since this plan's task order always lands Task 10 before this file is expected to fully typecheck standalone — proceed to Task 10 next.)

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/components/logo/studio-editor.tsx frontend-customer/src/components/logo/studio-panel.tsx
git commit -m "feat(logo-studio): wire coalescing undo/redo history into the editor"
```

---

## Task 9: Track `wallSeed`/`pack`/`packSeed`/`aiWallElements` state (prep for session + refine)

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Modify: `frontend-customer/src/components/logo/studio-wall.tsx`

**Interfaces:**
- Consumes: `packElementsByIndex` (Task 5).
- Produces: new state in `logo-studio.tsx` (`wallSeed`, `pack`, `packSeed`, `aiWallElements`, `activeElements`), `StudioWallProps.onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void`, new `StudioWallProps.aiWallElements?: (BrandPackElement[] | undefined)[] | null`.

- [ ] **Step 1: Add the new state slots to `logo-studio.tsx`**

Add the import:

```ts
import { packElementsByIndex, type BrandPackElement } from "@/lib/logo/composer";
```

Right after the existing `wall`/`wallDark`/`showingVariants` state (lines
74–76), add:

```ts
  const [wallSeed, setWallSeed] = useState(1);
```

Right after `aiWall` (line 82), add:

```ts
  const [pack, setPack] = useState<BrandPack | null>(null);
  const [packSeed, setPackSeed] = useState<number | null>(null);
  const [aiWallElements, setAiWallElements] = useState<
    (BrandPackElement[] | undefined)[] | null
  >(null);
```

(`BrandPack` needs adding to the existing `composer` import at the top —
it's already imported as a type in some files but check line 14–19's
import and add `type BrandPack` if not already present alongside
`composeFromPack, composeWall, moreLikeThis, type Brief`.)

Right after the `editHistory` state (added in Task 8), add:

```ts
  const [activeElements, setActiveElements] = useState<BrandPackElement[] | null>(null);
```

- [ ] **Step 2: Set `wallSeed` in `regenerateWall`**

Replace `regenerateWall` (lines 130–134):

```ts
  function regenerateWall() {
    const seed = 1 + Math.floor(Math.random() * 1_000_000);
    setWallSeed(seed);
    setWall(composeWall(brief, seed, 24, theme.primaryHex));
    setShowingVariants(false);
  }
```

- [ ] **Step 3: Set `pack`/`packSeed`/`aiWallElements` in `fetchAiIdeas`**

Replace the `resp.source === "ai" || resp.source === "cache"` branch inside
`fetchAiIdeas` (lines 160–162):

```ts
      if (resp.source === "ai" || resp.source === "cache") {
        const seed = 1 + Math.floor(Math.random() * 1_000_000);
        setPack(resp.pack);
        setPackSeed(resp.pack ? seed : null);
        setAiWall(resp.pack ? composeFromPack(resp.pack, brief, seed) : null);
        setAiWallElements(resp.pack ? packElementsByIndex(resp.pack) : null);
      } else if (resp.source === "error") {
```

- [ ] **Step 4: Thread `elements` through `handleCustomize` and clear `pack` state in `startIdeas`**

Replace `handleCustomize` from Task 8 to accept the second argument:

```ts
  function handleCustomize(chosen: LogoRecipe, elements?: BrandPackElement[]) {
    setRecipe(chosen);
    setEditHistory(reset(chosen));
    setActiveElements(elements ?? null);
    setStep("editor");
  }
```

In `startIdeas` (lines 177–182), also clear the new state so a fresh
"Show my logo ideas" doesn't carry over a stale pack from a previous brief:

```ts
  function startIdeas() {
    regenerateWall();
    setAiWall(null);
    setAiWallElements(null);
    setPack(null);
    setPackSeed(null);
    setAiNotice(null);
    setStep("ideas");
  }
```

- [ ] **Step 5: Thread `elements` through `StudioWall`/`AiWallCard`**

In `frontend-customer/src/components/logo/studio-wall.tsx`, add the import:

```ts
import type { BrandPackElement } from "@/lib/logo/brand-pack-api";
```

Wait — `BrandPackElement` lives in `composer.ts`, not `brand-pack-api.ts`.
Use:

```ts
import type { BrandPackElement } from "@/lib/logo/composer";
```

Update `StudioWallProps` (lines 11–32) — change `onCustomize` and add
`aiWallElements`:

```ts
interface StudioWallProps {
  wall: LogoRecipe[];
  dark: boolean;
  onToggleDark: () => void;
  onShuffle: () => void;
  onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
  showingVariants: boolean;
  onShowAll: () => void;
  brandName?: string;
  aiWall?: LogoRecipe[] | null;
  aiWallElements?: (BrandPackElement[] | undefined)[] | null;
  aiLoading?: boolean;
  aiNotice?: string | null;
  brandPackStatus?: BrandPackStatus | null;
  onGenerateAi?: () => void;
}
```

Update `AiWallCard`'s prop type and click handlers (lines 84–94, 101–125)
to accept and forward `elements`:

```ts
const AiWallCard = memo(function AiWallCard({
  recipe,
  elements,
  dark,
  onCustomize,
  onMoreLikeThis,
}: {
  recipe: LogoRecipe;
  elements?: BrandPackElement[];
  dark: boolean;
  onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
}) {
```

and both its `onClick={() => onCustomize(recipe)}` call sites become
`onClick={() => onCustomize(recipe, elements)}`.

`WallCard`'s prop type also widens to match the shared `onCustomize` type
(lines 36–46) even though it never passes `elements`:

```ts
const WallCard = memo(function WallCard({
  recipe,
  dark,
  onCustomize,
  onMoreLikeThis,
}: {
  recipe: LogoRecipe;
  dark: boolean;
  onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
}) {
```

Finally, in `StudioWall`'s render, destructure `aiWallElements` from props
and pass the per-index elements into each `AiWallCard` (lines 353–361):

```tsx
              {aiWall.map((recipe, i) => (
                <AiWallCard
                  key={i}
                  recipe={recipe}
                  elements={aiWallElements?.[i]}
                  dark={dark}
                  onCustomize={onCustomize}
                  onMoreLikeThis={onMoreLikeThis}
                />
              ))}
```

(add `aiWallElements` to the destructured props list at the top of
`StudioWall`, lines 270–285.)

- [ ] **Step 6: Update the `<StudioWall>` call site in `logo-studio.tsx`**

In the `step === "ideas"` render block (lines 398–417), add
`aiWallElements={aiWallElements}` alongside the existing `aiWall={aiWall}`.

- [ ] **Step 7: Typecheck**

```bash
cd frontend-customer && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run the frontend test suite baseline**

```bash
cd frontend-customer && npx vitest run
```

Expected: all existing tests still pass (no logic changed in composer.ts
itself, only new plumbing state).

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/components/logo/studio-wall.tsx
git commit -m "feat(logo-studio): track wall/pack seeds and AI mark elements for session + refine"
```

---

## Task 10: Wire the localStorage session into `logo-studio.tsx`

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Modify: `frontend-customer/src/components/logo/studio-brief.tsx`

**Interfaces:**
- Consumes: `loadStudioSession`, `saveStudioSession`, `clearStudioSession` (Task 7).

- [ ] **Step 1: Restore a saved session on open, falling back to the existing seed-from-config behavior**

Replace the re-seed effect from Task 8 (which currently just seeds from
`config`) with a version that checks for a saved session first:

```ts
  useEffect(() => {
    if (!open) return;
    const saved = loadStudioSession();
    if (saved) {
      setBrief(saved.brief);
      setPack(saved.pack);
      setPackSeed(saved.packSeed);
      setWallSeed(saved.wallSeed);
      setWall(composeWall(saved.brief, saved.wallSeed, 24, theme.primaryHex));
      if (saved.pack) {
        setAiWall(composeFromPack(saved.pack, saved.brief, saved.packSeed ?? 1));
        setAiWallElements(packElementsByIndex(saved.pack));
      } else {
        setAiWall(null);
        setAiWallElements(null);
      }
      const restoredRecipe = saved.recipe ?? seedRecipe(config, theme.primaryHex);
      setRecipe(restoredRecipe);
      setEditHistory(reset(restoredRecipe));
      setActiveElements(saved.elements);
      setStep(saved.step);
      return;
    }
    const seeded = seedRecipe(config, theme.primaryHex);
    setRecipe(seeded);
    setEditHistory(reset(seeded));
    setActiveElements(null);
    setBrief((b) => ({ ...b, brandName: config.brand_name || b.brandName }));
    setStep(isRecipe(config.logo_recipe) ? "editor" : "brief");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
```

Add the import:

```ts
import { clearStudioSession, loadStudioSession, saveStudioSession } from "@/lib/logo/studio-session";
```

- [ ] **Step 2: Debounce-save on every tracked state change while open**

Add right after the restore effect:

```ts
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveStudioSession({ step, brief, wallSeed, pack, packSeed, recipe, elements: activeElements });
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [open, step, brief, wallSeed, pack, packSeed, recipe, activeElements]);
```

- [ ] **Step 3: Clear the session on a successful save**

In `handleSave`, right after `onSaved(body);` (line 268):

```ts
      onSaved(body);
      clearStudioSession();
      onOpenChange(false);
```

- [ ] **Step 4: Add "Start over" on the Brief step**

In `logo-studio.tsx`, add a handler:

```ts
  function handleStartOver() {
    clearStudioSession();
    setBrief({ brandName: config.brand_name || "", niche: "", styleChips: [] });
    setWall(null);
    setPack(null);
    setPackSeed(null);
    setAiWall(null);
    setAiWallElements(null);
    setAiNotice(null);
  }
```

Pass it to `<StudioBrief>` (lines 388–396):

```tsx
              {step === "brief" && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <StudioBrief
                    brief={brief}
                    onChange={setBrief}
                    onSubmit={startIdeas}
                    onStartOver={handleStartOver}
                  />
                </div>
              )}
```

In `frontend-customer/src/components/logo/studio-brief.tsx`, add the prop
and render a small text button:

```ts
interface StudioBriefProps {
  brief: Brief;
  onChange: (brief: Brief) => void;
  onSubmit: () => void;
  onStartOver: () => void;
}
```

```tsx
export function StudioBrief({ brief, onChange, onSubmit, onStartOver }: StudioBriefProps) {
```

Add, right after the closing `</Button>` (before the closing `</div>` at
line 107):

```tsx
      <button
        type="button"
        onClick={onStartOver}
        className="self-center text-xs text-muted-foreground hover:underline"
      >
        Start over
      </button>
```

- [ ] **Step 5: Typecheck**

```bash
cd frontend-customer && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual verification (localStorage restore is not unit-testable here — no React component-test infra in this repo)**

```bash
make dev
```

Then in a browser at the tenant admin logo studio page:
1. Open the studio, fill in the Brief, click "Show my logo ideas".
2. Customize a wall tile to reach the Editor, make a couple of edits.
3. Refresh the page, reopen the studio — confirm it silently restores to
   the Editor step with your edits intact (check `localStorage.getItem("contentor_logo_studio")` in devtools to see the payload).
4. Go back to the Brief step, click "Start over" — confirm the brief
   clears and localStorage no longer has the key.
5. Reach the Editor, click "Use this logo" to save — confirm
   `localStorage.getItem("contentor_logo_studio")` is now `null`.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/components/logo/studio-brief.tsx
git commit -m "feat(logo-studio): restore/persist/clear studio state via localStorage session"
```

---

## Task 11: AI refinement prompt box in the editor

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`
- Modify: `frontend-customer/src/components/logo/studio-editor.tsx`
- Modify: `frontend-customer/src/components/logo/studio-panel.tsx`

**Interfaces:**
- Consumes: `fetchLogoRefine` (Task 5), `applyRefinedDesign` (Task 5), `push` (Task 6).
- Produces: `handleRefine(instruction: string)` in `logo-studio.tsx`; `RefinePromptBox` component in `studio-panel.tsx`.

- [ ] **Step 1: Add refine state and `handleRefine` to `logo-studio.tsx`**

Add the import:

```ts
import { applyRefinedDesign } from "@/lib/logo/composer";
import { fetchLogoRefine } from "@/lib/logo/refine-api";
```

Add state right after `activeElements` (Task 9):

```ts
  const [refining, setRefining] = useState(false);
  const [refineNotice, setRefineNotice] = useState<string | null>(null);
```

Add the handler, near `handleMoreLikeThis`:

```ts
  async function handleRefine(instruction: string) {
    setRefining(true);
    setRefineNotice(null);
    try {
      const resp = await fetchLogoRefine(recipe, activeElements, instruction);
      setBrandPackStatus((s) =>
        s ? { ...s, refine_remaining: resp.refine_remaining } : s,
      );
      if (resp.source === "ai" && resp.design) {
        const design = resp.design;
        setRecipe((r) => {
          const next = applyRefinedDesign(r, design);
          setEditHistory((h) => push(h, next, null));
          return next;
        });
        setActiveElements(design.mark.elements ?? null);
        setRefineNotice(design.rationale);
      } else if (resp.source === "quota_exhausted") {
        setRefineNotice("You've used this month's AI refinements. More next month.");
      } else {
        setRefineNotice("Couldn't refine the design — try again.");
      }
    } catch {
      setRefineNotice("Couldn't reach the design studio just now.");
    } finally {
      setRefining(false);
    }
  }
```

Note this uses the functional `setRecipe((r) => ...)` form deliberately
(unlike the synchronous `patch`/`updateRecipe`): `handleRefine` is async, so
`recipe`/`editHistory` captured in the outer closure could be stale by the
time the request resolves if the coach kept editing meanwhile — reading
the latest value via the updater avoids that.

- [ ] **Step 2: Thread refine props through `StudioEditor` into `StudioPanel`**

In `studio-editor.tsx`, add to `StudioEditorProps`:

```ts
  brandPackStatus: BrandPackStatus | null;
  refining: boolean;
  refineNotice: string | null;
  onRefine: (instruction: string) => void;
```

Import the type:

```ts
import type { BrandPackStatus } from "@/lib/logo/brand-pack-api";
```

Destructure the four new props and pass them to `<StudioPanel>`:

```tsx
      <StudioPanel
        recipe={recipe}
        selected={selected}
        onPatch={onPatch}
        onUpdate={onUpdate}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        brandPackStatus={brandPackStatus}
        refining={refining}
        refineNotice={refineNotice}
        onRefine={onRefine}
        primaryHex={primaryHex}
        onGetNewIdeas={onGetNewIdeas}
        onUploadMark={onUploadMark}
      />
```

- [ ] **Step 3: Add the `RefinePromptBox` to `studio-panel.tsx`**

Add `Loader2, Sparkles` to the lucide-react import:

```ts
import { Loader2, Redo2, Sparkles, Undo2, Upload, Wand2 } from "lucide-react";
```

Add the import:

```ts
import { useState } from "react";
import type { BrandPackStatus } from "@/lib/logo/brand-pack-api";
```

(`useRef` is already imported from `"react"` at the top — extend that line
to `import { useRef, useState } from "react";`.)

Extend `StudioPanelProps`:

```ts
interface StudioPanelProps {
  recipe: LogoRecipe;
  selected: ElementKey | null;
  onPatch: (part: Partial<LogoRecipe>, coalesceKey?: string) => void;
  onUpdate: (updater: (r: LogoRecipe) => LogoRecipe, coalesceKey?: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  brandPackStatus: BrandPackStatus | null;
  refining: boolean;
  refineNotice: string | null;
  onRefine: (instruction: string) => void;
  primaryHex: string;
  onGetNewIdeas: () => void;
  onUploadMark: (file: File) => void;
}
```

Add the component, right before `export function StudioPanel`:

```tsx
/** AI "ask the designer" box — paid tenants only, same gate/reason codes as
 * the Brand Pack. Scope is the whole design (mark, palette, font, layout),
 * so it lives at the top of the panel regardless of which element is
 * selected, unlike the per-element control sections below it. */
function RefinePromptBox({
  brandPackStatus,
  refining,
  refineNotice,
  onRefine,
}: {
  brandPackStatus: BrandPackStatus | null;
  refining: boolean;
  refineNotice: string | null;
  onRefine: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  if (!brandPackStatus?.eligible) return null;
  const remaining = brandPackStatus.refine_remaining;
  const blocked = !brandPackStatus.enabled || remaining <= 0;

  return (
    <section className="space-y-1.5 rounded-md border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Ask the AI designer
      </p>
      {blocked ? (
        <p className="text-xs text-muted-foreground">
          {remaining <= 0
            ? "You've used this month's AI refinements. More next month."
            : "AI refinement is temporarily unavailable."}
        </p>
      ) : (
        <>
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
            maxLength={300}
            placeholder="e.g. warmer colors, a rounder mark, more premium"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={refining}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={refining || !instruction.trim()}
              onClick={() => {
                onRefine(instruction.trim());
                setInstruction("");
              }}
            >
              {refining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Refine
            </Button>
            <p className="text-right text-xs text-muted-foreground">
              {remaining} AI refinement{remaining === 1 ? "" : "s"} left this
              month.
            </p>
          </div>
        </>
      )}
      {refineNotice && (
        <p className="text-xs italic text-muted-foreground">{refineNotice}</p>
      )}
    </section>
  );
}
```

Update `StudioPanel` to render it, right after the undo/redo row added in
Task 8:

```tsx
export function StudioPanel(props: StudioPanelProps) {
  const { selected, canUndo, canRedo, onUndo, onRedo, brandPackStatus, refining, refineNotice, onRefine } = props;
  return (
    <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
      <div className="flex items-center gap-1.5">
        {/* undo/redo buttons from Task 8, unchanged */}
      </div>
      <RefinePromptBox
        brandPackStatus={brandPackStatus}
        refining={refining}
        refineNotice={refineNotice}
        onRefine={onRefine}
      />
      {selected === null && <GlobalControls {...props} />}
      {(selected === "name" || selected === "tagline") && (
        <TextControls {...props} element={selected} />
      )}
      {selected === "mark" && <MarkControls {...props} />}
    </div>
  );
}
```

- [ ] **Step 4: Update the `<StudioEditor>` call site**

In `logo-studio.tsx`, add the four new props to the `<StudioEditor>` render
from Task 8:

```tsx
                <StudioEditor
                  recipe={recipe}
                  onPatch={patch}
                  onUpdate={updateRecipe}
                  canUndo={canUndo(editHistory)}
                  canRedo={canRedo(editHistory)}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  brandPackStatus={brandPackStatus}
                  refining={refining}
                  refineNotice={refineNotice}
                  onRefine={handleRefine}
                  primaryHex={theme.primaryHex}
                  onGetNewIdeas={() => setStep("brief")}
                  onUploadMark={handleMarkUpload}
                  logoSvgRef={logoSvgRef}
                  markSvgRef={markSvgRef}
                />
```

- [ ] **Step 5: Typecheck**

```bash
cd frontend-customer && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual browser verification**

With `make dev` running and `BILLING_BYPASS_ENABLED`/a paid tenant set up
(or a paid `PlatformSubscription` seeded), and the CLI/Anthropic provider
enabled per the repo's dev AI setup:

1. Open the Logo Studio as a paid coach, reach the Editor step.
2. Confirm the "Ask the AI designer" box appears in the right panel,
   showing "20 AI refinements left this month."
3. Type an instruction (e.g. "warmer colors") and click Refine — confirm
   the loading spinner shows, then the mark/palette update and the
   rationale text appears below the box.
4. Press Cmd+Z (or Ctrl+Z) — confirm the refinement undoes back to the
   prior design, and the remaining-count in the box (from the last status
   fetch) still reflects the server-side quota decrement (undo doesn't
   refund quota — that's correct per spec: "Failed calls charge budget,
   never quota" is about failures, not successful-then-undone calls).
5. As a free-tier coach, confirm the box doesn't render at all.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/components/logo/studio-editor.tsx frontend-customer/src/components/logo/studio-panel.tsx
git commit -m "feat(logo-studio): add AI refinement prompt box wired to logo-refine/"
```

---

## Task 12: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend test suite**

```bash
cd frontend-customer && npx vitest run
```

Expected: all pass, including every test added in Tasks 5–7.

- [ ] **Step 2: Typecheck the whole frontend**

```bash
cd frontend-customer && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full backend test suite**

```bash
docker compose exec django pytest -n auto
```

Expected: all pass.

- [ ] **Step 4: Lint**

```bash
make lint
```

Expected: zero issues (per this repo's rule that pre-commit must pass with
zero security/formatting/error/warning issues).

- [ ] **Step 5: `make dev` end-to-end walkthrough**

```bash
make dev
```

Repeat the manual verification checklists from Task 10 Step 6 and Task 11
Step 6 back-to-back in one session (brief → ideas → editor → refine →
undo/redo → refresh-restore → save-clears-session → start-over), on both a
free-tier and a paid-tier tenant.

- [ ] **Step 6: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "fix(logo-studio): address issues found during end-to-end verification"
```

(Skip this step if verification found nothing to fix.)
