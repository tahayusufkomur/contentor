"""Logo Studio AI Brand Pack: one Claude call returns bespoke vector marks +
brand palettes for a coach's brief, letting the client's deterministic
composer (composeFromPack in composer.ts) multiply them into a wall of ideas
at zero extra cost. See
docs/superpowers/specs/2026-07-08-logo-ai-brand-pack-design.md.

Every mark this module returns has already been run through
``logo_recipe.validate_recipe`` (the same injection trust boundary the
deterministic composer's recipes pass through) — nothing reaches the caller
that hasn't survived that validation.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from django.conf import settings
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.models import LogoAiUsage

from .logo_geometry import compile_elements
from .logo_recipe import _hex, validate_recipe

PROMPT_VERSION = 4

# A minimal, already-valid v2 recipe skeleton used only to run a Brand Pack
# mark's paths through validate_recipe's injection whitelist + clamps — the
# single source of truth for that validation, not duplicated here.
_DUMMY_RECIPE = {
    "version": 2,
    "layout": "horizontal",
    "name": "x",
    "tagline": "",
    "mark": {"type": "initials", "style": "plain"},
    "badge": {"shape": "circle", "outline": False},
    "typography": {
        "name": {"font": "Inter", "weight": 700, "tracking": 0, "case": "none"},
        "tagline": {"font": "Inter", "weight": 500, "tracking": 0.08, "case": "upper"},
    },
    "colors": {
        "palette_id": None,
        "badge": {"type": "solid", "color": "#111827"},
        "mark": "#ffffff",
        "text": "#111827",
        "tagline": "#6b7280",
    },
    "elements": {
        "mark": {"offset": [0, 0], "scale": 1},
        "name": {"offset": [0, 0], "scale": 1},
        "tagline": {"offset": [0, 0], "scale": 1},
    },
}

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


class _ElementBase(BaseModel):
    fill: Literal["mark", "mark2", "accent"] = "mark"
    opacity: float | None = None


class _Circle(_ElementBase):
    type: Literal["circle"]
    cx: float
    cy: float
    r: float


class _Ring(_ElementBase):
    type: Literal["ring"]
    cx: float
    cy: float
    r: float
    thickness: float


class _DotRing(_ElementBase):
    type: Literal["dot_ring"]
    cx: float
    cy: float
    radius: float
    count: int
    dot_r: float
    start_deg: float = 0


class _DotGrid(_ElementBase):
    type: Literal["dot_grid"]
    cx: float
    cy: float
    cols: int
    rows: int
    pitch: float
    dot_r: float
    skip: list[int] = []


class _RoundedRect(_ElementBase):
    type: Literal["rounded_rect"]
    cx: float
    cy: float
    w: float
    h: float
    rx: float = 0
    rotate_deg: float = 0


class _Polygon(_ElementBase):
    type: Literal["polygon"]
    cx: float
    cy: float
    r: float
    sides: int
    rotate_deg: float = 0
    thickness: float = 0


class _Arc(_ElementBase):
    type: Literal["arc"]
    cx: float
    cy: float
    r: float
    thickness: float
    start_deg: float
    sweep_deg: float
    round_caps: bool = False


class _FreePath(_ElementBase):
    type: Literal["path"]
    d: str
    fill_rule: Literal["nonzero", "evenodd"] | None = None


_Element = Annotated[
    _Circle | _Ring | _DotRing | _DotGrid | _RoundedRect | _Polygon | _Arc | _FreePath,
    Field(discriminator="type"),
]


class _Mark(BaseModel):
    rationale: str
    elements: list[_Element]


class _Palette(BaseModel):
    name: str
    primary: str
    secondary: str
    accent: str
    ink: str


class _BrandPack(BaseModel):
    marks: list[_Mark]
    palettes: list[_Palette]
    tagline: str
    font_vibe: Literal["Modern", "Elegant", "Bold", "Playful", "Minimal"]


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


class BrandPackError(Exception):
    """Raised when a Brand Pack call completed but left nothing usable
    (every mark's paths failed validation, or no palettes). Carries the
    estimated cost of the (already-billed) call so callers can still record
    it against the global budget kill-switch."""

    def __init__(self, message, cost_usd=0.0):
        super().__init__(message)
        self.cost_usd = cost_usd


class BrandPackResult:
    def __init__(self, pack, cost_usd):
        self.pack = pack
        self.cost_usd = cost_usd


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


def _luminance(hex_color):
    n = int(hex_color[1:], 16)

    def channel(v):
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel((n >> 16) & 0xFF) + 0.7152 * channel((n >> 8) & 0xFF) + 0.0722 * channel(n & 0xFF)


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


def _validate_pack_palette(item):
    primary = _hex(item.primary, "#1a56db")
    ink = _hex(item.ink, "#111827")
    if _luminance(ink) > 0.5:
        ink = "#1a1a1a"  # too light to read on a white page background
    return {
        "name": str(item.name or "")[:30],
        "primary": primary,
        "secondary": _hex(item.secondary, primary),
        "accent": _hex(item.accent, primary),
        "ink": ink,
    }


def generate_brand_pack(brand_name, niche, primary_hex, style_chips=(), vibe=""):
    """One structured AI call -> a validated Brand Pack. Raises BrandPackError
    (carrying the estimated cost) on provider failure or if the response
    parses but nothing usable survives validation."""
    chips = ", ".join(style_chips) if style_chips else "no strong preference"
    user_content = (
        f'Brand name: "{brand_name}"\n'
        f'Niche: "{niche or "general coaching"}"\n'
        f"Style preferences: {chips}\n"
        f'Their vibe, in their own words: "{vibe or "-"}"\n'
        f"Brand's existing theme color: {primary_hex}\n"
    )
    try:
        parsed, cost, _ = core_ai.structured(
            system=STATIC_PROMPT,
            user=user_content,
            output_model=_BrandPack,
            model=settings.LOGO_AI_MODEL,
            # 6 marks of element-JSON are compact, but Sonnet's adaptive
            # thinking bills within max_tokens too — 8000 leaves headroom.
            max_tokens=8000,
        )
    except core_ai.AiError as exc:
        raise BrandPackError(str(exc), cost_usd=exc.cost_usd) from exc

    marks = [m for m in (_validate_pack_mark(item) for item in parsed.marks) if m]
    palettes = [_validate_pack_palette(item) for item in parsed.palettes]
    if not marks or not palettes:
        raise BrandPackError("brand pack validation left nothing usable", cost_usd=cost)

    pack = {
        "marks": marks,
        "palettes": palettes,
        "tagline": str(parsed.tagline or "")[:120],
        "font_vibe": parsed.font_vibe,
    }
    return BrandPackResult(pack, cost)


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


# ── Usage accounting (durable — DB, not cache; see LogoAiUsage) ────────────


def _current_month():
    return datetime.now(UTC).strftime("%Y-%m")


def tenant_usage(tenant_schema, month=None):
    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    return row


def global_spend(month=None):
    from django.db.models import Sum

    month = month or _current_month()
    total = LogoAiUsage.objects.filter(month=month).aggregate(total=Sum("usd_spent"))["total"]
    return total or Decimal("0")


def record_attempt_cost(tenant_schema, usd, month=None):
    """Charged on EVERY Anthropic call attempt (success or failure) so a
    systematic-failure loop still trips the global budget kill-switch."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(usd_spent=F("usd_spent") + usd)


def record_successful_pack(tenant_schema, month=None):
    """Charged only after a successful, validated pack — failed calls and
    cache hits never consume a coach's monthly quota."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(packs_used=F("packs_used") + 1)


def record_successful_refinement(tenant_schema, month=None):
    """Charged only after a successful, validated refinement — failed calls
    never consume a coach's monthly quota."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(refinements_used=F("refinements_used") + 1)
