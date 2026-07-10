"""Element compiler for AI Brand Pack marks: typed geometric elements ->
exact filled-path `d` strings (viewBox 0 0 100 100, fills only — no strokes).

The model designs (placement, sizes, counts, angles); this module drafts —
all trig/arc math happens here so marks come out optically precise instead
of freehand-bezier wobbly. Compiled output feeds the same
``validate_recipe`` injection boundary as any custom mark; nothing here
changes the client contract. Pure math, no Django imports. See
docs/superpowers/specs/2026-07-10-logo-brand-pack-quality-design.md.

Angle convention (designer-intuitive): 0 degrees points straight up
(12 o'clock), positive angles go clockwise on screen.
"""

import math

# Keep every parameter inside sane canvas bounds. These clamps ARE the
# contract: the pydantic schema in logo_ai.py is deliberately loose so one
# stray out-of-range number can't fail a whole pack at parse time.
_COORD = (0.0, 100.0)
_RADIUS = (1.0, 50.0)
_THICKNESS = (1.5, 20.0)


def _clamp(value, bounds, default):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(n) or math.isinf(n):
        return default
    lo, hi = bounds
    return min(max(n, lo), hi)


def _fmt(n):
    """Compact, whitelist-safe number: max 2 decimals, no trailing zeros,
    no scientific notation, no negative zero."""
    r = round(n + 0.0, 2)
    if r == int(r):
        r = int(r)
    if r == 0:
        r = 0
    return str(r)


def _polar(cx, cy, r, deg):
    """Point at ``deg`` on the circle around (cx, cy) — 0 deg is up,
    positive clockwise (screen coords, y down)."""
    rad = math.radians(deg - 90.0)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def _disc(cx, cy, r):
    """Filled circle as one closed subpath (two relative half-arcs)."""
    return (
        f"M{_fmt(cx - r)} {_fmt(cy)}"
        f"a{_fmt(r)} {_fmt(r)} 0 1 0 {_fmt(2 * r)} 0"
        f"a{_fmt(r)} {_fmt(r)} 0 1 0 {_fmt(-2 * r)} 0Z"
    )


def _rotate(points, cx, cy, deg):
    rad = math.radians(deg)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    return [(cx + (x - cx) * cos_a - (y - cy) * sin_a, cy + (x - cx) * sin_a + (y - cy) * cos_a) for x, y in points]


