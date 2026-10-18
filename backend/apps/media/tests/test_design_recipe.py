"""The cover recipe validator, and the one database rule of a Design.

KEEP IN SYNC: frontend-customer/src/types/design.ts and src/lib/covers/recipe.ts mirror the shape and
the defaults asserted here.
"""

import copy
import uuid

import pytest
from django.db import IntegrityError, transaction
from rest_framework.serializers import ValidationError

from apps.media.design_recipe import MAX_EXTRAS, validate_recipe
from apps.media.models import Design

PHOTO = str(uuid.uuid4())
FRAME = {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.1}


def clean(recipe, photo_exists=lambda _photo_id: True):
    return validate_recipe(recipe, photo_exists=photo_exists)


def text_extra(layer_id, **fields):
    return {"id": layer_id, "type": "text", "text": "Hi", "frame": FRAME, **fields}


def test_minimal_recipe_is_completed_with_defaults():
    assert clean({}) == {
        "version": 1,
        "layout": "panel",
        "photo": {
            "id": None,
            "focus": [0.5, 0.5],
            "zoom": 1,
            "brightness": 1,
            "contrast": 1,
            "saturation": 1,
            "darken": 0,
        },
        "words": {"label": "", "title": None, "subtitle": ""},
        "badge": {"kind": "none", "text": "", "fill": "accent"},
        "logo": True,
        "panel": "primary",
        "styles": {},
        "extras": [],
        "overrides": {},
    }


def test_rejects_unknown_layout_and_paint():
    with pytest.raises(ValidationError):
        clean({"layout": "poster"})
    with pytest.raises(ValidationError):
        clean({"panel": "teal"})
    assert clean({"panel": "#1E5AA8"})["panel"] == "#1E5AA8"
    assert clean({"layout": "band", "panel": "inverse-ink"})["panel"] == "inverse-ink"


@pytest.mark.parametrize(
    "paint", ["teal", "#12345", "#1234567", "#GGGGGG", "1E5AA8", "#1E5AA8\n", "", 7, None, ["ink"]]
)
def test_every_paint_slot_rejects_a_bad_colour(paint):
    shape = {"id": "s1", "type": "shape", "shape": "rect", "fill": paint, "frame": FRAME}
    for recipe in (
        {"panel": paint},
        {"badge": {"fill": paint}},
        {"styles": {"title": {"color": paint}}},
        {"extras": [shape]},
    ):
        with pytest.raises(ValidationError):
            clean(recipe)


def test_title_capped_at_90_and_turkish_kept():
    assert clean({"words": {"title": "x" * 120}})["words"]["title"] == "x" * 90
    turkish = "Şükran ğüş ıİ"
    words = clean({"words": {"label": turkish, "title": f"  {turkish}  ", "subtitle": turkish}})["words"]
    assert words == {"label": turkish, "title": turkish, "subtitle": turkish}
    assert clean({"words": {"title": " \n "}})["words"]["title"] is None


def test_text_loses_a_nul_and_a_lone_surrogate():
    """Both are valid JSON, but Postgres refuses the first in a jsonb column and UTF-8 the second."""
    dirty = "Sp\x00ring \ud800sale\udfff 😀"
    out = clean(
        {
            "words": {"label": dirty, "title": dirty, "subtitle": dirty},
            "badge": {"kind": "text", "text": dirty},
            "extras": [text_extra("t1", text=dirty), {"id": "b1", "type": "badge", "text": dirty, "frame": FRAME}],
        }
    )
    texts = [*out["words"].values(), out["badge"]["text"], *(extra["text"] for extra in out["extras"])]
    assert texts == ["Spring sale 😀"] * 6  # the emoji is one character, and stays
    assert clean(out) == out
    assert clean({"words": {"title": "\x00 \ud800"}})["words"]["title"] is None  # nothing left of it


def test_every_text_is_cut_to_its_limit():
    long = "ç" * 200
    out = clean(
        {
            "words": {"label": long, "subtitle": long},
            "badge": {"kind": "text", "text": long},
            "extras": [text_extra("t1", text=long), {"id": "b1", "type": "badge", "text": long, "frame": FRAME}],
        }
    )
    assert len(out["words"]["label"]) == 40
    assert len(out["words"]["subtitle"]) == 140
    assert len(out["badge"]["text"]) == 24
    assert [len(e["text"]) for e in out["extras"]] == [140, 24]


