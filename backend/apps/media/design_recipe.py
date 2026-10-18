"""The recipe a cover is drawn from: any dict in, a complete clean recipe out.

Same philosophy as tenant_config/logo_recipe.py (whose clamp helpers it reuses): a value of the
wrong kind (a layout, a paint, a style enum, a bad id or frame) is a hard ValidationError, because
the editor never produces one; numbers and free text are clamped, never rejected. A missing field
takes its default and unknown keys are dropped, so `{}` is a valid recipe.

KEEP IN SYNC: frontend-customer/src/types/design.ts and src/lib/covers/recipe.ts mirror this shape
and its defaults — change them together.
"""

import math
import re
import uuid
from collections.abc import Callable

from rest_framework import serializers

from apps.tenant_config.logo_recipe import _HEX_RE, _enum, _num

LAYOUTS = ("panel", "full", "title", "band", "framed", "photo")
SIZES = ("card", "wide", "banner")
PARTS = ("photo", "panel", "label", "title", "subtitle", "logo", "badge")
BADGE_KINDS = ("none", "new", "date", "live", "text")
FONT_ROLES = ("display", "body")
PAINT_ROLES = (
    "primary",
    "accent",
    "ink",
    "paper",
    "surface",
    "inverse",
    "inverse-ink",
    "primary-light",
    "primary-dark",
    "accent-light",
    "accent-dark",
    "white",
    "black",
)
SHAPES = ("rect", "circle", "arch", "line")
WEIGHTS = (400, 500, 600, 700, 800)
MAX_EXTRAS = 12
TEXT_MAX = {"label": 40, "title": 90, "subtitle": 140, "badge": 24, "extra": 140}

ALIGNS = ("left", "center", "right")
EXTRA_TYPES = ("text", "badge", "shape")
# Always matched with fullmatch: a trailing "$" would let a final newline through.
_EXTRA_ID_RE = re.compile(r"[a-z0-9-]{1,24}")
_STYLE_RANGES = {"scale": (0.5, 2), "tracking": (-0.05, 0.3), "leading": (0.9, 1.6)}
_FRAME_RANGES = {"x": (-0.5, 1.5), "y": (-0.5, 1.5), "w": (0.02, 2), "h": (0.02, 2)}


def _obj(value):
    return value if isinstance(value, dict) else {}