def _compile_circle(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    r = _clamp(el.get("r"), _RADIUS, 10)
    return _disc(cx, cy, r)


def _compile_ring(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    r = _clamp(el.get("r"), _RADIUS, 30)
    thickness = _clamp(el.get("thickness"), _THICKNESS, 4)
    inner = max(r - thickness, 0.5)
    return _disc(cx, cy, r) + _disc(cx, cy, inner), "evenodd"


def _compile_dot_ring(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    radius = _clamp(el.get("radius"), _RADIUS, 25)
    count = int(_clamp(el.get("count"), (3, 24), 8))
    dot_r = _clamp(el.get("dot_r"), (1.0, 8.0), 3)
    start = _clamp(el.get("start_deg"), (-360, 360), 0)
    subpaths = []
    for i in range(count):
        x, y = _polar(cx, cy, radius, start + i * 360.0 / count)
        subpaths.append(_disc(x, y, dot_r))
    return "".join(subpaths)


def _compile_dot_grid(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    cols = int(_clamp(el.get("cols"), (2, 6), 3))
    rows = int(_clamp(el.get("rows"), (2, 6), 3))
    pitch = _clamp(el.get("pitch"), (4.0, 30.0), 12)
    dot_r = _clamp(el.get("dot_r"), (1.0, 8.0), 3)
    raw_skip = el.get("skip") or []
    skip = {int(i) for i in raw_skip if isinstance(i, int | float)} if isinstance(raw_skip, list) else set()
    subpaths = []
    for row in range(rows):
        for col in range(cols):
            if row * cols + col in skip:
                continue
            x = cx + (col - (cols - 1) / 2.0) * pitch
            y = cy + (row - (rows - 1) / 2.0) * pitch
            subpaths.append(_disc(x, y, dot_r))
    return "".join(subpaths)


def _compile_rounded_rect(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    w = _clamp(el.get("w"), (2.0, 90.0), 30)
    h = _clamp(el.get("h"), (2.0, 90.0), 12)
    rx = _clamp(el.get("rx"), (0.0, 45.0), 0)
    rx = min(rx, w / 2.0, h / 2.0)
    rotate = _clamp(el.get("rotate_deg"), (-180, 180), 0)
    x0, y0 = cx - w / 2.0, cy - h / 2.0
    x1, y1 = cx + w / 2.0, cy + h / 2.0
    # Clockwise from the end of the top-left corner arc; corner arcs are
    # circular so rotation only needs to move the anchor points.
    anchors = [
        (x0 + rx, y0),
        (x1 - rx, y0),
        (x1, y0 + rx),
        (x1, y1 - rx),
        (x1 - rx, y1),
        (x0 + rx, y1),
        (x0, y1 - rx),
        (x0, y0 + rx),
    ]
    if rotate:
        anchors = _rotate(anchors, cx, cy, rotate)
    p = [f"{_fmt(x)} {_fmt(y)}" for x, y in anchors]
    arc = f"A{_fmt(rx)} {_fmt(rx)} 0 0 1"
    return (
        f"M{p[0]}L{p[1]}{arc} {p[2]}L{p[3]}{arc} {p[4]}L{p[5]}{arc} {p[6]}L{p[7]}{arc} {p[0]}Z"
        if rx > 0
        else f"M{p[0]}L{p[1]}L{p[3]}L{p[5]}L{p[7]}Z"
    )


def _polygon_points(cx, cy, r, sides, rotate):
    return [_polar(cx, cy, r, rotate + i * 360.0 / sides) for i in range(sides)]


def _poly_subpath(points):
    head, *rest = points
    return f"M{_fmt(head[0])} {_fmt(head[1])}" + "".join(f"L{_fmt(x)} {_fmt(y)}" for x, y in rest) + "Z"


def _compile_polygon(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    r = _clamp(el.get("r"), _RADIUS, 30)
    sides = int(_clamp(el.get("sides"), (3, 12), 6))
    rotate = _clamp(el.get("rotate_deg"), (-360, 360), 0)
    thickness = _clamp(el.get("thickness"), (0.0, 20.0), 0)
    outer = _poly_subpath(_polygon_points(cx, cy, r, sides, rotate))
    if thickness <= 0:
        return outer, None
    # Perpendicular (apothem-true) inset so the outline reads evenly.
    inner_r = max(r - thickness / math.cos(math.pi / sides), 1.0)
    inner = _poly_subpath(_polygon_points(cx, cy, inner_r, sides, rotate))
    return outer + inner, "evenodd"


def _compile_arc(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    r = _clamp(el.get("r"), _RADIUS, 30)
    thickness = _clamp(el.get("thickness"), _THICKNESS, 4)
    start = _clamp(el.get("start_deg"), (-360, 360), 0)
    sweep = _clamp(el.get("sweep_deg"), (15.0, 340.0), 90)
    round_caps = bool(el.get("round_caps"))
    r_out = min(r + thickness / 2.0, 50.0)
    r_in = max(r - thickness / 2.0, 0.5)
    end = start + sweep
    large = 1 if sweep > 180 else 0
    ox0, oy0 = _polar(cx, cy, r_out, start)
    ox1, oy1 = _polar(cx, cy, r_out, end)
    ix0, iy0 = _polar(cx, cy, r_in, start)
    ix1, iy1 = _polar(cx, cy, r_in, end)
    cap_r = (r_out - r_in) / 2.0
    d = f"M{_fmt(ox0)} {_fmt(oy0)}A{_fmt(r_out)} {_fmt(r_out)} 0 {large} 1 {_fmt(ox1)} {_fmt(oy1)}"
    if round_caps:
        d += f"A{_fmt(cap_r)} {_fmt(cap_r)} 0 0 1 {_fmt(ix1)} {_fmt(iy1)}"
    else:
        d += f"L{_fmt(ix1)} {_fmt(iy1)}"
    d += f"A{_fmt(r_in)} {_fmt(r_in)} 0 {large} 0 {_fmt(ix0)} {_fmt(iy0)}"
    if round_caps:
        d += f"A{_fmt(cap_r)} {_fmt(cap_r)} 0 0 1 {_fmt(ox0)} {_fmt(oy0)}"
    d += "Z"
    return d


def compile_elements(elements):
    """Typed elements -> list of ``{d, fill[, fill_rule][, opacity]}`` path
    dicts ready for the custom-mark validator. Unknown element types are
    skipped (defensive — the pydantic schema shouldn't allow them)."""
    paths = []
    for el in elements or []:
        if not isinstance(el, dict):
            continue
        kind = el.get("type")
        fill_rule = None
        if kind == "circle":
            d = _compile_circle(el)
        elif kind == "ring":
            d, fill_rule = _compile_ring(el)
        elif kind == "dot_ring":
            d = _compile_dot_ring(el)
        elif kind == "dot_grid":
            d = _compile_dot_grid(el)
        elif kind == "rounded_rect":
            d = _compile_rounded_rect(el)
        elif kind == "polygon":
            d, fill_rule = _compile_polygon(el)
        elif kind == "arc":
            d = _compile_arc(el)
        elif kind == "path":
            d = str(el.get("d") or "")
            fill_rule = el.get("fill_rule")
        else:
            continue
        if not d:
            continue
        entry = {"d": d, "fill": el.get("fill") or "mark"}
        if fill_rule in ("nonzero", "evenodd"):
            entry["fill_rule"] = fill_rule
        if el.get("opacity") is not None:
            entry["opacity"] = el["opacity"]
        paths.append(entry)
    return paths
