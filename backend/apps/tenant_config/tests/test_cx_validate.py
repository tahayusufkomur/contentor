"""CSL v1 validator: the trust boundary every AI-built section crosses."""

import copy

from apps.tenant_config.cx.validate import validate_spec
from apps.tenant_config.tests.cx_fixtures import ITINERARY_SPEC


def _spec(**changes):
    spec = copy.deepcopy(ITINERARY_SPEC)
    spec.update(changes)
    return spec


def _kids(spec):
    return [c["t"] for c in spec["tree"]["children"]]


def test_canonical_spec_is_a_fixed_point():
    spec, errors = validate_spec(ITINERARY_SPEC)
    assert errors == []
    assert spec == ITINERARY_SPEC
    assert validate_spec(spec) == (spec, [])


def test_missing_props_get_catalog_defaults():
    spec, errors = validate_spec(_spec(tree={"t": "Section", "children": [{"t": "Opener"}]}))
    assert errors == []
    assert spec["tree"] == {"t": "Section", "tone": "base", "width": "wrap", "children": [{"t": "Opener"}]}


def test_unknown_primitives_and_props_are_dropped():
    raw = _spec(
        tree={
            "t": "Section",
            "className": "bg-red-500",
            "style": {"color": "red"},
            "children": [{"t": "Opener", "html": "<script>"}, {"t": "Script", "src": "x.js"}],
        }
    )
    spec, errors = validate_spec(raw)
    assert spec["tree"] == {"t": "Section", "tone": "base", "width": "wrap", "children": [{"t": "Opener"}]}
    assert any("Script" in e for e in errors)


def test_bind_to_an_undeclared_field_drops_the_node():
    spec, errors = validate_spec(
        _spec(tree={"t": "Section", "children": [{"t": "Opener"}, {"t": "Text", "bind": "nope"}]})
    )
    assert _kids(spec) == ["Opener"]
    assert any("nope" in e for e in errors)


def test_item_binds_only_work_inside_an_item_template():
    spec, _ = validate_spec(
        _spec(tree={"t": "Section", "children": [{"t": "Opener"}, {"t": "Heading", "bind": "$.title"}]})
    )
    assert _kids(spec) == ["Opener"]


def test_opener_needs_a_heading_field():
    fields = {k: v for k, v in ITINERARY_SPEC["fields"].items() if k != "heading"}
    spec, errors = validate_spec(_spec(fields=fields, tree={"t": "Section", "children": [{"t": "Opener"}]}))
    assert spec is None
    assert any("heading" in e for e in errors)


def test_root_must_be_a_band_or_sequence():
    assert validate_spec(_spec(tree={"t": "Opener"}))[0] is None


def test_bands_cannot_nest_inside_a_section():
    raw = _spec(tree={"t": "Section", "children": [{"t": "Opener"}, {"t": "Section", "children": [{"t": "Opener"}]}]})
    spec, errors = validate_spec(raw)
    assert _kids(spec) == ["Opener"]
    assert any("not allowed" in e for e in errors)


def test_split_needs_two_children():
    raw = _spec(tree={"t": "Section", "children": [{"t": "Split", "children": [{"t": "Opener"}]}, {"t": "Opener"}]})
    spec, _ = validate_spec(raw)
    assert _kids(spec) == ["Opener"]


def test_numbers_are_clamped_and_bad_enums_fall_back():
    raw = _spec(
        tree={
            "t": "Section",
            "tone": "neon",
            "children": [
                {"t": "Opener"},
                {"t": "Grid", "each": "days", "cols": 99, "item": [{"t": "Heading", "bind": "$.title", "level": "7"}]},
            ],
        }
    )
    spec, errors = validate_spec(raw)
    grid = spec["tree"]["children"][1]
    assert spec["tree"]["tone"] == "base"
    assert grid["cols"] == 6
    assert grid["item"][0]["level"] == 4
    assert any("neon" in e for e in errors)


def test_too_many_nodes_are_cut_off_once():
    kids = [{"t": "Opener"}] + [{"t": "Label", "bind": "kicker"} for _ in range(500)]
    spec, errors = validate_spec(_spec(tree={"t": "Section", "children": kids}))
    assert len(spec["tree"]["children"]) == 149  # 150 nodes including the Section
    assert errors.count("the tree has too many nodes") == 1


def test_deep_trees_are_cut_off():
    node = {"t": "Opener"}
    for _ in range(12):
        node = {"t": "Stack", "children": [node]}
    spec, _ = validate_spec(_spec(tree={"t": "Section", "children": [{"t": "Opener"}, node]}))
    assert _kids(spec) == ["Opener"]