def test_clamps_numbers():
    photo = clean(
        {"photo": {"zoom": 9, "darken": -1, "brightness": 0, "contrast": 2, "saturation": 1.2, "focus": [2, -1]}}
    )["photo"]
    assert photo["zoom"] == 3
    assert photo["darken"] == 0
    assert photo["brightness"] == 0.5
    assert photo["contrast"] == 1.5
    assert photo["saturation"] == 1.2
    assert photo["focus"] == [1, 0]


@pytest.mark.parametrize("junk", ["big", "2", None, True, [], {}, float("nan"), float("inf"), 10**400])
def test_a_non_number_takes_the_default(junk):
    photo = clean({"photo": {"zoom": junk, "darken": junk, "focus": [junk, 0.2]}})["photo"]
    assert (photo["zoom"], photo["darken"], photo["focus"]) == (1, 0, [0.5, 0.2])


@pytest.mark.parametrize("focus", ["left", [0.2], [0.1, 0.2, 0.3], None])
def test_a_malformed_focus_takes_the_default(focus):
    assert clean({"photo": {"focus": focus}})["photo"]["focus"] == [0.5, 0.5]


def test_foreign_photo_rejected():
    with pytest.raises(ValidationError):
        clean({"photo": {"id": PHOTO}}, photo_exists=lambda _photo_id: False)


def test_photo_is_looked_up_by_its_canonical_id():
    seen = []
    out = clean({"photo": {"id": PHOTO.upper()}}, photo_exists=lambda photo_id: seen.append(photo_id) or True)
    assert out["photo"]["id"] == PHOTO
    assert seen == [PHOTO]


def never_asked(_photo_id):
    raise AssertionError("photo_exists was called")


@pytest.mark.parametrize("bad", ["", "not-a-uuid", 12, ["x"], {"id": 1}, True])
def test_malformed_photo_id_is_rejected_before_any_lookup(bad):
    with pytest.raises(ValidationError):
        clean({"photo": {"id": bad}}, photo_exists=never_asked)


def test_no_photo_needs_no_lookup():
    assert clean({"photo": {"id": None}}, photo_exists=never_asked)["photo"]["id"] is None


def test_extras_capped_and_overrides_need_known_ids():
    full = [text_extra(f"x{i}") for i in range(MAX_EXTRAS)]
    assert len(clean({"extras": full})["extras"]) == MAX_EXTRAS
    with pytest.raises(ValidationError):
        clean({"extras": [*full, text_extra("x12")]})
    overrides = {
        "card": {"x0": FRAME, "zz": FRAME, "title": FRAME},
        "poster": {"x0": FRAME},
    }
    assert clean({"extras": full[:1], "overrides": overrides})["overrides"] == {"card": {"x0": FRAME, "title": FRAME}}


def test_an_override_frame_is_clamped_and_must_be_whole():
    out = clean({"overrides": {"wide": {"title": {"x": 9, "y": -9, "w": 0, "h": 9}}}})
    assert out["overrides"] == {"wide": {"title": {"x": 1.5, "y": -0.5, "w": 0.02, "h": 2}}}
    with pytest.raises(ValidationError):
        clean({"overrides": {"wide": {"title": {"x": 0.1, "y": 0.1, "w": 0.5}}}})


@pytest.mark.parametrize("layer_id", ["", "Bad", "has space", "a" * 25, "title", "badge", 7, None])
def test_extra_ids_are_checked(layer_id):
    with pytest.raises(ValidationError):
        clean({"extras": [text_extra(layer_id)]})


def test_duplicate_extra_ids_are_rejected():
    with pytest.raises(ValidationError):
        clean({"extras": [text_extra("a1"), text_extra("a1")]})


def test_extras_are_shaped_by_their_type():
    extras = clean(
        {
            "extras": [
                text_extra("t1", text="é" * 200, style={"scale": 9, "weight": 800, "junk": 1}),
                text_extra("t2"),
                {"id": "b1", "type": "badge", "text": "Sold out", "frame": FRAME},
                {
                    "id": "s1",
                    "type": "shape",
                    "shape": "arch",
                    "opacity": 0,
                    "frame": {"x": 9, "y": -9, "w": 0, "h": 9},
                },
                {"id": "s2", "type": "shape", "shape": "line", "fill": "#1E5AA8", "frame": FRAME},
            ]
        }
    )["extras"]
    assert extras == [
        {"id": "t1", "type": "text", "text": "é" * 140, "style": {"scale": 2, "weight": 800}, "frame": FRAME},
        {"id": "t2", "type": "text", "text": "Hi", "style": {}, "frame": FRAME},
        {"id": "b1", "type": "badge", "text": "Sold out", "fill": "accent", "frame": FRAME},
        {
            "id": "s1",
            "type": "shape",
            "shape": "arch",
            "fill": "accent",
            "opacity": 0.1,
            "frame": {"x": 1.5, "y": -0.5, "w": 0.02, "h": 2},
        },
        {"id": "s2", "type": "shape", "shape": "line", "fill": "#1E5AA8", "opacity": 1, "frame": FRAME},
    ]


