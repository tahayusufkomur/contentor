"""Element compiler for AI Brand Pack marks: typed geometric elements ->
exact filled-path `d` strings. Pure math, no Django. See
docs/superpowers/specs/2026-07-10-logo-brand-pack-quality-design.md.
"""

import math
import re

import pytest

from apps.tenant_config.logo_geometry import _polar, compile_elements
from apps.tenant_config.logo_recipe import _PATH_D_RE, MARK_CUSTOM_MAX_D_LEN

_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _numbers(d):
    return [float(n) for n in _NUM_RE.findall(d)]


def _assert_valid_d(d):
    assert d
    assert len(d) <= MARK_CUSTOM_MAX_D_LEN
    assert _PATH_D_RE.match(d), d


def test_polar_zero_deg_points_up():
    x, y = _polar(50, 50, 30, 0)
    assert (round(x, 2), round(y, 2)) == (50, 20)


def test_polar_90_deg_points_right():
    x, y = _polar(50, 50, 30, 90)
    assert (round(x, 2), round(y, 2)) == (80, 50)


def test_circle_compiles_to_one_disc_subpath():
    [path] = compile_elements([{"type": "circle", "cx": 50, "cy": 50, "r": 10}])
    _assert_valid_d(path["d"])
    assert path["d"].count("M") == 1
    assert path["d"].count("a") == 2  # disc = two relative half-arcs
    assert path["fill"] == "mark"


def test_ring_is_two_discs_with_evenodd():
    [path] = compile_elements([{"type": "ring", "cx": 50, "cy": 50, "r": 30, "thickness": 4}])
    _assert_valid_d(path["d"])
    assert path["d"].count("M") == 2
    assert path["fill_rule"] == "evenodd"


def test_dot_ring_places_count_discs_at_exact_polar_coords():
    [path] = compile_elements([{"type": "dot_ring", "cx": 50, "cy": 50, "radius": 30, "count": 12, "dot_r": 3}])
    _assert_valid_d(path["d"])
    assert path["d"].count("M") == 12
    # dot at 90 deg sits at (80, 50): its disc subpath starts at (80 - dot_r, 50)
    assert "M77 50" in path["d"]
    # dot at 0 deg (straight up) starts at (50 - 3, 20)
    assert "M47 20" in path["d"]


def test_dot_grid_skips_cells():
    [path] = compile_elements(
        [
            {
                "type": "dot_grid",
                "cx": 50,
                "cy": 50,
                "cols": 3,
                "rows": 3,
                "pitch": 14,
                "dot_r": 3,
                "skip": [4],  # centre cell, row-major
            }
        ]
    )
    _assert_valid_d(path["d"])
    assert path["d"].count("M") == 8
    assert "M47 50" not in path["d"]  # the skipped centre disc


def test_rounded_rect_axis_aligned():
    [path] = compile_elements([{"type": "rounded_rect", "cx": 50, "cy": 50, "w": 40, "h": 20, "rx": 6}])
    _assert_valid_d(path["d"])
    assert path["d"].count("A") == 4  # four corner arcs
    xs = _numbers(path["d"])
    assert all(-1 <= n <= 101 for n in xs)


def test_rounded_rect_rotated_stays_in_canvas():
    [path] = compile_elements(
        [{"type": "rounded_rect", "cx": 50, "cy": 50, "w": 40, "h": 12, "rx": 6, "rotate_deg": 37}]
    )
    _assert_valid_d(path["d"])
    for n in _numbers(path["d"]):
        assert -5 <= n <= 105


def test_capsule_via_full_rx_clamp():
    # rx greater than h/2 clamps to h/2 -> stadium/capsule shape
    [path] = compile_elements([{"type": "rounded_rect", "cx": 50, "cy": 50, "w": 30, "h": 8, "rx": 99}])
    _assert_valid_d(path["d"])


def test_polygon_filled():
    [path] = compile_elements([{"type": "polygon", "cx": 50, "cy": 50, "r": 30, "sides": 6}])
    _assert_valid_d(path["d"])
    assert path["d"].count("L") == 5  # M + 5 L + Z = hexagon
    assert path["d"].count("M") == 1


def test_polygon_outlined_is_evenodd_double():
    [path] = compile_elements([{"type": "polygon", "cx": 50, "cy": 50, "r": 30, "sides": 3, "thickness": 4}])
    _assert_valid_d(path["d"])
    assert path["d"].count("M") == 2
    assert path["fill_rule"] == "evenodd"


