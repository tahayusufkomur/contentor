"""Logo Studio recipe v2: v1 upgrade + defensive validation.

KEEP IN SYNC: frontend-customer/src/lib/logo/migrate.ts implements the
identical v1->v2 upgrade in TypeScript — change both together (parity
fixture: tests/test_logo_recipe.py / __tests__/migrate.test.ts).

Philosophy matches v1 validation (serializers.validate_logo_recipe):
unknown enum values are a hard 400 (the studio/composer never produces
them); free text and numbers are clamped, not rejected.
"""

import re

from rest_framework import serializers

LAYOUTS = {"horizontal", "horizontal_reversed", "stacked", "name_only", "emblem"}
BADGE_SHAPES = {"none", "circle", "rounded", "squircle", "hexagon", "shield", "diamond"}
MARK_TYPES = {"icon", "initials", "abstract", "image"}
ICON_STYLES = {"outline", "solid"}
INITIALS_STYLES = {"plain", "monogram", "split", "overlap"}
ABSTRACT_FAMILIES = {"orbits", "bloom", "waves", "prism", "knot", "grid"}
FILL_TYPES = {"solid", "linear", "radial"}
CASES = {"none", "upper", "title"}
WEIGHTS = {400, 500, 600, 700, 800}

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _solid(color):
    return {"type": "solid", "color": color}


def _linear(start, end, angle=135):
    return {"type": "linear", "from": start, "to": end, "angle": angle}


# Full curated palette table (colors included — the AI path resolves
# palette_id server-side). KEEP IN SYNC with PALETTES() in
# frontend-customer/src/lib/logo/catalog.ts ("theme" is tenant-derived,
# resolved by palette_colors below).
PALETTES = {
    "ink": {"badge": _solid("#111827"), "mark": "#ffffff", "text": "#111827", "tagline": "#6b7280"},
    "slate": {"badge": _solid("#334155"), "mark": "#ffffff", "text": "#334155", "tagline": "#64748b"},
    "forest": {"badge": _solid("#15803d"), "mark": "#ffffff", "text": "#14532d", "tagline": "#4d7c0f"},
    "terracotta": {"badge": _solid("#c2410c"), "mark": "#fff7ed", "text": "#7c2d12", "tagline": "#9a3412"},
    "rose": {"badge": _solid("#e11d48"), "mark": "#fff1f2", "text": "#881337", "tagline": "#9f1239"},
    "violet": {"badge": _solid("#7c3aed"), "mark": "#f5f3ff", "text": "#4c1d95", "tagline": "#6d28d9"},
    "amber": {"badge": _solid("#f59e0b"), "mark": "#1f2937", "text": "#78350f", "tagline": "#92400e"},
    "ocean-fade": {"badge": _linear("#0ea5e9", "#1d4ed8"), "mark": "#ffffff", "text": "#0c4a6e", "tagline": "#0369a1"},
    "sunset-fade": {"badge": _linear("#f97316", "#e11d48"), "mark": "#ffffff", "text": "#7c2d12", "tagline": "#c2410c"},
    "mint-fade": {"badge": _linear("#34d399", "#0d9488"), "mark": "#022c22", "text": "#134e4a", "tagline": "#0f766e"},
    "berry-fade": {"badge": _linear("#a855f7", "#db2777"), "mark": "#ffffff", "text": "#581c87", "tagline": "#86198f"},
    "midnight-fade": {
        "badge": _linear("#1e293b", "#0f172a"),
        "mark": "#93c5fd",
        "text": "#0f172a",
        "tagline": "#475569",
    },
    "gold-fade": {"badge": _linear("#fbbf24", "#d97706"), "mark": "#451a03", "text": "#78350f", "tagline": "#a16207"},
    "sage": {"badge": _solid("#84a98c"), "mark": "#f0fdf4", "text": "#354f52", "tagline": "#52796f"},
    "clay": {"badge": _solid("#b08968"), "mark": "#fefae0", "text": "#5f4b32", "tagline": "#7f5539"},
    "sky": {"badge": _solid("#38bdf8"), "mark": "#082f49", "text": "#0c4a6e", "tagline": "#0284c7"},
    "plum": {"badge": _solid("#6b21a8"), "mark": "#faf5ff", "text": "#3b0764", "tagline": "#7e22ce"},
    "sand": {"badge": _solid("#e7e5e4"), "mark": "#44403c", "text": "#292524", "tagline": "#78716c"},
    "coral": {"badge": _solid("#fb7185"), "mark": "#4c0519", "text": "#881337", "tagline": "#be123c"},
    "pine": {"badge": _solid("#065f46"), "mark": "#d1fae5", "text": "#064e3b", "tagline": "#047857"},
    "mono": {"badge": _solid("#404040"), "mark": "#fafafa", "text": "#171717", "tagline": "#737373"},
    "cocoa": {"badge": _solid("#4a2c2a"), "mark": "#fde68a", "text": "#3f1d1b", "tagline": "#78350f"},
    "lavender": {"badge": _solid("#c4b5fd"), "mark": "#312e81", "text": "#3730a3", "tagline": "#6366f1"},
}
PALETTE_IDS = {"theme", *PALETTES}