def _clamp(value, lo, hi, default):
    """_num for JSON numbers only: null, a bool, a string, NaN, infinity or an int too big for a
    float is not a number and takes the default."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return default
    try:
        return _num(value, lo, hi, default) if math.isfinite(value) else default
    except OverflowError:
        return default


def clean_text(value: str) -> str:
    """`value` without a NUL and without lone surrogates: valid JSON, but Postgres refuses the first (in a
    jsonb column or a query) and UTF-8 the second."""
    return value.replace("\x00", "").encode("utf-8", "ignore").decode()


def _text(value, limit):
    """Free text as typed: trimmed, and cut to its limit (trimmed again, so cleaning twice is a no-op)."""
    return clean_text(value).strip()[:limit].rstrip() if isinstance(value, str) else ""


def _paint(value, field):
    """A palette role or #rrggbb, exactly as given. Anything else is an error: unlike
    logo_recipe._hex there is no colour to fall back to."""
    if isinstance(value, str) and (value in PAINT_ROLES or _HEX_RE.fullmatch(value)):
        return value
    raise serializers.ValidationError(f"{field} must be a palette role or a #rrggbb colour.")


def _photo_id(value, photo_exists):
    """null, or the canonical id of one of her photos."""
    if value is None:
        return None
    try:
        photo_id = str(uuid.UUID(str(value)))
    except ValueError:
        photo_id = None
    if photo_id is None or not photo_exists(photo_id):
        raise serializers.ValidationError("photo.id must be one of your photos.")
    return photo_id


def _frame(value, field):
    """A frame in fractions of the canvas. Nothing can stand in for a missing side, so (unlike a
    plain number) a missing or non-numeric side is an error."""
    if not isinstance(value, dict):
        raise serializers.ValidationError(f"{field} must be a frame with x, y, w and h.")
    frame = {}
    for side, (lo, hi) in _FRAME_RANGES.items():
        number = _clamp(value.get(side), lo, hi, None)
        if number is None:
            raise serializers.ValidationError(f"{field}.{side} must be a number.")
        frame[side] = number
    return frame


def _part_style(value, field):
    """A PartStyle. Every key is optional (left out = the layout's own): a number out of range is
    clamped, a non-number or non-boolean is left out, a bad enum or paint is an error."""
    value = _obj(value)
    style = {}
    for key, (lo, hi) in _STYLE_RANGES.items():
        number = _clamp(value.get(key), lo, hi, None)
        if number is not None:
            style[key] = number
    for key in ("upper", "hidden"):
        if isinstance(value.get(key), bool):
            style[key] = value[key]
    for key, allowed in (("weight", WEIGHTS), ("align", ALIGNS), ("font", FONT_ROLES)):
        if key in value:
            style[key] = _enum(value[key], allowed, f"{field}.{key}")
    if "color" in value:
        style["color"] = _paint(value["color"], f"{field}.color")
    return style


def _extras(value):
    items = value if isinstance(value, list) else []
    if len(items) > MAX_EXTRAS:
        raise serializers.ValidationError(f"extras holds at most {MAX_EXTRAS} layers.")
    extras, seen = [], set()
    for index, raw in enumerate(items):
        field = f"extras[{index}]"
        if not isinstance(raw, dict):
            raise serializers.ValidationError(f"{field} must be an object.")
        layer_id = raw.get("id")
        if not (
            isinstance(layer_id, str)
            and _EXTRA_ID_RE.fullmatch(layer_id)
            and layer_id not in PARTS
            and layer_id not in seen
        ):
            raise serializers.ValidationError(
                f"{field}.id must be unique, 1-24 of a-z, 0-9 or -, and not the name of a part."
            )
        seen.add(layer_id)
        kind = _enum(raw.get("type"), EXTRA_TYPES, f"{field}.type")
        extra = {"id": layer_id, "type": kind}
        if kind == "text":
            extra["text"] = _text(raw.get("text"), TEXT_MAX["extra"])
            extra["style"] = _part_style(raw.get("style"), f"{field}.style")
        elif kind == "badge":
            extra["text"] = _text(raw.get("text"), TEXT_MAX["badge"])
            extra["fill"] = _paint(raw.get("fill", "accent"), f"{field}.fill")
        else:
            extra["shape"] = _enum(raw.get("shape"), SHAPES, f"{field}.shape")
            extra["fill"] = _paint(raw.get("fill", "accent"), f"{field}.fill")
            extra["opacity"] = _clamp(raw.get("opacity"), 0.1, 1, 1)
        extra["frame"] = _frame(raw.get("frame"), f"{field}.frame")
        extras.append(extra)
    return extras


def validate_recipe(value: dict, *, photo_exists: Callable[[str], bool]) -> dict:
    """Shape a cover recipe into a complete, clean one (the input is left alone).

    ``photo_exists`` is asked once, with the canonical id, when the recipe names a photo; the caller
    decides what counts as hers. Raises ``rest_framework.serializers.ValidationError``.
    """
    if not isinstance(value, dict):
        raise serializers.ValidationError("recipe must be an object.")
    photo, words, badge = _obj(value.get("photo")), _obj(value.get("words")), _obj(value.get("badge"))
    focus = photo.get("focus")
    focus = focus if isinstance(focus, list | tuple) and len(focus) == 2 else (None, None)
    extras = _extras(value.get("extras"))
    layer_ids = {*PARTS, *(extra["id"] for extra in extras)}
    styles, overrides = _obj(value.get("styles")), _obj(value.get("overrides"))
    return {
        "version": 1,
        "layout": _enum(value.get("layout", "panel"), LAYOUTS, "layout"),
        "photo": {
            "id": _photo_id(photo.get("id"), photo_exists),
            "focus": [_clamp(axis, 0, 1, 0.5) for axis in focus],
            "zoom": _clamp(photo.get("zoom"), 1, 3, 1),
            "brightness": _clamp(photo.get("brightness"), 0.5, 1.5, 1),
            "contrast": _clamp(photo.get("contrast"), 0.5, 1.5, 1),
            "saturation": _clamp(photo.get("saturation"), 0.5, 1.5, 1),
            "darken": _clamp(photo.get("darken"), 0, 0.7, 0),
        },
        "words": {
            "label": _text(words.get("label"), TEXT_MAX["label"]),
            # null = the item's own title, so a blank one is null too.
            "title": _text(words.get("title"), TEXT_MAX["title"]) or None,
            "subtitle": _text(words.get("subtitle"), TEXT_MAX["subtitle"]),
        },
        "badge": {
            "kind": _enum(badge.get("kind", "none"), BADGE_KINDS, "badge.kind"),
            "text": _text(badge.get("text"), TEXT_MAX["badge"]),
            "fill": _paint(badge.get("fill", "accent"), "badge.fill"),
        },
        "logo": value["logo"] if isinstance(value.get("logo"), bool) else True,
        "panel": _paint(value.get("panel", "primary"), "panel"),
        "styles": {
            part: _part_style(styles[part], f"styles.{part}") for part in PARTS if isinstance(styles.get(part), dict)
        },
        "extras": extras,
        # An override for a layer that is gone (a deleted extra) is dropped, not an error.
        "overrides": {
            size: {
                layer: _frame(frame, f"overrides.{size}.{layer}")
                for layer, frame in _obj(frames).items()
                if layer in layer_ids
            }
            for size, frames in overrides.items()
            if size in SIZES
        },
    }
