"""Copilot chrome executors: pure validation/merge helpers behind
edit_theme / edit_navbar. Theme ids come from the TenantTheme catalog;
navbar updates are overlaid on the current config and cleaned by the same
serializer allowlist the admin config PATCH uses (links etc. preserved).
DB writes happen in the execute view, not here."""

import pytest

from apps.core.copilot import chrome

pytestmark = pytest.mark.django_db


def test_clean_theme_normalizes_and_accepts_catalog_ids():
    assert chrome.clean_theme(" Forest ") == "forest"
    assert chrome.clean_theme("ocean") == "ocean"


def test_clean_theme_rejects_unknown_id():
    with pytest.raises(chrome.ChromeOpError, match="ocean"):
        chrome.clean_theme("midnight")  # the spec's example theme does not exist


def test_theme_label():
    assert chrome.theme_label("forest") == "Forest"


def test_clean_layout_normalizes_and_rejects_unknown():
    assert chrome.clean_layout(" Pill ") == "pill"
    with pytest.raises(chrome.ChromeOpError, match="classic"):
        chrome.clean_layout("floating")


def test_merge_navbar_overlays_and_preserves_links():
    current = {
        "layout": "classic",
        "links": [{"label": "Courses", "href": "/courses"}],
        "cta": {"text": "Get Started", "href": "/courses"},
        "logo_size": "lg",
    }
    merged = chrome.merge_navbar(current, {"layout": "pill"})
    assert merged["layout"] == "pill"
    assert merged["links"] == [{"label": "Courses", "href": "/courses"}]
    assert merged["cta"] == {"text": "Get Started", "href": "/courses"}
    assert merged["logo_size"] == "lg"


def test_merge_navbar_cleans_cta_href_and_caps_text():
    merged = chrome.merge_navbar({}, {"cta": {"text": "x" * 200, "href": "javascript:evil()"}})
    assert merged["cta"]["href"] == ""  # unsafe scheme stripped by _clean_nav_href
    assert len(merged["cta"]["text"]) == 80


def test_merge_navbar_invalid_layout_raises_user_safe_error():
    with pytest.raises(chrome.ChromeOpError):
        chrome.merge_navbar({}, {"layout": "floating"})


def test_merge_navbar_does_not_materialize_defaults_for_absent_keys():
    current = {"layout": "classic", "links": [{"label": "Courses", "href": "/courses"}]}
    merged = chrome.merge_navbar(current, {"layout": "pill"})
    assert merged["layout"] == "pill"
    assert merged["links"] == [{"label": "Courses", "href": "/courses"}]
    # cta/logo_size were never present in current or updates — the validator
    # would normally default them in (cta=None, logo_size="md"), but the
    # merge must not invent keys that weren't there before.
    assert "cta" not in merged
    assert "logo_size" not in merged
    assert "show_login" not in merged


def test_clean_links_validates_via_serializer_allowlist():
    cleaned = chrome.clean_links([
        {"label": "Courses", "href": "/courses"},
        {"label": "Evil", "href": "javascript:alert(1)"},  # href blanked -> dropped
    ])
    assert cleaned == [{"label": "Courses", "href": "/courses"}]


def test_clean_links_rejects_bad_shapes():
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_links("not-a-list")
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_links([{"label": "x", "href": "/a"}] * 21)
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_links([{"label": "", "href": ""}])