def palette_colors(palette_id, primary_hex):
    """Resolve a palette id to a full v2 ``colors`` dict. Unknown ids fall
    back to "ink"; "theme" derives from the tenant's primary color."""
    if palette_id == "theme":
        return {
            "palette_id": "theme",
            "badge": _solid(_hex(primary_hex, "#1a56db")),
            "mark": "#ffffff",
            "text": "#111827",
            "tagline": "#6b7280",
        }
    resolved = palette_id if palette_id in PALETTES else "ink"
    return {"palette_id": resolved, **PALETTES[resolved]}


def _hex(value, default):
    value = str(value or "")
    return value if _HEX_RE.match(value) else default


def _num(value, lo, hi, default):
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def upgrade_recipe(value):
    """v1 dict -> v2 dict; v2 (or anything else) passes through untouched."""
    if not isinstance(value, dict) or value.get("version") != 1:
        return value
    raw_mark = value.get("mark") if isinstance(value.get("mark"), dict) else {}
    if raw_mark.get("type") == "icon":
        mark = {"type": "icon", "icon": raw_mark.get("icon", ""), "style": "outline"}
    elif raw_mark.get("type") == "image":
        mark = {"type": "image", "photo_id": raw_mark.get("photo_id", ""), "url": raw_mark.get("url", "")}
    else:
        mark = {"type": "initials", "style": "plain"}
    colors = value.get("colors") if isinstance(value.get("colors"), dict) else {}
    over = value.get("overrides") if isinstance(value.get("overrides"), dict) else {}
    font = value.get("font", "Inter")
    return {
        "version": 2,
        "layout": "name_only" if value.get("layout") == "name_only" else "horizontal",
        "name": value.get("name", ""),
        "tagline": "",
        "mark": mark,
        "badge": {"shape": value.get("badge", "circle"), "outline": False},
        "typography": {
            "name": {"font": font, "weight": 700, "tracking": 0, "case": "none"},
            "tagline": {"font": font, "weight": 500, "tracking": 0.08, "case": "upper"},
        },
        "colors": {
            "palette_id": None,
            "badge": {"type": "solid", "color": colors.get("badge_bg", "#111827")},
            "mark": colors.get("mark_fg", "#ffffff"),
            "text": colors.get("text", "#111827"),
            "tagline": "#6b7280",
        },
        "elements": {
            "mark": {"offset": over.get("mark_offset", [0, 0]), "scale": over.get("mark_scale", 1)},
            "name": {"offset": over.get("name_offset", [0, 0]), "scale": over.get("name_scale", 1)},
            "tagline": {"offset": [0, 0], "scale": 1},
        },
    }


def _enum(value, allowed, field):
    if value not in allowed:
        choices = ", ".join(sorted(str(a) for a in allowed))
        raise serializers.ValidationError(f"{field} must be one of: {choices}.")
    return value


