"""Styled-section manifest: loaders, the section block cleaner, restyle mapping,
and the TenantConfig.style field. Styles are fixtures (the real ones ship
disabled and may not exist yet)."""

import pytest
from django.core.cache import cache
from rest_framework import serializers
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenant_config import sections
from apps.tenant_config.defaults import BLOCK_STYLE_ALLOWLIST, KNOWN_BLOCK_TYPES
from apps.tenant_config.serializers import TenantConfigSerializer


def _style(sid, enabled=True, **variants):
    base = {family: ["only"] for family in sections.families()}
    return {
        "id": sid,
        "label": sid.title(),
        "mood": f"{sid} mood",
        "enabled": enabled,
        "order": 1,
        "photoWords": f"{sid} light",
        "variants": {**base, **variants},
    }


STYLES = {
    "calm": _style("calm", hero=["split", "fullBleed", "intro"], story=["portrait", "wide"]),
    "bold": _style("bold", hero=["poster", "intro"], story=["stacked"]),
    "draft": _style("draft", enabled=False),
}


@pytest.fixture(autouse=True)
def fixture_styles(monkeypatch):
    monkeypatch.setattr(sections, "styles", lambda: STYLES)


@pytest.fixture
def real_styles(monkeypatch):
    """Undo fixture_styles: read the style JSON the repo actually ships."""
    monkeypatch.undo()


# --- catalog ------------------------------------------------------------------


def test_section_types_are_known_blocks_without_style_overrides():
    assert {f"section.{f}" for f in sections.families()} == sections.SECTION_TYPES
    assert sections.SECTION_TYPES <= KNOWN_BLOCK_TYPES
    assert all(BLOCK_STYLE_ALLOWLIST[t] == frozenset() for t in sections.SECTION_TYPES)


def test_style_lookups():
    assert set(sections.enabled_styles()) == {"calm", "bold"}
    assert sections.style("draft")["enabled"] is False
    assert sections.style("nope") is None and sections.style("") is None
    assert sections.variants("calm", "hero") == ["split", "fullBleed", "intro"]
    assert sections.variants("nope", "hero") == []
    assert sections.image_fields("hero") == ("image", "image2")
    assert sections.image_fields("moments") == ()


def test_resolve_variant():
    assert sections.resolve_variant("calm", "hero", "fullBleed") == "calm.fullBleed"
    assert sections.resolve_variant("calm", "hero", "nope") == "calm.split"
    assert sections.resolve_variant("calm", "hero", None) == "calm.split"
    assert sections.resolve_variant("nope", "hero", "split") is None


def test_restyle_variant_prefers_name_then_index_then_first():
    assert sections.restyle_variant("calm.intro", "bold", "hero") == "bold.intro"  # same name
    assert sections.restyle_variant("calm.split", "bold", "hero") == "bold.poster"  # same index (0)
    assert sections.restyle_variant("calm.fullBleed", "bold", "hero") == "bold.intro"  # index 1
    assert sections.restyle_variant("calm.wide", "bold", "story") == "bold.stacked"  # index 1 missing → first
    assert sections.restyle_variant("ghost.x", "bold", "hero") == "bold.poster"  # unknown source → first
    assert sections.restyle_variant("calm.split", "nope", "hero") == "calm.split"  # unmappable → unchanged


def test_restyle_pages_only_touches_section_blocks():
    pages = {
        "home": {
            "blocks": [
                {"id": "a", "type": "section.hero", "variant": "calm.intro", "headline": "Hi"},
                {"id": "b", "type": "hero", "heading": "Legacy"},
            ]
        },
        "about": [],
    }
    out = sections.restyle_pages(pages, "bold")
    assert out["home"]["blocks"][0] == {"id": "a", "type": "section.hero", "variant": "bold.intro", "headline": "Hi"}
    assert out["home"]["blocks"][1] == {"id": "b", "type": "hero", "heading": "Legacy"}
    assert out["about"] == []
    assert pages["home"]["blocks"][0]["variant"] == "calm.intro"  # input untouched


# --- clean_section_block --------------------------------------------------------


def test_clamp_text_cuts_on_word_boundary():
    assert sections.clamp_text("hello wonderful world", 12) == "hello"
    assert sections.clamp_text("hello world", 11) == "hello world"
    assert sections.clamp_text("x" * 50, 10) == "x" * 10  # one long word → hard cut
    assert sections.clamp_text(None, 10) == ""


def test_clean_section_block_clamps_caps_coerces_and_drops():
    block = {
        "id": "blk_1",
        "type": "section.benefits",
        "variant": "calm.only",
        "enabled": 1,
        "heading": "Breathe " * 20,
        "evil": "<script>",
        "items": [{"title": "One", "text": "t", "junk": "x"}] * 9 + ["not a dict"],
        "image": {"url": "https://x/a.jpg", "photo_id": "p1", "alt": "A", "extra": "x"},
    }
    out = sections.clean_section_block(block)
    assert set(out) == {"id", "type", "variant", "enabled", "heading", "items", "image"}
    assert out["enabled"] is True
    assert len(out["heading"]) <= 80 and not out["heading"].endswith(" ")
    assert len(out["items"]) == 6
    assert out["items"][0] == {"title": "One", "text": "t"}
    assert out["image"] == {"url": "https://x/a.jpg", "photo_id": "p1", "alt": "A"}


