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

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from django.conf import settings
from pydantic import BaseModel

from apps.core.models import LogoAiUsage

from .logo_recipe import _hex, validate_recipe

PROMPT_VERSION = 1

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

STATIC_PROMPT = """You are a professional logo designer producing a Brand Pack for a coaching \
brand — 3 bespoke vector marks and 3 brand color palettes. This is the one \
part of the studio that isn't a template picker: draw original geometry and \
propose colors that belong to this specific brand.

## Marks

Each mark is 2-6 filled SVG paths in a 0-100 unit square viewBox (both axes \
0 to 100). Rules:
- Use only these path commands, absolute or relative: M L H V C S Q T A Z.
- Keep each path's `d` string under 300 characters.
- Minimum feature size ~4 units, so the mark still reads at 48px (a \
favicon-sized render).
- Center the composition roughly within the viewBox.
- No strokes — filled shapes only. Use `fill_rule` "evenodd" for \
counters/negative space (e.g. a closed letterform or a ring).
- Draw something specific to the brand's niche and name — not a generic \
sparkle or a stock-icon silhouette. Prefer geometric symbolism, negative \
space, or a monogram-style integration of mark and letterform over literal \
illustration.
- At least one of the 3 marks should use a second fill role (`fill: \
"mark2"` or `"accent"` on some of its paths) for tonal depth; the rest can \
be single-color (`fill: "mark"`, the default).
- Write one plain-language sentence per mark explaining why it fits the \
brand — a non-technical coach should read it and understand the idea \
immediately. No jargon, no design-school language.

Example mark (a rising line inside a ring, for a growth-focused coach):
{"rationale": "A path curving upward inside a ring — steady progress, \
held in a supportive circle.",
 "paths": [
   {"d": "M50 8 A42 42 0 1 1 49.9 8 Z M50 16 A34 34 0 1 0 50.1 16 Z", "fill": "mark", "fill_rule": "evenodd"},
   {"d": "M28 62 Q40 30 50 45 Q60 60 74 30", "fill": "accent"}
 ]}

Example mark (a monogram-style integration for a two-word brand name):
{"rationale": "The two initials interlock into one continuous shape — \
partnership built into the mark itself.",
 "paths": [
   {"d": "M20 20 L20 80 L38 80 L38 55 L58 55 L58 80 L76 80 L76 20 L58 20 L58 42 L38 42 L38 20 Z", "fill": "mark"}
 ]}

## Palettes

Each palette has 4 hex roles: `primary` (the dominant brand color — riff on \
the tenant's existing theme color given below, don't just repeat it \
verbatim across all 3 palettes), `secondary`, `accent`, and `ink` (a dark, \
readable-on-white color for body text and marks — keep `ink` distinctly \
darker than `primary`, not a near-duplicate of it).

## Output

Return exactly 3 marks and exactly 3 palettes, plus one short tagline (empty \
string if nothing obvious fits — don't force one), and a `font_vibe`: pick \
the single best-fitting category from Modern, Elegant, Bold, Playful, \
Minimal for this brand's typography — not a specific font name."""


class _Path(BaseModel):
    d: str
    fill: Literal["mark", "mark2", "accent"] = "mark"
    fill_rule: Literal["nonzero", "evenodd"] | None = None
    opacity: float | None = None


class _Mark(BaseModel):
    rationale: str
    paths: list[_Path]


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


# $ per 1M tokens: (input, output, cache_read, cache_write). Cache-write here
# assumes the 5-minute TTL (1.25x input), not the 1-hour tier.
_MODEL_PRICES = {
    "claude-sonnet-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00, "cache_read": 0.10, "cache_write": 1.25},
}
_DEFAULT_PRICES = _MODEL_PRICES["claude-sonnet-5"]


def _estimate_cost(usage, model):
    prices = _MODEL_PRICES.get(model, _DEFAULT_PRICES)

    def per_m(tokens, price):
        return (Decimal(tokens or 0) / Decimal(1_000_000)) * Decimal(str(price))

    return (
        per_m(getattr(usage, "input_tokens", 0), prices["input"])
        + per_m(getattr(usage, "output_tokens", 0), prices["output"])
        + per_m(getattr(usage, "cache_read_input_tokens", 0), prices["cache_read"])
        + per_m(getattr(usage, "cache_creation_input_tokens", 0), prices["cache_write"])
    )


def _anthropic_client():
    from anthropic import Anthropic

    return Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0, max_retries=1)


def _luminance(hex_color):
    n = int(hex_color[1:], 16)

    def channel(v):
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel((n >> 16) & 0xFF) + 0.7152 * channel((n >> 8) & 0xFF) + 0.0722 * channel(n & 0xFF)


def _validate_pack_mark(item):
    """Run one Brand Pack mark's paths through validate_recipe (the same
    injection whitelist a saved recipe's custom mark passes through).
    Returns a validated ``{rationale, paths}`` dict, or None if every path
    was invalid — the whole mark is dropped, not degraded."""
    dummy = {
        **_DUMMY_RECIPE,
        "mark": {
            "type": "custom",
            "rationale": item.rationale,
            "paths": [{"d": p.d, "fill": p.fill, "fill_rule": p.fill_rule, "opacity": p.opacity} for p in item.paths],
        },
    }
    shaped = validate_recipe(dummy)
    if shaped["mark"]["type"] != "custom":
        return None
    return {"rationale": shaped["mark"]["rationale"], "paths": shaped["mark"]["paths"]}


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
    """One Claude call -> a validated Brand Pack. Raises BrandPackError
    (carrying the estimated cost) if the response parses but nothing usable
    survives validation; propagates any SDK/network exception unwrapped
    (caller records $0 for that attempt — no usage data to estimate from)."""
    client = _anthropic_client()
    chips = ", ".join(style_chips) if style_chips else "no strong preference"
    user_content = (
        f'Brand name: "{brand_name}"\n'
        f'Niche: "{niche or "general coaching"}"\n'
        f"Style preferences: {chips}\n"
        f'Their vibe, in their own words: "{vibe or "-"}"\n'
        f"Brand's existing theme color: {primary_hex}\n"
    )
    response = client.messages.parse(
        model=settings.LOGO_AI_MODEL,
        max_tokens=6000,
        system=[{"type": "text", "text": STATIC_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
        output_format=_BrandPack,
    )
    cost = _estimate_cost(response.usage, settings.LOGO_AI_MODEL)
    parsed = response.parsed_output

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
