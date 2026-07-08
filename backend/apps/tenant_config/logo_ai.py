"""Logo Studio recipe suggestions (schema v2).

AI path: Claude structured output constrained to the catalogs, brief-aware
(style chips + free-text vibe), returning 8 full v2 recipes. Fallback path:
deterministic niche-keyword picks (v1 combos upgraded to v2). Both return
recipes in the exact shape ``logo_recipe.validate_recipe`` accepts — every
AI item is validated through it before leaving this module.

KEEP IN SYNC: the icon/font catalogs mirror
``frontend-customer/src/lib/logo/catalog.ts`` (20 fonts, 64 icons); palette
ids resolve through ``logo_recipe.PALETTES`` (same sync note there). The
frontend's deterministic composer (``lib/logo/composer.ts``) mirrors
NICHE_ICONS below.
"""

from typing import Literal

from django.conf import settings
from pydantic import BaseModel

from .logo_recipe import PALETTE_IDS, palette_colors, upgrade_recipe, validate_recipe

# 64 curated lucide icon names (kebab-case), 8 niche groups of 8.
ICON_NAMES = [
    # wellness
    "flower-2",
    "leaf",
    "sprout",
    "sun",
    "moon",
    "heart",
    "heart-pulse",
    "sparkles",
    # fitness
    "dumbbell",
    "bike",
    "trophy",
    "medal",
    "flame",
    "zap",
    "activity",
    "footprints",
    # music
    "music",
    "music-2",
    "mic",
    "headphones",
    "guitar",
    "piano",
    "drum",
    "radio",
    # education
    "book-open",
    "graduation-cap",
    "pencil",
    "pen-tool",
    "lightbulb",
    "brain",
    "library",
    "notebook-pen",
    # business
    "briefcase",
    "trending-up",
    "target",
    "bar-chart-3",
    "rocket",
    "globe",
    "handshake",
    "landmark",
    # creative
    "camera",
    "palette",
    "brush",
    "scissors",
    "wand-2",
    "gem",
    "crown",
    "star",
    # food
    "chef-hat",
    "utensils-crossed",
    "coffee",
    "cake",
    "apple",
    "wheat",
    "salad",
    "cookie",
    # lifestyle
    "home",
    "paw-print",
    "dog",
    "cat",
    "baby",
    "compass",
    "mountain",
    "waves",
]

# The full v2 font catalog (catalog.ts LOGO_FONTS families, in order).
FONTS = [
    "Inter",
    "Geist",
    "DM Sans",
    "Plus Jakarta Sans",
    "Playfair Display",
    "Lora",
    "EB Garamond",
    "Cormorant Garamond",
    "Poppins",
    "Montserrat",
    "Archivo",
    "Space Grotesk",
    "Nunito",
    "Quicksand",
    "Baloo 2",
    "Fredoka",
    "Work Sans",
    "Manrope",
    "Sora",
    "Outfit",
]

# niche keyword -> icons that read well for it (fallback path).
# KEEP IN SYNC: frontend-customer/src/lib/logo/composer.ts NICHE_ICONS.
NICHE_ICONS = {
    "yoga": ["flower-2", "leaf", "sun", "sparkles"],
    "fitness": ["dumbbell", "flame", "trophy", "activity"],
    "music": ["music", "guitar", "mic", "headphones"],
    "business": ["briefcase", "trending-up", "target", "rocket"],
    "cooking": ["chef-hat", "utensils-crossed", "cake", "coffee"],
    "food": ["chef-hat", "salad", "apple", "coffee"],
    "art": ["palette", "brush", "camera", "gem"],
    "education": ["book-open", "graduation-cap", "lightbulb", "brain"],
}
DEFAULT_ICONS = ["sparkles", "star", "zap", "heart"]

ABSTRACT_FAMILIES = ("orbits", "bloom", "waves", "prism", "knot", "grid")


class _SuggestionV2(BaseModel):
    layout: Literal["horizontal", "horizontal_reversed", "stacked", "name_only", "emblem"]
    mark_type: Literal["icon", "initials", "abstract"]
    icon: str = ""
    initials_style: Literal["plain", "monogram", "split", "overlap"] = "plain"
    abstract_family: Literal["orbits", "bloom", "waves", "prism", "knot", "grid"] = "orbits"
    badge_shape: Literal["none", "circle", "rounded", "squircle", "hexagon", "shield", "diamond"]
    badge_outline: bool = False
    palette_id: str
    font: str
    weight: Literal[400, 500, 600, 700, 800] = 700
    case: Literal["none", "upper", "title"] = "none"
    tracking: float = 0.0
    tagline: str = ""


class _SuggestionListV2(BaseModel):
    suggestions: list[_SuggestionV2]


def _anthropic_client():
    from anthropic import Anthropic

    return Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0, max_retries=1)


