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
MARK_TYPES = {"icon", "initials", "abstract", "image", "custom"}
ICON_STYLES = {"outline", "solid"}
INITIALS_STYLES = {"plain", "monogram", "split", "overlap"}
ABSTRACT_FAMILIES = {"orbits", "bloom", "waves", "prism", "knot", "grid"}
FILL_TYPES = {"solid", "linear", "radial"}
CASES = {"none", "upper", "title"}
WEIGHTS = {400, 500, 600, 700, 800}

# AI Brand Pack "custom" mark: bespoke SVG path geometry. Role tokens let one
# mark recolor across palettes / dark mode without carrying raw hex inline.
MARK_FILL_ROLES = {"mark", "mark2", "accent"}
MARK_CUSTOM_MAX_PATHS = 8
MARK_CUSTOM_MAX_D_LEN = 2000

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
# Whitelist for custom-mark path `d` strings: SVG path-data commands, digits,
# and separators only. Cannot express url(), markup, or external references —
# this is the injection trust boundary for AI-drawn marks (recipes render
# inline for every tenant visitor and export to files).
_PATH_D_RE = re.compile(r"^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$")

# Curated palette ids; KEEP IN SYNC with PALETTES() in
# frontend-customer/src/lib/logo/catalog.ts ("theme" is the tenant-derived
# one). Ids only — the color values live client-side with the composer.
PALETTE_IDS = {
    "theme",
    "ink",
    "slate",
    "forest",
    "terracotta",
    "rose",
    "violet",
    "amber",
    "ocean-fade",
    "sunset-fade",
    "mint-fade",
    "berry-fade",
    "midnight-fade",
    "gold-fade",
    "sage",
    "clay",
    "sky",
    "plum",
    "sand",
    "coral",
    "pine",
    "mono",
    "cocoa",
    "lavender",
}


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


def _custom_mark(raw_mark):
    """AI Brand Pack mark: bespoke SVG paths. Drop any path whose `d` fails
    the injection whitelist or is too long; degrade to plain initials if
    nothing survives (clamp philosophy — a pack must always render)."""
    raw_paths = raw_mark.get("paths") if isinstance(raw_mark.get("paths"), list) else []
    paths = []
    for raw_path in raw_paths:
        if len(paths) >= MARK_CUSTOM_MAX_PATHS:
            break
        if not isinstance(raw_path, dict):
            continue
        d = str(raw_path.get("d") or "")
        if not d or len(d) > MARK_CUSTOM_MAX_D_LEN or not _PATH_D_RE.match(d):
            continue
        fill = raw_path.get("fill")
        entry = {"d": d, "fill": fill if fill in MARK_FILL_ROLES else "mark"}
        fill_rule = raw_path.get("fill_rule")
        if fill_rule in ("nonzero", "evenodd"):
            entry["fill_rule"] = fill_rule
        if raw_path.get("opacity") is not None:
            entry["opacity"] = _num(raw_path.get("opacity"), 0, 1, 1.0)
        paths.append(entry)
    if not paths:
        return {"type": "initials", "style": "plain"}
    return {
        "type": "custom",
        "rationale": str(raw_mark.get("rationale") or "")[:200],
        "paths": paths,
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
    elif mark_type == "custom":
        mark = _custom_mark(raw_mark)
    else:  # image — never persist urls; re-derived on read from photo_id.
        mark = {"type": "image", "photo_id": clean_photo_id(raw_mark.get("photo_id")), "url": ""}

    raw_badge = value.get("badge") if isinstance(value.get("badge"), dict) else {}
    raw_typo = value.get("typography") if isinstance(value.get("typography"), dict) else {}
    raw_colors = value.get("colors") if isinstance(value.get("colors"), dict) else {}
    raw_elements = value.get("elements") if isinstance(value.get("elements"), dict) else {}
    palette_id = raw_colors.get("palette_id")
    mark_hex = _hex(raw_colors.get("mark"), "#ffffff")

    colors = {
        "palette_id": palette_id if palette_id in PALETTE_IDS else None,
        "badge": _fill(raw_colors.get("badge"), "#111827"),
        "mark": mark_hex,
        "text": _hex(raw_colors.get("text"), "#111827"),
        "tagline": _hex(raw_colors.get("tagline"), "#6b7280"),
    }
    # mark2/mark_accent are optional secondary fill roles for "custom" marks
    # (AI Brand Pack). Omitted entirely unless the input carried one, so
    # every pre-existing recipe shape is unaffected.
    if raw_colors.get("mark2") is not None:
        colors["mark2"] = _hex(raw_colors.get("mark2"), mark_hex)
    if raw_colors.get("mark_accent") is not None:
        colors["mark_accent"] = _hex(raw_colors.get("mark_accent"), mark_hex)

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
        "colors": colors,
        "elements": {
            "mark": _placement(raw_elements.get("mark")),
            "name": _placement(raw_elements.get("name")),
            "tagline": _placement(raw_elements.get("tagline")),
        },
    }
