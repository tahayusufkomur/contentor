# Logo Studio Creative Freedom Upgrade (Brand Pack v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Brand Pack AI designs 8 complete, concept-driven logos (mark + layout + badge + font + typography + color mapping) with an expressive geometry vocabulary (line-art curves, organic shapes, rotational/mirror repetition, negative-space cuts), replacing the 6-prescribed-marks × dice-rolled-lockups pipeline.

**Architecture:** Extends the existing "model designs, Python drafts" element compiler (`logo_geometry.py`) with 6 primitives and 3 combinators; changes the Brand Pack contract (`logo_ai.py`) from `marks×palettes` to complete `designs`; the client materializes designs faithfully (`composeDesigns`) instead of randomizing (`composeFromPack`, kept as legacy fallback). The saved recipe v2 shape and the `validate_recipe` injection boundary are **unchanged**.

**Tech Stack:** Django 5.1 + pydantic structured output (backend), Next.js 14 + TypeScript + vitest (frontend-customer), pytest in the django container.

**Spec:** `docs/superpowers/specs/2026-07-11-logo-creative-freedom-design.md`

## Global Constraints

- Vector-only; recipe v2 shape untouched — `migrate.ts`, `validate_recipe`, exports unchanged.
- Injection boundary unchanged: `_PATH_D_RE` whitelist, `MARK_CUSTOM_MAX_PATHS = 8`, `MARK_CUSTOM_MAX_D_LEN = 2000`.
- One AI call per pack; `max_tokens` 8000 → 16000; `PROMPT_VERSION` 4 → 5; 8 designs; 3 palettes.
- `logo_geometry.py` stays pure math — no Django/DRF imports.
- Font list in the prompt, `catalog.ts` `LOGO_FONTS`, and the backend `FontVibe` Literal must stay in sync (KEEP IN SYNC comments).
- Angle convention everywhere: 0° points up, positive clockwise (screen coords, y down).
- Pre-commit must pass with zero issues. Run backend tests via `docker compose exec django pytest <path> -v` (dev stack must be up: `make dev`).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/apps/tenant_config/logo_geometry.py` | element → path compiler | +6 primitives, +`repeat`/`mirror`, +`cut` merging, `_compile_single` dispatcher refactor |
| `backend/apps/tenant_config/tests/test_logo_geometry.py` | compiler tests | new tests per primitive/combinator |
| `backend/apps/tenant_config/logo_ai.py` | AI contract + prompts | new element models, `_Design`/`_Typography`/`_ColorRoles`, `_BrandPack.designs`, STATIC_PROMPT v5, REFINE_PROMPT update, `_RefinedDesign` lockup fields |
| `backend/apps/tenant_config/tests/test_logo_ai.py` | contract tests | fixtures → designs shape |
| `backend/apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py` | elements round-trip | expected dicts gain `cut: False` |
| `backend/apps/tenant_config/tests/test_logo_ai_views.py`, `test_logo_refine_views.py` | endpoint tests | fake payload shape updates only (views unchanged) |
| `frontend-customer/src/lib/logo/catalog.ts` | font/palette catalogs | `FontVibe` + 4 Script fonts |
| `frontend-customer/src/lib/logo/composer.ts` | brief/pack → recipes | `BrandPackDesign` types, `composeDesigns`, `composePackWall`, `packElementsByIndex` update, `applyRefinedDesign` lockup fields |
| `frontend-customer/src/lib/logo/__tests__/composer.test.ts`, `catalog.test.ts` | unit tests | new + updated |
| `frontend-customer/src/components/logo/logo-studio.tsx` | studio UI | swap `composeFromPack` call sites → `composePackWall` |

Views (`views.py`) relay the pack/design dicts untouched — no backend view changes.

---

### Task 1: `curve` primitive — the line-art enabler

**Files:**
- Modify: `backend/apps/tenant_config/logo_geometry.py` (after `_compile_arc`, ~line 217)
- Test: `backend/apps/tenant_config/tests/test_logo_geometry.py`

**Interfaces:**
- Consumes: existing helpers `_clamp`, `_fmt`, `_COORD`, `_THICKNESS`.
- Produces: `_compile_curve(el) -> (d: str, fill_rule: str | None)` — dict keys: `points` (list of `[x, y]`, 2–10 used), `thickness`, `round_caps` (bool), `closed` (bool). Registered in `compile_elements` under `type == "curve"`.

- [ ] **Step 1: Write the failing tests**

Append to `test_logo_geometry.py`:

```python
def test_curve_two_points_is_a_straight_ribbon():
    paths = compile_elements(
        [{"type": "curve", "points": [[30, 50], [70, 50]], "thickness": 6}]
    )
    assert len(paths) == 1
    d = paths[0]["d"]
    # horizontal spine at y=50, thickness 6: edges at y=53 (left offset,
    # normal (0,1) for tangent (1,0)) and y=47.
    assert d.startswith("M30 53")
    assert "70 47" in d
    assert d.endswith("Z")
    assert "A" not in d  # flat caps by default


def test_curve_round_caps_add_two_cap_arcs():
    d = compile_elements(
        [{"type": "curve", "points": [[30, 50], [70, 50]], "thickness": 6, "round_caps": True}]
    )[0]["d"]
    assert d.count("A3 3") == 2


def test_curve_passes_near_interior_control_points():
    # Catmull-Rom interpolates its control points: the ribbon must have
    # coordinates within thickness of the middle point (50, 30).
    d = compile_elements(
        [{"type": "curve", "points": [[20, 70], [50, 30], [80, 70]], "thickness": 4}]
    )[0]["d"]
    ys_near_30 = [
        pair for pair in d.replace("M", " ").replace("L", " ").replace("Z", " ").split()
        if pair  # numbers alternate x y; crude but deterministic scan below
    ]
    # parse alternating floats
    nums = [float(n) for n in ys_near_30]
    pts = list(zip(nums[0::2], nums[1::2], strict=False))
    assert any(abs(x - 50) < 3 and abs(y - 30) < 4 for x, y in pts)


def test_curve_closed_is_two_loops_evenodd():
    paths = compile_elements(
        [{"type": "curve", "points": [[50, 25], [75, 50], [50, 75], [25, 50]], "thickness": 4, "closed": True}]
    )
    assert paths[0].get("fill_rule") == "evenodd"
    assert paths[0]["d"].count("M") == 2


def test_curve_degenerate_inputs_are_dropped_or_survive():
    assert compile_elements([{"type": "curve", "points": [[50, 50]], "thickness": 4}]) == []
    assert compile_elements([{"type": "curve", "points": "junk", "thickness": 4}]) == []
    # duplicate points collapse; a single distinct point -> dropped
    assert compile_elements(
        [{"type": "curve", "points": [[50, 50], [50, 50]], "thickness": 4}]
    ) == []


