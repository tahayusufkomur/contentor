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
        {"type": "circle", "cx": 30, "cy": 50, "r": 5, "fill": "mark", "opacity": None, "cut": False},
        {"type": "circle", "cx": 70, "cy": 50, "r": 5, "fill": "accent", "opacity": None, "cut": False},
    ]
    recompiled = compile_elements(result["elements"])
    assert [p["d"] for p in recompiled] == [p["d"] for p in result["paths"]]


def test_validate_pack_mark_drops_mark_when_nothing_survives_validation():
    item = logo_ai._Mark(rationale="x", elements=[])
    assert logo_ai._validate_pack_mark(item) is None


def test_new_vocabulary_parses_and_compiles():
    item = logo_ai._Mark(
        rationale="One line through a mirrored bloom.",
        elements=[
            {
                "type": "mirror",
                "axis_x": 50,
                "of": {"type": "petal", "cx": 38, "cy": 50, "length": 30, "width": 12, "rotate_deg": -30},
            },
            {"type": "curve", "points": [[20, 70], [50, 45], [80, 70]], "thickness": 4, "round_caps": True},
            {"type": "circle", "cx": 50, "cy": 30, "r": 10},
            {"type": "star", "cx": 50, "cy": 30, "points": 5, "outer_r": 6, "inner_r": 2.5, "cut": True},
        ],
    )
    result = logo_ai._validate_pack_mark(item)
    assert result is not None
    assert len(result["paths"]) == 3  # star cut merged into the circle
    assert result["elements"][3]["cut"] is True


def test_repeat_blob_wave_crescent_parse_and_compile_through_pydantic():
    # The prior test leaves repeat/blob/wave/crescent untouched by real
    # pydantic validation — hand-built dicts at the geometry layer bypass
    # the _Element/_RepeatChild discriminated unions entirely. repeat is the
    # highest-risk gap: it's the only model with a nested union child (`of`),
    # so a field-name drift between _Repeat/_RepeatChild and the compiler's
    # _compile_repeat would only surface here, not in a hand-built-dict test.
    item = logo_ai._Mark(
        rationale="A sunburst of arcs around an organic core, with a crescent accent.",
        elements=[
            {"type": "blob", "cx": 50, "cy": 50, "r": 20, "sides": 8, "seed": 3, "irregularity": 0.2},
            {
                "type": "repeat",
                "cx": 50,
                "cy": 50,
                "count": 6,
                "of": {"type": "arc", "cx": 50, "cy": 15, "r": 8, "thickness": 3, "start_deg": 0, "sweep_deg": 90},
            },
            {"type": "wave", "cx": 50, "cy": 80, "width": 40, "amplitude": 5, "cycles": 2, "thickness": 3},
            {"type": "crescent", "cx": 80, "cy": 50, "r": 10, "cutter_r": 8, "cutter_offset": 6},
        ],
    )
    result = logo_ai._validate_pack_mark(item)
    assert result is not None
    assert len(result["paths"]) == 4
    recompiled = compile_elements(result["elements"])
    assert [p["d"] for p in recompiled] == [p["d"] for p in result["paths"]]
