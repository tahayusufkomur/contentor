"""Copilot photo executors: pure pick/apply helpers behind set_block_image.
The pick is deterministic (token-overlap shortlist against the model's photo
description — no extra AI call); a block's current photo is traced back to
its curated source by s3_key so a re-pick can exclude it. DB writes happen
in the execute view, not here."""

import pytest

from apps.core.copilot import photos
from apps.core.models import CuratedPhoto

pytestmark = pytest.mark.django_db


def _row(title, tags, kind="hero", image_key=None, enabled=True):
    return CuratedPhoto.objects.create(
        title=title,
        tags=tags,
        kind=kind,
        image_key=image_key or f"platform/curated-photos/{title.lower().replace(' ', '-')}.jpg",
        enabled=enabled,
    )


def test_image_field_for_maps_supported_block_types():
    assert photos.image_field_for("hero") == "bgImage"
    assert photos.image_field_for("imageText") == "image"


def test_image_field_for_rejects_unsupported_type():
    with pytest.raises(photos.PhotoOpError, match="hero"):
        photos.image_field_for("faq")


def test_pick_photo_prefers_description_overlap():
    _row("City skyline", "city, urban, skyline")
    match = _row("Sunlit yoga studio", "yoga, studio, calm, warm")
    picked = photos.pick_photo("calm sunlit yoga studio", "yoga", field="bgImage")
    assert picked.pk == match.pk


def test_pick_photo_excludes_current_photo_key():
    first = _row("Sunlit yoga studio", "yoga, studio, calm")
    second = _row("Yoga mat close-up", "yoga, mat, floor", kind="stock")
    picked = photos.pick_photo("yoga", "yoga", field="image", exclude_s3_key=first.image_key)
    assert picked.pk == second.pk


def test_pick_photo_ignores_disabled_and_non_platform_keys():
    _row("Disabled", "yoga", enabled=False)
    _row("Outside prefix", "yoga", image_key="tenants/evil.jpg")
    with pytest.raises(photos.PhotoOpError):
        photos.pick_photo("yoga", "yoga", field="bgImage")


def test_pick_photo_hero_field_only_offers_hero_kind():
    _row("Yoga icon", "yoga", kind="icon")
    with pytest.raises(photos.PhotoOpError):
        photos.pick_photo("yoga", "yoga", field="bgImage")


def test_apply_block_image_sets_field_and_preserves_rest():
    pages = {
        "home": {
            "blocks": [
                {
                    "id": "blk_hero",
                    "type": "hero",
                    "enabled": True,
                    "heading": "Hi",
                    "bgImage": {"url": None, "photo_id": None},
                }
            ]
        }
    }
    new_pages = photos.apply_block_image(pages, "home", "blk_hero", "bgImage", "abc-123")
    block = new_pages["home"]["blocks"][0]
    assert block["bgImage"] == {"url": None, "photo_id": "abc-123"}
    assert block["heading"] == "Hi"
    # pure: the input dict is untouched
    assert pages["home"]["blocks"][0]["bgImage"] == {"url": None, "photo_id": None}


def test_apply_block_image_unknown_block_raises_user_safe_error():
    with pytest.raises(photos.PhotoOpError, match="blk_missing"):
        photos.apply_block_image({"home": {"blocks": []}}, "home", "blk_missing", "bgImage", "x")