def _recipe_from_item(item, brand_name, niche, primary_hex, seed):
    """Assemble a v2 recipe from a structured-output item, clamping every
    field to the catalogs, then run it through validate_recipe (final word)."""
    icons = NICHE_ICONS.get((niche or "").lower(), DEFAULT_ICONS)
    icon = item.icon if item.icon in ICON_NAMES else icons[0]
    font = item.font if item.font in FONTS else "Inter"
    if item.mark_type == "icon":
        mark = {"type": "icon", "icon": icon, "style": "outline"}
    elif item.mark_type == "abstract":
        mark = {"type": "abstract", "family": item.abstract_family, "seed": seed}
    else:
        mark = {"type": "initials", "style": item.initials_style}
    recipe = {
        "version": 2,
        "layout": item.layout,
        "name": brand_name,
        "tagline": str(item.tagline or "")[:120],
        "mark": mark,
        "badge": {"shape": item.badge_shape, "outline": bool(item.badge_outline)},
        "typography": {
            "name": {"font": font, "weight": item.weight, "tracking": item.tracking, "case": item.case},
            "tagline": {"font": font, "weight": 500, "tracking": 0.08, "case": "upper"},
        },
        "colors": palette_colors(item.palette_id, primary_hex),
        "elements": {
            "mark": {"offset": [0, 0], "scale": 1},
            "name": {"offset": [0, 0], "scale": 1},
            "tagline": {"offset": [0, 0], "scale": 1},
        },
    }
    return validate_recipe(recipe)


def _recipe_v1(brand_name, layout, icon, badge, font, badge_bg, mark_fg, text):
    return {
        "version": 1,
        "layout": layout,
        "name": brand_name,
        "mark": {"type": "icon", "icon": icon},
        "badge": badge,
        "font": font,
        "colors": {"badge_bg": badge_bg, "mark_fg": mark_fg, "text": text},
        "overrides": {"mark_offset": [0, 0], "mark_scale": 1, "name_offset": [0, 0], "name_scale": 1},
    }


def fallback_suggestions(brand_name, niche, primary_hex):
    """4 deterministic niche-keyword recipes, upgraded to schema v2."""
    icons = DEFAULT_ICONS
    for keyword, candidates in NICHE_ICONS.items():
        if keyword in (niche or "").lower():
            icons = candidates
            break
    combos = [
        ("badge_name", "circle", "Playfair Display", primary_hex, "#ffffff", "#111827"),
        ("icon_name", "none", "Inter", primary_hex, primary_hex, "#111827"),
        ("badge_name", "squircle", "Poppins", "#111827", "#ffffff", "#111827"),
        ("name_only", "none", "Lora", primary_hex, primary_hex, "#334155"),
    ]
    return [
        upgrade_recipe(_recipe_v1(brand_name, layout, icons[i % len(icons)], badge, font, bg, fg, text))
        for i, (layout, badge, font, bg, fg, text) in enumerate(combos)
    ]


def ai_suggestions(brand_name, niche, primary_hex, style_chips=(), vibe="", count=8):
    """``count`` v2 recipes from Claude, validated against the catalogs.
    Raises on API failure — the view catches and falls back."""
    client = _anthropic_client()
    chips = ", ".join(style_chips) if style_chips else "no preference"
    prompt = (
        f"Design {count} distinct, professional logo recipes for a coaching brand.\n"
        f'Brand name: "{brand_name}"\n'
        f'Niche: "{niche or "general coaching"}"\n'
        f"Style preferences: {chips}\n"
        f'Their vibe, in their own words: "{vibe or "-"}"\n'
        f'Brand primary color: {primary_hex} (palette_id "theme" uses it)\n\n'
        f"Catalogs — every field must come from these:\n"
        f"icons: {', '.join(ICON_NAMES)}\n"
        f"fonts: {', '.join(FONTS)}\n"
        f"palette_ids: {', '.join(sorted(PALETTE_IDS))}\n"
        f"abstract families (geometric symbol generators): {', '.join(ABSTRACT_FAMILIES)}\n\n"
        f"Rules: make the {count} suggestions genuinely diverse — vary layout, "
        f"mark_type (mix icons, initials monograms, abstract symbols), palette, "
        f"font and badge; tracking between 0 and 0.3 (wide tracking suits "
        f"uppercase); a short tagline only when the niche suggests an obvious "
        f"one, otherwise empty; at least one suggestion should use the theme "
        f"palette. Favor combinations that read as designed by a professional: "
        f"serif fonts with muted palettes for elegant briefs, heavy weights "
        f"with strong gradients for bold ones."
    )
    response = client.messages.parse(
        model="claude-opus-4-8",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
        output_format=_SuggestionListV2,
    )
    items = list(response.parsed_output.suggestions)[:count]
    recipes = [
        _recipe_from_item(item, brand_name, niche, primary_hex, seed=(i * 7919 + 13) % 100_000)
        for i, item in enumerate(items)
    ]
    fallback = fallback_suggestions(brand_name, niche, primary_hex)
    while len(recipes) < 4:
        recipes.append(fallback[len(recipes) % 4])
    return recipes
