"""Migration parity + v2 validation for the Logo Studio recipe.

KEEP IN SYNC: the V1/V2 parity fixture mirrors
frontend-customer/src/lib/logo/__tests__/migrate.test.ts exactly.
"""

import copy

import pytest
from rest_framework import serializers as drf_serializers

from apps.tenant_config.logo_recipe import upgrade_recipe, validate_recipe

V1 = {
    "version": 1,
    "layout": "badge_name",
    "name": "Zeynep Yoga",
    "mark": {"type": "icon", "icon": "flower-2"},
    "badge": "circle",
    "font": "Playfair Display",
    "colors": {"badge_bg": "#7c3aed", "mark_fg": "#ffffff", "text": "#111827"},
    "overrides": {"mark_offset": [4, -2], "mark_scale": 1.2, "name_offset": [0, 0], "name_scale": 0.9},
}

V2 = {
    "version": 2,
    "layout": "horizontal",
    "name": "Zeynep Yoga",
    "tagline": "",
    "mark": {"type": "icon", "icon": "flower-2", "style": "outline"},
    "badge": {"shape": "circle", "outline": False},
    "typography": {
        "name": {"font": "Playfair Display", "weight": 700, "tracking": 0, "case": "none"},
        "tagline": {"font": "Playfair Display", "weight": 500, "tracking": 0.08, "case": "upper"},
    },
    "colors": {
        "palette_id": None,
        "badge": {"type": "solid", "color": "#7c3aed"},
        "mark": "#ffffff",
        "text": "#111827",
        "tagline": "#6b7280",
    },
    "elements": {
        "mark": {"offset": [4, -2], "scale": 1.2},
        "name": {"offset": [0, 0], "scale": 0.9},
        "tagline": {"offset": [0, 0], "scale": 1},
    },
}


def _valid():
    """Fresh deep copy of the canonical valid v2 recipe, safe to mutate."""
    return copy.deepcopy(V2)


def test_upgrade_matches_ts_parity_fixture():
    assert upgrade_recipe(V1) == V2


def test_upgrade_passes_v2_through():
    assert upgrade_recipe(V2) == V2


def test_upgrade_icon_name_and_initials_and_image():
    out = upgrade_recipe({**V1, "layout": "icon_name", "badge": "none", "mark": {"type": "initials"}})
    assert out["layout"] == "horizontal"
    assert out["badge"] == {"shape": "none", "outline": False}
    assert out["mark"] == {"type": "initials", "style": "plain"}
    out = upgrade_recipe({**V1, "layout": "name_only", "mark": {"type": "image", "photo_id": "abc", "url": "x"}})
    assert out["layout"] == "name_only"
    assert out["mark"]["type"] == "image"


def test_validate_recipe_shapes_valid_v2():
    # Input stays v2 (compat) but validate_recipe's output is always v3.
    shaped = validate_recipe(V2)
    assert shaped == {**V2, "version": 3, "mark": {"type": "icon", "icon": "flower-2", "style": "outline"}}


def test_validate_recipe_rejects_bad_enums():
    for patch in (
        {"layout": "diagonal"},
        {"badge": {"shape": "star", "outline": False}},
        {"mark": {"type": "hologram"}},
        {"mark": {"type": "icon", "icon": "flower-2", "style": "3d"}},
        {"mark": {"type": "initials", "style": "cursive"}},
        {"mark": {"type": "abstract", "family": "fractal", "seed": 1}},
        {"colors": {**V2["colors"], "badge": {"type": "conic", "color": "#fff"}}},
    ):
        with pytest.raises(drf_serializers.ValidationError):
            validate_recipe({**V2, **patch})