def test_curve_worst_case_fits_length_budget():
    d = compile_elements(
        [{
            "type": "curve",
            "points": [[10, 10], [30, 80], [50, 15], [70, 85], [90, 20], [10, 90], [90, 90], [50, 50], [20, 30], [80, 60]],
            "thickness": 3,
            "round_caps": True,
        }]
    )[0]["d"]
    assert len(d) < 2000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -k curve -v`
Expected: FAIL — `compile_elements` returns `[]` (unknown type `curve` skipped), assertions on `len(paths)` fail.

- [ ] **Step 3: Implement `_compile_curve`**

Add to `logo_geometry.py` after `_compile_arc`:

```python
# Local copy of logo_recipe.MARK_CUSTOM_MAX_D_LEN (this module must stay
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
            out.append((
                0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
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
    return f"{head_cmd}{_fmt(head[0])} {_fmt(head[1])}" + "".join(
        f"L{_fmt(x)} {_fmt(y)}" for x, y in rest
    )


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
```

Register in `compile_elements` (the `elif` chain):

```python
        elif kind == "curve":
            d, fill_rule = _compile_curve(el)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -v`
Expected: all PASS (new curve tests + every pre-existing test).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_geometry.py backend/apps/tenant_config/tests/test_logo_geometry.py
git commit -m "feat(logo): curve primitive — spline ribbon line-art compiled server-side"
```

---

### Task 2: `star`, `petal`, `crescent`, `blob`, `wave` primitives

**Files:**
- Modify: `backend/apps/tenant_config/logo_geometry.py`
- Test: `backend/apps/tenant_config/tests/test_logo_geometry.py`

**Interfaces:**
- Consumes: `_clamp`, `_fmt`, `_polar`, `_rotate`, `_fit_radius`, `_poly_subpath`, `_catmull_rom` (Task 1).
- Produces: `_compile_star(el) -> str`, `_compile_petal(el) -> str`, `_compile_crescent(el) -> str`, `_compile_blob(el) -> str`, `_compile_wave(el) -> str`; all registered in `compile_elements`. `_prng(seed) -> callable` (mulberry32 port, matches `abstract.ts`).

- [ ] **Step 1: Write the failing tests**

```python
def test_star_has_2n_vertices_top_point_up():
    d = compile_elements(
        [{"type": "star", "cx": 50, "cy": 50, "points": 5, "outer_r": 30, "inner_r": 13}]
    )[0]["d"]
    assert d.startswith("M50 20")  # top outer vertex at (50, 50-30)
    assert d.count("L") == 9  # 10 vertices: 1 M + 9 L
    assert d.endswith("Z")


def test_petal_tips_on_the_length_axis():
    d = compile_elements(
        [{"type": "petal", "cx": 50, "cy": 50, "length": 30, "width": 14}]
    )[0]["d"]
    assert d.startswith("M50 35")  # tip at (50, 50-15)
    assert "50 65" in d  # opposite tip
    assert d.count("C") == 2


def test_petal_rotates_clockwise():
    d = compile_elements(
        [{"type": "petal", "cx": 50, "cy": 50, "length": 30, "width": 14, "rotate_deg": 90}]
    )[0]["d"]
    assert d.startswith("M65 50")  # tip swung from up to right


def test_crescent_is_two_arcs_with_expected_flags():
    d = compile_elements(
        [{"type": "crescent", "cx": 50, "cy": 50, "r": 30, "cutter_r": 24, "cutter_offset": 12}]
    )[0]["d"]
    assert d.count("A") == 2
    assert "A30 30 0 1 1" in d  # kept outer arc is major, clockwise
    assert "A24 24 0 1 0" in d  # cutter arc: major here (chord beyond cutter center)
    assert d.endswith("Z")


def test_blob_is_deterministic_per_seed_and_regular_at_zero_irregularity():
    a = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 7, "irregularity": 0.3}])[0]["d"]
    b = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 7, "irregularity": 0.3}])[0]["d"]
    c = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 8, "irregularity": 0.3}])[0]["d"]
    assert a == b
    assert a != c
    regular = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 7, "irregularity": 0}])[0]["d"]
    assert regular.startswith("M50 25")  # top vertex exactly on r


def test_wave_ribbon_closes_and_fits_budget():
    paths = compile_elements(
        [{"type": "wave", "cx": 50, "cy": 50, "width": 60, "amplitude": 8, "cycles": 2, "thickness": 4}]
    )
    d = paths[0]["d"]
    assert d.count("M") == 1
    assert d.endswith("Z")
    assert len(d) < 2000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -k "star or petal or crescent or blob or wave" -v`
Expected: FAIL — index errors on empty `compile_elements` results.

- [ ] **Step 3: Implement the five compilers**

```python
def _compile_star(el):
    cx = _clamp(el.get("cx"), _COORD, 50)
    cy = _clamp(el.get("cy"), _COORD, 50)
    points = int(_clamp(el.get("points"), (3, 12), 5))
    outer = _fit_radius(cx, cy, _clamp(el.get("outer_r"), _RADIUS, 30))
    inner = _clamp(el.get("inner_r"), (1.0, outer), outer * 0.45)
    rotate = _clamp(el.get("rotate_deg"), (-360, 360), 0)
    verts = [
        _polar(cx, cy, outer if i % 2 == 0 else inner, rotate + i * 180.0 / points)
        for i in range(points * 2)
    ]
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
        (cx, cy - l2),                       # tip
        (cx + wf, cy - l2 * 0.5),            # c1 out
        (cx + wf, cy + l2 * 0.5),            # c2 out
        (cx, cy + l2),                       # bottom tip
        (cx - wf, cy + l2 * 0.5),            # c1 back
        (cx - wf, cy - l2 * 0.5),            # c2 back
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
        _polar(cx, cy, r * (1 - irregularity + 2 * irregularity * rand()), i * 360.0 / sides)
        for i in range(sides)
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
```

Register all five in `compile_elements`:

```python
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
```

- [ ] **Step 4: Run the full geometry suite**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -v`
Expected: all PASS. If the crescent flag assertions fail, print the `d`, render it in an SVG scratch file, and fix the *test expectation only if the shape is visually a correct crescent opening toward `rotate_deg`* — otherwise fix the sweep flags.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_geometry.py backend/apps/tenant_config/tests/test_logo_geometry.py
git commit -m "feat(logo): star, petal, crescent, blob, wave primitives"
```

---

### Task 3: `_compile_single` refactor + `repeat` / `mirror` combinators

**Files:**
- Modify: `backend/apps/tenant_config/logo_geometry.py` (refactor `compile_elements`, ~line 219)
- Test: `backend/apps/tenant_config/tests/test_logo_geometry.py`

**Interfaces:**
- Produces: `_compile_single(el) -> (d, fill_rule | None)` — the single dispatcher used by `compile_elements`, `_compile_repeat`, `_compile_mirror`. `repeat` dict keys: `cx, cy, count, start_deg, of`. `mirror` keys: `axis_x, of, include_original`.

- [ ] **Step 1: Write the failing tests**

```python
def test_repeat_places_rotated_copies_evenly():
    d = compile_elements(
        [{
            "type": "repeat", "cx": 50, "cy": 50, "count": 4,
            "of": {"type": "circle", "cx": 50, "cy": 30, "r": 4},
        }]
    )[0]["d"]
    # child at (50,30) -> copies at (70,50), (50,70), (30,50)
    for anchor in ("M46 30", "M66 50", "M46 70", "M26 50"):
        assert anchor in d  # disc subpath starts at (cx - r, cy)


def test_repeat_advances_child_rotation():
    d = compile_elements(
        [{
            "type": "repeat", "cx": 50, "cy": 50, "count": 2,
            "of": {"type": "petal", "cx": 50, "cy": 35, "length": 20, "width": 8},
        }]
    )[0]["d"]
    # second copy is the petal rotated 180deg: its tip points down from (50,65)
    assert "M50 25" in d and "M50 75" in d


def test_repeat_of_ring_keeps_evenodd():
    paths = compile_elements(
        [{
            "type": "repeat", "cx": 50, "cy": 50, "count": 3,
            "of": {"type": "ring", "cx": 50, "cy": 30, "r": 8, "thickness": 3},
        }]
    )
    assert paths[0]["fill_rule"] == "evenodd"


def test_repeat_rejects_forbidden_children():
    assert compile_elements(
        [{"type": "repeat", "cx": 50, "cy": 50, "count": 4, "of": {"type": "path", "d": "M0 0L1 1Z"}}]
    ) == []
    assert compile_elements(
        [{"type": "repeat", "cx": 50, "cy": 50, "count": 4,
          "of": {"type": "repeat", "cx": 50, "cy": 50, "count": 2, "of": {"type": "circle", "cx": 50, "cy": 30, "r": 3}}}]
    ) == []


def test_repeat_stops_before_length_budget():
    paths = compile_elements(
        [{
            "type": "repeat", "cx": 50, "cy": 50, "count": 16,
            "of": {"type": "arc", "cx": 50, "cy": 30, "r": 10, "thickness": 3, "start_deg": 0, "sweep_deg": 200, "round_caps": True},
        }]
    )
    assert len(paths) == 1
    assert len(paths[0]["d"]) < 2000


def test_mirror_reflects_center_and_keeps_original():
    d = compile_elements(
        [{"type": "mirror", "axis_x": 50, "of": {"type": "circle", "cx": 30, "cy": 40, "r": 5}}]
    )[0]["d"]
    assert "M25 40" in d and "M65 40" in d  # discs at x=30 and x=70


def test_mirror_can_drop_the_original():
    d = compile_elements(
        [{"type": "mirror", "axis_x": 50, "include_original": False,
          "of": {"type": "circle", "cx": 30, "cy": 40, "r": 5}}]
    )[0]["d"]
    assert "M65 40" in d and "M25 40" not in d


def test_mirror_reflects_arc_orientation():
    # arc 0..90 (top->right quarter) mirrors to the top->left quarter
    d = compile_elements(
        [{"type": "mirror", "axis_x": 50, "include_original": False,
          "of": {"type": "arc", "cx": 50, "cy": 50, "r": 20, "thickness": 4, "start_deg": 0, "sweep_deg": 90}}]
    )[0]["d"]
    nums = [float(n) for n in d.replace("M", " ").replace("L", " ").replace("A", " ").replace("Z", " ").split()]
    xs = nums[0::2]
    assert min(xs) < 40  # geometry lives on the left half


def test_mirror_rejects_blob_children():
    assert compile_elements(
        [{"type": "mirror", "axis_x": 50, "of": {"type": "blob", "cx": 30, "cy": 50, "r": 10, "seed": 3}}]
    ) == []
```

Note: the arc-orientation test extracts every number pair crudely; arc flags
land in the number stream, keep the assertion loose (`min(xs) < 40`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -k "repeat or mirror" -v`
Expected: FAIL (unknown types skipped).

- [ ] **Step 3: Refactor and implement**

Refactor `compile_elements`'s `if/elif` chain into a dispatcher, then add the combinators:

```python
_REPEATABLE = {"circle", "ring", "rounded_rect", "polygon", "arc", "star", "petal", "crescent", "blob", "wave", "curve"}
_MIRRORABLE = _REPEATABLE - {"blob"}  # a blob can't be param-reflected (seeded shape)
_CHILD_ROTATE_KEYS = {
    "rounded_rect": "rotate_deg", "polygon": "rotate_deg", "star": "rotate_deg",
    "petal": "rotate_deg", "crescent": "rotate_deg", "wave": "rotate_deg",
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
    (out["cx"], out["cy"]), = _rotate([(ccx, ccy)], cx, cy, deg)
    key = _CHILD_ROTATE_KEYS.get(child.get("type"))
    if key:
        out[key] = _norm_deg(_clamp(child.get(key), (-360, 360), 0) + deg)
    return out


def _reflected_child(child, axis):
    out = dict(child)
    kind = child.get("type")
    if kind == "curve":
        raw = child.get("points") if isinstance(child.get("points"), list) else []
        out["points"] = [
            [2 * axis - p[0], p[1]]
            for p in raw if isinstance(p, list | tuple) and len(p) == 2
        ]
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
```

`compile_elements` becomes:

```python
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
        entry = {"d": d, "fill": el.get("fill") or "mark"}
        if fill_rule in ("nonzero", "evenodd"):
            entry["fill_rule"] = fill_rule
        if el.get("opacity") is not None:
            entry["opacity"] = el["opacity"]
        paths.append(entry)
    return paths
```

(Place `_compile_repeat`/`_compile_mirror` definitions before `_compile_single`
or rely on late binding — module-level functions resolve at call time, so
order is free; keep them adjacent for readability.)

- [ ] **Step 4: Run the full geometry suite (regression + new)**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -v`
Expected: all PASS, including every pre-Task-1 test (the refactor must not change any existing output).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_geometry.py backend/apps/tenant_config/tests/test_logo_geometry.py
git commit -m "feat(logo): repeat and mirror combinators + compile dispatcher refactor"
```

---

### Task 4: `cut` — negative space on any element

**Files:**
- Modify: `backend/apps/tenant_config/logo_geometry.py` (`compile_elements`)
- Test: `backend/apps/tenant_config/tests/test_logo_geometry.py`

**Interfaces:**
- Produces: any element dict may carry `cut: true` — its compiled subpaths merge into the previous path entry with `fill_rule: "evenodd"`; its own `fill`/`opacity` are ignored.

- [ ] **Step 1: Write the failing tests**

```python
def test_cut_merges_into_previous_element_as_evenodd():
    paths = compile_elements([
        {"type": "circle", "cx": 50, "cy": 50, "r": 30, "fill": "mark2", "opacity": 0.9},
        {"type": "circle", "cx": 50, "cy": 50, "r": 12, "cut": True, "fill": "accent", "opacity": 0.1},
    ])
    assert len(paths) == 1
    assert paths[0]["fill_rule"] == "evenodd"
    assert paths[0]["fill"] == "mark2"       # cut's own fill ignored
    assert paths[0]["opacity"] == 0.9        # cut's own opacity ignored
    assert paths[0]["d"].count("M") == 2     # base disc subpath + cut disc subpath


def test_consecutive_cuts_stack_on_the_same_base():
    paths = compile_elements([
        {"type": "rounded_rect", "cx": 50, "cy": 50, "w": 60, "h": 60, "rx": 8},
        {"type": "circle", "cx": 40, "cy": 50, "r": 6, "cut": True},
        {"type": "circle", "cx": 60, "cy": 50, "r": 6, "cut": True},
    ])
    assert len(paths) == 1
    assert paths[0]["d"].count("M") == 3


def test_leading_cut_is_ignored():
    paths = compile_elements([
        {"type": "circle", "cx": 50, "cy": 50, "r": 10, "cut": True},
        {"type": "circle", "cx": 50, "cy": 50, "r": 30},
    ])
    assert len(paths) == 1
    assert "fill_rule" not in paths[0]


def test_repeat_as_cut_punches_a_ring_of_holes():
    paths = compile_elements([
        {"type": "circle", "cx": 50, "cy": 50, "r": 32},
        {"type": "repeat", "cx": 50, "cy": 50, "count": 6, "cut": True,
         "of": {"type": "circle", "cx": 50, "cy": 32, "r": 4}},
    ])
    assert len(paths) == 1
    assert paths[0]["fill_rule"] == "evenodd"
    assert paths[0]["d"].count("M") == 7


def test_cut_merging_never_exceeds_length_budget():
    big_curve = {"type": "curve", "cut": True, "thickness": 3, "round_caps": True,
                 "points": [[10, 10], [30, 80], [50, 15], [70, 85], [90, 20], [10, 90], [90, 90], [50, 50], [20, 30], [80, 60]]}
    base = {"type": "circle", "cx": 50, "cy": 50, "r": 30}
    paths = compile_elements([base, big_curve, big_curve])
    assert len(paths) == 1
    assert len(paths[0]["d"]) < 2000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -k cut -v`
Expected: FAIL — cuts currently compile as separate paths (`len(paths) == 2/3`).

- [ ] **Step 3: Implement cut merging in `compile_elements`**

```python
def compile_elements(elements):
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
```

- [ ] **Step 4: Run the full geometry suite**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_geometry.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_geometry.py backend/apps/tenant_config/tests/test_logo_geometry.py
git commit -m "feat(logo): cut flag — negative space merging on any element"
```

---

### Task 5: Pydantic element schema for the new vocabulary

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py` (element models, ~lines 198–279)
- Test: `backend/apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py`

**Interfaces:**
- Consumes: Task 1–4 compilers (via `compile_elements`).
- Produces: `_Element` union extended with `_Star`, `_Petal`, `_Crescent`, `_Blob`, `_Wave`, `_Curve`, `_Repeat`, `_Mirror`; `_ElementBase` gains `cut: bool = False`. `_RepeatChild` union type for combinator children.

- [ ] **Step 1: Write the failing test**

Append to `test_logo_ai_elements_roundtrip.py`:

```python
def test_new_vocabulary_parses_and_compiles():
    item = logo_ai._Mark(
        rationale="One line through a mirrored bloom.",
        elements=[
            {"type": "mirror", "axis_x": 50,
             "of": {"type": "petal", "cx": 38, "cy": 50, "length": 30, "width": 12, "rotate_deg": -30}},
            {"type": "curve", "points": [[20, 70], [50, 45], [80, 70]], "thickness": 4, "round_caps": True},
            {"type": "circle", "cx": 50, "cy": 30, "r": 10},
            {"type": "star", "cx": 50, "cy": 30, "points": 5, "outer_r": 6, "inner_r": 2.5, "cut": True},
        ],
    )
    result = logo_ai._validate_pack_mark(item)
    assert result is not None
    assert len(result["paths"]) == 3  # star cut merged into the circle
    assert result["elements"][3]["cut"] is True
```

Also update the two existing assertions in
`test_validate_pack_mark_returns_elements_that_recompile_to_same_paths`: each
expected element dict gains `"cut": False` (the new `_ElementBase` default is
included by `model_dump()`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py -v`
Expected: new test FAILS with a pydantic `ValidationError` (unknown discriminator values `mirror`/`curve`/`star`).

- [ ] **Step 3: Add the models**

In `logo_ai.py`, extend `_ElementBase` and add after `_FreePath`:

```python
class _ElementBase(BaseModel):
    fill: Literal["mark", "mark2", "accent"] = "mark"
    opacity: float | None = None
    cut: bool = False


class _Star(_ElementBase):
    type: Literal["star"]
    cx: float
    cy: float
    points: int
    outer_r: float
    inner_r: float
    rotate_deg: float = 0


class _Petal(_ElementBase):
    type: Literal["petal"]
    cx: float
    cy: float
    length: float
    width: float
    rotate_deg: float = 0


class _Crescent(_ElementBase):
    type: Literal["crescent"]
    cx: float
    cy: float
    r: float
    cutter_r: float
    cutter_offset: float
    rotate_deg: float = 0


class _Blob(_ElementBase):
    type: Literal["blob"]
    cx: float
    cy: float
    r: float
    sides: int = 8
    seed: int = 1
    irregularity: float = 0.25


class _Wave(_ElementBase):
    type: Literal["wave"]
    cx: float
    cy: float
    width: float
    amplitude: float
    cycles: float = 1.5
    thickness: float = 4
    rotate_deg: float = 0


class _Curve(_ElementBase):
    type: Literal["curve"]
    points: list[list[float]]
    thickness: float = 4
    round_caps: bool = False
    closed: bool = False


_RepeatChild = Annotated[
    _Circle | _Ring | _RoundedRect | _Polygon | _Arc | _Star | _Petal | _Crescent | _Blob | _Wave | _Curve,
    Field(discriminator="type"),
]


class _Repeat(_ElementBase):
    type: Literal["repeat"]
    cx: float
    cy: float
    count: int
    start_deg: float = 0
    of: _RepeatChild


class _Mirror(_ElementBase):
    type: Literal["mirror"]
    axis_x: float = 50
    include_original: bool = True
    of: _RepeatChild


_Element = Annotated[
    _Circle | _Ring | _DotRing | _DotGrid | _RoundedRect | _Polygon | _Arc | _FreePath
    | _Star | _Petal | _Crescent | _Blob | _Wave | _Curve | _Repeat | _Mirror,
    Field(discriminator="type"),
]
```

(`_Mirror.of` allows `_Blob` at the schema level; the compiler rejects it —
the schema stays deliberately loose, clamps are the contract.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py apps/tenant_config/tests/test_logo_ai.py -v`
Expected: all PASS (existing `test_logo_ai.py` fixtures still parse — old element types unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py
git commit -m "feat(logo): pydantic schema for curve/star/petal/crescent/blob/wave/repeat/mirror/cut"
```

---

### Task 6: Pack contract v3 (`designs`) + STATIC_PROMPT v5

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py` (`STATIC_PROMPT`, `_BrandPack`, `generate_brand_pack`, `PROMPT_VERSION`)
- Test: `backend/apps/tenant_config/tests/test_logo_ai.py`, `backend/apps/tenant_config/tests/test_logo_ai_views.py`

**Interfaces:**
- Produces: pack dict shape `{"designs": [...], "palettes": [...], "tagline", "font_vibe"}` where each design is `{concept, rationale, paths, elements, layout, badge_shape, badge_outline, font, typography: {case, tracking, weight}, palette_index, color_roles: {badge, mark, mark2, mark_accent, text, tagline}}`. Helper `_validate_lockup(item) -> dict` shared with Task 7. `_FONT_VIBES` Literal includes `"Script"`.

- [ ] **Step 1: Update fixtures and write the failing tests**

In `test_logo_ai.py`, replace `_FakeMark` usage in `TestGenerateBrandPack` with a design-shaped fake and add assertions:

```python
class _FakeDesign:
    def __init__(self, **overrides):
        self.concept = overrides.get("concept", "A rising ring")
        self.rationale = overrides.get("rationale", "Feels like growth.")
        self.elements = overrides.get(
            "elements",
            [logo_ai._Circle(type="circle", cx=50, cy=50, r=20)],
        )
        self.layout = overrides.get("layout", "horizontal")
        self.badge_shape = overrides.get("badge_shape", "none")
        self.badge_outline = overrides.get("badge_outline", False)
        self.font = overrides.get("font", "Manrope")
        self.typography = overrides.get(
            "typography", logo_ai._Typography(case="upper", tracking=0.12, weight=600)
        )
        self.palette_index = overrides.get("palette_index", 1)
        self.color_roles = overrides.get("color_roles", logo_ai._ColorRoles())
```

New/updated tests (the existing `_FakeParsedOutput` gets `designs=` instead of `marks=`):

```python
    def test_pack_carries_full_designs(self, monkeypatch, settings):
        ...  # monkeypatch core_ai.structured to return _FakeParsedOutput(designs=[_FakeDesign()], palettes=[_FakePalette()], ...)
        result = logo_ai.generate_brand_pack("Kai Coaching", "yoga", "#1a56db")
        design = result.pack["designs"][0]
        assert design["concept"] == "A rising ring"
        assert design["layout"] == "horizontal"
        assert design["badge_shape"] == "none"
        assert design["font"] == "Manrope"
        assert design["typography"] == {"case": "upper", "tracking": 0.12, "weight": 600}
        assert design["palette_index"] == 0  # clamped: only 1 palette in the fake
        assert design["color_roles"]["mark"] == "ink"
        assert design["paths"]  # compiled + validated as before
        assert "marks" not in result.pack

    def test_palette_index_and_free_text_are_clamped(self, monkeypatch):
        ...  # _FakeDesign(palette_index=99, font="F" * 200, concept="c" * 500,
        #      typography=logo_ai._Typography(case="none", tracking=9, weight=700))
        design = result.pack["designs"][0]
        assert design["palette_index"] == 0
        assert len(design["font"]) == 60
        assert len(design["concept"]) == 200
        assert design["typography"]["tracking"] == 0.4
```

Update `test_raises_when_every_mark_is_invalid` to use a design with
`elements=[]`, and keep every other existing test green by adapting the fakes.
In `test_logo_ai_views.py`, update any fake pack payloads from
`{"marks": ...}` to `{"designs": ...}` (the views themselves don't inspect the
shape — only fixtures change).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_ai.py -v`
Expected: FAIL — `_Typography`/`_ColorRoles` don't exist, `_BrandPack` has no `designs`.

- [ ] **Step 3: Implement the contract**

In `logo_ai.py`:

```python
PROMPT_VERSION = 5

_FONT_VIBES = Literal["Modern", "Elegant", "Bold", "Playful", "Minimal", "Script"]
_LAYOUTS_LITERAL = Literal["horizontal", "stacked", "emblem", "horizontal_reversed", "name_only"]
_BADGES_LITERAL = Literal["none", "circle", "rounded", "squircle", "hexagon", "shield", "diamond"]
_ROLE = Literal["primary", "secondary", "accent", "ink", "white"]


class _Typography(BaseModel):
    case: Literal["none", "upper", "title"] = "none"
    tracking: float = 0
    weight: Literal[400, 500, 600, 700, 800] = 700


class _ColorRoles(BaseModel):
    badge: _ROLE = "primary"
    mark: _ROLE = "ink"
    mark2: _ROLE = "secondary"
    mark_accent: _ROLE = "accent"
    text: Literal["primary", "secondary", "ink"] = "ink"
    tagline: Literal["primary", "secondary", "accent", "ink"] = "secondary"


class _Design(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    layout: _LAYOUTS_LITERAL
    badge_shape: _BADGES_LITERAL
    badge_outline: bool = False
    font: str
    typography: _Typography
    palette_index: int = 0
    color_roles: _ColorRoles


class _BrandPack(BaseModel):
    designs: list[_Design]
    palettes: list[_Palette]
    tagline: str
    font_vibe: _FONT_VIBES
```

(`_Mark` stays — the refine flow still uses it.) Shared lockup shaping +
design validation:

```python
def _validate_lockup(item):
    """Shape the lockup fields shared by pack designs and refinements —
    enums are already guaranteed by the pydantic Literals; free text and
    numbers are clamped, never rejected."""
    return {
        "layout": item.layout,
        "badge_shape": item.badge_shape,
        "badge_outline": bool(item.badge_outline),
        "font": str(item.font or "")[:60],
        "typography": {
            "case": item.typography.case,
            "tracking": max(-0.1, min(0.4, float(item.typography.tracking or 0))),
            "weight": item.typography.weight,
        },
        "color_roles": item.color_roles.model_dump(),
    }


def _validate_design(item, palette_count):
    mark = _validate_pack_mark(item)
    if not mark:
        return None
    return {
        **mark,
        "concept": str(item.concept or "")[:200],
        "palette_index": int(max(0, min(palette_count - 1, item.palette_index))),
        **_validate_lockup(item),
    }
```

`generate_brand_pack` body changes:

```python
        parsed, cost, _ = core_ai.structured(
            system=STATIC_PROMPT,
            user=user_content,
            output_model=_BrandPack,
            model=settings.LOGO_AI_MODEL,
            # 8 full designs of element-JSON + lockups; adaptive thinking
            # bills within max_tokens too — 16000 leaves headroom.
            max_tokens=16000,
        )
    except core_ai.AiError as exc:
        raise BrandPackError(str(exc), cost_usd=exc.cost_usd) from exc

    palettes = [_validate_pack_palette(item) for item in parsed.palettes]
    designs = [d for d in (_validate_design(item, len(palettes) or 1) for item in parsed.designs) if d]
    if not designs or not palettes:
        raise BrandPackError("brand pack validation left nothing usable", cost_usd=cost)

    pack = {
        "designs": designs,
        "palettes": palettes,
        "tagline": str(parsed.tagline or "")[:120],
        "font_vibe": parsed.font_vibe,
    }
    return BrandPackResult(pack, cost)
```

- [ ] **Step 4: Rewrite the prompts**

Append the new vocabulary to `_ELEMENT_VOCABULARY_AND_PRINCIPLES` (after the
`path` bullet, before "## Non-negotiable design principles"):

```
- curve {points: [[x,y],...], thickness, round_caps, closed} — a smooth \
even-width ribbon swept through 2-10 control points. You bend a wire; the \
drafting engine makes a perfect stroke. round_caps true for soft ends. THE \
line-art tool: swooshes, continuous-line motifs, simplified figures.
- star {cx, cy, points, outer_r, inner_r, rotate_deg} — a pointed star.
- crescent {cx, cy, r, cutter_r, cutter_offset, rotate_deg} — a disc with a \
circular bite taken from the rotate_deg side: moons, leaves, smiles.
- petal {cx, cy, length, width, rotate_deg} — an almond pointed at both \
ends, length axis aimed at rotate_deg: leaves, drops, flames.
- blob {cx, cy, r, sides, seed, irregularity} — a smooth organic form; same \
seed always draws the same blob.
- wave {cx, cy, width, amplitude, cycles, thickness, rotate_deg} — a \
flowing sine ribbon: water, breath, sound.

Combinators:
- repeat {cx, cy, count, start_deg, of: <element>} — the child repeated \
`count` times, spun evenly around (cx, cy): petal becomes flower, square \
becomes pinwheel, arc becomes sunburst. Child: any element except path, \
dot_grid, dot_ring, repeat, mirror.
- mirror {axis_x, of: <element>, include_original} — the child plus its \
perfect reflection across the vertical line x=axis_x: wings, lotus poses, \
open books. Same children as repeat, except blob.
- Any element may add "cut": true — instead of drawing, it punches its \
shape OUT of the element right before it. The cut must sit fully inside \
that element. Negative space anywhere: a bite from a disc, a ring of holes \
(repeat as cut), a letter knocked out of a badge.
```

Also edit the existing `path` bullet in `_ELEMENT_VOCABULARY_AND_PRINCIPLES`:
change "under 400 characters" to "under 800 characters" (the spec promotes
freehand paths to a first-class tool for letterforms and organic silhouettes;
the server-side validation cap `MARK_CUSTOM_MAX_D_LEN = 2000` is untouched).

Replace `STATIC_PROMPT`'s "## The 6 marks" section, the intro line, and the
tagline section; keep "## Style directives", "## Rationale" and "## Palettes"
verbatim as they are today. New text:

```python
STATIC_PROMPT = (
    """You are a senior brand-identity designer producing a Brand Pack for a \
coaching brand: 8 complete logo designs plus 3 brand color palettes. The \
coach sells courses and community under this brand — every design must look \
like it came from a serious studio engagement, never from a clipart library.

"""
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## The 8 designs — concept first, never a template

For each design, write `concept` FIRST: one sentence naming a real idea \
drawn from THIS brand's name, niche and vibe (growth, calm, connection, \
strength, focus, warmth...) and the visual device that will express it. \
Then draw exactly that.

Diversity is a hard rule: no two designs may share their primary visual \
device. Devices to draw from (not limited to): solid geometry, \
negative-space cut, continuous-line curve, mirrored organic composition, \
dot system, arc system, letterform (the initial abstracted into geometry — \
path or dot-grid skips — never a font glyph), petal/blob composition, \
layered low-opacity texture. Vary density, weight and symmetry across the \
8 (make 2-3 clearly asymmetric). Where they fit the brand, use `curve` \
line-art in at least one design, a `cut` in at least one, and `mirror` \
symmetry in at least one. Never a generic swoosh, sparkle, or globe.

## The lockup — you design the whole logo, not just the mark

Per design, choose:
- layout: horizontal (versatile classic) | horizontal_reversed (mark on \
the right) | stacked (centered, ceremonial) | emblem (mark inside the \
badge above the name — requires a badge) | name_only (pure wordmark).
- badge_shape + badge_outline: a badge is a container; pick "none" when \
the mark should breathe directly on the page. emblem must have a badge.
- font: exactly one family from the catalog below, matched to the brand's \
voice.
- typography: case (upper = authoritative, title = friendly, none = \
modern), tracking (0.05-0.2 with upper, else 0), weight.
- palette_index: which of your 3 palettes this design wears (spread all 3 \
across the 8 designs).
- color_roles: which palette role paints each slot. Contrast is \
non-negotiable: on a dark badge use white or a light role for the mark; \
with badge "none" the mark and text must read on white; text must always \
read on white.

## Font catalog (family — voice)

Modern: Inter — neutral clarity; Geist — technical precision; DM Sans — \
warm geometric; Plus Jakarta Sans — contemporary polish.
Elegant: Playfair Display — editorial serif; Lora — bookish calm; \
EB Garamond — classical authority; Cormorant Garamond — fine luxury.
Bold: Poppins — confident rounds; Montserrat — urban strength; Archivo — \
industrial punch; Space Grotesk — techy edge.
Playful: Nunito — soft friendly; Quicksand — light bounce; Baloo 2 — \
chubby cheer; Fredoka — bubbly warmth.
Minimal: Work Sans — quiet utility; Manrope — refined minimal; Sora — \
future clean; Outfit — sleek geometry.
Script (for the name only — never uppercase, never taglines): Dancing \
Script — lively handwriting; Great Vibes — formal calligraphy; Pacifico — \
retro brush; Caveat — casual marker.
"""
```

then the kept sections, then replace the tagline + example section:

```python
    + """

## Tagline & typography

One short tagline — empty string if nothing natural fits; never force it. \
font_vibe: the single best fit among Modern, Elegant, Bold, Playful, \
Minimal, Script — the fallback pool if a design's font is ever unavailable.

## Example design (JSON)

{"concept": "One unbroken line rising through a steady circle — a single \
practice carried all the way.", "elements": [{"type": "circle", "cx": 50, \
"cy": 50, "r": 30}, {"type": "curve", "points": [[28, 64], [45, 55], [56, \
43], [72, 32]], "thickness": 4.5, "round_caps": true, "cut": true}], \
"rationale": "One continuous path through a steady circle — your coaching \
carries students all the way through.", "layout": "horizontal", \
"badge_shape": "none", "badge_outline": false, "font": "Manrope", \
"typography": {"case": "none", "tracking": 0, "weight": 700}, \
"palette_index": 0, "color_roles": {"badge": "primary", "mark": "ink", \
"mark2": "secondary", "mark_accent": "accent", "text": "ink", "tagline": \
"secondary"}}

{"concept": "A lotus opening — mirrored petals around a quiet center.", \
"elements": [{"type": "mirror", "axis_x": 50, "of": {"type": "petal", \
"cx": 38, "cy": 46, "length": 30, "width": 12, "rotate_deg": -35}}, \
{"type": "petal", "cx": 50, "cy": 40, "length": 34, "width": 13, "fill": \
"mark2"}, {"type": "circle", "cx": 50, "cy": 62, "r": 4, "fill": \
"accent"}], "rationale": "A lotus opening around a still center — calm \
that grows outward.", "layout": "stacked", "badge_shape": "none", \
"badge_outline": false, "font": "Cormorant Garamond", "typography": \
{"case": "title", "tracking": 0, "weight": 600}, "palette_index": 1, \
"color_roles": {"badge": "primary", "mark": "primary", "mark2": \
"secondary", "mark_accent": "accent", "text": "ink", "tagline": \
"secondary"}}"""
)
```

Add `# KEEP IN SYNC: frontend-customer/src/lib/logo/catalog.ts LOGO_FONTS`
above the font-catalog block.

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_ai.py apps/tenant_config/tests/test_logo_ai_views.py apps/tenant_config/tests/test_logo_ai_elements_roundtrip.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/tests/
git commit -m "feat(logo): Brand Pack v3 — 8 complete concept-first designs, prompt v5"
```

---

### Task 7: Refine parity — lockup fields on `_RefinedDesign`

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py` (`REFINE_PROMPT`, `_RefinedDesign`, `refine_design`)
- Test: `backend/apps/tenant_config/tests/test_logo_ai.py`, `backend/apps/tenant_config/tests/test_logo_refine_views.py`

**Interfaces:**
- Consumes: `_validate_lockup` (Task 6), `_Typography`, `_ColorRoles`, `_FONT_VIBES`.
- Produces: refine design dict gains `badge_shape, badge_outline, font, typography, color_roles` alongside existing `mark, palette, font_vibe, layout, rationale`.

- [ ] **Step 1: Write the failing test**

In `test_logo_ai.py` (new class or alongside existing refine tests):

```python
    def test_refine_design_carries_lockup_fields(self, monkeypatch):
        parsed = _FakeRefined(  # mirror the existing fake-refined pattern
            mark=_FakeMark(),
            palette=_FakePalette(),
            font_vibe="Script",
            layout="stacked",
            badge_shape="circle",
            badge_outline=True,
            font="Dancing Script",
            typography=logo_ai._Typography(case="title", tracking=0, weight=500),
            color_roles=logo_ai._ColorRoles(badge="ink", mark="white"),
            rationale="Warmer and softer.",
        )
        ...  # monkeypatch core_ai.structured -> (parsed, 0.01, None)
        result = logo_ai.refine_design({}, [], "make it warmer")
        assert result.design["badge_shape"] == "circle"
        assert result.design["badge_outline"] is True
        assert result.design["font"] == "Dancing Script"
        assert result.design["typography"]["weight"] == 500
        assert result.design["color_roles"]["badge"] == "ink"
        assert result.design["layout"] == "stacked"
```

Adapt existing refine fakes (they currently construct
`mark/palette/font_vibe/layout/rationale` only) to include the new fields
with defaults, and update `test_logo_refine_views.py` fakes the same way.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_ai.py -k refine -v`
Expected: FAIL — `_RefinedDesign` lacks the new fields / `design` dict lacks keys.

- [ ] **Step 3: Implement**

```python
class _RefinedDesign(BaseModel):
    mark: _Mark
    palette: _Palette
    font_vibe: _FONT_VIBES
    layout: _LAYOUTS_LITERAL
    badge_shape: _BADGES_LITERAL
    badge_outline: bool = False
    font: str
    typography: _Typography
    color_roles: _ColorRoles
    rationale: str
```

In `refine_design`, build the result via the shared helper:

```python
    design = {
        "mark": mark,
        "palette": _validate_pack_palette(parsed.palette),
        "font_vibe": parsed.font_vibe,
        "rationale": str(parsed.rationale or "")[:300],
        **_validate_lockup(parsed),
    }
```

Update `REFINE_PROMPT`'s "## Your task" closing sentence to:

```
Return one refined design: the mark (as elements, same vocabulary as \
above), a 4-hex-role palette, the whole lockup — layout, badge_shape + \
badge_outline, one font from the catalog in the pack brief's voice, \
typography (case/tracking/weight), and color_roles mapping palette roles \
onto badge/mark/text/tagline (contrast is non-negotiable) — the best-fit \
font_vibe, and a one-sentence rationale in plain words, addressed to the \
coach, saying what you changed and why.
```

Also append the same font catalog block used in `STATIC_PROMPT` to
`REFINE_PROMPT` (extract it into a module constant `_FONT_CATALOG` used by
both prompts so it exists in exactly one place).

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/ -v`
Expected: all tenant_config suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/tests/
git commit -m "feat(logo): refine returns the full lockup (badge, font, typography, color roles)"
```

---

### Task 8: Script fonts in the catalog

**Files:**
- Modify: `frontend-customer/src/lib/logo/catalog.ts:248-283`
- Test: `frontend-customer/src/lib/logo/__tests__/catalog.test.ts`

**Interfaces:**
- Produces: `FontVibe` includes `"Script"`; `LOGO_FONTS` has 24 entries. (Font loading in `logo-studio.tsx:140` and SVG export embedding both derive from `LOGO_FONTS`/css2 automatically — no changes there.)

- [ ] **Step 1: Write the failing test**

```ts
it("ships a Script vibe with 4 families and honest weight lists", () => {
  const script = LOGO_FONTS.filter((f) => f.vibe === "Script");
  expect(script.map((f) => f.family)).toEqual([
    "Dancing Script",
    "Great Vibes",
    "Pacifico",
    "Caveat",
  ]);
  expect(script.find((f) => f.family === "Great Vibes")?.weights).toEqual([400]);
  expect(script.find((f) => f.family === "Pacifico")?.weights).toEqual([400]);
});
```

Check for and update any existing assertion pinning `LOGO_FONTS.length` to 20
or enumerating vibes.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/catalog.test.ts`
Expected: FAIL — no Script entries.

- [ ] **Step 3: Implement**

```ts
export type FontVibe =
  | "Modern"
  | "Elegant"
  | "Bold"
  | "Playful"
  | "Minimal"
  | "Script";
```

```ts
const W_400: FontWeight[] = [400];
const W_400_TO_700: FontWeight[] = [400, 500, 600, 700];
```

Append to `LOGO_FONTS` (update the count comment to "24 Google Fonts, 4 per
vibe" and note `KEEP IN SYNC: backend/apps/tenant_config/logo_ai.py
_FONT_CATALOG`):

```ts
  { family: "Dancing Script", vibe: "Script", weights: W_400_TO_700 },
  { family: "Great Vibes", vibe: "Script", weights: W_400 },
  { family: "Pacifico", vibe: "Script", weights: W_400 },
  { family: "Caveat", vibe: "Script", weights: W_400_TO_700 },
```

(Real Google-Fonts weight ranges: Dancing Script 400–700 variable, Caveat
400–700 variable, Great Vibes and Pacifico 400 only.)

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend-customer && npx vitest run src/lib/logo && npx tsc --noEmit`
Expected: PASS. (`FontVibe` is a widening change — existing code compiles.)

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/catalog.ts frontend-customer/src/lib/logo/__tests__/catalog.test.ts
git commit -m "feat(logo): Script font vibe — Dancing Script, Great Vibes, Pacifico, Caveat"
```

---

### Task 9: `composeDesigns` + dispatcher + refine lockup application

**Files:**
- Modify: `frontend-customer/src/lib/logo/composer.ts` (pack section, ~lines 468–650)
- Test: `frontend-customer/src/lib/logo/__tests__/composer.test.ts`

**Interfaces:**
- Consumes: `LOGO_FONTS`, `LOGO_FONT_FAMILIES`, `fontEntry`, `defaultRecipe` from catalog; `BrandPackPath`/`BrandPackPalette` (existing).
- Produces:
  - `interface BrandPackDesign { concept: string; rationale: string; paths: BrandPackPath[]; elements?: BrandPackElement[]; layout: RecipeLayout; badge_shape: BadgeShape; badge_outline: boolean; font: string; typography: { case: TextCase; tracking: number; weight: FontWeight }; palette_index: number; color_roles: BrandPackColorRoles; }`
  - `interface BrandPack { designs?: BrandPackDesign[]; marks?: BrandPackMark[]; palettes: BrandPackPalette[]; tagline: string; font_vibe: FontVibe; }` (`marks` becomes optional-legacy)
  - `composeDesigns(pack, brief): LogoRecipe[]`
  - `composePackWall(pack, brief, seed): LogoRecipe[]` — designs → `composeDesigns`, legacy → `composeFromPack`
  - `packElementsByIndex(pack)` — 1:1 for designs, legacy fan-out otherwise
  - `RefinedDesign` gains `badge_shape, badge_outline, font, typography, color_roles`; `applyRefinedDesign` applies them.

- [ ] **Step 1: Write the failing tests**

Add a v3 pack fixture next to the existing `PACK` fixture and tests:

```ts
const DESIGN: BrandPackDesign = {
  concept: "A rising line through a circle",
  rationale: "Feels like progress.",
  paths: [{ d: "M10 10L90 90Z", fill: "mark" }],
  elements: [{ type: "circle", cx: 50, cy: 50, r: 30 }],
  layout: "stacked",
  badge_shape: "circle",
  badge_outline: true,
  font: "Sora",
  typography: { case: "upper", tracking: 0.12, weight: 600 },
  palette_index: 1,
  color_roles: {
    badge: "ink",
    mark: "white",
    mark2: "secondary",
    mark_accent: "accent",
    text: "ink",
    tagline: "primary",
  },
};
const PACK_V3: BrandPack = {
  designs: [DESIGN],
  palettes: [
    { name: "Calm", primary: "#336699", secondary: "#88aacc", accent: "#ee7755", ink: "#112233" },
    { name: "Vivid", primary: "#0055ff", secondary: "#66ccff", accent: "#ffaa00", ink: "#001122" },
  ],
  tagline: "Move daily",
  font_vibe: "Minimal",
};

describe("composeDesigns", () => {
  it("materializes the AI's lockup faithfully — no dice", () => {
    const [recipe] = composeDesigns(PACK_V3, BRIEF);
    expect(recipe.layout).toBe("stacked");
    expect(recipe.badge).toEqual({ shape: "circle", outline: true });
    expect(recipe.typography.name).toMatchObject({ font: "Sora", weight: 600, tracking: 0.12, case: "upper" });
    expect(recipe.colors.badge).toEqual({ type: "solid", color: "#001122" }); // ink of palette 1
    expect(recipe.colors.mark).toBe("#ffffff"); // white role
    expect(recipe.colors.tagline).toBe("#0055ff"); // primary of palette 1
    expect(recipe.mark).toMatchObject({ type: "custom", rationale: "Feels like progress." });
    expect(recipe.tagline).toBe("Move daily");
  });

  it("falls back to the pack vibe pool on unknown fonts and clamps palette_index", () => {
    const [recipe] = composeDesigns(
      { ...PACK_V3, designs: [{ ...DESIGN, font: "Comic Sans", palette_index: 9 }] },
      BRIEF,
    );
    expect(recipe.typography.name.font).toBe("Work Sans"); // first Minimal family
    expect(recipe.colors.tagline).toBe("#0055ff"); // clamped to last palette
  });

  it("guards a white mark when there is no badge behind it", () => {
    const [recipe] = composeDesigns(
      { ...PACK_V3, designs: [{ ...DESIGN, badge_shape: "none" }] },
      BRIEF,
    );
    expect(recipe.colors.mark).toBe("#001122"); // ink instead of invisible white
  });

  it("snaps unavailable weights to the family's heaviest", () => {
    const [recipe] = composeDesigns(
      { ...PACK_V3, designs: [{ ...DESIGN, font: "Great Vibes", typography: { ...DESIGN.typography, weight: 700 } }] },
      BRIEF,
    );
    expect(recipe.typography.name.weight).toBe(400);
  });
});

describe("composePackWall", () => {
  it("routes v3 packs to composeDesigns and legacy packs to composeFromPack", () => {
    expect(composePackWall(PACK_V3, BRIEF, 5)).toHaveLength(1);
    expect(composePackWall(PACK, BRIEF, 5)).toHaveLength(
      (PACK.marks?.length ?? 0) * PACK.palettes.length,
    );
  });
});

describe("packElementsByIndex v3", () => {
  it("is one-to-one with designs", () => {
    expect(packElementsByIndex(PACK_V3)).toEqual([DESIGN.elements]);
  });
});

describe("applyRefinedDesign lockup", () => {
  it("applies badge, font, typography and color roles", () => {
    const refined: RefinedDesign = {
      mark: { rationale: "r", paths: [{ d: "M1 1L2 2Z" }] },
      palette: PACK_V3.palettes[0]!,
      font_vibe: "Script",
      layout: "emblem",
      badge_shape: "squircle",
      badge_outline: false,
      font: "Caveat",
      typography: { case: "title", tracking: 0, weight: 500 },
      color_roles: DESIGN.color_roles,
      rationale: "warmer",
    };
    const next = applyRefinedDesign(baseRecipe(), refined); // reuse the file's existing base-recipe helper/fixture
    expect(next.layout).toBe("emblem");
    expect(next.badge).toEqual({ shape: "squircle", outline: false });
    expect(next.typography.name.font).toBe("Caveat");
    expect(next.colors.badge).toEqual({ type: "solid", color: "#112233" });
    expect(next.colors.mark).toBe("#ffffff");
  });
});
```

(Adapt fixture names to what the file already uses — `BRIEF`, `PACK`, and the
existing `applyRefinedDesign` describe block show the local conventions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/composer.test.ts`
Expected: FAIL — `composeDesigns`/`composePackWall`/`BrandPackDesign` don't exist.

- [ ] **Step 3: Implement**

In `composer.ts`, after the existing `BrandPack` interfaces:

```ts
export type PaletteRole = "primary" | "secondary" | "accent" | "ink" | "white";
export interface BrandPackColorRoles {
  badge: PaletteRole;
  mark: PaletteRole;
  mark2: PaletteRole;
  mark_accent: PaletteRole;
  text: Exclude<PaletteRole, "white" | "accent">;
  tagline: Exclude<PaletteRole, "white">;
}
export interface BrandPackTypography {
  case: TextCase;
  tracking: number;
  weight: FontWeight;
}
export interface BrandPackDesign {
  concept: string;
  rationale: string;
  paths: BrandPackPath[];
  elements?: BrandPackElement[];
  layout: RecipeLayout;
  badge_shape: BadgeShape;
  badge_outline: boolean;
  font: string;
  typography: BrandPackTypography;
  palette_index: number;
  color_roles: BrandPackColorRoles;
}
export interface BrandPack {
  /** v3 packs (PROMPT_VERSION >= 5): complete designs. */
  designs?: BrandPackDesign[];
  /** Legacy packs from saved studio sessions (<= 14 days old). */
  marks?: BrandPackMark[];
  palettes: BrandPackPalette[];
  tagline: string;
  font_vibe: FontVibe;
}
```

(`composeFromPack` iterates `pack.marks ?? []` now — one-line guard.)

```ts
function resolveRole(role: PaletteRole, palette: BrandPackPalette): string {
  return role === "white" ? "#ffffff" : palette[role];
}

const clampTracking = (t: number) => Math.max(-0.1, Math.min(0.4, t || 0));

export function composeDesigns(pack: BrandPack, brief: Brief): LogoRecipe[] {
  const vibePool = LOGO_FONTS.filter((f) => f.vibe === pack.font_vibe).map(
    (f) => f.family,
  );
  return (pack.designs ?? []).map((design) => {
    const palette =
      pack.palettes[Math.max(0, Math.min(design.palette_index, pack.palettes.length - 1))] ??
      pack.palettes[0]!;
    const family = LOGO_FONT_FAMILIES.includes(design.font)
      ? design.font
      : (vibePool[0] ?? LOGO_FONT_FAMILIES[0]!);
    const entry = fontEntry(family);
    const weight: FontWeight = entry.weights.includes(design.typography.weight)
      ? design.typography.weight
      : entry.weights[entry.weights.length - 1]!;
    const roles = design.color_roles;
    const noBadge = design.badge_shape === "none" || design.layout === "name_only";
    const markRole: PaletteRole =
      noBadge && roles.mark === "white" ? "ink" : roles.mark;
    const paths: CustomMarkPath[] = design.paths.map((p) => ({
      d: p.d,
      fill: p.fill ?? "mark",
      fill_rule: p.fill_rule,
      opacity: p.opacity,
    }));
    const base = defaultRecipe(brief.brandName || "My Brand", palette.primary);
    return {
      ...base,
      layout: design.layout,
      tagline: pack.tagline,
      mark: { type: "custom", rationale: design.rationale, paths },
      badge: { shape: design.badge_shape, outline: design.badge_outline },
      typography: {
        name: {
          font: entry.family,
          weight,
          tracking: clampTracking(design.typography.tracking),
          case: design.typography.case,
        },
        tagline: { font: entry.family, weight: 500, tracking: 0.08, case: "upper" },
      },
      colors: {
        palette_id: null,
        badge: { type: "solid", color: resolveRole(roles.badge, palette) },
        mark: resolveRole(markRole, palette),
        mark2: resolveRole(roles.mark2, palette),
        mark_accent: resolveRole(roles.mark_accent, palette),
        text: resolveRole(roles.text, palette),
        tagline: resolveRole(roles.tagline, palette),
      },
    };
  });
}

/** Single entry point for AI walls: v3 packs materialize their designs;
 * legacy packs (old saved sessions) keep the deterministic fan-out. */
export function composePackWall(
  pack: BrandPack,
  brief: Brief,
  seed: number,
): LogoRecipe[] {
  return pack.designs?.length
    ? composeDesigns(pack, brief)
    : composeFromPack(pack, brief, seed);
}
```

`packElementsByIndex` update:

```ts
export function packElementsByIndex(
  pack: BrandPack,
): (BrandPackElement[] | undefined)[] {
  if (pack.designs?.length) return pack.designs.map((d) => d.elements);
  const out: (BrandPackElement[] | undefined)[] = [];
  for (const mark of pack.marks ?? []) {
    for (let i = 0; i < pack.palettes.length; i++) out.push(mark.elements);
  }
  return out;
}
```

`RefinedDesign` + `applyRefinedDesign`:

```ts
export interface RefinedDesign {
  mark: BrandPackMark;
  palette: BrandPackPalette;
  font_vibe: FontVibe;
  layout: RecipeLayout;
  badge_shape: BadgeShape;
  badge_outline: boolean;
  font: string;
  typography: BrandPackTypography;
  color_roles: BrandPackColorRoles;
  rationale: string;
}
```

In `applyRefinedDesign`, resolve the font like `composeDesigns` does
(`design.font` if known, else the `font_vibe` pool, else keep the current
family), snap the weight to the family's available list, and replace the
badge/typography/colors blocks:

```ts
export function applyRefinedDesign(
  recipe: LogoRecipe,
  design: RefinedDesign,
): LogoRecipe {
  const vibePool = LOGO_FONTS.filter((f) => f.vibe === design.font_vibe).map(
    (f) => f.family,
  );
  const family = LOGO_FONT_FAMILIES.includes(design.font)
    ? design.font
    : vibePool.includes(recipe.typography.name.font)
      ? recipe.typography.name.font
      : (vibePool[0] ?? LOGO_FONT_FAMILIES[0]!);
  const entry = fontEntry(family);
  const weight: FontWeight = entry.weights.includes(design.typography.weight)
    ? design.typography.weight
    : entry.weights[entry.weights.length - 1]!;
  const paths: CustomMarkPath[] = design.mark.paths.map((p) => ({
    d: p.d,
    fill: p.fill ?? "mark",
    fill_rule: p.fill_rule,
    opacity: p.opacity,
  }));
  const roles = design.color_roles;
  const noBadge = design.badge_shape === "none" || design.layout === "name_only";
  const markRole: PaletteRole =
    noBadge && roles.mark === "white" ? "ink" : roles.mark;
  return {
    ...recipe,
    layout: design.layout,
    mark: { type: "custom", rationale: design.mark.rationale, paths },
    badge: { shape: design.badge_shape, outline: design.badge_outline },
    typography: {
      name: {
        font: entry.family,
        weight,
        tracking: clampTracking(design.typography.tracking),
        case: design.typography.case,
      },
      tagline: { ...recipe.typography.tagline, font: entry.family, weight: 500 },
    },
    colors: {
      ...recipe.colors,
      palette_id: null,
      badge: { type: "solid", color: resolveRole(roles.badge, design.palette) },
      mark: resolveRole(markRole, design.palette),
      mark2: resolveRole(roles.mark2, design.palette),
      mark_accent: resolveRole(roles.mark_accent, design.palette),
      text: resolveRole(roles.text, design.palette),
      tagline: resolveRole(roles.tagline, design.palette),
    },
  };
}
```

Fix any existing `applyRefinedDesign` tests: the old `RefinedDesign` fixtures
need the new required fields.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend-customer && npx vitest run src/lib/logo && npx tsc --noEmit`
Expected: all PASS. `tsc` will flag every consumer of the changed types — fix
`refine-api.ts` (type import only) and any studio usages surfaced (Task 10
handles `logo-studio.tsx` proper).

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/
git commit -m "feat(logo): composeDesigns — materialize AI lockups, no dice-rolling"
```

---

### Task 10: Studio wiring

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx:162,276` (both `composeFromPack` call sites + import)

**Interfaces:**
- Consumes: `composePackWall` (Task 9).

- [ ] **Step 1: Swap the call sites**

Import `composePackWall` instead of `composeFromPack`; replace:

```ts
setAiWall(composeFromPack(saved.pack, saved.brief, saved.packSeed ?? 1));
```
with
```ts
setAiWall(composePackWall(saved.pack, saved.brief, saved.packSeed ?? 1));
```
and
```ts
setAiWall(resp.pack ? composeFromPack(resp.pack, brief, seed) : null);
```
with
```ts
setAiWall(resp.pack ? composePackWall(resp.pack, brief, seed) : null);
```

`packElementsByIndex` call sites stay as-is (same name, new behavior).

- [ ] **Step 2: Verify build + suite**

Run: `cd frontend-customer && npx tsc --noEmit && npx vitest run src/lib/logo`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo): studio walls route through composePackWall (v3 designs / legacy)"
```

---

### Task 11: Eval wall — quality go/no-go

**Files:**
- Create: scratch only (`/tmp`-equivalent or `walk-shots/`-style local dir; nothing committed)

Before batch generation, probe the CLI provider once (see memory note
`project-ai-cli-provider-session-limits`): run a single tiny prompt through
the django container's `claude` CLI and confirm it answers before looping.

- [ ] **Step 1: Generate packs for 6 varied briefs at $0**

With the dev stack up and the CLI provider configured (as in the 07-10
quality plan's Task 3), generate packs from `docker compose exec django
python manage.py shell` for briefs covering the capability anchors:
yoga studio (expects mirror/lotus/line-art), beauty coach (expects petal +
Script font), fitness, business, music, tech.

- [ ] **Step 2: Render an HTML eval wall**

For each pack render every design as an inline SVG card (compile `paths`
with the design's resolved palette roles, name in the design's font via a
Google-Fonts `<link>`, layout label). One HTML file, all 6 briefs.

- [ ] **Step 3: Judge against the spec's anchors, iterate the prompt**

Checklist per pack: 8 distinct visual devices (no two alike)? At least one
credible line-art `curve` design? `cut` negative space present and clean?
`mirror` symmetry used where it fits? Script font appearing only on suitable
brands, name-only? Lockups varied (not all horizontal/none)? Crescents and
curves render without artifacts (this is the visual gate for Task 2's arc
flags)? Iterate `STATIC_PROMPT` wording while calls are free; re-run.

- [ ] **Step 4: Commit any prompt iterations**

```bash
git add backend/apps/tenant_config/logo_ai.py
git commit -m "feat(logo): prompt v5 tuning from eval wall"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Full backend suite** — `docker compose exec django pytest -v` (or `make test`): PASS, zero failures.
- [ ] **Step 2: Full frontend suite** — `cd frontend-customer && npx vitest run && npx tsc --noEmit`: PASS.
- [ ] **Step 3: Lint** — `make lint` (pre-commit on all files): zero issues.
- [ ] **Step 4: Dev-stack walkthrough** — `make dev`, then in the browser: paid tenant → Logo Studio → brief → Generate: the AI row renders **8 tiles** (one per design, visibly different lockups/fonts); pick one → editor opens with the design's font/badge/colors; run one refinement with a lockup-changing instruction ("make it a warm script emblem") → badge/font/colors all change; save; export brand-kit.zip still works (Script font embeds).
- [ ] **Step 5: Legacy session restore** — before generating in step 4, seed localStorage with an old-shape session (`marks` pack) from a stash or by checking out the previous commit briefly; confirm the studio still restores and renders 18 legacy tiles via `composeFromPack`.
- [ ] **Step 6: E2e** — `make e2e` (spec `e2e/specs/15-logo-studio.spec.ts` asserts the deterministic wall's 24 cards and recipe save shape — both unchanged): PASS.
- [ ] **Step 7: Final commit if anything was touched during verification.**
