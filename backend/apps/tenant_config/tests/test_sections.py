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
    assert sections.image_fields("hero") == ("image", "image2", "image3", "image4")
    assert sections.image_fields("moments") == ()


def test_resolve_variant():
    assert sections.resolve_variant("calm", "hero", "fullBleed") == "calm.fullBleed"
    assert sections.resolve_variant("calm", "hero", "nope") == "calm.split"
    assert sections.resolve_variant("calm", "hero", None) == "calm.split"
    assert sections.resolve_variant("nope", "hero", "split") is None


def test_restyle_variant_prefers_name_then_index_then_first():
    assert sections.restyle_variant("calm.intro", "bold", "hero") == "bold.intro"  # same name
    assert sections.restyle_variant("calm.split", "bold", "hero") == "bold.poster"  # same index (0)
    # a hero that is not the intro never lands on the target's intro, whatever its index
    assert sections.restyle_variant("calm.fullBleed", "bold", "hero") == "bold.poster"
    assert sections.restyle_variant("calm.wide", "bold", "story") == "bold.stacked"  # index 1 missing → first
    assert sections.restyle_variant("ghost.x", "bold", "hero") == "bold.poster"  # unknown source → first
    assert sections.restyle_variant("calm.split", "nope", "hero") == "calm.split"  # unmappable → unchanged


def test_hero_photos_by_layout(monkeypatch):
    styles = {
        "wide": {**_style("wide", hero=["cluster", "split", "intro"]), "heroLayout": "collage"},
        "plain": {**_style("plain", hero=["split", "intro"]), "heroLayout": "split"},
    }
    monkeypatch.setattr(sections, "styles", lambda: styles)
    assert sections.hero_photos("wide.cluster") == 4  # the layout's own count
    assert sections.hero_photos("wide.split") == 2  # the old variant keeps two
    assert sections.hero_photos("wide.intro") == 1
    assert sections.hero_photos("plain.split") == 2
    assert sections.hero_photos("nope.x") == 2


def test_unshown_slots_follow_the_layout(monkeypatch):
    styles = {
        "wide": {
            **_style("wide", hero=["cluster", "split", "intro"], story=["note", "old"]),
            "heroLayout": "collage",
            "bodyLayouts": {"story": "letter"},
        },
        "quote": {**_style("quote", story=["pull", "old"]), "bodyLayouts": {"story": "pull"}},
        "plain": {**_style("plain", story=["old"]), "bodyLayouts": {"story": "split"}},
    }
    monkeypatch.setattr(sections, "styles", lambda: styles)
    assert sections.unshown_slots("hero", "wide.intro") == ("image2", "image3", "image4")
    assert sections.unshown_slots("hero", "wide.cluster") == ()  # the collage shows all four
    assert sections.unshown_slots("story", "wide.note") == ("image", "image2")  # a letter has no photo
    assert sections.unshown_slots("story", "wide.old") == ()  # the older variant keeps its photos
    assert sections.unshown_slots("story", "quote.pull") == ("image2",)
    assert sections.unshown_slots("story", "plain.old") == ()
    assert sections.unshown_slots("benefits", "plain.only") == ()


def test_restyle_keeps_the_coachs_story_photo_visible(monkeypatch):
    styles = {
        **STYLES,
        "letters": {
            **_style("letters", story=["note", "old"]),
            "bodyLayouts": {"story": "letter"},
        },
    }
    monkeypatch.setattr(sections, "styles", lambda: styles)
    story = lambda image: {"type": "section.story", "variant": "calm.portrait", "image": image}  # noqa: E731
    pages = lambda block: {"home": {"blocks": [block]}}  # noqa: E731
    with_photo = sections.restyle_pages(pages(story({"photo_id": "p1", "url": None})), "letters")
    assert with_photo["home"]["blocks"][0]["variant"] == "letters.old"  # a letter would hide the photo
    without = sections.restyle_pages(pages(story({"photo_id": None, "url": None})), "letters")
    assert without["home"]["blocks"][0]["variant"] == "letters.note"  # nothing to hide: the style's default


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