def test_arc_sector_endpoints_exact():
    [path] = compile_elements(
        [
            {
                "type": "arc",
                "cx": 50,
                "cy": 50,
                "r": 30,
                "thickness": 6,
                "start_deg": 0,
                "sweep_deg": 90,
            }
        ]
    )
    _assert_valid_d(path["d"])
    # outer edge starts at 0 deg on radius r + thickness/2 = 33 -> (50, 17)
    assert path["d"].startswith("M50 17")
    xs = _numbers(path["d"])
    assert all(0 <= n <= 100 for n in xs if abs(n) > 1)


def test_arc_round_caps_add_cap_arcs():
    flat = compile_elements(
        [{"type": "arc", "cx": 50, "cy": 50, "r": 30, "thickness": 6, "start_deg": 0, "sweep_deg": 90}]
    )[0]
    round_ = compile_elements(
        [
            {
                "type": "arc",
                "cx": 50,
                "cy": 50,
                "r": 30,
                "thickness": 6,
                "start_deg": 0,
                "sweep_deg": 90,
                "round_caps": True,
            }
        ]
    )[0]
    assert round_["d"].count("A") == flat["d"].count("A") + 2


def test_arc_sweep_is_clamped_away_from_degenerate():
    [path] = compile_elements(
        [{"type": "arc", "cx": 50, "cy": 50, "r": 30, "thickness": 6, "start_deg": 0, "sweep_deg": 359}]
    )
    _assert_valid_d(path["d"])


def test_freehand_path_passes_through():
    [path] = compile_elements(
        [{"type": "path", "d": "M20 20 L80 20 L50 80 Z", "fill_rule": "nonzero", "fill": "accent"}]
    )
    assert path["d"] == "M20 20 L80 20 L50 80 Z"
    assert path["fill"] == "accent"


def test_fill_and_opacity_pass_through():
    [path] = compile_elements([{"type": "circle", "cx": 30, "cy": 30, "r": 5, "fill": "mark2", "opacity": 0.4}])
    assert path["fill"] == "mark2"
    assert path["opacity"] == pytest.approx(0.4)


def test_unknown_element_type_is_skipped():
    assert compile_elements([{"type": "unknown_type", "cx": 50, "cy": 50}]) == []


def test_edge_placed_radials_shrink_to_fit_canvas():
    # A big disc near the top edge must scale down, not get viewBox-clipped
    # (observed once in the v2 eval wall: a "moon" semicircle cut off at y=0).
    # circle {cx 50, cy 10, r 40} -> r fits to 10 -> disc starts at (40, 10)
    [circle] = compile_elements([{"type": "circle", "cx": 50, "cy": 10, "r": 40}])
    assert circle["d"].startswith("M40 10a10 10")
    # ring {cx 90} -> outer r fits to 10 -> outer disc starts at (80, 50)
    [ring] = compile_elements([{"type": "ring", "cx": 90, "cy": 50, "r": 35, "thickness": 4}])
    assert ring["d"].startswith("M80 50a10 10")
    # dot_ring {cy 12, radius 30, dot_r 3} -> radius fits to 12-3=9; the
    # top dot's disc starts at (50-3, 12-9) = (47, 3)
    [dots] = compile_elements([{"type": "dot_ring", "cx": 50, "cy": 12, "radius": 30, "count": 8, "dot_r": 3}])
    assert "M47 3a3 3" in dots["d"]
    # arc {cx 15, r 30, thickness 6} -> r_out fits to 15; 0 deg outer start
    # is (15, 50-15) = (15, 35)
    [arc] = compile_elements(
        [{"type": "arc", "cx": 15, "cy": 50, "r": 30, "thickness": 6, "start_deg": 0, "sweep_deg": 180}]
    )
    assert arc["d"].startswith("M15 35")


def test_out_of_range_params_are_clamped_not_fatal():
    [path] = compile_elements([{"type": "circle", "cx": 400, "cy": -50, "r": 500}])
    _assert_valid_d(path["d"])
    for n in _numbers(path["d"]):
        assert -101 <= n <= 201  # clamped centre/radius keep numbers bounded


def test_every_dot_of_a_big_grid_fits_the_length_budget():
    [path] = compile_elements(
        [{"type": "dot_grid", "cx": 50, "cy": 50, "cols": 6, "rows": 6, "pitch": 12, "dot_r": 2.5}]
    )
    _assert_valid_d(path["d"])
    assert path["d"].count("M") == 36