def test_field_rules():
    raw = _spec(
        fields={
            "heading": {"type": "text", "label": "Heading", "max": 99999},
            "id": {"type": "text"},
            "Bad Name": {"type": "text"},
            "script": {"type": "html"},
            "list": {"type": "items", "fields": {"body": {"type": "richtext"}}},
        },
        tree={"t": "Section", "children": [{"t": "Opener"}]},
    )
    spec, errors = validate_spec(raw)
    assert spec["fields"] == {
        "heading": {"type": "text", "label": "Heading", "max": 600},
        "kicker": {"type": "text", "label": "Kicker", "max": 40},  # an Opener always brings these two
        "intro": {"type": "text", "label": "Intro", "max": 220},
    }
    assert len(errors) == 5  # reserved name, bad name, unknown type, richtext in items, empty items


def test_layout_maps_only_compatible_fields():
    fields = {
        "heading": {"type": "text", "label": "Heading", "max": 80},
        "photo": {"type": "image", "label": "Photo"},
        "perks": {"type": "items", "label": "Perks", "fields": {"title": {"type": "text", "label": "Title"}}},
    }
    raw = _spec(
        fields=fields,
        tree={
            "t": "Layout",
            "family": "benefits",
            "map": {"heading": "heading", "intro": "photo", "items": "perks", "nope": "heading"},
        },
    )
    spec, errors = validate_spec(raw)
    assert spec["tree"] == {
        "t": "Layout",
        "family": "benefits",
        "variant": "auto",
        "map": {"heading": "heading", "items": "perks"},
    }
    assert len(errors) == 2


def test_layout_of_a_dynamic_family_needs_its_source():
    tree = {"t": "Layout", "family": "pricing", "map": {"heading": "heading"}}
    assert validate_spec(_spec(tree=tree))[0] is None
    spec, _ = validate_spec(_spec(dynamic="plans", tree=tree))
    assert spec["tree"]["family"] == "pricing" and spec["dynamic"] == "plans"


def test_oversized_specs_are_refused():
    subs = {f"f{i}": {"type": "image", "label": "L" * 40, "role": "r" * 120} for i in range(24)}
    fields = {
        "heading": ITINERARY_SPEC["fields"]["heading"],
        **{f"list{i}": {"type": "items", "label": "List", "fields": subs} for i in range(20)},
    }
    spec, errors = validate_spec(_spec(fields=fields, tree={"t": "Section", "children": [{"t": "Opener"}]}))
    assert spec is None
    assert errors[-1] == "the section is too large"


def test_garbage_never_raises():
    garbage = [
        None,
        [],
        "x",
        5,
        {"tree": [1, 2]},
        {"tree": {"t": ["Section"]}},
        {"fields": [1], "tree": {"t": "Section", "children": "nope"}},
        {"fields": {}, "tree": {"t": "Section", "children": [{"t": "Grid", "each": {"a": 1}, "item": []}]}},
        {"fields": {}, "tree": {"t": "Section", "children": [{"t": "Icon", "name": ["x"]}]}},
        {"fields": {}, "tree": {"t": "Layout", "family": {"x": 1}}},
    ]
    for raw in garbage:
        assert validate_spec(raw)[0] is None, raw


def test_a_text_field_never_fills_a_richtext_slot():
    # richtext slots render as raw HTML; a text field is never sanitised.
    fields = {
        "heading": {"type": "text", "label": "Heading", "max": 80},
        "story": {"type": "text", "label": "Story", "max": 600},
    }
    tree = {"t": "Layout", "family": "story", "map": {"heading": "heading", "body": "story"}}
    spec, errors = validate_spec(_spec(fields=fields, tree=tree))
    assert spec["tree"]["map"] == {"heading": "heading"}
    assert any("cannot fill body" in e for e in errors)


def test_layout_variant_must_be_a_real_variant_name():
    fields = {"heading": {"type": "text", "label": "Heading", "max": 80}}
    for bad in ("constructor", "__proto__", "<x>"):
        tree = {"t": "Layout", "family": "benefits", "variant": bad, "map": {"heading": "heading"}}
        assert validate_spec(_spec(fields=fields, tree=tree))[0]["tree"]["variant"] == "auto", bad
    tree = {"t": "Layout", "family": "benefits", "variant": "edit", "map": {"heading": "heading"}}
    assert validate_spec(_spec(fields=fields, tree=tree))[0]["tree"]["variant"] == "edit"


def test_layout_items_need_matching_sub_field_types():
    fields = {
        "heading": {"type": "text", "label": "Heading", "max": 80},
        "perks": {"type": "items", "label": "Perks", "fields": {"title": {"type": "image", "label": "Title"}}},
    }
    tree = {"t": "Layout", "family": "benefits", "map": {"heading": "heading", "items": "perks"}}
    spec, _ = validate_spec(_spec(fields=fields, tree=tree))
    assert spec["tree"]["map"] == {"heading": "heading"}