def test_clean_section_block_selects_bools_links_and_bad_images():
    out = sections.clean_section_block(
        {"type": "section.courseShowcase", "limit": 9, "heading": "Courses"}
    ) | sections.clean_section_block(
        {"type": "section.contact", "showForm": "false", "image": "not-a-dict", "heading": "Hi"}
    )
    assert out["limit"] == "3"  # not an option → the field's default
    assert out["showForm"] is False
    assert "image" not in out
    hero = sections.clean_section_block({"type": "section.hero", "ctaHref": "javascript:alert(1)", "headline": "x"})
    assert hero["ctaHref"] == ""
    assert sections.clean_section_block({"type": "section.courseShowcase", "limit": 6})["limit"] == "6"


def test_clean_section_block_richtext_measures_plain_text():
    short = sections.clean_section_block({"type": "section.story", "body": "<p>Hi <strong>there</strong></p>"})
    assert short["body"] == "<p>Hi <strong>there</strong></p>"  # fits → HTML kept
    long_ = sections.clean_section_block({"type": "section.story", "body": "<p>" + "&lt;b&gt; word " * 200 + "</p>"})
    assert len(long_["body"]) > 0 and "<p>" not in long_["body"]
    assert "<b>" not in long_["body"]  # stripped text stays escaped


def test_clean_section_block_variant_resolution_and_unknown_family():
    clean = sections.clean_section_block
    assert clean({"type": "section.hero", "variant": "calm.fullBleed"})["variant"] == "calm.fullBleed"
    assert clean({"type": "section.hero", "variant": "calm.gone"})["variant"] == "calm.split"
    assert clean({"type": "section.hero", "variant": "future.split"})["variant"] == "future.split"  # unknown style
    assert "variant" not in clean({"type": "section.hero", "variant": 7})
    assert clean({"type": "section.marquee", "heading": "x"}) is None
    assert clean({"type": "hero"}) is None


def test_validate_pages_keeps_section_blocks_and_drops_style_override():
    out = TenantConfigSerializer().validate_pages(
        {
            "home": {
                "blocks": [
                    {
                        "type": "section.cta",
                        "variant": "bold.gone",
                        "heading": "Join",
                        "text": "Plain text, not body",
                        "ctaLabel": "Go",
                        "ctaHref": "javascript:x",
                        "style": {"background": "muted"},
                        "unknown": 1,
                    },
                    {"type": "section.nope", "heading": "dropped"},
                ]
            }
        }
    )
    (block,) = out["home"]["blocks"]
    assert block["id"].startswith("blk_") and block["enabled"] is True
    assert block["variant"] == "bold.only"
    assert block["text"] == "Plain text, not body"
    assert block["ctaHref"] == ""
    assert "style" not in block and "unknown" not in block


# --- TenantConfig.style -----------------------------------------------------------


def test_validate_style_accepts_blank_or_known_ids():
    validate = TenantConfigSerializer().validate_style
    assert validate("") == ""
    assert validate("calm") == "calm"
    assert validate("draft") == "draft"  # shipped but not offered yet — still storable
    with pytest.raises(serializers.ValidationError):
        validate("nope")


@pytest.mark.django_db(transaction=True)
def test_style_round_trips_through_config_api(tenant_ctx):
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    owner = User.objects.create_user(email="style@x.com", name="O", password="x", role="owner", is_staff=True)  # noqa: S106
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)
    assert client.patch("/api/v1/admin/config/", {"style": "nope"}, format="json").status_code == 400
    resp = client.patch("/api/v1/admin/config/", {"style": "calm"}, format="json")
    assert resp.status_code == 200, resp.content
    cfg = TenantConfig.objects.first()
    assert cfg.style == "calm"
    assert cfg.setup_progress.get("look_edited") is True
    cache.delete("tenant:shared_test:config")
    public = APIClient(HTTP_HOST="shared-test.localhost").get("/api/v1/admin/config/")
    assert public.status_code == 200
    assert public.json()["style"] == "calm"


def test_every_enabled_style_ships_two_full_palettes(real_styles):
    keys = set(sections.style("journal")["palette"])
    for sid, s in sections.enabled_styles().items():
        assert s.get("paletteLabel"), sid
        assert len(s["palettes"]) == 2, sid
        for p in s["palettes"]:
            assert p["id"] and p["label"] and p["mood"], (sid, p)
            assert set(p["palette"]) == keys, (sid, p["id"])


def test_looks_list_every_style_in_every_palette(real_styles):
    looks = sections.looks()
    assert len(looks) == 3 * len(sections.enabled_styles())
    first = looks[0]
    assert first["value"] == first["style"] and first["palette"] == ""
    assert looks[1]["value"] == f"{first['style']}:{looks[1]['palette']}"
    assert all({"value", "style", "palette", "label", "detail"} <= set(o) for o in looks)
    assert sections.palettes("journal").keys() == {"sage", "dusk"}


def test_parse_look(real_styles):
    assert sections.parse_look("journal") == ("journal", "")
    assert sections.parse_look("journal:sage") == ("journal", "sage")
    assert sections.parse_look("journal:mint") is None
    assert sections.parse_look("nope") is None
    assert sections.parse_look("") is None
