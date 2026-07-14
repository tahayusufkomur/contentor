import pytest

from apps.core.onboarding.compose import build_config_overrides
from apps.tenant_config.defaults import KNOWN_BLOCK_TYPES, KNOWN_PAGE_KEYS

SECTIONS = {
    "hero": {
        "headline": "Find Your Balance",
        "subheadline": "Guided practice for every level.",
        "cta_text": "Start Your Practice",
        "cta_href": "/courses",
        "bg_image_url": "demo/photos/yoga_6.jpg",
        "bg_image_photo_id": "42",
    },
    "about": {
        "heading": "About Me",
        "body": "Twelve years of teaching.",
        "image_url": "demo/photos/yoga_7.jpg",
        "image_photo_id": "43",
    },
    "testimonials": {"items": [{"name": "Priya", "text": "Changed my life.", "avatar_url": ""}]},
    "faq": {"items": [{"q": "Do I need experience?", "a": "No."}]},
    "cta": {"heading": "Ready to begin?", "button_text": "Join Now", "button_href": "/courses"},
}


def _build(answers=None, locale="en"):
    return build_config_overrides(answers or {}, brand_name="Glow Studio", landing_sections=SECTIONS, locale=locale)


def test_returns_exactly_the_override_keys():
    assert set(_build()) == {"theme", "font_family", "navbar_config", "enabled_modules", "pages"}


def test_all_pages_present_with_known_types_and_unique_ids():
    pages = _build()["pages"]
    assert set(pages) == set(KNOWN_PAGE_KEYS)
    for page in pages.values():
        types = [b["type"] for b in page["blocks"]]
        ids = [b["id"] for b in page["blocks"]]
        assert set(types) <= KNOWN_BLOCK_TYPES
        assert len(ids) == len(set(ids))
        assert all("style" not in b for b in page["blocks"])  # theme-locked


def test_pages_pass_server_validation():
    from apps.tenant_config.serializers import TenantConfigSerializer

    # The write-side gate every coach save goes through must accept our seeds.
    TenantConfigSerializer().validate_pages(_build()["pages"])


def test_design_answers_applied():
    over = _build({"theme": "forest", "font_family": "Nunito", "navbar_layout": "minimal"})
    assert over["theme"] == "forest"
    assert over["font_family"] == "Nunito"
    assert over["navbar_config"]["layout"] == "minimal"


@pytest.mark.parametrize(
    ("goals", "expect_modules", "expect_hrefs", "absent_hrefs"),
    [
        ([], [], ["/courses", "/about", "/faq"], ["/events", "/store", "/plans"]),
        (["run_live_classes"], ["live"], ["/events"], ["/store", "/plans"]),
        (["in_person_events"], ["live"], ["/events"], ["/plans"]),
        (["sell_downloads"], ["downloads"], ["/store", "/plans"], ["/events"]),
        (["sell_courses"], [], ["/plans"], ["/events", "/store"]),
        (["email_marketing"], ["campaigns"], [], ["/events", "/store", "/plans"]),
        (["build_community"], ["community"], [], ["/events", "/store", "/plans"]),
    ],
)
def test_goal_matrix(goals, expect_modules, expect_hrefs, absent_hrefs):
    over = _build({"goals": goals})
    for module in ["courses", "billing", "pages", "analytics", *expect_modules]:
        assert module in over["enabled_modules"], module
    hrefs = [link["href"] for link in over["navbar_config"]["links"]]
    for href in expect_hrefs:
        assert href in hrefs, href
    for href in absent_hrefs:
        assert href not in hrefs, href


def test_home_goal_blocks_appended_once():
    over = _build({"goals": ["run_live_classes", "in_person_events", "sell_downloads"]})
    types = [b["type"] for b in over["pages"]["home"]["blocks"]]
    assert types.count("upcomingEvents") == 1  # both live goals -> one block
    assert types.count("storeProducts") == 1


def test_hero_style_and_photo_harvest():
    split = _build({"hero_style": "split"})["pages"]["home"]["blocks"][0]
    assert split["layout"] == "split"
    assert split["heading"] == "Find Your Balance"
    assert split["bgImage"]["photo_id"] == "42"
    minimal = _build({"hero_style": "minimal"})["pages"]["home"]["blocks"][0]
    assert minimal["layout"] == "minimal"
    assert minimal["bgImage"] == {"url": None, "photo_id": None}


def test_home_story_layout_sequence():
    over = _build({"page_layouts": {"home": "home-story"}})
    assert [b["type"] for b in over["pages"]["home"]["blocks"]] == [
        "hero",
        "imageText",
        "courseGrid",
        "faq",
        "cta",
    ]


def test_tr_locale_writes_turkish_content():
    over = _build({"goals": ["sell_courses"]}, locale="tr")
    labels = [link["label"] for link in over["navbar_config"]["links"]]
    assert "Kurslar" in labels
    assert over["navbar_config"]["cta"]["text"] == "Hemen Başla"
    assert over["pages"]["pricing"]["blocks"][0]["heading"] == "Planlar ve Fiyatlar"


def test_empty_answers_still_valid():
    over = _build({})
    assert over["theme"] == "ocean"
    assert over["navbar_config"]["layout"] == "classic"
    assert len(over["pages"]["home"]["blocks"]) >= 3
