"""Staged Design-with-AI conversation (icon -> name -> tagline). Each turn
is Pass A here (design), then the client renders the draft and Pass B
(critique_turn, vision) reviews the model's own output before the coach
sees it. See docs/superpowers/specs/2026-07-11-logo-vision-critique-conversation-design.md.

Every mark still flows through logo_ai._validate_pack_mark -> validate_recipe
(the injection trust boundary) — nothing reaches the caller unvalidated."""

import json
from decimal import Decimal

from django.conf import settings
from pydantic import BaseModel

from apps.core import ai as core_ai

from . import logo_image, logo_trace
from .logo_ai import (
    _BADGES_LITERAL,
    _ELEMENT_VOCABULARY_AND_PRINCIPLES,
    _FONT_CATALOG,
    _LAYOUTS_LITERAL,
    _ROLE,
    _ColorRoles,
    _Element,
    _Mark,
    _MarkGradient,
    _Palette,
    _Typography,
    _validate_custom_paths,
    _validate_lockup,
    _validate_pack_mark,
    _validate_pack_palette,
)
from .logo_geometry import compile_elements

STAGES = ("icon", "name", "tagline")

_SESSION_FRAME = """You are a senior brand-identity designer in a LIVE
working session with a coach (they sell courses and community under this
brand). You are talking WITH them, not generating a batch: read the
conversation, respond to what they just said in one or two warm plain-words
sentences (`message`), and show 1-3 candidates that act on their feedback.
Never repeat a candidate they already rejected; evolve or replace it. Every
design must look like it came from a serious studio engagement.

"""

ICON_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE ICON ONLY

Design 1-3 mark candidates (no lockup, no fonts). Each candidate:
- `concept` FIRST: one sentence naming a real idea from THIS brand's
  name/niche/vibe and the visual device expressing it. Then draw exactly that.
- Candidates in one turn must not share their primary visual device.
- `palette`: 4 hex roles (primary/secondary/accent/ink) tuned to the brand —
  riff on the theme color; ink must read on white.
- `color_roles`: which palette color paints mark / mark2 / mark_accent.
- `rationale`: one plain-words sentence to the coach on why it fits.
Banned clichés: generic swoosh, sparkle, globe, atom orbits, lightbulb.
- `image_prompt`: a prompt for an image model to draw exactly this mark.
  Describe the visual device concretely and ALWAYS restate the constraints:
  "flat vector logo mark, <the device>, <N> solid colors (<name them>),
  plain white background, no text, no letters, no gradients, no shadows,
  centered, generous margin". Vary the drawing style across candidates
  where it fits the brand — e.g. one refined continuous-line drawing
  (single elegant thin line), one solid silhouette, one geometric mark —
  and say the style in the prompt."""
)

NAME_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE NAME LINE (lockup around the pinned mark)

The coach pinned a mark (its elements are in the conversation). Keep its
identity — you may fine-tune geometry only if the coach asks. Design 1-3
complete lockups:
- layout: horizontal | horizontal_reversed | stacked | emblem (needs a
  badge) | name_only.
- badge_shape + badge_outline: a badge is a container; "none" lets the mark
  breathe on the page.
- font: exactly one family from the catalog; typography case/tracking/weight
  designed for the brand's voice. Pairing recipes: Elegant = light serif,
  tracked-out upper (tracking 0.12-0.2, weight 400-500); Bold = heavy
  tight lowercase (weight 700-800, tracking 0); Minimal = medium weight,
  generous tracking (0.05-0.1); Playful = rounded family, title case;
  Script = name only, never uppercase.
- mark_scale (0.6-1.8): the mark/wordmark size relationship — small-mark
  editorial vs big-mark emblem drama. Vary it across candidates.
- mark_gradient: optional, subtle, same hue family (e.g. primary -> ink at
  90-135 degrees). Flat is the default — a gradient must earn its place.
  Never on text.
- color_roles: contrast is non-negotiable — on a dark badge use white or a
  light role for the mark; text always reads on white.
- tagline: leave "" at this stage.

"""
    + _FONT_CATALOG
)

TAGLINE_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE TAGLINE

