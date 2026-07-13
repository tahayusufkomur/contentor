import pytest
from rest_framework.test import APIClient

from apps.core.onboarding import wizard_catalog as wc
from apps.tenant_config.defaults import KNOWN_BLOCK_TYPES, KNOWN_PAGE_KEYS
from apps.tenant_config.models import TenantTheme
from apps.tenant_config.serializers import _NAVBAR_LAYOUTS

pytestmark = pytest.mark.django_db


def test_themes_match_tenant_theme_enum():
    assert set(wc.THEMES) == set(TenantTheme.values)


def test_theme_ranking_covers_all_niches_with_valid_themes():
    from apps.core.demo.seed_template import available_niches

    assert set(wc.THEME_RANKING) == set(available_niches())
    for ranked in wc.THEME_RANKING.values():
        assert len(ranked) == 3
        assert set(ranked) <= set(wc.THEMES)


def test_navbar_and_hero_enums_are_valid_subsets():
    assert set(wc.NAVBAR_LAYOUTS) <= _NAVBAR_LAYOUTS
    assert set(wc.HERO_STYLES) == {"centered", "split", "minimal"}


def test_page_layouts_cover_all_pages_with_known_blocks():
    assert set(wc.PAGE_LAYOUTS) == set(KNOWN_PAGE_KEYS)
    for options in wc.PAGE_LAYOUTS.values():
        assert len(options) >= 2
        ids = [o["id"] for o in options]
        assert len(ids) == len(set(ids))
        for option in options:
            assert set(option["blocks"]) <= KNOWN_BLOCK_TYPES
    for goal_block in wc.HOME_GOAL_BLOCKS:
        assert goal_block["goal"] in wc.GOALS
        assert goal_block["type"] in KNOWN_BLOCK_TYPES


def test_recommended_answers_complete_and_fallback():
    rec = wc.recommended_answers("yoga")
    assert rec["theme"] == "forest"
    assert set(rec["page_layouts"]) == set(KNOWN_PAGE_KEYS)
    assert rec["logo"] == {"mode": "wordmark", "curated_id": None}
    assert wc.recommended_answers("no-such-niche")["niche"] == "general"


def test_validate_answers_accepts_valid_partial():
    assert wc.validate_answers({"theme": "forest", "goals": ["sell_courses"]}) == []


@pytest.mark.parametrize(
    "partial",
    [
        {"theme": "neon"},
        {"nonsense_key": 1},
        {"description": "x" * 501},
        {"goals": ["sell_courses", "hack"]},
        {"page_layouts": {"home": "no-such-layout"}},
        {"page_layouts": {"basement": "home-spotlight"}},
        {"logo": {"mode": "ai"}},
        {"font_family": "Comic Sans"},
        {"hero_style": "gigantic"},
        {"navbar_layout": "pill"},
    ],
)
def test_validate_answers_rejects_invalid(partial):
    assert wc.validate_answers(partial) != []


def test_catalog_endpoint_serves_payload():
    resp = APIClient().get("/api/v1/onboarding/wizard/catalog/")
    assert resp.status_code == 200
    data = resp.json()
    assert "yoga" in data["niches"]
    assert len(data["page_layouts"]["home"]) == 2
    assert data["recommended"]["logo"]["mode"] == "wordmark"
