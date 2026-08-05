"""Pure block operations behind the copilot's add/remove/move actions.
No DB — pages dicts in, pages dicts out."""

import pytest

from apps.core.copilot import blocks

HERO = {"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}
INTRO = {"id": "blk_intro", "type": "richText", "enabled": True, "heading": "About", "body": "<p>x</p>"}
PAGES = {"home": {"blocks": [HERO, INTRO]}}


def test_build_block_clamps_and_sanitizes():
    b = blocks.build_block("richText", {"heading": "H" * 500, "body": "<script>x</script><p>ok</p>"})
    assert b["type"] == "richText" and b["enabled"] is True
    assert b["id"].startswith("blk_") and len(b["id"]) == 12
    assert len(b["heading"]) == 120  # FIELD_CAPS["heading"]
    assert "<script>" not in b["body"] and "ok" in b["body"]


def test_build_block_drops_unknown_fields_and_caps_faq_items():
    b = blocks.build_block("faq", {"heading": "Q&A", "evil": "x", "items": [{"q": "q" * 400, "a": "a"}] * 20})
    assert "evil" not in b
    assert len(b["items"]) == 6  # MAX_FAQ_ITEMS
    assert len(b["items"][0]["q"]) == 150  # FIELD_CAPS["q"]


def test_build_block_rejects_unknown_and_testimonials_types():
    with pytest.raises(blocks.BlockOpError):
        blocks.build_block("marquee", {})
    with pytest.raises(blocks.BlockOpError):
        blocks.build_block("testimonials", {"heading": "x"})


def test_add_block_appends_or_inserts_after():
    new = blocks.build_block("cta", {"heading": "Join"})
    appended = blocks.add_block(PAGES, "home", new, after_block_id=None)
    assert [b["id"] for b in appended["home"]["blocks"]][-1] == new["id"]
    inserted = blocks.add_block(PAGES, "home", new, after_block_id="blk_hero")
    assert [b["id"] for b in inserted["home"]["blocks"]] == ["blk_hero", new["id"], "blk_intro"]
    assert [b["id"] for b in PAGES["home"]["blocks"]] == ["blk_hero", "blk_intro"]  # input untouched


def test_remove_and_move_block():
    removed = blocks.remove_block(PAGES, "home", "blk_intro")
    assert [b["id"] for b in removed["home"]["blocks"]] == ["blk_hero"]
    moved = blocks.move_block(PAGES, "home", "blk_intro", after_block_id=None)
    assert [b["id"] for b in moved["home"]["blocks"]] == ["blk_intro", "blk_hero"]


def test_unknown_page_or_block_id_raises():
    with pytest.raises(blocks.BlockOpError):
        blocks.add_block(PAGES, "nope", HERO, None)
    with pytest.raises(blocks.BlockOpError):
        blocks.remove_block(PAGES, "home", "blk_ghost")
    with pytest.raises(blocks.BlockOpError):
        blocks.move_block(PAGES, "home", "blk_ghost", None)


def test_legacy_bare_list_pages_still_work():
    """The tolerance path: a page whose value is a bare list (the old, wrong
    fixture shape / any legacy data) still add/removes correctly."""
    legacy_pages = {"home": [HERO, INTRO]}
    new = blocks.build_block("cta", {"heading": "Join"})
    appended = blocks.add_block(legacy_pages, "home", new, after_block_id=None)
    assert [b["id"] for b in appended["home"]][-1] == new["id"]
    removed = blocks.remove_block(legacy_pages, "home", "blk_intro")
    assert [b["id"] for b in removed["home"]] == ["blk_hero"]
    moved = blocks.move_block(legacy_pages, "home", "blk_intro", after_block_id=None)
    assert [b["id"] for b in moved["home"]] == ["blk_intro", "blk_hero"]


def test_page_blocks_normalizer():
    assert blocks.page_blocks({"blocks": [HERO]}) == [HERO]
    assert blocks.page_blocks([HERO]) == [HERO]
    assert blocks.page_blocks({"blocks": "not-a-list"}) is None
    assert blocks.page_blocks({"no_blocks_key": []}) is None
    assert blocks.page_blocks("garbage") is None
    assert blocks.page_blocks(None) is None
    assert blocks.page_blocks(123) is None


def test_clean_field_select_link_and_bool():
    assert blocks.clean_field("hero", "layout", "split") == "split"
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("hero", "layout", "diagonal")
    assert blocks.clean_field("hero", "ctaHref", "/pricing") == "/pricing"
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("hero", "ctaHref", "javascript:alert(1)")
    assert blocks.clean_field("banner", "dismissible", 1) is True
    assert blocks.clean_field("banner", "dismissible", "false") is False
    assert blocks.clean_field("banner", "dismissible", "True") is True
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("banner", "dismissible", "maybe")
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("hero", "nope", "x")


def test_build_block_stats_and_banner_addable():
    stats = blocks.build_block("stats", {"layout": "band", "items": [{"value": "500+", "label": "Students"}] * 20})
    assert stats["layout"] == "band" and len(stats["items"]) == 8
    assert stats["items"][0] == {"value": "500+", "label": "Students"}
    banner = blocks.build_block("banner", {"text": "Sale!", "linkHref": "/pricing", "dismissible": True})
    assert banner["text"] == "Sale!" and banner["dismissible"] is True


def test_build_block_accepts_presentation_fields():
    b = blocks.build_block("hero", {"heading": "Hi", "ctaHref": "/courses", "overlay": "light"})
    assert b["ctaHref"] == "/courses" and b["overlay"] == "light"


def test_edit_block_fields_changes_and_previews():
    new_pages, changes = blocks.edit_block_fields(
        PAGES, "home", "blk_hero", {"heading": "Welcome!", "ctaHref": "/pricing"}
    )
    hero = new_pages["home"]["blocks"][0]
    assert hero["heading"] == "Welcome!" and hero["ctaHref"] == "/pricing"
    assert {c["field"] for c in changes} == {"heading", "ctaHref"}
    assert next(c for c in changes if c["field"] == "heading") == {
        "field": "heading",
        "old": "Hi",
        "new": "Welcome!",
    }
    assert PAGES["home"]["blocks"][0]["heading"] == "Hi"  # input not mutated


def test_edit_block_fields_rejects_noop_empty_and_bad_values():
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_hero", {})
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_hero", {"heading": "Hi"})  # already that value
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_hero", {"layout": "diagonal"})
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_missing", {"heading": "x"})


def test_set_block_enabled_toggles_and_rejects_noop():
    hidden = blocks.set_block_enabled(PAGES, "home", "blk_hero", False)
    assert hidden["home"]["blocks"][0]["enabled"] is False
    with pytest.raises(blocks.BlockOpError):
        blocks.set_block_enabled(PAGES, "home", "blk_hero", True)  # already visible


def test_duplicate_block_inserts_copy_with_fresh_id():
    new_pages, new_id = blocks.duplicate_block(PAGES, "home", "blk_hero")
    ids = [b["id"] for b in new_pages["home"]["blocks"]]
    assert ids == ["blk_hero", new_id, "blk_intro"] and new_id != "blk_hero"
    assert new_pages["home"]["blocks"][1]["heading"] == "Hi"


def test_move_block_across_pages():
    pages = {"home": {"blocks": [dict(HERO)]}, "about": {"blocks": [dict(INTRO)]}}
    moved = blocks.move_block(pages, "home", "blk_hero", None, to_page="about")
    assert [b["id"] for b in moved["home"]["blocks"]] == []
    assert [b["id"] for b in moved["about"]["blocks"]] == ["blk_hero", "blk_intro"]
    after = blocks.move_block(pages, "home", "blk_hero", "blk_intro", to_page="about")
    assert [b["id"] for b in after["about"]["blocks"]] == ["blk_intro", "blk_hero"]
    with pytest.raises(blocks.BlockOpError):
        blocks.move_block(pages, "home", "blk_hero", None, to_page="nope")
