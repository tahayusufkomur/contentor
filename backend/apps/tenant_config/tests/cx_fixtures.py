"""A canonical AI component spec (the prompt's retreat-itinerary example,
after validation) and a block carrying it. Shared by the cx tests."""

import copy

ITINERARY_SPEC = {
    "csl": 1,
    "name": "Retreat itinerary",
    "summary": "Day-by-day plan of a multi-day retreat",
    "fields": {
        "kicker": {"type": "text", "label": "Kicker", "max": 40},
        "heading": {"type": "text", "label": "Heading", "required": True, "max": 80},
        "intro": {"type": "text", "label": "Intro", "max": 220},
        "days": {
            "type": "items",
            "label": "Days",
            "fields": {
                "when": {"type": "text", "label": "Day", "max": 24},
                "title": {"type": "text", "label": "Title", "required": True, "max": 60},
                "text": {"type": "text", "label": "Plan", "max": 220},
                "image": {
                    "type": "image",
                    "label": "Photo",
                    "aspect": "3:2",
                    "role": "a calm retreat scene for this day",
                },
            },
            "max": 10,
            "min": 2,
            "itemLabel": "Day",
        },
    },
    "dynamic": None,
    "tree": {
        "t": "Section",
        "tone": "surface",
        "width": "wrap",
        "children": [
            {"t": "Opener"},
            {
                "t": "Timeline",
                "each": "days",
                "orient": "vertical",
                "marker": "num",
                "item": [
                    {"t": "Label", "bind": "$.when"},
                    {"t": "Heading", "bind": "$.title", "level": 3, "size": "md"},
                    {"t": "Text", "bind": "$.text", "size": "md", "muted": True, "measure": "normal"},
                    {"t": "Img", "bind": "$.image", "treatment": "frame", "aspect": 1.5},
                ],
            },
        ],
    },
}


def itinerary_block(**changes):
    block = {
        "id": "blk_cxtest01",
        "type": "cx",
        "enabled": True,
        "cx": {"ref": "cx_1a2b3c4d@1", "spec": copy.deepcopy(ITINERARY_SPEC)},
        "kicker": "Seven days in Bali",
        "heading": "How the week unfolds",
        "intro": "Slow mornings, long practices and time to rest.",
        "days": [
            {
                "when": "Day 1",
                "title": "Arrive and settle",
                "text": "Check in and an easy evening class.",
                "image": {"url": None, "photo_id": "p1", "alt": "A quiet beach at dawn"},
            },
            {"when": "Day 2", "title": "Find your rhythm", "text": "Morning flow and an afternoon walk."},
        ],
    }
    block.update(changes)
    return block
