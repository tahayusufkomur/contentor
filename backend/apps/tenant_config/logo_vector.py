"""Generated-logo raster -> role-coloured vector paths, icon crop, margin.

vectorize(png, palette) -> {"view_box": [100, H], "paths": [{"d", "role", "fill_rule"?}]} | None

A full-colour vtracer pass (no 3-colour limit, no 12-path cap: those caps in
logo_trace are for the old icon-only pipeline). Every fill snaps to the
nearest palette role so the logo recolours and gets a dark variant by role
swap; background paths are dropped so the logo is transparent. Output is
CANDIDATE input to logo_recipe's whitelist — the recipe validator re-checks."""

import io
import re

import vtracer
from PIL import Image

ROLES = ("background", "surface", "primary", "accent", "ink", "muted")
MAX_PATHS = 400
MAX_TOTAL_CHARS = 300_000
_MARGIN = 2.0  # units inside the 100-wide box
_MAX_SIDE = 1024
_INK_DIST = 40  # RGB distance from the background that counts as ink
_MIN_ICON_GAP = 0.02  # empty-column run, fraction of the width, that separates mark from name

_PATH_RE = re.compile(r'<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"(?: transform="translate\(([-\d.]+),([-\d.]+)\)")?/>')
_SIZE_RE = re.compile(r'width="(\d+)"\s+height="(\d+)"')
_TOKEN_RE = re.compile(r"([MLCQZmlcqz])|(-?\d*\.?\d+)")
_TRACE = {
    "colormode": "color",
    "hierarchical": "stacked",
    "mode": "spline",
    "filter_speckle": 6,
    "color_precision": 7,
    "layer_difference": 24,
    "corner_threshold": 60,
    "length_threshold": 4.0,
    "max_iterations": 10,
    "splice_threshold": 45,
    "path_precision": 2,
}


def _rgb(hex_):
    return tuple(int(hex_[i : i + 2], 16) for i in (1, 3, 5))


def _dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b, strict=False)) ** 0.5


def _snap(hex_, palette):
    c = _rgb(hex_)
    return min(ROLES, key=lambda role: _dist(c, _rgb(palette[role])))


def _flatten(png, background_hex):
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    im.thumbnail((_MAX_SIDE, _MAX_SIDE))
    bg = Image.new("RGBA", im.size, _rgb(background_hex) + (255,))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def _parse(d, tx, ty):
    """vtracer's absolute M/L/C/Z with a translate offset -> [(cmd, [x, y, ...])]."""
    out, cmd, nums = [], None, []
    for m in _TOKEN_RE.finditer(d):
        if m.group(1):
            if cmd:
                out.append((cmd, nums))
            cmd, nums = m.group(1).upper(), []
        else:
            nums.append(float(m.group(2)))
    if cmd:
        out.append((cmd, nums))
    if any(c not in "MLCQZ" for c, _ in out):
        return None
    return [(c, [v + (tx if i % 2 == 0 else ty) for i, v in enumerate(n)]) for c, n in out]


def _fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def vectorize(png, palette):
    im = _flatten(png, palette["background"])
    buf = io.BytesIO()
    im.save(buf, "PNG")
    svg = vtracer.convert_raw_image_to_svg(buf.getvalue(), img_format="png", **_TRACE)
    shapes = []
    for d, fill, tx, ty in _PATH_RE.findall(svg):
        role = _snap(fill, palette)
        if role == "background":
            continue
        parsed = _parse(d, float(tx or 0), float(ty or 0))
        if not parsed:
            return None
        shapes.append((role, parsed))
    if not shapes or len(shapes) > MAX_PATHS:
        return None
    xs = [v for _, segs in shapes for _, n in segs for v in n[0::2]]
    ys = [v for _, segs in shapes for _, n in segs for v in n[1::2]]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    if w <= 0 or h <= 0:
        return None
    scale = (100 - 2 * _MARGIN) / w
    height = round(h * scale + 2 * _MARGIN, 2)
    paths = []
    for role, segs in shapes:
        parts = []
        for cmd, n in segs:
            coords = [
                _fmt((v - x0) * scale + _MARGIN) if i % 2 == 0 else _fmt((v - y0) * scale + _MARGIN)
                for i, v in enumerate(n)
            ]
            parts.append(cmd + " ".join(coords))
        paths.append({"d": "".join(parts), "role": role})
    if sum(len(p["d"]) for p in paths) > MAX_TOTAL_CHARS:
        return None
    return {"view_box": [100.0, height], "paths": paths}


def _ink_mask(png, background_hex, step=2):
    im = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = _rgb(background_hex)
    cols = [False] * w
    rows = [False] * h
    for y in range(0, h, step):
        for x in range(0, w, step):
            if _dist(px[x, y], bg) > _INK_DIST:
                cols[x] = rows[y] = True
    return im, cols, rows


def ink_margin(png, background_hex):
    im, cols, rows = _ink_mask(png, background_hex)
    w, h = im.size
    if not any(cols):
        return 0.0
    x0, x1 = cols.index(True), len(cols) - 1 - cols[::-1].index(True)
    y0, y1 = rows.index(True), len(rows) - 1 - rows[::-1].index(True)
    return round(min(x0, y0, w - 1 - x1, h - 1 - y1) / min(w, h), 3)


def icon_crop(png, palette):
    """The mark alone: the ink cluster left of the widest empty column gap,
    padded to a square, 512 px. None when no gap splits the ink (a wordmark)."""
    im, cols, rows = _ink_mask(png, palette["background"], step=1)
    w, h = im.size
    if not any(cols):
        return None
    first, last = cols.index(True), len(cols) - 1 - cols[::-1].index(True)
    best, start, run = (0, 0), None, 0
    for x in range(first, last + 1):
        if not cols[x]:
            start = x if start is None else start
            run += 1
            if run > best[0]:
                best = (run, start)
        else:
            start, run = None, 0
    gap, gap_start = best
    if gap < _MIN_ICON_GAP * w:  # measured: 0.027 on a mark+name logo, <= 0.015 between words of a wordmark
        return None
    left_cols = cols[:gap_start]
    lx0, lx1 = left_cols.index(True), len(left_cols) - 1 - left_cols[::-1].index(True)
    if lx1 - lx0 < 0.05 * w:
        return None
    px = im.load()
    bg = _rgb(palette["background"])
    ys = [y for y in range(h) if any(_dist(px[x, y], bg) > _INK_DIST for x in range(lx0, lx1 + 1, 2))]
    ly0, ly1 = min(ys), max(ys)
    side = max(lx1 - lx0, ly1 - ly0)
    pad = int(side * 0.12)
    cx, cy = (lx0 + lx1) // 2, (ly0 + ly1) // 2
    half = side // 2 + pad
    box = (cx - half, cy - half, cx + half, cy + half)
    square = Image.new("RGB", (2 * half, 2 * half), bg)
    square.paste(im.crop(box), (0, 0))
    out = io.BytesIO()
    square.resize((512, 512), Image.LANCZOS).save(out, "PNG")
    return out.getvalue()
