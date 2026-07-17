"""Demo-template navbar invariants: every template must truthfully represent
the tenant's capabilities (events + store links), never say "Programs", and
carry its assigned layout preset."""

import pytest

from apps.demo_seed.registry import load_niche

EXPECTED_LAYOUTS = {
    "yoga": "centered",
    "pilates": "split",
    "makeup": "pill",
    "face_yoga": "minimal",
    "pole_dance": "pill",
    "fitness": "classic",
    "belly_dance": "centered",
    "general": "classic",
}
VALID_LAYOUTS = {"classic", "centered", "split", "minimal", "pill"}


@pytest.mark.parametrize("name", sorted(EXPECTED_LAYOUTS))
def test_template_navbar_truthful(name):
    data = load_niche(name)
    nav = data.CONFIG["navbar_config"]
    hrefs = [link["href"] for link in nav["links"]]
    labels = [link["label"] for link in nav["links"]]
    assert "/events" in hrefs, f"{name}: no events link"
    assert "/store" in hrefs, f"{name}: no store link (all templates seed downloads)"
    assert "/courses" in hrefs, f"{name}: no courses link"
    assert "Programs" not in labels, f"{name}: 'Programs' mislabel still present"
    assert nav["layout"] == EXPECTED_LAYOUTS[name]
    assert nav["layout"] in VALID_LAYOUTS
