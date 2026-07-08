"""Migration parity + v2 validation for the Logo Studio recipe.

KEEP IN SYNC: the V1/V2 parity fixture mirrors
frontend-customer/src/lib/logo/__tests__/migrate.test.ts exactly.
"""

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
    shaped = validate_recipe(V2)
    assert shaped == {**V2, "mark": {"type": "icon", "icon": "flower-2", "style": "outline"}}


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