def test_looks_list_every_style_once_with_its_palettes(real_styles):
    looks = sections.looks()
    assert len(looks) == len(sections.enabled_styles())
    first = looks[0]
    assert first["value"] == first["style"] and first["palette"] == ""
    assert [p["id"] for p in first["palettes"]][0] == ""
    assert len(first["palettes"]) == 3
    assert all({"value", "style", "palette", "label", "detail", "palettes"} <= set(o) for o in looks)
    assert sections.palettes("journal").keys() == {"sage", "dusk"}
    # Every look names its hero layout, so /setup can group the near-twins.
    assert all(o["group"] for o in looks), [o["value"] for o in looks if not o["group"]]
    assert len({o["group"] for o in looks}) >= 10
    # Every hero layout a style uses has a label, and each label is its own group.
    assert {s.get("heroLayout") for s in sections.enabled_styles().values()} <= set(sections.HERO_LAYOUTS)
    assert len(set(sections.HERO_LAYOUTS.values())) == len(sections.HERO_LAYOUTS)


def test_styles_sharing_a_hero_layout_differ_in_two_body_sections(real_styles):
    """Same hero layout, same body would be the same page: story / benefits /
    howItWorks must differ in at least two of the three."""
    styles = sections.enabled_styles()
    assert all(set(s["bodyLayouts"]) == {"story", "benefits", "howItWorks"} for s in styles.values())
    clashes = []
    ids = list(styles)
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            if styles[a]["heroLayout"] != styles[b]["heroLayout"]:
                continue
            same = [f for f in styles[a]["bodyLayouts"] if styles[a]["bodyLayouts"][f] == styles[b]["bodyLayouts"][f]]
            if len(same) > 1:
                clashes.append(f"{a}/{b} ({styles[a]['heroLayout']}) share {same}")
    assert not clashes, clashes


def test_every_niche_gets_varied_hero_layouts_among_its_first_six(real_styles):
    """/setup leads with the best six looks for a niche: they must not all be the same page."""
    niches = {n for s in sections.enabled_styles().values() for n in s.get("niches", [])}
    for niche in sorted(niches):
        layouts = {s["heroLayout"] for s in sections.rank_styles(niche)[:6]}
        assert len(layouts) >= 5, (niche, layouts)


def test_a_style_can_order_its_own_home_page(real_styles, monkeypatch):
    base = sections.manifest()["recipes"]
    assert sections.recipes("nope") == base  # unknown style: the manifest's
    own = ["hero", "courseShowcase", "cta"]
    monkeypatch.setattr(sections, "style", lambda sid: {"recipes": {"home": own}})
    assert sections.recipes("any") == {**base, "home": own}  # other pages keep the manifest's order


def test_parse_look(real_styles):
    assert sections.parse_look("journal") == ("journal", "")
    assert sections.parse_look("journal:sage") == ("journal", "sage")
    assert sections.parse_look("journal:mint") is None
    assert sections.parse_look("nope") is None
    assert sections.parse_look("") is None


def test_palette_must_belong_to_the_style(real_styles):
    from apps.tenant_config.serializers import TenantConfigSerializer

    assert TenantConfigSerializer(data={"style": "journal", "palette": "sage"}, partial=True).is_valid()
    bad = TenantConfigSerializer(data={"style": "journal", "palette": "mint"}, partial=True)
    assert not bad.is_valid() and "palette" in bad.errors


@pytest.mark.django_db
def test_patching_style_alone_clears_a_stale_palette(tenant_ctx, real_styles):
    """Review focus 1: the copilot and the admin page change style without
    touching palette; a palette from the old style must not block the save."""
    from apps.tenant_config.models import TenantConfig
    from apps.tenant_config.serializers import TenantConfigSerializer

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.style, cfg.palette = "journal", "sage"
    cfg.save()
    ser = TenantConfigSerializer(cfg, data={"style": "grid"}, partial=True)
    assert ser.is_valid(), ser.errors
    assert ser.validated_data["palette"] == ""
