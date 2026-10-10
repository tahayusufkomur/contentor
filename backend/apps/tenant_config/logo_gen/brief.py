"""The brief for one coach's logo batch and the prompts built from it.

Static text lives in module constants (prompt caching); everything
tenant-specific goes through LogoBrief."""

import logging
from dataclasses import dataclass
from typing import Literal

from django.conf import settings
from pydantic import BaseModel, Field

from apps.core import ai as core_ai

from .color import oklch_to_hex

logger = logging.getLogger(__name__)

ROLES = ("background", "surface", "primary", "accent", "ink", "muted")
_STYLE_KEYS = {
    "background": "background",
    "surface": "surface",
    "primary": "primary",
    "accent": "accent",
    "ink": "foreground",
    "muted": "mutedForeground",
}
ARCHETYPES = ("mark_name", "wordmark", "emblem")
_COMPOSITION = {
    "mark_name": "a symbol or pictorial mark on the left with the brand name set beside it",
    "wordmark": "a wordmark-led design where the typography itself is the logo, with at most one small graphic element",
    "emblem": "an emblem: mark and name inside one enclosing shape",
}
# Display family -> what to tell the image model. Default below for the rest.
_TYPOGRAPHY_BY_DISPLAY = {
    "Cormorant": "a light high-contrast serif (Cormorant-like) paired with a clean sans",
    "Newsreader": "an editorial transitional serif (Newsreader-like)",
    "Instrument Serif": "a sharp high-contrast serif (Instrument Serif-like)",
    "Bodoni Moda": "a didone serif with hairline contrast (Bodoni-like)",
    "Fraunces": "a soft, warm old-style serif (Fraunces-like)",
    "Spectral": "a bookish serif (Spectral-like)",
    "Source Serif 4": "a readable transitional serif",
    "Shippori Mincho": "a Japanese-flavoured serif (Mincho-like), wide letter-spacing",
    "Cinzel": "an inscriptional roman capitals face (Cinzel-like)",
    "Young Serif": "a chunky friendly serif",
    "Zilla Slab": "a sturdy slab serif",
    "Alegreya": "a calligraphic humanist serif",
    "JetBrains Mono": "a monospace display face (JetBrains Mono-like)",
    "Syne": "a wide expressive grotesque",
    "Unbounded": "an extra-wide geometric display sans",
    "Host Grotesk": "a neutral grotesque",
    "Archivo": "a bold condensed grotesque",
    "Bricolage Grotesque": "a quirky high-contrast grotesque",
    "Fredoka": "a rounded playful sans",
    "Anybody": "a wide variable grotesque",
}
_DEFAULT_TYPOGRAPHY = "a clean geometric sans"


@dataclass(frozen=True)
class LogoBrief:
    brand: str
    business: str
    mood: str
    typography: str
    palette: dict  # role -> hex, roles = ROLES
    style_id: str
    palette_id: str


class Concept(BaseModel):
    concept: str = Field(max_length=200)
    archetype: Literal["mark_name", "wordmark", "emblem"]


class _Concepts(BaseModel):
    concepts: list[Concept] = Field(default_factory=list)


def _style_palette(style_id, palette_id):
    from apps.tenant_config import sections

    style = sections.style(style_id) or {}
    variant = sections.palettes(style_id).get(palette_id) if palette_id else None
    raw = (variant or {}).get("palette") or style.get("palette") or {}
    return {
        role: oklch_to_hex(raw[key]) if raw.get(key) else default
        for role, key, default in (
            ("background", "background", "#ffffff"),
            ("surface", "surface", "#f3f3f3"),
            ("primary", "primary", "#222222"),
            ("accent", "accent", "#888888"),
            ("ink", "foreground", "#111111"),
            ("muted", "mutedForeground", "#666666"),
        )
    }, style


