"""Vectorize a generated raster mark back into Logo Studio path dicts.

trace_mark(png_bytes) -> [{"d", "fill": "mark"|"mark2"|"accent"}, ...] | None

Pipeline: Pillow flatten+quantize (<=3 colors on a white background) ->
vtracer (flat-mark settings, one coarser retry) -> drop background paths ->
rescale pixel coordinates into the 0 0 100 100 mark viewBox -> map quantized
colors to fill roles by area (largest = "mark"). The result is CANDIDATE
input to validate_recipe's injection whitelist (the caller re-validates) —
never trusted output. Caps mirror logo_recipe.MARK_CUSTOM_* (local copies,
same pattern as logo_geometry._MAX_D). Returns None on anything
pathological; the caller falls back to Claude-authored paths."""

import io
import logging
import re

import vtracer
from PIL import Image

logger = logging.getLogger(__name__)

_MAX_PATHS = 12  # logo_recipe.MARK_CUSTOM_MAX_PATHS
_MAX_D_LEN = 12000  # logo_recipe.MARK_CUSTOM_MAX_D_LEN
_MARGIN = 4.0  # breathing room inside the 0-100 viewBox
_WHITE_MIN = 240  # every RGB channel >= this reads as background
_MAX_TRACE_SIZE = 1024
_ROLE_ORDER = ("mark", "mark2", "accent")

# vtracer emits `<path d="..." fill="#RRGGBB" transform="translate(x,y)"/>`
# with coordinates RELATIVE to the translate offset; the first path is the
# full-canvas background. Commands are absolute M/L/C/Z (spline mode).
_SVG_PATH_RE = re.compile(
    r'<path d="([^"]+)" fill="#([0-9A-Fa-f]{6})"(?: transform="translate\(([-0-9.]+),([-0-9.]+)\)")?'
)
_D_TOKEN_RE = re.compile(r"([A-Za-z])|(-?\d*\.?\d+)")
_ALLOWED_COMMANDS = set("MLCQZ")

# Detail-first: the fine tier preserves line art (a continuous one-line
# figure is a single ~5-7k-char outline path — the image model's best
# output); each later tier is the retry when the previous one blows the
# caps, trading fidelity for fit before rejecting.
_VTRACER_TIERS = (
    {
        "filter_speckle": 4,
        "color_precision": 6,
        "layer_difference": 64,
        "corner_threshold": 45,
        "length_threshold": 3.5,
        "splice_threshold": 45,
        "path_precision": 1,
    },
    {
        "filter_speckle": 16,
        "color_precision": 6,
        "layer_difference": 64,
        "corner_threshold": 80,
        "length_threshold": 6.0,
        "splice_threshold": 60,
        "path_precision": 1,
    },
    {
        "filter_speckle": 32,
        "color_precision": 6,
        "layer_difference": 64,
        "corner_threshold": 110,
        "length_threshold": 12.0,
        "splice_threshold": 80,
        "path_precision": 0,
    },
)


def _prepare(png_bytes):
    """Flatten alpha onto white, cap size, quantize. Returns
    (quantized_png_bytes, size, [(count, rgb), ...] non-background colors,
    ranked by area) or None when the image can't be a clean mark."""
    try:
        image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    except Exception:
        return None
    base = Image.new("RGBA", image.size, (255, 255, 255, 255))
    image = Image.alpha_composite(base, image).convert("RGB")
    image.thumbnail((_MAX_TRACE_SIZE, _MAX_TRACE_SIZE))
    quantized = image.quantize(colors=4, method=Image.Quantize.MEDIANCUT).convert("RGB")
    colors = quantized.getcolors(16) or []
    background = [c for c in colors if all(channel >= _WHITE_MIN for channel in c[1])]
    foreground = sorted((c for c in colors if not all(channel >= _WHITE_MIN for channel in c[1])), reverse=True)
    # The image prompt demands a white background; no white (or no shapes)
    # means the model ignored it — not a traceable mark.
    if not background or not foreground or len(foreground) > len(_ROLE_ORDER):
        return None
    buf = io.BytesIO()
    quantized.save(buf, "PNG")
    return buf.getvalue(), quantized.size, foreground


def _nearest(rgb, candidates):
    return min(candidates, key=lambda c: sum((a - b) ** 2 for a, b in zip(rgb, c, strict=True)))


def _rescale_d(d, tx, ty, size):
    """Absolute pixel-space path data (+ translate offset) -> 0-100 viewBox
    with margin, 1 decimal place. Returns None on any non-absolute or exotic
    command — coarser retry / rejection beats silently wrong geometry."""
    scale = (100.0 - 2 * _MARGIN) / max(size)
    out, is_x = [], True
    for letter, number in _D_TOKEN_RE.findall(d):
        if letter:
            if letter not in _ALLOWED_COMMANDS:
                return None
            out.append(letter)
            is_x = True
        else:
            value = (float(number) + (tx if is_x else ty)) * scale + _MARGIN
            if not 0.0 <= value <= 100.0:
                value = min(max(value, 0.0), 100.0)
            out.append(f"{value:.1f}")
            is_x = not is_x
    return " ".join(out)


def _trace_once(quantized_png, size, roles_by_rgb, tier):
    # hierarchical MUST be "cutout", not "stacked": stacked encodes holes
    # (e.g. the enclosed regions of a continuous-line figure) as white
    # shapes painted on top, which we drop as background — turning line art
    # into a solid silhouette. Cutout punches holes into the shape itself
    # as extra subpaths, so dropping white layers is loss-free.
    svg = vtracer.convert_raw_image_to_svg(
        quantized_png, img_format="png", colormode="color", hierarchical="cutout", mode="spline", **tier
    )
    paths = []
    for d, hex_color, tx, ty in _SVG_PATH_RE.findall(svg):
        rgb = tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))
        if all(channel >= _WHITE_MIN for channel in rgb):
            continue  # background layer
        role = roles_by_rgb[_nearest(rgb, list(roles_by_rgb))]
        rescaled = _rescale_d(d.strip(), float(tx or 0), float(ty or 0), size)
        if rescaled is None or len(rescaled) > _MAX_D_LEN:
            return None
        paths.append({"d": rescaled, "fill": role})
        if len(paths) > _MAX_PATHS:
            return None
    return paths or None


def trace_mark(png_bytes):
    try:
        prepared = _prepare(png_bytes)
        if not prepared:
            return None
        quantized_png, size, foreground = prepared
        roles_by_rgb = {rgb: role for (_, rgb), role in zip(foreground, _ROLE_ORDER, strict=False)}
    except Exception:
        logger.exception("logo trace: mark preparation failed")
        return None
    for tier in _VTRACER_TIERS:
        try:
            paths = _trace_once(quantized_png, size, roles_by_rgb, tier)
        except Exception:
            logger.exception("logo trace: vtracer failed")
            return None
        if paths:
            return paths
    logger.info("logo trace: no tier produced a mark within caps — rejecting")
    return None