def _fill(value, default_color):
    value = value if isinstance(value, dict) else {}
    fill_type = _enum(value.get("type"), FILL_TYPES, "fill.type")
    if fill_type == "solid":
        return {"type": "solid", "color": _hex(value.get("color"), default_color)}
    fill = {
        "type": fill_type,
        "from": _hex(value.get("from"), default_color),
        "to": _hex(value.get("to"), default_color),
    }
    if fill_type == "linear":
        fill["angle"] = _num(value.get("angle"), 0, 360, 135)
    return fill


def _text_style(value, default_weight):
    value = value if isinstance(value, dict) else {}
    weight = value.get("weight")
    return {
        "font": str(value.get("font") or "Inter")[:100],
        "weight": weight if weight in WEIGHTS else default_weight,
        "tracking": _num(value.get("tracking"), -0.1, 0.4, 0),
        "case": value.get("case") if value.get("case") in CASES else "none",
    }


def _placement(value):
    value = value if isinstance(value, dict) else {}
    pair = value.get("offset") or [0, 0]
    if not isinstance(pair, list | tuple) or len(pair) != 2:
        pair = [0, 0]
    return {
        "offset": [_num(pair[0], -120, 120, 0), _num(pair[1], -120, 120, 0)],
        "scale": _num(value.get("scale"), 0.4, 3.0, 1.0),
    }


def validate_recipe(value, clean_photo_id=lambda v: str(v or "")):
    """Defensively shape a v2 recipe dict. Raises ValidationError on bad
    enums; clamps free text/numbers. ``clean_photo_id`` is injected by the
    serializer so image marks reuse its UUID clamping."""
    raw_mark = value.get("mark") if isinstance(value.get("mark"), dict) else {}
    mark_type = _enum(raw_mark.get("type"), MARK_TYPES, "mark.type")
    if mark_type == "icon":
        mark = {
            "type": "icon",
            "icon": str(raw_mark.get("icon") or "")[:60],
            "style": _enum(raw_mark.get("style", "outline"), ICON_STYLES, "mark.style"),
        }
    elif mark_type == "initials":
        mark = {"type": "initials", "style": _enum(raw_mark.get("style", "plain"), INITIALS_STYLES, "mark.style")}
    elif mark_type == "abstract":
        mark = {
            "type": "abstract",
            "family": _enum(raw_mark.get("family"), ABSTRACT_FAMILIES, "mark.family"),
            "seed": int(_num(raw_mark.get("seed"), 0, 10_000_000, 1)),
        }
    else:  # image — never persist urls; re-derived on read from photo_id.
        mark = {"type": "image", "photo_id": clean_photo_id(raw_mark.get("photo_id")), "url": ""}

    raw_badge = value.get("badge") if isinstance(value.get("badge"), dict) else {}
    raw_typo = value.get("typography") if isinstance(value.get("typography"), dict) else {}
    raw_colors = value.get("colors") if isinstance(value.get("colors"), dict) else {}
    raw_elements = value.get("elements") if isinstance(value.get("elements"), dict) else {}
    palette_id = raw_colors.get("palette_id")

    return {
        "version": 2,
        "layout": _enum(value.get("layout"), LAYOUTS, "layout"),
        "name": str(value.get("name") or "")[:80],
        "tagline": str(value.get("tagline") or "")[:120],
        "mark": mark,
        "badge": {
            "shape": _enum(raw_badge.get("shape"), BADGE_SHAPES, "badge.shape"),
            "outline": bool(raw_badge.get("outline", False)),
        },
        "typography": {
            "name": _text_style(raw_typo.get("name"), 700),
            "tagline": _text_style(raw_typo.get("tagline"), 500),
        },
        "colors": {
            "palette_id": palette_id if palette_id in PALETTE_IDS else None,
            "badge": _fill(raw_colors.get("badge"), "#111827"),
            "mark": _hex(raw_colors.get("mark"), "#ffffff"),
            "text": _hex(raw_colors.get("text"), "#111827"),
            "tagline": _hex(raw_colors.get("tagline"), "#6b7280"),
        },
        "elements": {
            "mark": _placement(raw_elements.get("mark")),
            "name": _placement(raw_elements.get("name")),
            "tagline": _placement(raw_elements.get("tagline")),
        },
    }
