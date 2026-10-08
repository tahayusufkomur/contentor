"""The AI component catalog is well-formed: every rule the validator and
the prompt read from it is a known kind with consistent defaults."""

from apps.tenant_config.cx import catalog

ROLES = {"root", "band", "block"}
CHILDREN = {"none", "bands", "blocks", "two", "item"}
PROP_KINDS = {"enum", "int", "num", "bool", "text", "icon", "family", "each", "bind", "map"}


def test_every_primitive_is_well_formed():
    assert catalog.primitives(), "catalog has no primitives"
    for name, prim in catalog.primitives().items():
        assert prim["role"] in ROLES, name
        assert prim.get("children", "none") in CHILDREN, name
        for prop, pdef in (prim.get("props") or {}).items():
            kinds = PROP_KINDS & set(pdef)
            assert len(kinds) == 1, (name, prop, kinds)
            if "enum" in pdef and "default" in pdef:
                assert pdef["default"] in pdef["enum"], (name, prop)
            for ranged in ("int", "num"):
                if ranged in pdef and "default" in pdef:
                    lo, hi = pdef[ranged]
                    assert lo <= pdef["default"] <= hi, (name, prop)
        if prim.get("children") == "item":
            assert prim["props"]["each"]["required"], name


def test_only_sequence_is_a_root_and_bands_are_section_and_layout():
    roles = {name: prim["role"] for name, prim in catalog.primitives().items()}
    assert [n for n, r in roles.items() if r == "root"] == ["Sequence"]
    assert sorted(n for n, r in roles.items() if r == "band") == ["Layout", "Section"]


def test_limits_match_the_spec():
    assert catalog.limits() == {"nodes": 150, "depth": 8, "bytes": 16384, "fields": 24}
    assert len(catalog.icons()) == len(set(catalog.icons()))