def test_validate_recipe_clamps_freeform_values():
    noisy = {
        **V2,
        "name": "x" * 300,
        "tagline": "y" * 300,
        "typography": {
            "name": {"font": "F" * 300, "weight": 900, "tracking": 9, "case": "sideways"},
            "tagline": {"font": "", "weight": "bold", "tracking": -9, "case": "upper"},
        },
        "colors": {**V2["colors"], "mark": "purple", "text": None, "tagline": 5, "palette_id": "p" * 99},
        "elements": {
            "mark": {"offset": [999, -999], "scale": 99},
            "name": {"offset": "junk", "scale": None},
            "tagline": {"offset": [1, 2], "scale": 0.01},
        },
    }
    shaped = validate_recipe(noisy)
    assert len(shaped["name"]) == 80 and len(shaped["tagline"]) == 120
    assert shaped["typography"]["name"]["weight"] == 700  # unknown weight -> default
    assert shaped["typography"]["name"]["case"] == "none"
    assert shaped["typography"]["name"]["tracking"] == 0.4  # clamped to max
    assert shaped["typography"]["tagline"]["tracking"] == -0.1  # clamped to min
    assert shaped["colors"]["mark"] == "#ffffff" and shaped["colors"]["text"] == "#111827"
    assert shaped["colors"]["palette_id"] is None  # unknown/overlong id -> null
    assert shaped["elements"]["mark"] == {"offset": [120, -120], "scale": 3.0}
    assert shaped["elements"]["name"] == {"offset": [0, 0], "scale": 1.0}
    assert shaped["elements"]["tagline"]["scale"] == 0.4


def test_validate_recipe_abstract_seed_clamped_to_int():
    shaped = validate_recipe({**V2, "mark": {"type": "abstract", "family": "bloom", "seed": 7.9}})
    assert shaped["mark"] == {"type": "abstract", "family": "bloom", "seed": 7}
    shaped = validate_recipe({**V2, "mark": {"type": "abstract", "family": "bloom", "seed": "x"}})
    assert shaped["mark"]["seed"] == 1


# ── AI Brand Pack: "custom" mark type (bespoke SVG path marks) ─────────────


def test_validate_recipe_custom_mark_valid_paths():
    shaped = validate_recipe(
        {
            **V2,
            "mark": {
                "type": "custom",
                "rationale": "A rising line evokes progress.",
                "paths": [
                    {"d": "M10 10 L90 90 Z", "fill": "mark2", "opacity": 0.8},
                    {"d": "M0 0 H100 V100 Z"},
                ],
            },
        }
    )
    assert shaped["mark"] == {
        "type": "custom",
        "rationale": "A rising line evokes progress.",
        "paths": [
            {"d": "M10 10 L90 90 Z", "fill": "mark2", "opacity": 0.8},
            {"d": "M0 0 H100 V100 Z", "fill": "mark"},
        ],
    }


def test_validate_recipe_custom_mark_drops_injection_paths():
    shaped = validate_recipe(
        {
            **V2,
            "mark": {
                "type": "custom",
                "paths": [
                    {"d": "M0 0 L10 10 Z"},
                    {"d": "M0 0 url(javascript:alert(1))"},
                    {"d": "<script>alert(1)</script>"},
                ],
            },
        }
    )
    assert shaped["mark"]["paths"] == [{"d": "M0 0 L10 10 Z", "fill": "mark"}]


def test_validate_recipe_custom_mark_degrades_when_all_paths_invalid():
    shaped = validate_recipe({**V2, "mark": {"type": "custom", "paths": [{"d": "javascript:alert(1)"}]}})
    assert shaped["mark"] == {"type": "initials", "style": "plain"}


def test_validate_recipe_custom_mark_degrades_when_paths_empty():
    shaped = validate_recipe({**V2, "mark": {"type": "custom", "paths": []}})
    assert shaped["mark"] == {"type": "initials", "style": "plain"}


def test_validate_recipe_custom_mark_caps_path_count():
    paths = [{"d": f"M{i} {i} L{i + 1} {i + 1} Z"} for i in range(12)]
    shaped = validate_recipe({**V2, "mark": {"type": "custom", "paths": paths}})
    assert len(shaped["mark"]["paths"]) == 8


