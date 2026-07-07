"""Logo Studio recipe suggestions.

AI path: Claude structured output constrained to the catalog. Fallback path:
deterministic niche-keyword picks. Both return recipes in the exact shape
``TenantConfigSerializer.validate_logo_recipe`` accepts.

KEEP IN SYNC: the icon/font catalogs mirror
``frontend-customer/src/lib/logo/catalog.ts``.
"""

from typing import Literal

from django.conf import settings
from pydantic import BaseModel

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

FONTS = ["Inter", "Geist", "Poppins", "Nunito", "DM Sans", "Playfair Display", "Merriweather", "Lora"]

# niche keyword -> icons that read well for it (fallback path)
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

_LAYOUTS = ("badge_name", "icon_name", "name_only")
_BADGES = ("circle", "rounded", "squircle", "none")


class _Suggestion(BaseModel):
    layout: Literal["badge_name", "icon_name", "name_only"]
    icon: str
    badge: Literal["circle", "rounded", "squircle", "none"]
    font: str
    badge_bg: str
    mark_fg: str
    text: str


class _SuggestionList(BaseModel):
    suggestions: list[_Suggestion]


def _anthropic_client():
    from anthropic import Anthropic

    return Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=20.0, max_retries=1)


def _recipe(brand_name, layout, icon, badge, font, badge_bg, mark_fg, text):
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
        _recipe(brand_name, layout, icons[i % len(icons)], badge, font, bg, fg, text)
        for i, (layout, badge, font, bg, fg, text) in enumerate(combos)
    ]


def _validated(item, brand_name, niche, primary_hex):
    import re

    hex_re = re.compile(r"^#[0-9a-fA-F]{6}$")
    icons = NICHE_ICONS.get((niche or "").lower(), DEFAULT_ICONS)
    icon = item.icon if item.icon in ICON_NAMES else icons[0]
    font = item.font if item.font in FONTS else "Inter"
    layout = item.layout if item.layout in _LAYOUTS else "badge_name"
    badge = item.badge if item.badge in _BADGES else "circle"
    badge_bg = item.badge_bg if hex_re.match(item.badge_bg or "") else primary_hex
    mark_fg = item.mark_fg if hex_re.match(item.mark_fg or "") else "#ffffff"
    text = item.text if hex_re.match(item.text or "") else "#111827"
    return _recipe(brand_name, layout, icon, badge, font, badge_bg, mark_fg, text)


def ai_suggestions(brand_name, niche, primary_hex):
    """4 recipes from Claude, validated against the catalog. Raises on API
    failure — the view catches and falls back."""
    client = _anthropic_client()
    prompt = (
        f"Suggest 4 distinct logo recipes for a coaching brand.\n"
        f'Brand name: "{brand_name}"\nNiche: "{niche or "general coaching"}"\n'
        f"Brand primary color: {primary_hex}\n\n"
        f"Rules: icon must be one of: {', '.join(ICON_NAMES)}.\n"
        f"font must be one of: {', '.join(FONTS)}.\n"
        f"Colors are 6-digit hex. Make the 4 suggestions visually distinct "
        f"(vary layout, badge, font, palette); at least one should use the brand primary color. "
        f"badge_bg/mark_fg must contrast strongly; text must be readable on white."
    )
    response = client.messages.parse(
        model="claude-opus-4-8",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
        output_format=_SuggestionList,
    )
    items = list(response.parsed_output.suggestions)[:4]
    recipes = [_validated(item, brand_name, niche, primary_hex) for item in items]
    while len(recipes) < 4:
        recipes.append(fallback_suggestions(brand_name, niche, primary_hex)[len(recipes)])
    return recipes
