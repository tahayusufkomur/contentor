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


def _fit_radius(cx, cy, extent, minimum=1.0):
    """Shrink a radial extent so the shape stays inside the 0-100 canvas —
    an edge-placed disc/ring/arc must scale down, not get viewBox-clipped
    (the one geometry failure mode observed in the v2 eval wall)."""
    return max(min(extent, cx, cy, 100.0 - cx, 100.0 - cy), minimum)


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
    r = _fit_radius(cx, cy, _clamp(el.get("r"), _RADIUS, 10))
    return _disc(cx, cy, r)


def _compile_ring(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    r = _fit_radius(cx, cy, _clamp(el.get("r"), _RADIUS, 30))
    thickness = _clamp(el.get("thickness"), _THICKNESS, 4)
    inner = max(r - thickness, 0.5)
    return _disc(cx, cy, r) + _disc(cx, cy, inner), "evenodd"


def _compile_dot_ring(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    dot_r = _clamp(el.get("dot_r"), (1.0, 8.0), 3)
    radius = max(
        _fit_radius(cx, cy, _clamp(el.get("radius"), _RADIUS, 25) + dot_r) - dot_r,
        1.0,
    )
    count = int(_clamp(el.get("count"), (3, 24), 8))
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
    thickness = _clamp(el.get("thickness"), _THICKNESS, 4)
    r = max(
        _fit_radius(cx, cy, _clamp(el.get("r"), _RADIUS, 30) + thickness / 2.0) - thickness / 2.0,
        1.0,
    )
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


# Compile budget for AUTHORED element marks — deliberately tighter than
# logo_recipe.MARK_CUSTOM_MAX_D_LEN (which is sized for traced image-derived
# marks); compiled primitives never legitimately need more (this module must stay
# Django-free). KEEP IN SYNC.
_MAX_D = 2000
_CURVE_MAX_POINTS = 10


def _catmull_rom(pts, samples_per_seg, closed=False):
    """Dense polyline through ``pts`` (uniform Catmull-Rom; endpoints
    duplicated when open, wrapped when closed)."""
    n = len(pts)
    if n == 2 and not closed:
        (x0, y0), (x1, y1) = pts
        return [
            (x0 + (x1 - x0) * t / samples_per_seg, y0 + (y1 - y0) * t / samples_per_seg)
            for t in range(samples_per_seg + 1)
        ]
    if closed:
        ext = [pts[-1]] + pts + [pts[0], pts[1]]
        seg_count = n
    else:
        ext = [pts[0]] + pts + [pts[-1]]
        seg_count = n - 1
    out = []
    for i in range(seg_count):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        last_seg = i == seg_count - 1
        steps = samples_per_seg + (1 if last_seg and not closed else 0)
        for s in range(steps):
            t = s / samples_per_seg
            t2, t3 = t * t, t * t * t
            out.append(
                (
                    0.5
                    * (
                        2 * p1[0]
                        + (-p0[0] + p2[0]) * t
                        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
                    ),
                    0.5
                    * (
                        2 * p1[1]
                        + (-p0[1] + p2[1]) * t
                        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
                    ),
                )
            )
    return out


def _offset_edges(dense, half, closed=False):
    """Left/right offset polylines at distance ``half`` from the spine,
    coordinates clamped into the canvas."""
    left, right = [], []
    n = len(dense)
    for i, (x, y) in enumerate(dense):
        if closed:
            px, py = dense[i - 1]
            nx_, ny_ = dense[(i + 1) % n]
        else:
            px, py = dense[max(i - 1, 0)]
            nx_, ny_ = dense[min(i + 1, n - 1)]
        tx, ty = nx_ - px, ny_ - py
        norm = math.hypot(tx, ty) or 1.0
        ox, oy = -ty / norm * half, tx / norm * half
        clampc = lambda v: min(max(v, 0.0), 100.0)  # noqa: E731
        left.append((clampc(x + ox), clampc(y + oy)))
        right.append((clampc(x - ox), clampc(y - oy)))
    return left, right


def _polyline(points, head_cmd="M"):
    head, *rest = points
    return f"{head_cmd}{_fmt(head[0])} {_fmt(head[1])}" + "".join(f"L{_fmt(x)} {_fmt(y)}" for x, y in rest)


def _compile_curve(el):
    raw = el.get("points") if isinstance(el.get("points"), list) else []
    pts = []
    for p in raw[:_CURVE_MAX_POINTS]:
        if isinstance(p, list | tuple) and len(p) == 2:
            q = (_clamp(p[0], _COORD, 50), _clamp(p[1], _COORD, 50))
            if not pts or q != pts[-1]:
                pts.append(q)
    if len(pts) < 2:
        return "", None
    thickness = _clamp(el.get("thickness"), _THICKNESS, 4)
    half = thickness / 2.0
    closed = bool(el.get("closed"))
    if closed and len(pts) < 3:
        closed = False
    samples = max(4, 32 // max(len(pts) - 1, 1))
    dense = _catmull_rom(pts, samples, closed=closed)
    left, right = _offset_edges(dense, half, closed=closed)
    if closed:
        return _polyline(left) + "Z" + _polyline(right) + "Z", "evenodd"
    d = _polyline(left)
    rev = list(reversed(right))
    cap = f"A{_fmt(half)} {_fmt(half)} 0 0 1"
    if el.get("round_caps"):
        d += f"{cap} {_fmt(rev[0][0])} {_fmt(rev[0][1])}"
    else:
        d += f"L{_fmt(rev[0][0])} {_fmt(rev[0][1])}"
    d += "".join(f"L{_fmt(x)} {_fmt(y)}" for x, y in rev[1:])
    if el.get("round_caps"):
        d += f"{cap} {_fmt(left[0][0])} {_fmt(left[0][1])}"
    d += "Z"
    return d, None


def _compile_star(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    points = int(_clamp(el.get("points"), (3, 12), 5))
    outer = _fit_radius(cx, cy, _clamp(el.get("outer_r"), _RADIUS, 30))
    inner = _clamp(el.get("inner_r"), (1.0, outer), outer * 0.45)
    rotate = _clamp(el.get("rotate_deg"), (-360, 360), 0)
    verts = [_polar(cx, cy, outer if i % 2 == 0 else inner, rotate + i * 180.0 / points) for i in range(points * 2)]
    return _poly_subpath(verts)


def _compile_petal(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    length = _clamp(el.get("length"), (4.0, 90.0), 30)
    width = _clamp(el.get("width"), (2.0, length), length * 0.45)
    rotate = _clamp(el.get("rotate_deg"), (-360, 360), 0)
    l2, wf = length / 2.0, width * 0.66
    # tip, two cubic curves through max width at the middle, back to tip
    pts = [
        (cx, cy - l2),  # tip
        (cx + wf, cy - l2 * 0.5),  # c1 out
        (cx + wf, cy + l2 * 0.5),  # c2 out
        (cx, cy + l2),  # bottom tip
        (cx - wf, cy + l2 * 0.5),  # c1 back
        (cx - wf, cy - l2 * 0.5),  # c2 back
    ]
    if rotate:
        pts = _rotate(pts, cx, cy, rotate)
    p = [f"{_fmt(x)} {_fmt(y)}" for x, y in pts]
    return f"M{p[0]}C{p[1]} {p[2]} {p[3]}C{p[4]} {p[5]} {p[0]}Z"


def _compile_crescent(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    r = _fit_radius(cx, cy, _clamp(el.get("r"), _RADIUS, 30))
    cutter_r = _clamp(el.get("cutter_r"), (r * 0.4, r), r * 0.8)
    lo, hi = max(r - cutter_r + 1.0, 1.0), r + cutter_r - 1.0
    dist = _clamp(el.get("cutter_offset"), (lo, hi), min(max(r * 0.4, lo), hi))
    rotate = _clamp(el.get("rotate_deg"), (-360, 360), 0)
    # two-circle intersection (cutter center along the rotate direction)
    a = (dist * dist + r * r - cutter_r * cutter_r) / (2.0 * dist)
    h = math.sqrt(max(r * r - a * a, 0.0))
    ux, uy = _polar(0.0, 0.0, 1.0, rotate)  # unit vector toward the cutter
    bx, by = cx + a * ux, cy + a * uy
    px, py = -uy, ux  # perpendicular
    p1 = (bx + h * px, by + h * py)
    p2 = (bx - h * px, by - h * py)
    inner_large = 1 if a > dist else 0
    return (
        f"M{_fmt(p1[0])} {_fmt(p1[1])}"
        f"A{_fmt(r)} {_fmt(r)} 0 1 1 {_fmt(p2[0])} {_fmt(p2[1])}"
        f"A{_fmt(cutter_r)} {_fmt(cutter_r)} 0 {inner_large} 0 {_fmt(p1[0])} {_fmt(p1[1])}Z"
    )


def _prng(seed):
    """mulberry32 — same algorithm as frontend abstract.ts, deterministic
    across Python versions (unlike random.Random)."""
    state = int(seed) & 0xFFFFFFFF

    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rand


def _compile_blob(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    irregularity = _clamp(el.get("irregularity"), (0.0, 0.45), 0.25)
    r = _fit_radius(cx, cy, _clamp(el.get("r"), _RADIUS, 25) * (1 + irregularity)) / (1 + irregularity)
    sides = int(_clamp(el.get("sides"), (5, 12), 8))
    rand = _prng(int(_clamp(el.get("seed"), (0, 10_000_000), 1)))
    verts = [
        _polar(cx, cy, r * (1 - irregularity + 2 * irregularity * rand()), i * 360.0 / sides) for i in range(sides)
    ]
    # closed Catmull-Rom -> cubic beziers (standard 1/6 tangent rule)
    d = f"M{_fmt(verts[0][0])} {_fmt(verts[0][1])}"
    n = len(verts)
    for i in range(n):
        p0, p1 = verts[i - 1], verts[i]
        p2, p3 = verts[(i + 1) % n], verts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d += f"C{_fmt(c1[0])} {_fmt(c1[1])} {_fmt(c2[0])} {_fmt(c2[1])} {_fmt(p2[0])} {_fmt(p2[1])}"
    return d + "Z"


def _compile_wave(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    width = _clamp(el.get("width"), (10.0, 90.0), 60)
    amplitude = _clamp(el.get("amplitude"), (1.0, 20.0), 6)
    cycles = _clamp(el.get("cycles"), (0.5, 4.0), 1.5)
    thickness = _clamp(el.get("thickness"), _THICKNESS, 4)
    rotate = _clamp(el.get("rotate_deg"), (-360, 360), 0)
    # scale the whole local shape down if its corner radius would leave canvas
    rmax = math.hypot(width / 2.0, amplitude + thickness / 2.0)
    fit = _fit_radius(cx, cy, rmax)
    s = min(1.0, fit / rmax)
    width, amplitude, thickness = width * s, amplitude * s, thickness * s
    samples = 28
    spine = []
    for i in range(samples + 1):
        t = i / samples
        x = cx - width / 2.0 + width * t
        y = cy + amplitude * math.sin(2 * math.pi * cycles * t)
        spine.append((x, y))
    left, right = _offset_edges(spine, thickness / 2.0)
    pts = left + list(reversed(right))
    if rotate:
        pts = _rotate(pts, cx, cy, rotate)
    return _polyline(pts) + "Z"


_REPEATABLE = {"circle", "ring", "rounded_rect", "polygon", "arc", "star", "petal", "crescent", "blob", "wave", "curve"}
_MIRRORABLE = _REPEATABLE - {"blob"}  # a blob can't be param-reflected (seeded shape)
_CHILD_ROTATE_KEYS = {
    "rounded_rect": "rotate_deg",
    "polygon": "rotate_deg",
    "star": "rotate_deg",
    "petal": "rotate_deg",
    "crescent": "rotate_deg",
    "wave": "rotate_deg",
    "arc": "start_deg",
}


def _norm_deg(deg):
    return ((deg + 180.0) % 360.0) - 180.0


def _compile_single(el):
    """One element dict -> (d, fill_rule|None). Unknown/invalid -> ('', None)."""
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
    elif kind == "star":
        d = _compile_star(el)
    elif kind == "petal":
        d = _compile_petal(el)
    elif kind == "crescent":
        d = _compile_crescent(el)
    elif kind == "blob":
        d = _compile_blob(el)
    elif kind == "wave":
        d = _compile_wave(el)
    elif kind == "curve":
        d, fill_rule = _compile_curve(el)
    elif kind == "repeat":
        d, fill_rule = _compile_repeat(el)
    elif kind == "mirror":
        d, fill_rule = _compile_mirror(el)
    elif kind == "path":
        d = str(el.get("d") or "")
        fill_rule = el.get("fill_rule")
    else:
        d = ""
    return d, fill_rule


def _rotated_child(child, cx, cy, deg):
    out = dict(child)
    if child.get("type") == "curve":
        raw = child.get("points") if isinstance(child.get("points"), list) else []
        pts = [(p[0], p[1]) for p in raw if isinstance(p, list | tuple) and len(p) == 2]
        out["points"] = [list(q) for q in _rotate(pts, cx, cy, deg)]
        return out
    ccx = _clamp(child.get("cx"), _COORD, 50)
    ccy = _clamp(child.get("cy"), _COORD, 50)
    ((out["cx"], out["cy"]),) = _rotate([(ccx, ccy)], cx, cy, deg)
    key = _CHILD_ROTATE_KEYS.get(child.get("type"))
    if key:
        out[key] = _norm_deg(_clamp(child.get(key), (-360, 360), 0) + deg)
    return out


def _reflected_child(child, axis):
    out = dict(child)
    kind = child.get("type")
    if kind == "curve":
        raw = child.get("points") if isinstance(child.get("points"), list) else []
        out["points"] = [[2 * axis - p[0], p[1]] for p in raw if isinstance(p, list | tuple) and len(p) == 2]
        return out
    out["cx"] = 2 * axis - _clamp(child.get("cx"), _COORD, 50)
    if kind == "arc":
        start = _clamp(child.get("start_deg"), (-360, 360), 0)
        sweep = _clamp(child.get("sweep_deg"), (15.0, 340.0), 90)
        out["start_deg"] = _norm_deg(-(start + sweep))
    else:
        key = _CHILD_ROTATE_KEYS.get(kind)
        if key:
            out[key] = -_clamp(child.get(key), (-360, 360), 0)
    return out


def _compile_repeat(el):
    child = el.get("of") if isinstance(el.get("of"), dict) else None
    if not child or child.get("type") not in _REPEATABLE:
        return "", None
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    count = int(_clamp(el.get("count"), (2, 16), 6))
    start = _clamp(el.get("start_deg"), (-360, 360), 0)
    parts, rule, total = [], None, 0
    for i in range(count):
        d, fr = _compile_single(_rotated_child(child, cx, cy, start + i * 360.0 / count))
        if not d or total + len(d) > _MAX_D - 100:
            continue
        parts.append(d)
        total += len(d)
        rule = rule or fr
    return "".join(parts), rule


def _compile_mirror(el):
    child = el.get("of") if isinstance(el.get("of"), dict) else None
    if not child or child.get("type") not in _MIRRORABLE:
        return "", None
    axis = _clamp(el.get("axis_x"), _COORD, 50)
    include_original = el.get("include_original", True)
    parts, rule = [], None
    sources = ([child] if include_original else []) + [_reflected_child(child, axis)]
    for src in sources:
        d, fr = _compile_single(src)
        if d:
            parts.append(d)
            rule = rule or fr
    return "".join(parts), rule


def compile_elements(elements):
    """Typed elements -> list of ``{d, fill[, fill_rule][, opacity]}`` path
    dicts ready for the custom-mark validator. Unknown element types are
    skipped (defensive — the pydantic schema shouldn't allow them)."""
    paths = []
    for el in elements or []:
        if not isinstance(el, dict):
            continue
        d, fill_rule = _compile_single(el)
        if not d:
            continue
        if el.get("cut"):
            # Punch the shape out of the element right before it. Skipped
            # when there's no base yet or the merged d would blow the
            # whitelist budget (the whole path would be dropped downstream).
            if not paths or len(paths[-1]["d"]) + len(d) > _MAX_D:
                continue
            paths[-1]["d"] += d
            paths[-1]["fill_rule"] = "evenodd"
            continue
        entry = {"d": d, "fill": el.get("fill") or "mark"}
        if fill_rule in ("nonzero", "evenodd"):
            entry["fill_rule"] = fill_rule
        if el.get("opacity") is not None:
            entry["opacity"] = el["opacity"]
        paths.append(entry)
    return paths