def test_validate_recipe_custom_mark_drops_overlong_path():
    long_d = "M" + "1 " * 1200  # > 2000 chars
    shaped = validate_recipe({**V2, "mark": {"type": "custom", "paths": [{"d": long_d}, {"d": "M0 0 Z"}]}})
    assert shaped["mark"]["paths"] == [{"d": "M0 0 Z", "fill": "mark"}]


def test_validate_recipe_custom_mark_opacity_clamped():
    shaped = validate_recipe({**V2, "mark": {"type": "custom", "paths": [{"d": "M0 0 Z", "opacity": 5}]}})
    assert shaped["mark"]["paths"][0]["opacity"] == 1.0


def test_validate_recipe_custom_mark_fill_rule_clamped():
    shaped = validate_recipe(
        {
            **V2,
            "mark": {
                "type": "custom",
                "paths": [
                    {"d": "M0 0 Z", "fill_rule": "evenodd"},
                    {"d": "M1 1 Z", "fill_rule": "spiral"},
                    {"d": "M2 2 Z"},
                ],
            },
        }
    )
    assert shaped["mark"]["paths"][0] == {"d": "M0 0 Z", "fill": "mark", "fill_rule": "evenodd"}
    # unknown fill_rule -> omitted (renderer defaults to nonzero), not rejected
    assert "fill_rule" not in shaped["mark"]["paths"][1]
    assert "fill_rule" not in shaped["mark"]["paths"][2]


def test_validate_recipe_custom_mark_unknown_fill_role_clamped():
    shaped = validate_recipe({**V2, "mark": {"type": "custom", "paths": [{"d": "M0 0 Z", "fill": "rainbow"}]}})
    assert shaped["mark"]["paths"][0]["fill"] == "mark"


def test_validate_recipe_custom_mark_rationale_clamped():
    shaped = validate_recipe(
        {
            **V2,
            "mark": {
                "type": "custom",
                "rationale": "x" * 300,
                "paths": [{"d": "M0 0 Z"}],
            },
        }
    )
    assert len(shaped["mark"]["rationale"]) == 200


def test_validate_recipe_colors_mark2_and_accent_optional():
    shaped = validate_recipe(V2)
    assert "mark2" not in shaped["colors"]
    assert "mark_accent" not in shaped["colors"]

    shaped2 = validate_recipe({**V2, "colors": {**V2["colors"], "mark2": "#ff00ff", "mark_accent": "purple"}})
    assert shaped2["colors"]["mark2"] == "#ff00ff"
    # invalid hex -> defaults to the shaped mark color, not left as "purple"
    assert shaped2["colors"]["mark_accent"] == shaped2["colors"]["mark"]


# ── Recipe v3: mark colors accept a shaped Fill (solid/linear/radial) ──────


class TestMarkFillV3:
    def test_output_is_version_3(self):
        assert validate_recipe(_valid())["version"] == 3

    def test_string_mark_color_passes_through(self):
        shaped = validate_recipe(_valid())
        assert shaped["colors"]["mark"] == _valid()["colors"]["mark"]

    def test_linear_fill_mark_color_is_shaped(self):
        recipe = _valid()
        recipe["colors"]["mark"] = {"type": "linear", "from": "#112233", "to": "#445566", "angle": 45}
        shaped = validate_recipe(recipe)
        assert shaped["colors"]["mark"] == {"type": "linear", "from": "#112233", "to": "#445566", "angle": 45}

    def test_malformed_fill_falls_back_to_default_hex(self):
        recipe = _valid()
        recipe["colors"]["mark"] = {"type": "conic", "junk": True}
        shaped = validate_recipe(recipe)
        assert shaped["colors"]["mark"] == "#ffffff"

    def test_gradient_angle_clamped(self):
        recipe = _valid()
        recipe["colors"]["mark"] = {"type": "linear", "from": "#112233", "to": "#445566", "angle": 9999}
        assert validate_recipe(recipe)["colors"]["mark"]["angle"] == 360
