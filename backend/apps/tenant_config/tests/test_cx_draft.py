"""The model answers flat (parent ids); assemble() rebuilds the tree."""

from apps.tenant_config.cx.draft import CxDraft, assemble
from apps.tenant_config.cx.prompt import EXEMPLAR
from apps.tenant_config.cx.validate import validate_spec
from apps.tenant_config.tests.cx_fixtures import ITINERARY_SPEC

BASE = {
    "name": "Test",
    "summary": "",
    "fields": [
        {"name": "heading", "type": "text", "label": "Heading", "max": 80, "required": True},
        {"name": "days", "type": "items", "label": "Days"},
        {"name": "title", "parent": "days", "type": "text", "label": "Title"},
    ],
}


def test_the_prompt_example_assembles_to_the_canonical_itinerary():
    raw, content = assemble(CxDraft.model_validate(EXEMPLAR))
    spec, errors = validate_spec(raw)
    assert errors == []
    assert spec == ITINERARY_SPEC
    assert content["heading"] == "How the week unfolds"
    assert [d["title"] for d in content["days"]] == ["Arrive and settle", "Find your rhythm", "Go home lighter"]


def test_children_keep_their_listed_order_and_item_slots():
    draft = CxDraft.model_validate(
        {
            **BASE,
            "nodes": [
                {"id": "s", "t": "Section"},
                {"id": "g", "parent": "s", "t": "Grid", "props": [{"name": "each", "value": "days"}]},
                {"id": "o", "parent": "s", "t": "Opener"},
                {
                    "id": "h",
                    "parent": "g",
                    "slot": "item",
                    "t": "Heading",
                    "props": [{"name": "bind", "value": "$.title"}],
                },
            ],
        }
    )
    raw, _ = assemble(draft)
    assert raw["tree"] == {
        "t": "Section",
        "children": [{"t": "Grid", "each": "days", "item": [{"t": "Heading", "bind": "$.title"}]}, {"t": "Opener"}],
    }
    assert raw["fields"]["days"]["fields"] == {"title": {"type": "text", "label": "Title"}}


def test_cycles_orphans_and_reserved_prop_names_are_ignored():
    draft = CxDraft.model_validate(
        {
            **BASE,
            "nodes": [
                {
                    "id": "s",
                    "t": "Section",
                    "props": [{"name": "t", "value": "Script"}, {"name": "children", "value": "x"}],
                },
                {"id": "a", "parent": "b", "t": "Stack"},
                {"id": "b", "parent": "a", "t": "Stack"},
                {"id": "o", "parent": "s", "t": "Opener"},
                {"id": "x", "parent": "missing", "t": "Text"},
            ],
        }
    )
    raw, _ = assemble(draft)
    assert raw["tree"] == {"t": "Section", "children": [{"t": "Opener"}]}


def test_props_are_coerced_by_the_catalog():
    draft = CxDraft.model_validate(
        {
            **BASE,
            "nodes": [
                {"id": "g", "t": "Grid", "props": [{"name": "cols", "value": "4"}]},
                {"id": "i", "parent": "g", "slot": "item", "t": "Img", "props": [{"name": "aspect", "value": "1.25"}]},
                {"id": "t", "parent": "g", "slot": "item", "t": "Text", "props": [{"name": "muted", "value": "TRUE"}]},
                {
                    "id": "l",
                    "parent": "g",
                    "slot": "item",
                    "t": "Layout",
                    "props": [{"name": "map", "value": "heading=heading, items=days"}],
                },
            ],
        }
    )
    raw, _ = assemble(draft)
    grid = raw["tree"]
    assert grid["cols"] == 4
    assert grid["item"][0]["aspect"] == 1.25
    assert grid["item"][1]["muted"] is True
    assert grid["item"][2]["map"] == {"heading": "heading", "items": "days"}


def test_no_root_means_no_tree():
    draft = CxDraft.model_validate({**BASE, "nodes": [{"id": "o", "parent": "s", "t": "Opener"}]})
    raw, _ = assemble(draft)
    assert raw["tree"] is None
    assert validate_spec(raw)[0] is None