The lockup is decided (in the conversation). Return 1-3 candidates that are
the SAME design with different `tagline` text (and its color role if needed):
short, concrete, in the coach's voice — never corporate filler. If the coach
supplied their own words, style those (you may tighten them). If nothing
natural fits, one candidate may keep tagline "".

"""
    + _FONT_CATALOG
)

CRITIQUE_PROMPT = (
    """You are the same senior brand-identity designer REVIEWING RENDERS OF
YOUR OWN DESIGNS before the client sees them. The images are exact renders
of the JSON designs you produced, in order. Hold them to: would a $5,000
studio ship this?

Checklist — redraw (not nudge) any design that fails:
1. Collisions / collapsed geometry: overlapping elements that read as a
   mistake, shapes swallowing each other, stray fragments.
2. Balance: is the composition visually centered with intentional weight?
3. Spacing rhythm: at least 6 units of clear space between separate
   elements; margins respected.
4. Contrast on the white card: every element clearly visible.
5. Favicon survivability: no meaningful feature would vanish at 48px.
6. Mark <-> wordmark proportion and typography pairing (when a lockup is
   shown): does the type feel designed for this brand?

Return the same schema you produced before: keep `message` (you may append
one sentence about what you fixed), keep good designs byte-identical, and
fully redraw failing ones.

