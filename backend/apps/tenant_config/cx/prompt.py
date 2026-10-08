"""Prompts for AI components. The catalog part is generated from
primitives.json and families.json, so a new primitive reaches the model
with no prompt edit."""

from __future__ import annotations

import json
from functools import cache

from apps.tenant_config import sections

from .catalog import icons, limits, primitives

_RULES = """You design ONE custom section for a solo coach's website. You never write code: you compose the \
section from a fixed catalog of primitives, and the site draws them in the coach's chosen visual style. Never \
output HTML, CSS, class names, colours or fonts.

WHAT YOU RETURN
- name, summary: what the section is, in a few plain words.
- fields: the section's content contract. Each field has a name (camelCase, at most 24 characters, never id, \
type, variant, enabled, style or cx), a type, a label (plain words the coach sees in the editor), max (longest \
text) and required. Types: text, richtext, link, image, items. An items field is a repeatable list: give it min, \
max and item_label, and declare its sub-fields as separate entries with parent set to the items field's name \
(sub-field types: text, link, image). An image field needs role (what the photo should show) and aspect (1:1, \
4:5, 3:4, 2:3, 3:2, 4:3 or 16:9).
- nodes: the section as a flat list in reading order. Each node has an id (any short string), parent (the \
parent node's id, null for the one root), slot ("children", or "item" for the item template of Grid, Rows, \
Timeline and Steps), t (the primitive) and props as name/value strings.
- texts and lists: the words for your fields. texts holds text, richtext and link fields; lists holds items \
fields, one row per item with cells keyed by sub-field name. Leave image fields out: photos are chosen for you.
- missing_capabilities: short phrases for anything asked for that the catalog cannot express (for example \
"image carousel" or "countdown timer"). Build the closest thing you can anyway.

TREE RULES
- The root is a Section (usual), a Layout, or a Sequence of Sections and Layouts.
- Section and Layout are full-width bands. Everything else goes inside a Section; never put a band inside a \
Section.
- A bind prop names one of your fields. Inside an item template, "$.title" names the current item's title \
sub-field.
- Opener draws the style's own kicker, heading and intro, so declare fields kicker, heading (text, required) and \
intro, and open most sections with it.
- Use the style's hand-built layouts: when part of the request is a standard section (benefits, steps, FAQ, \
pricing, courses, events), add a Layout for it and build new structure only for what no family covers.
- In an inverse Section or Band, use Button variant onInverse.
- Keep it focused: one clear purpose, usually 3 to 7 items, at most {nodes} nodes and {depth} levels deep.

CONTENT RULES
- Write in the coach's voice from the facts you are given.
- Never invent credentials, testimonials, reviews, prices, numbers, dates, names or quotes. When a fact is \
unknown, write neutral words the coach can edit.
- Links are site paths (/courses, /about, /contact, /calendar, /events, /plans, /faq, /blog) or empty.
- No emoji, no hashtags."""

# The worked example in the prompt. Must assemble to a spec with no
# validation errors (test_cx_draft pins it to cx_fixtures.ITINERARY_SPEC).
EXEMPLAR = {
    "name": "Retreat itinerary",
    "summary": "Day-by-day plan of a multi-day retreat",
    "dynamic": None,
    "fields": [
        {"name": "kicker", "type": "text", "label": "Kicker", "max": 40},
        {"name": "heading", "type": "text", "label": "Heading", "max": 80, "required": True},
        {"name": "intro", "type": "text", "label": "Intro", "max": 220},
        {"name": "days", "type": "items", "label": "Days", "item_label": "Day", "min": 2, "max": 10},
        {"name": "when", "parent": "days", "type": "text", "label": "Day", "max": 24},
        {"name": "title", "parent": "days", "type": "text", "label": "Title", "max": 60, "required": True},
        {"name": "text", "parent": "days", "type": "text", "label": "Plan", "max": 220},
        {
            "name": "image",
            "parent": "days",
            "type": "image",
            "label": "Photo",
            "aspect": "3:2",
            "role": "a calm retreat scene for this day",
        },
    ],
    "nodes": [
        {"id": "band", "t": "Section", "props": [{"name": "tone", "value": "surface"}]},
        {"id": "open", "parent": "band", "t": "Opener"},
        {
            "id": "line",
            "parent": "band",
            "t": "Timeline",
            "props": [{"name": "each", "value": "days"}, {"name": "marker", "value": "num"}],
        },
        {"id": "when", "parent": "line", "slot": "item", "t": "Label", "props": [{"name": "bind", "value": "$.when"}]},
        {
            "id": "title",
            "parent": "line",
            "slot": "item",
            "t": "Heading",
            "props": [{"name": "bind", "value": "$.title"}, {"name": "level", "value": "3"}],
        },
        {
            "id": "plan",
            "parent": "line",
            "slot": "item",
            "t": "Text",
            "props": [{"name": "bind", "value": "$.text"}, {"name": "muted", "value": "true"}],
        },
        {
            "id": "photo",
            "parent": "line",
            "slot": "item",
            "t": "Img",
            "props": [
                {"name": "bind", "value": "$.image"},
                {"name": "treatment", "value": "frame"},
                {"name": "aspect", "value": "1.5"},
            ],
        },
    ],
    "texts": [
        {"field": "kicker", "value": "Seven days in Bali"},
        {"field": "heading", "value": "How the week unfolds"},
        {"field": "intro", "value": "Slow mornings, long practices and time to rest."},
    ],
    "lists": [
        {
            "field": "days",
            "rows": [
                {
                    "cells": [
                        {"key": "when", "value": "Day 1"},
                        {"key": "title", "value": "Arrive and settle"},
                        {"key": "text", "value": "Check in and an easy evening class."},
                    ]
                },
                {
                    "cells": [
                        {"key": "when", "value": "Day 2"},
                        {"key": "title", "value": "Find your rhythm"},
                        {"key": "text", "value": "Morning flow and an afternoon walk."},
                    ]
                },
                {
                    "cells": [
                        {"key": "when", "value": "Day 7"},
                        {"key": "title", "value": "Go home lighter"},
                        {"key": "text", "value": "A closing circle before goodbyes."},
                    ]
                },
            ],
        }
    ],
    "missing_capabilities": [],
}