@pytest.mark.parametrize(
    "extra",
    [
        {"id": "a1", "type": "photo", "frame": FRAME},
        {"id": "a1", "type": "text", "text": "Hi"},
        {"id": "a1", "type": "text", "text": "Hi", "frame": {"x": 0.1}},
        {"id": "a1", "type": "text", "text": "Hi", "frame": "wide"},
        {"id": "a1", "type": "text", "text": "Hi", "frame": FRAME, "style": {"align": "justify"}},
        {"id": "a1", "type": "shape", "shape": "star", "frame": FRAME},
        {"id": "a1", "type": "badge", "fill": "teal", "frame": FRAME},
        "not an object",
    ],
)
def test_a_bad_extra_is_rejected(extra):
    with pytest.raises(ValidationError):
        clean({"extras": [extra]})


def test_styles_keep_known_parts_and_shape_their_keys():
    styles = clean(
        {
            "styles": {
                "title": {
                    "scale": 0.1,
                    "weight": 700,
                    "upper": True,
                    "tracking": 1,
                    "leading": 1.2,
                    "align": "center",
                    "color": "#1E5AA8",
                    "font": "body",
                    "hidden": False,
                    "junk": 1,
                },
                "subtitle": {"scale": "big", "upper": "yes"},
                "logo": {"hidden": True},
                "ghost": {"scale": 1},
                "label": "bold",
            }
        }
    )["styles"]
    assert styles == {
        "title": {
            "scale": 0.5,
            "weight": 700,
            "upper": True,
            "tracking": 0.3,
            "leading": 1.2,
            "align": "center",
            "color": "#1E5AA8",
            "font": "body",
            "hidden": False,
        },
        "subtitle": {},
        "logo": {"hidden": True},
    }


@pytest.mark.parametrize(
    "style", [{"weight": 650}, {"weight": "700"}, {"align": "justify"}, {"align": None}, {"font": "mono"}]
)
def test_a_bad_style_enum_is_rejected(style):
    with pytest.raises(ValidationError):
        clean({"styles": {"title": style}})


def test_badge_kind_must_be_known():
    for kind in ("none", "new", "date", "live", "text"):
        assert clean({"badge": {"kind": kind}})["badge"]["kind"] == kind
    with pytest.raises(ValidationError):
        clean({"badge": {"kind": "sale"}})


def test_unknown_keys_are_dropped_and_the_version_is_pinned():
    junk = {"version": 7, "junk": 1, "photo": {"junk": 1}, "words": {"junk": 1}, "badge": {"junk": 1}}
    assert clean(junk) == clean({})


@pytest.mark.parametrize("junk", [[], "recipe", 3, None])
def test_the_recipe_must_be_an_object(junk):
    with pytest.raises(ValidationError):
        clean(junk)


def test_cleaning_twice_changes_nothing_and_never_touches_the_input():
    messy = {
        "layout": "band",
        "photo": {"id": PHOTO.upper(), "zoom": "2", "focus": [5, "x"]},
        "words": {"label": "  Spring  ", "title": "y" * 89 + " tail", "subtitle": "Ç" * 200},
        "badge": {"kind": "text", "text": "z" * 30, "fill": "#1E5AA8"},
        "logo": "no",
        "styles": {"title": {"scale": 9}, "x": {}},
        "extras": [text_extra("t1", text="  hi  "), {"id": "s1", "type": "shape", "shape": "line", "frame": FRAME}],
        "overrides": {"wide": {"t1": {"x": 7, "y": 7, "w": 7, "h": 7}, "zz": FRAME}},
    }
    snapshot = copy.deepcopy(messy)
    once = clean(messy)
    assert messy == snapshot
    assert once["words"]["title"] == "y" * 89
    assert clean(once) == once


@pytest.mark.django_db(transaction=True)
def test_only_one_design_is_kept_per_target(tenant_ctx):
    kept = {"kind": "cover", "target_kind": "course", "target_key": "7", "recipe": {}, "state": "kept"}
    Design.objects.create(**kept)
    for other in (
        {"state": "draft"},
        {"state": "retired"},
        {"target_key": "8"},
        {"target_kind": "live"},
        {"kind": "post"},
    ):
        Design.objects.create(**{**kept, **other})
    with pytest.raises(IntegrityError), transaction.atomic():
        Design.objects.create(**kept)