"""
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
)


class _MarkRoles(BaseModel):
    mark: _ROLE = "primary"
    mark2: _ROLE = "secondary"
    mark_accent: _ROLE = "accent"


class _IconDesign(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    palette: _Palette
    color_roles: _MarkRoles
    image_prompt: str = ""


class _IconTurn(BaseModel):
    message: str
    designs: list[_IconDesign]


class _ConverseDesign(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    palette: _Palette
    layout: _LAYOUTS_LITERAL
    badge_shape: _BADGES_LITERAL
    badge_outline: bool = False
    font: str
    typography: _Typography
    color_roles: _ColorRoles
    mark_scale: float = 1.0
    mark_gradient: _MarkGradient | None = None
    tagline: str = ""


class _LockupTurn(BaseModel):
    message: str
    designs: list[_ConverseDesign]


_STAGE_PROMPTS = {
    "icon": (ICON_STAGE_PROMPT, _IconTurn),
    "name": (NAME_STAGE_PROMPT, _LockupTurn),
    "tagline": (TAGLINE_STAGE_PROMPT, _LockupTurn),
}


class ConverseError(Exception):
    """The turn completed but left nothing usable (provider failure or all
    marks failed validation). Carries the billed cost for the kill-switch."""

    def __init__(self, message, cost_usd=0.0):
        super().__init__(message)
        self.cost_usd = cost_usd


class TurnResult:
    def __init__(self, message, designs, cost_usd):
        self.message = message
        self.designs = designs
        self.cost_usd = cost_usd


def _validate_icon_design(item):
    mark = _validate_pack_mark(_Mark(rationale=item.rationale, elements=item.elements))
    if not mark:
        return None
    return {
        **mark,
        "concept": str(item.concept or "")[:200],
        "palette": _validate_pack_palette(item.palette),
        "color_roles": item.color_roles.model_dump(),
        "image_prompt": str(item.image_prompt or "")[:500],
    }


def _validate_converse_design(item):
    mark = _validate_pack_mark(_Mark(rationale=item.rationale, elements=item.elements))
    if not mark:
        return None
    return {
        **mark,
        "concept": str(item.concept or "")[:200],
        "palette": _validate_pack_palette(item.palette),
        "tagline": str(item.tagline or "")[:120],
        **_validate_lockup(item),
    }


_VALIDATORS = {"icon": _validate_icon_design, "name": _validate_converse_design, "tagline": _validate_converse_design}


def _validate_turn(stage, parsed, cost):
    designs = [d for d in (_VALIDATORS[stage](item) for item in parsed.designs[:3]) if d]
    if not designs:
        raise ConverseError("turn validation left nothing usable", cost_usd=cost)
    return TurnResult(str(parsed.message or "")[:600], designs, cost)


def _is_traced(elements, paths):
    """Traced (image-derived) paths never equal what their own elements
    compile to; authored paths always do (same deterministic pipeline)."""
    try:
        return paths != _validate_custom_paths(compile_elements(elements))
    except Exception:
        return True


def _inherit_traced_paths(draft_designs, result):
    """Critique keep-rule. A critique that keeps a design 'byte-identical'
    re-emits its elements and _validate_turn recompiles them — which would
    silently replace traced (image-derived) paths with authored ones.
    Two layers:
    1. Elements match -> inherit the draft's exact paths (covers authored
       and traced designs alike; harmless for authored ones since identical
       elements compile to identical paths).
    2. A TRACED draft mark is immutable outright — stamped back by position
       — because the model cannot re-author paths it never wrote, and
       element-echo matching alone proved brittle in live runs (models
       drift the JSON they echo, silently degrading the mark)."""
    paths_by_elements = {
        json.dumps(design.get("elements"), sort_keys=True): design["paths"]
        for design in draft_designs
        if design.get("paths")
    }
    for design in result.designs:
        kept = paths_by_elements.get(json.dumps(design.get("elements"), sort_keys=True))
        if kept:
            design["paths"] = kept
    if len(result.designs) == len(draft_designs):
        for design, draft in zip(result.designs, draft_designs, strict=False):
            if draft.get("paths") and _is_traced(draft.get("elements"), draft["paths"]):
                design["paths"] = draft["paths"]
                design["elements"] = draft["elements"]
    return result


def _stamp_pinned_traced_mark(pinned, result):
    """Cross-stage persistence: a pinned mark whose paths are traced is
    immutable at the name/tagline stages — the model can't fine-tune organic
    traced geometry, only silently replace it with authored primitives (the
    original bug). Stamp the pinned geometry into every design. Authored
    pinned marks (paths == their compiled elements) keep the existing
    recompile/fine-tune flow untouched."""
    entries = [e for e in _pinned_reference_designs(pinned) if _is_traced(e["elements"], e["paths"])]
    if not entries:
        return result
    chosen = entries[-1]  # the pinned lockup (later stage) wins over the icon pin
    for design in result.designs:
        design["paths"] = chosen["paths"]
        design["elements"] = chosen["elements"]
    return result


def _pinned_reference_designs(pinned):
    """The client's `pinned` payload may carry a prior stage's traced mark —
    `mark_paths` (icon -> name) or the whole previous lockup design under
    `lockup` (name -> tagline). Both are client-supplied, untrusted JSON (they
    round-tripped through the browser), so any path data is re-validated
    through _validate_custom_paths (the same injection whitelist every other
    mark path crosses) before being trusted. A validation failure just drops
    that entry — the design falls back to its freshly recompiled, safe
    paths."""
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


def apply_image_marks(result):
    """Icon-stage post-step (generate -> vectorize): draw each candidate's
    image_prompt with the image model, trace it, and swap the traced paths
    into the design. Per-candidate fail-open — any generation/trace/
    validation failure leaves that candidate on its authored paths; a turn
    never comes back blank because of the image path. Always strips
    image_prompt from the payload. Gemini attempt cost is folded into
    result.cost_usd so the view's existing record_attempt_cost covers image
    spend under the same budget kill-switch."""
    prompts = [design.pop("image_prompt", "") for design in result.designs]
    if not logo_image.enabled():
        return result
    indexed = [(i, prompt) for i, prompt in enumerate(prompts) if prompt]
    if not indexed:
        return result
    images, cost = logo_image.generate_mark_images([prompt for _, prompt in indexed])
    result.cost_usd = (result.cost_usd or Decimal("0")) + cost
    for (i, _), png in zip(indexed, images, strict=False):
        if not png:
            continue
        traced = logo_trace.trace_mark(png)
        validated = _validate_custom_paths(traced) if traced else None
        if validated:
            result.designs[i]["paths"] = validated
    return result


def _user_content(brief, transcript, pinned, message):
    parts = [
        f'Brand name: "{brief.get("brand_name") or "My Brand"}"\n'
        f'Niche: "{brief.get("niche") or "general coaching"}"\n'
        f"Style preferences: {brief.get('style_chips') or 'no strong preference'}\n"
        f'Their vibe, in their own words: "{brief.get("vibe") or "-"}"\n'
        f"Brand's existing theme color: {brief.get('primary_hex') or '#1a56db'}"
    ]
    if pinned.get("mark_elements"):
        parts.append("Pinned mark elements: " + json.dumps(pinned["mark_elements"])[:4000])
    if pinned.get("lockup"):
        parts.append("Pinned lockup: " + json.dumps(pinned["lockup"])[:4000])
    tail = transcript[-12:]
    if tail:
        lines = [f"{'Coach' if m.get('role') == 'user' else 'You'}: {str(m.get('text') or '')[:500]}" for m in tail]
        parts.append("<conversation_so_far>\n" + "\n".join(lines) + "\n</conversation_so_far>")
    parts.append(f'Coach\'s message: "{str(message or "")[:500]}"')
    return "\n\n".join(parts)


def converse_turn(stage, brief, transcript, pinned, message):
    """Pass A: one structured call -> validated TurnResult. Raises
    ConverseError (carrying billed cost) on failure."""
    if stage not in _STAGE_PROMPTS:
        raise ValueError(f"unknown stage: {stage}")
    prompt, output_model = _STAGE_PROMPTS[stage]
    try:
        parsed, cost, _ = core_ai.structured(
            system=prompt,
            user=_user_content(brief, transcript, pinned, message),
            output_model=output_model,
            model=settings.LOGO_AI_MODEL,
            max_tokens=6000,
        )
    except core_ai.AiError as exc:
        raise ConverseError(str(exc), cost_usd=exc.cost_usd) from exc
    result = _validate_turn(stage, parsed, cost)
    return apply_image_marks(result) if stage == "icon" else _stamp_pinned_traced_mark(pinned, result)


class RefineCritiqueResult:
    def __init__(self, design, cost_usd):
        self.design = design
        self.cost_usd = cost_usd


def critique_refine(cached, images):
    """Pass B for an editor refinement: one design, same checklist. The
    output model is logo_ai's _RefinedDesign; validation mirrors
    logo_ai.refine_design's (the injection trust boundary — mark paths still
    flow through _validate_pack_mark -> validate_recipe)."""
    from . import logo_ai

    blocks = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}} for img in images[:3]
    ]
    blocks.append({"type": "text", "text": "Your design:\n" + json.dumps(cached["design"])[:12000]})
    try:
        parsed, cost, _ = core_ai.structured_messages(
            system=CRITIQUE_PROMPT,
            messages=[{"role": "user", "content": blocks}],
            output_model=logo_ai._RefinedDesign,
            model=settings.LOGO_AI_MODEL,
            max_tokens=3000,
        )
    except core_ai.AiError as exc:
        raise ConverseError(str(exc), cost_usd=exc.cost_usd) from exc
    mark = _validate_pack_mark(parsed.mark)
    if not mark:
        raise ConverseError("critiqued refine mark left nothing usable", cost_usd=cost)
    design = {
        "mark": mark,
        "palette": _validate_pack_palette(parsed.palette),
        "font_vibe": parsed.font_vibe,
        "rationale": str(parsed.rationale or "")[:300],
        **_validate_lockup(parsed),
    }
    return RefineCritiqueResult(design, cost)


def critique_turn(stage, draft, images):
    """Pass B: the model reviews renders of its own draft. `images` are raw
    base64 PNG strings (already size/magic-checked by the view). Raises
    ConverseError on failure — the caller falls back to the draft."""
    _, output_model = _STAGE_PROMPTS[stage]
    blocks = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}} for img in images[:3]
    ]
    blocks.append(
        {
            "type": "text",
            "text": "Your designs, in the same order as the renders:\n" + json.dumps(draft["designs"])[:12000],
        }
    )
    try:
        parsed, cost, _ = core_ai.structured_messages(
            system=CRITIQUE_PROMPT,
            messages=[{"role": "user", "content": blocks}],
            output_model=output_model,
            model=settings.LOGO_AI_MODEL,
            max_tokens=6000,
        )
    except core_ai.AiError as exc:
        raise ConverseError(str(exc), cost_usd=exc.cost_usd) from exc
    return _inherit_traced_paths(draft.get("designs") or [], _validate_turn(stage, parsed, cost))
