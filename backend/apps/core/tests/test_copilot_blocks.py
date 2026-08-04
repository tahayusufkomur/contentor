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