def _prop_text(name, pdef) -> str:
    if "enum" in pdef:
        kind = "|".join(map(str, pdef["enum"]))
    elif "int" in pdef:
        kind = f"whole number {pdef['int'][0]}-{pdef['int'][1]}"
    elif "num" in pdef:
        kind = f"number {pdef['num'][0]}-{pdef['num'][1]}"
    elif "bool" in pdef:
        kind = "true|false"
    elif "bind" in pdef:
        kind = "your " + "/".join(pdef["bind"]) + " field" + (" (top level only)" if pdef.get("top") else "")
    elif "each" in pdef:
        kind = "your items field"
    elif "family" in pdef:
        kind = "family id"
    elif "icon" in pdef:
        kind = "icon name"
    elif "map" in pdef:
        kind = "familyField=yourField pairs, comma-separated"
    else:
        kind = "text"
    required = ", required" if pdef.get("required") else ""
    default = f", default {pdef['default']}" if "default" in pdef else ""
    return f"{name} ({kind}{required}{default})"


def catalog_text() -> str:
    lines = []
    for name, prim in primitives().items():
        props = "; ".join(_prop_text(k, v) for k, v in (prim.get("props") or {}).items()) or "no props"
        lines.append(
            f"- {name} [{prim['role']}, children: {prim.get('children', 'none')}] {props}. {prim.get('doc', '')}"
        )
    return "\n".join(lines)


def families_text() -> str:
    lines = []
    for family_id, family in sections.families().items():
        parts = []
        for name, spec in family["fields"].items():
            if spec["type"] == "items":
                subs = ", ".join(f"{k}:{v['type']}" for k, v in (spec.get("fields") or {}).items())
                parts.append(f"{name}:items[{subs}]")
            else:
                parts.append(f"{name}:{spec['type']}")
        source = f", dynamic={family['source']}" if family.get("source") else ""
        lines.append(f"- {family_id} ({family.get('label', family_id)}{source}): {', '.join(parts)}")
    return "\n".join(lines)


@cache
def system_prompt() -> str:
    rules = _RULES.replace("{nodes}", str(limits()["nodes"])).replace("{depth}", str(limits()["depth"]))
    return (
        rules
        + "\n\nPRIMITIVES\n"
        + catalog_text()
        + "\n\nICONS: "
        + ", ".join(icons())
        + "\n\nFAMILIES (for Layout: map your fields onto these field names)\n"
        + families_text()
        + "\n\nEXAMPLE (a retreat itinerary)\n"
        + json.dumps(EXEMPLAR, indent=1)
    )


def _coach_lines(coach) -> list[str]:
    lines = [f"COACH: {coach.get('brand', '')}, teaches {coach.get('topic', '')} (niche: {coach.get('niche', '')})."]
    if coach.get("description"):
        lines.append(f"ABOUT: {coach['description']}")
    for fact in coach.get("followups") or []:
        lines.append(f"FACT: {fact.get('q', '')} — {fact.get('a', '')}")
    if coach.get("goals"):
        lines.append("OFFERS: " + ", ".join(coach["goals"]))
    return lines


def _style_lines(style_id) -> list[str]:
    style = sections.style(style_id)
    if not style:
        return ["STYLE: neutral (no site style). Layout uses variant auto."]
    lines = [f"STYLE: {style.get('label', style_id)} — {style.get('mood', '')}", "LAYOUT VARIANTS IN THIS STYLE:"]
    for family, names in (style.get("variants") or {}).items():
        lines.append(f"- {family}: {', '.join(names)}")
    return lines


def compose_turn(request, page_key, coach, style_id) -> str:
    return "\n".join(
        [f"BUILD THIS SECTION: {request}", f"PAGE: {page_key}", *_coach_lines(coach), *_style_lines(style_id)]
    )


def refine_turn(instruction, spec, content, coach, style_id) -> str:
    return "\n".join(
        [
            f"CHANGE THIS SECTION: {instruction}",
            "Keep everything the coach did not ask to change, including field names, so their edits survive. "
            "Answer with the whole section.",
            "CURRENT SECTION: " + json.dumps(spec),
            "CURRENT CONTENT: " + json.dumps(content),
            *_coach_lines(coach),
            *_style_lines(style_id),
        ]
    )


def repair_turn(turn, errors) -> str:
    problems = "\n- ".join(errors[:12])
    return f"{turn}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix them and answer again in full:\n- {problems}"
