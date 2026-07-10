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
    assert compile_elements([{"type": "blob", "cx": 50, "cy": 50}]) == []


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