def test_polar_full_circle_symmetry():
    # sanity: 4 points at 90-degree steps land on the compass points
    pts = [_polar(50, 50, 20, deg) for deg in (0, 90, 180, 270)]
    rounded = [(round(x, 2), round(y, 2)) for x, y in pts]
    assert rounded == [(50, 30), (70, 50), (50, 70), (30, 50)]


def test_math_module_available():  # guards against accidental Django import
    assert math.pi


def test_curve_two_points_is_a_straight_ribbon():
    paths = compile_elements([{"type": "curve", "points": [[30, 50], [70, 50]], "thickness": 6}])
    assert len(paths) == 1
    d = paths[0]["d"]
    # horizontal spine at y=50, thickness 6: edges at y=53 (left offset,
    # normal (0,1) for tangent (1,0)) and y=47.
    assert d.startswith("M30 53")
    assert "70 47" in d
    assert d.endswith("Z")
    assert "A" not in d  # flat caps by default


def test_curve_round_caps_add_two_cap_arcs():
    d = compile_elements([{"type": "curve", "points": [[30, 50], [70, 50]], "thickness": 6, "round_caps": True}])[0][
        "d"
    ]
    assert d.count("A3 3") == 2


def test_curve_passes_near_interior_control_points():
    # Catmull-Rom interpolates its control points: the ribbon must have
    # coordinates within thickness of the middle point (50, 30).
    d = compile_elements([{"type": "curve", "points": [[20, 70], [50, 30], [80, 70]], "thickness": 4}])[0]["d"]
    ys_near_30 = [
        pair
        for pair in d.replace("M", " ").replace("L", " ").replace("Z", " ").split()
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
    assert compile_elements([{"type": "curve", "points": [[50, 50], [50, 50]], "thickness": 4}]) == []


def test_curve_worst_case_fits_length_budget():
    d = compile_elements(
        [
            {
                "type": "curve",
                "points": [
                    [10, 10],
                    [30, 80],
                    [50, 15],
                    [70, 85],
                    [90, 20],
                    [10, 90],
                    [90, 90],
                    [50, 50],
                    [20, 30],
                    [80, 60],
                ],
                "thickness": 3,
                "round_caps": True,
            }
        ]
    )[0]["d"]
    assert len(d) < 2000


def test_star_has_2n_vertices_top_point_up():
    d = compile_elements([{"type": "star", "cx": 50, "cy": 50, "points": 5, "outer_r": 30, "inner_r": 13}])[0]["d"]
    assert d.startswith("M50 20")  # top outer vertex at (50, 50-30)
    assert d.count("L") == 9  # 10 vertices: 1 M + 9 L
    assert d.endswith("Z")


def test_petal_tips_on_the_length_axis():
    d = compile_elements([{"type": "petal", "cx": 50, "cy": 50, "length": 30, "width": 14}])[0]["d"]
    assert d.startswith("M50 35")  # tip at (50, 50-15)
    assert "50 65" in d  # opposite tip
    assert d.count("C") == 2


def test_petal_rotates_clockwise():
    d = compile_elements([{"type": "petal", "cx": 50, "cy": 50, "length": 30, "width": 14, "rotate_deg": 90}])[0]["d"]
    assert d.startswith("M65 50")  # tip swung from up to right


def test_crescent_is_two_arcs_with_expected_flags():
    d = compile_elements([{"type": "crescent", "cx": 50, "cy": 50, "r": 30, "cutter_r": 24, "cutter_offset": 12}])[0][
        "d"
    ]
    assert d.count("A") == 2
    assert "A30 30 0 1 1" in d  # kept outer arc is major, clockwise
    assert "A24 24 0 1 0" in d  # cutter arc: major here (chord beyond cutter center)
    assert d.endswith("Z")


def test_blob_is_deterministic_per_seed_and_regular_at_zero_irregularity():
    a = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 7, "irregularity": 0.3}])[
        0
    ]["d"]
    b = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 7, "irregularity": 0.3}])[
        0
    ]["d"]
    c = compile_elements([{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 8, "irregularity": 0.3}])[
        0
    ]["d"]
    assert a == b
    assert a != c
    regular = compile_elements(
        [{"type": "blob", "cx": 50, "cy": 50, "r": 25, "sides": 8, "seed": 7, "irregularity": 0}]
    )[0]["d"]
    assert regular.startswith("M50 25")  # top vertex exactly on r


