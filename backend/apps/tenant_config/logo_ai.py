"""Logo Studio AI shared internals: pydantic mark/design schemas, the
element vocabulary + font catalog prompts, lockup/mark/palette validators,
the single-call ``refine_design`` (coach's free-text tweak of one draft), and
durable per-tenant usage accounting (LogoAiUsage). The staged Design-with-AI
conversation lives in ``logo_converse`` and reuses these schemas + validators.
See docs/superpowers/specs/2026-07-11-logo-vision-critique-conversation-design.md.

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
under 800 characters, closed shapes only, no strokes. Use fill_rule \
"evenodd" to cut negative space out of a solid form.
- curve {points: [[x,y],...], thickness, round_caps, closed} — a smooth \
even-width ribbon swept through 2-10 control points. You bend a wire; the \
drafting engine makes a perfect stroke. round_caps true for soft ends. THE \
line-art tool: swooshes, continuous-line motifs, simplified figures.
- star {cx, cy, points, outer_r, inner_r, rotate_deg} — a pointed star.
- crescent {cx, cy, r, cutter_r, cutter_offset, rotate_deg} — a disc with a \
circular bite taken from the rotate_deg side: moons, leaves, smiles.
- petal {cx, cy, length, width, rotate_deg} — an almond pointed at both \
ends, length axis aimed at rotate_deg: leaves, drops, flames.
- blob {cx, cy, r, sides, seed, irregularity} — a smooth organic form; same \
seed always draws the same blob.
- wave {cx, cy, width, amplitude, cycles, thickness, rotate_deg} — a \
flowing sine ribbon: water, breath, sound.

Combinators:
- repeat {cx, cy, count, start_deg, of: <element>} — the child repeated \
`count` times, spun evenly around (cx, cy): petal becomes flower, square \
becomes pinwheel, arc becomes sunburst. Child: any element except path, \
dot_grid, dot_ring, repeat, mirror.
- mirror {axis_x, of: <element>, include_original} — the child plus its \
perfect reflection across the vertical line x=axis_x: wings, lotus poses, \
open books. Same children as repeat, except blob.
- Any element may add "cut": true — instead of drawing, it punches its \
shape OUT of the element right before it. The cut must sit fully inside \
that element. Negative space anywhere: a bite from a disc, a ring of holes \
(repeat as cut), a letter knocked out of a badge.

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

# KEEP IN SYNC: frontend-customer/src/lib/logo/catalog.ts LOGO_FONTS
# Shared by REFINE_PROMPT and logo_converse's stage prompts so the font list
# exists in exactly one place.
_FONT_CATALOG = """## Font catalog (family — voice)

Modern: Inter — neutral clarity; Geist — technical precision; DM Sans — \
warm geometric; Plus Jakarta Sans — contemporary polish.
Elegant: Playfair Display — editorial serif; Lora — bookish calm; \
EB Garamond — classical authority; Cormorant Garamond — fine luxury.
Bold: Poppins — confident rounds; Montserrat — urban strength; Archivo — \
industrial punch; Space Grotesk — techy edge.
Playful: Nunito — soft friendly; Quicksand — light bounce; Baloo 2 — \
chubby cheer; Fredoka — bubbly warmth.
Minimal: Work Sans — quiet utility; Manrope — refined minimal; Sora — \
future clean; Outfit — sleek geometry.
Script (for the name only — never uppercase, never taglines): Dancing \
Script — lively handwriting; Great Vibes — formal calligraphy; Pacifico — \
retro brush; Caveat — casual marker.
"""


class _ElementBase(BaseModel):
    fill: Literal["mark", "mark2", "accent"] = "mark"
    opacity: float | None = None
    cut: bool = False


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


class _Star(_ElementBase):
    type: Literal["star"]
    cx: float
    cy: float
    points: int
    outer_r: float
    inner_r: float
    rotate_deg: float = 0


class _Petal(_ElementBase):
    type: Literal["petal"]
    cx: float
    cy: float
    length: float
    width: float
    rotate_deg: float = 0


class _Crescent(_ElementBase):
    type: Literal["crescent"]
    cx: float
    cy: float
    r: float
    cutter_r: float
    cutter_offset: float
    rotate_deg: float = 0


class _Blob(_ElementBase):
    type: Literal["blob"]
    cx: float
    cy: float
    r: float
    sides: int = 8
    seed: int = 1
    irregularity: float = 0.25


class _Wave(_ElementBase):
    type: Literal["wave"]
    cx: float
    cy: float
    width: float
    amplitude: float
    cycles: float = 1.5
    thickness: float = 4
    rotate_deg: float = 0


class _Curve(_ElementBase):
    type: Literal["curve"]
    points: list[list[float]]
    thickness: float = 4
    round_caps: bool = False
    closed: bool = False


_RepeatChild = Annotated[
    _Circle | _Ring | _RoundedRect | _Polygon | _Arc | _Star | _Petal | _Crescent | _Blob | _Wave | _Curve,
    Field(discriminator="type"),
]


class _Repeat(_ElementBase):
    type: Literal["repeat"]
    cx: float
    cy: float
    count: int
    start_deg: float = 0
    of: _RepeatChild


class _Mirror(_ElementBase):
    type: Literal["mirror"]
    axis_x: float = 50
    include_original: bool = True
    of: _RepeatChild


_Element = Annotated[
    _Circle
    | _Ring
    | _DotRing
    | _DotGrid
    | _RoundedRect
    | _Polygon
    | _Arc
    | _FreePath
    | _Star
    | _Petal
    | _Crescent
    | _Blob
    | _Wave
    | _Curve
    | _Repeat
    | _Mirror,
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


_FONT_VIBES = Literal["Modern", "Elegant", "Bold", "Playful", "Minimal", "Script"]
_LAYOUTS_LITERAL = Literal["horizontal", "stacked", "emblem", "horizontal_reversed", "name_only"]
_BADGES_LITERAL = Literal["none", "circle", "rounded", "squircle", "hexagon", "shield", "diamond"]
_ROLE = Literal["primary", "secondary", "accent", "ink", "white"]


class _Typography(BaseModel):
    case: Literal["none", "upper", "title"] = "none"
    tracking: float = 0
    weight: Literal[400, 500, 600, 700, 800] = 700


class _MarkGradient(BaseModel):
    to: Literal["primary", "secondary", "accent", "ink"]
    angle: float = 90


class _ColorRoles(BaseModel):
    badge: _ROLE = "primary"
    mark: _ROLE = "ink"
    mark2: _ROLE = "secondary"
    mark_accent: _ROLE = "accent"
    text: Literal["primary", "secondary", "ink"] = "ink"
    tagline: Literal["primary", "secondary", "accent", "ink"] = "secondary"


class _Design(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    layout: _LAYOUTS_LITERAL
    badge_shape: _BADGES_LITERAL
    badge_outline: bool = False
    font: str
    typography: _Typography
    palette_index: int = 0
    color_roles: _ColorRoles
    mark_scale: float = 1.0
    mark_gradient: _MarkGradient | None = None


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
above), a 4-hex-role palette, the whole lockup — layout, badge_shape + \
badge_outline, one font from the catalog in the pack brief's voice, \
typography (case/tracking/weight), and color_roles mapping palette roles \
onto badge/mark/text/tagline (contrast is non-negotiable) — the best-fit \
font_vibe, and a one-sentence rationale in plain words, addressed to the \
coach, saying what you changed and why.

"""
    + _FONT_CATALOG
)