def logo_brief(tenant, answers):
    from apps.core.onboarding.ai_curate import CoachBrief

    coach = CoachBrief.from_tenant(tenant)
    style_id = str(answers.get("style") or "")
    palette_id = str(answers.get("palette") or "")
    if not style_id:  # an auto-picked look is on the config, never in the answers
        from apps.tenant_config.models import TenantConfig

        cfg = TenantConfig.objects.first()
        style_id, palette_id = (cfg.style, cfg.palette) if cfg else ("", "")
    palette, style = _style_palette(style_id, palette_id)
    display = ((style.get("fonts") or {}).get("display") or "").strip()
    business = coach.subject or coach.niche.replace("_", " ")
    if coach.description:
        business = f"{business}: {coach.description.strip()[:160]}"
    return LogoBrief(
        brand=tenant.name or coach.brand_name or "",
        business=business,
        mood=str(style.get("mood") or "calm, modern, professional"),
        typography=_TYPOGRAPHY_BY_DISPLAY.get(display, _DEFAULT_TYPOGRAPHY),
        palette=palette,
        style_id=style_id,
        palette_id=palette_id,
    )


def image_prompt(brief, concept):
    c = brief.palette
    return (
        "You are a senior brand designer. Design a finished, professional logo for a coaching business.\n"
        f'Brand name: "{brief.brand}" (spell it exactly). The brand name is the only text in the logo.\n'
        f"Business: {brief.business}.\nBrand mood: {brief.mood}\nTypography direction: {brief.typography}.\n"
        f"Mark concept: {concept.concept}.\n"
        f"Palette: background {c['background']}, surface {c['surface']}, primary {c['primary']}, accent {c['accent']}, "
        f"text {c['ink']}, muted {c['muted']}. Use only these colours.\n"
        f"Composition: {_COMPOSITION[concept.archetype]}. Flat vector style, crisp edges, no gradients, no shadows, "
        "no 3D, no texture, no mockup, no frame. No words, letters or characters other than the brand name. "
        f"Generous margin, the whole logo centered on a plain {c['background']} background, aspect ratio 4:3. "
        "It must survive being shrunk to 32 pixels."
    )


CONCEPTS_SYSTEM_PROMPT = """You are a senior brand designer briefing an illustrator.
Given a coaching brand, propose mark concepts: each a different visual metaphor for THIS business, concrete enough
to draw in one sentence (what is depicted, in what drawing manner), never a generic salon/spa/wellness trope,
never clip-art.
Return concepts in the order of the archetypes asked for, one per archetype."""


def _default_concepts(count):
    base = [
        Concept(
            concept="a single-line symbol of what the coach teaches, drawn with one uniform stroke",
            archetype="mark_name",
        ),
        Concept(concept="the brand name alone, set with one distinctive typographic detail", archetype="wordmark"),
        Concept(concept="a simple symbol of the practice inside a circle with the name beneath", archetype="emblem"),
    ]
    return (base * 3)[:count]


def concepts_for(brief, *, count, avoid=(), defects=()):
    """``count`` concepts, archetypes rotating mark_name -> wordmark -> emblem.
    Never raises: a provider failure returns the defaults."""
    archetypes = [ARCHETYPES[i % 3] for i in range(count)]
    user = "\n".join(
        [
            f"Brand: {brief.brand}",
            f"Business: {brief.business}",
            f"Mood: {brief.mood}",
            f"Typography: {brief.typography}",
            f"Archetypes, in order: {', '.join(archetypes)}",
            *([f"Do not reuse these ideas: {'; '.join(avoid)}"] if avoid else []),
            *([f"A previous round was criticised for: {'; '.join(defects)}. Avoid those failings."] if defects else []),
        ]
    )
    try:
        parsed, _cost, _model = core_ai.structured(
            system=CONCEPTS_SYSTEM_PROMPT,
            user=user,
            output_model=_Concepts,
            model=settings.AGENTC_PRO_MODEL,
            max_tokens=800,
            label="contentor:logo-concepts",
            effort="max",
            timeout_seconds=90,
        )
    except core_ai.AiError:
        logger.warning("logo concepts: provider failed, using defaults")
        return _default_concepts(count)
    out = [c for c in parsed.concepts if c.concept.strip()][:count]
    if len(out) < count:
        out += _default_concepts(count)[len(out) :]
    # The model's order is advisory; the archetypes stay balanced.
    return [c.model_copy(update={"archetype": archetype}) for c, archetype in zip(out, archetypes, strict=False)]