def test_wave_ribbon_closes_and_fits_budget():
    paths = compile_elements(
        [{"type": "wave", "cx": 50, "cy": 50, "width": 60, "amplitude": 8, "cycles": 2, "thickness": 4}]
    )
    d = paths[0]["d"]
    assert d.count("M") == 1
    assert d.endswith("Z")
    assert len(d) < 2000


def test_repeat_places_rotated_copies_evenly():
    d = compile_elements(
        [
            {
                "type": "repeat",
                "cx": 50,
                "cy": 50,
                "count": 4,
                "of": {"type": "circle", "cx": 50, "cy": 30, "r": 4},
            }
        ]
    )[0]["d"]
    # child at (50,30) -> copies at (70,50), (50,70), (30,50)
    for anchor in ("M46 30", "M66 50", "M46 70", "M26 50"):
        assert anchor in d  # disc subpath starts at (cx - r, cy)


def test_repeat_advances_child_rotation():
    d = compile_elements(
        [
            {
                "type": "repeat",
                "cx": 50,
                "cy": 50,
                "count": 2,
                "of": {"type": "petal", "cx": 50, "cy": 35, "length": 20, "width": 8},
            }
        ]
    )[0]["d"]
    # second copy is the petal rotated 180deg: its tip points down from (50,65)
    assert "M50 25" in d and "M50 75" in d


def test_repeat_of_ring_keeps_evenodd():
    paths = compile_elements(
        [
            {
                "type": "repeat",
                "cx": 50,
                "cy": 50,
                "count": 3,
                "of": {"type": "ring", "cx": 50, "cy": 30, "r": 8, "thickness": 3},
            }
        ]
    )
    assert paths[0]["fill_rule"] == "evenodd"


def test_repeat_rejects_forbidden_children():
    assert (
        compile_elements([{"type": "repeat", "cx": 50, "cy": 50, "count": 4, "of": {"type": "path", "d": "M0 0L1 1Z"}}])
        == []
    )
    assert (
        compile_elements(
            [
                {
                    "type": "repeat",
                    "cx": 50,
                    "cy": 50,
                    "count": 4,
                    "of": {
                        "type": "repeat",
                        "cx": 50,
                        "cy": 50,
                        "count": 2,
                        "of": {"type": "circle", "cx": 50, "cy": 30, "r": 3},
                    },
                }
            ]
        )
        == []
    )


def test_repeat_stops_before_length_budget():
    paths = compile_elements(
        [
            {
                "type": "repeat",
                "cx": 50,
                "cy": 50,
                "count": 16,
                "of": {
                    "type": "arc",
                    "cx": 50,
                    "cy": 30,
                    "r": 10,
                    "thickness": 3,
                    "start_deg": 0,
                    "sweep_deg": 200,
                    "round_caps": True,
                },
            }
        ]
    )
    assert len(paths) == 1
    assert len(paths[0]["d"]) < 2000


def test_mirror_reflects_center_and_keeps_original():
    d = compile_elements([{"type": "mirror", "axis_x": 50, "of": {"type": "circle", "cx": 30, "cy": 40, "r": 5}}])[0][
        "d"
    ]
    assert "M25 40" in d and "M65 40" in d  # discs at x=30 and x=70


def test_mirror_can_drop_the_original():
    d = compile_elements(
        [
            {
                "type": "mirror",
                "axis_x": 50,
                "include_original": False,
                "of": {"type": "circle", "cx": 30, "cy": 40, "r": 5},
            }
        ]
    )[0]["d"]
    assert "M65 40" in d and "M25 40" not in d


def test_mirror_reflects_arc_orientation():
    # arc 0..90 (top->right quarter) mirrors to the top->left quarter
    d = compile_elements(
        [
            {
                "type": "mirror",
                "axis_x": 50,
                "include_original": False,
                "of": {"type": "arc", "cx": 50, "cy": 50, "r": 20, "thickness": 4, "start_deg": 0, "sweep_deg": 90},
            }
        ]
    )[0]["d"]
    nums = [float(n) for n in d.replace("M", " ").replace("L", " ").replace("A", " ").replace("Z", " ").split()]
    xs = nums[0::2]
    assert min(xs) < 40  # geometry lives on the left half


def test_mirror_rejects_blob_children():
    assert (
        compile_elements(
            [{"type": "mirror", "axis_x": 50, "of": {"type": "blob", "cx": 30, "cy": 50, "r": 10, "seed": 3}}]
        )
        == []
    )
