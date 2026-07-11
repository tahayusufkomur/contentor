"""Brand Pack marks now carry their source `elements` alongside compiled
`paths` (see docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md
§ element round-trip). This guarantees the client can hand `elements` back
on a future refinement call and get the exact same geometry it started with.
"""

from apps.tenant_config import logo_ai
from apps.tenant_config.logo_geometry import compile_elements


def test_validate_pack_mark_returns_elements_that_recompile_to_same_paths():
    item = logo_ai._Mark(
        rationale="Two dots facing each other.",
        elements=[
            {"type": "circle", "cx": 30, "cy": 50, "r": 5},
            {"type": "circle", "cx": 70, "cy": 50, "r": 5, "fill": "accent"},
        ],
    )
    result = logo_ai._validate_pack_mark(item)
    assert result is not None
    assert result["elements"] == [
        {"type": "circle", "cx": 30, "cy": 50, "r": 5, "fill": "mark", "opacity": None},
        {"type": "circle", "cx": 70, "cy": 50, "r": 5, "fill": "accent", "opacity": None},
    ]
    recompiled = compile_elements(result["elements"])
    assert [p["d"] for p in recompiled] == [p["d"] for p in result["paths"]]


def test_validate_pack_mark_drops_mark_when_nothing_survives_validation():
    item = logo_ai._Mark(rationale="x", elements=[])
    assert logo_ai._validate_pack_mark(item) is None
