"""eval_compose_site's composer-side checks: a skeleton page (pure fallback
copy, no photos) fails both; AI-written copy and placed photos pass."""

from apps.core.management.commands.eval_compose_site import empty_slots, fallback_sections
from apps.core.onboarding import site_composer as sc
from apps.tenant_config import sections


def _home(brand="Maya Laurent"):
    blocks = sc.skeleton_pages("journal", niche="yoga", brand_name=brand, description="")["home"]["blocks"]
    return blocks, sc._ctx("yoga", brand, "")


def test_skeleton_sections_read_as_fallback():
    blocks, ctx = _home()
    flagged = fallback_sections("home", blocks, ctx)
    assert "hero" in flagged
    assert len(flagged) == len([b for b in blocks if sc._writable(sections.family_of(b["type"]))])


def test_written_copy_is_not_fallback():
    blocks, ctx = _home()
    hero = next(b for b in blocks if b["type"] == "section.hero")
    hero["headline"] = "Morning flow for stiff backs"
    assert "hero" not in fallback_sections("home", blocks, ctx)


def test_empty_photo_slots_are_reported_until_filled():
    blocks, _ctx = _home()
    missing = empty_slots(blocks)
    assert any(slot.startswith("hero.") for slot in missing)
    for block in blocks:
        family = sections.family_of(block["type"])
        for name in sections.image_fields(family):
            block[name] = {"photo_id": "p1"}
        for name, spec in sections.families()[family]["fields"].items():
            if spec["type"] == "items":
                for item in block.get(name) or []:
                    for sub, sub_spec in spec["fields"].items():
                        if sub_spec["type"] == "image":
                            item[sub] = {"photo_id": "p1"}
    assert empty_slots(blocks) == []
