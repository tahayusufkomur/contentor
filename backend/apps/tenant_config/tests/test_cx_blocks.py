"""The cx block on the write path: every save re-validates the spec and
shapes the content by it."""

import pytest

from apps.tenant_config import sections
from apps.tenant_config.cx.blocks import clean_cx_block
from apps.tenant_config.serializers import TenantConfigSerializer
from apps.tenant_config.tests.cx_fixtures import ITINERARY_SPEC, itinerary_block


def test_a_valid_block_keeps_its_content_and_snapshot():
    out = clean_cx_block(itinerary_block())
    assert out["cx"] == {"ref": "cx_1a2b3c4d@1", "spec": ITINERARY_SPEC}
    assert out["heading"] == "How the week unfolds"
    assert out["days"][0]["image"]["photo_id"] == "p1"


def test_content_is_shaped_by_the_spec():
    block = itinerary_block(
        heading="word " * 100,
        junk="dropped",
        days=[{"title": "T", "when": "W", "evil": 1, "image": {"url": "javascript:alert(1)", "photo_id": None}}],
    )
    out = clean_cx_block(block)
    assert len(out["heading"]) <= 80
    assert "junk" not in out
    assert out["days"] == [{"when": "W", "title": "T", "image": {"url": None, "photo_id": None, "alt": None}}]


def test_a_forged_ref_is_cleared():
    out = clean_cx_block(itinerary_block(cx={"ref": "../../etc", "spec": ITINERARY_SPEC}))
    assert out["cx"]["ref"] is None


def test_a_block_without_a_usable_spec_is_dropped():
    assert clean_cx_block(itinerary_block(cx={"ref": None, "spec": {"tree": {"t": "Script"}}})) is None
    assert clean_cx_block(itinerary_block(cx="nope")) is None


def test_saved_block_survives_a_second_save():
    once = clean_cx_block(itinerary_block())
    assert clean_cx_block(once) == once


def test_pages_patch_with_hostile_cx_blocks_never_breaks():
    heading = {"heading": {"type": "text"}}
    hostile = [
        itinerary_block(id="blk_ok000001"),
        {
            "type": "cx",
            "cx": {
                "spec": {"fields": heading, "tree": {"t": "Section", "className": "x", "children": [{"t": "Opener"}]}}
            },
            "heading": "<img onerror=alert(1)>",
        },
        {
            "type": "cx",
            "cx": {
                "spec": {
                    "fields": heading,
                    "tree": {"t": "Section", "children": [{"t": "Text", "bind": "heading"}] * 5000},
                }
            },
        },
        {"type": "cx", "cx": None},
        {"type": "cx"},
    ]
    blocks = TenantConfigSerializer().validate_pages({"home": {"blocks": hostile}})["home"]["blocks"]
    assert len(blocks) == 3
    assert blocks[0]["id"] == "blk_ok000001"
    assert blocks[1]["cx"]["spec"]["tree"] == {
        "t": "Section",
        "tone": "base",
        "width": "wrap",
        "children": [{"t": "Opener"}],
    }
    assert blocks[1]["heading"] == "<img onerror=alert(1)>"  # plain text: React escapes it on render
    assert len(blocks[2]["cx"]["spec"]["tree"]["children"]) == 149


def test_restyling_a_site_leaves_cx_blocks_alone():
    block = clean_cx_block(itinerary_block())
    pages = {"home": {"blocks": [block, {"id": "blk_h", "type": "section.hero", "variant": "maison.intro"}]}}
    out = sections.restyle_pages(pages, "journal")
    assert out["home"]["blocks"][0] == block
    assert out["home"]["blocks"][1]["variant"] == "journal.intro"


@pytest.mark.django_db
def test_a_garbage_photo_id_never_breaks_signing():
    days = [{"when": "W", "title": "T", "image": {"url": None, "photo_id": "not-a-uuid", "alt": None}}]
    block = clean_cx_block(itinerary_block(days=days))
    TenantConfigSerializer()._sign_tree(block)  # Photo.pk is a UUID: a raw bad id used to raise ValidationError