class _RefinedDesign(BaseModel):
    mark: _Mark
    palette: _Palette
    font_vibe: _FONT_VIBES
    layout: _LAYOUTS_LITERAL
    badge_shape: _BADGES_LITERAL
    badge_outline: bool = False
    font: str
    typography: _Typography
    color_roles: _ColorRoles
    rationale: str
    mark_scale: float = 1.0
    mark_gradient: _MarkGradient | None = None


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


def _validate_lockup(item):
    """Shape the lockup fields shared by pack designs and refinements —
    enums are already guaranteed by the pydantic Literals; free text and
    numbers are clamped, never rejected."""
    return {
        "layout": item.layout,
        "badge_shape": item.badge_shape,
        "badge_outline": bool(item.badge_outline),
        "font": str(item.font or "")[:60],
        "typography": {
            "case": item.typography.case,
            "tracking": max(-0.1, min(0.4, float(item.typography.tracking or 0))),
            "weight": item.typography.weight,
        },
        "color_roles": item.color_roles.model_dump(),
        "mark_scale": max(0.6, min(1.8, float(item.mark_scale or 1.0))),
        "mark_gradient": (
            {
                "to": item.mark_gradient.to,
                "angle": max(0.0, min(360.0, float(item.mark_gradient.angle or 0))),
            }
            if item.mark_gradient
            else None
        ),
    }


def _validate_design(item, palette_count):
    mark = _validate_pack_mark(item)
    if not mark:
        return None
    return {
        **mark,
        "concept": str(item.concept or "")[:200],
        "palette_index": int(max(0, min(palette_count - 1, item.palette_index))),
        **_validate_lockup(item),
    }


def refine_design(recipe, elements, instruction):
    """One gated, uncached Claude call -> a refined design (mark, palette,
    font_vibe, and the whole lockup — layout, badge, font, typography,
    color_roles — same parity as a Brand Pack design). Raises RefineError
    (carrying the estimated cost) on provider failure or if the refined
    mark's paths don't survive validation. `elements` is capped
    defensively: it's untrusted request input, only ever used as
    descriptive prompt text (never compiled or persisted directly), but a
    hostile payload shouldn't be able to inflate the prompt without
    bound."""
    if elements:
        bounded = json.dumps(elements[:12])[:4000]
        current = f"Current mark elements (redesign these): {bounded}"
    else:
        summary = _describe_recipe(recipe)
        current = f"Current design summary (no source elements available — design a new custom mark): {summary}"
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
        "rationale": str(parsed.rationale or "")[:300],
        **_validate_lockup(parsed),
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
    cache hits never consume a coach's monthly quota. The batch Brand Pack
    endpoint is retired; kept for the historical ``packs_used`` column."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(packs_used=F("packs_used") + 1)


def record_successful_turn(tenant_schema, month=None):
    """Charged only after a successful, validated Pass A — the critique
    pass and failed calls never consume a coach's monthly turns."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(turns_used=F("turns_used") + 1)


def record_successful_refinement(tenant_schema, month=None):
    """Charged only after a successful, validated refinement — failed calls
    never consume a coach's monthly quota."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(refinements_used=F("refinements_used") + 1)
