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


# ── set_logo (logos.py) ─────────────────────────────────────────────────────

from apps.core.copilot import logos  # noqa: E402
from apps.core.models import CuratedLogo  # noqa: E402


def _logo_row(title, tags, image_key=None, enabled=True):
    return CuratedLogo.objects.create(
        title=title,
        tags=tags,
        image_key=image_key or f"platform/curated-logos/{title.lower().replace(' ', '-')}.png",
        enabled=enabled,
    )


def test_pick_logo_matches_description():
    CuratedLogo.objects.create(
        title="Lotus mark", tags="yoga,calm,flower", image_key="platform/curated-logos/lotus.png", enabled=True
    )
    CuratedLogo.objects.create(
        title="Barbell mark", tags="gym,strength", image_key="platform/curated-logos/barbell.png", enabled=True
    )
    row = logos.pick_logo("a calm lotus flower", "yoga")
    assert row.title == "Lotus mark"


def test_pick_logo_excludes_current():
    CuratedLogo.objects.create(title="Only", tags="yoga", image_key="platform/curated-logos/only.png", enabled=True)
    with pytest.raises(logos.LogoOpError):
        logos.pick_logo("anything", "yoga", exclude_s3_key="platform/curated-logos/only.png")


def test_pick_logo_ignores_disabled_and_non_platform_keys():
    _logo_row("Disabled", "yoga", enabled=False)
    _logo_row("Outside prefix", "yoga", image_key="tenants/evil.png")
    with pytest.raises(logos.LogoOpError):
        logos.pick_logo("yoga", "yoga")


def test_pick_logo_no_rows_raises():
    with pytest.raises(logos.LogoOpError):
        logos.pick_logo("anything", "yoga")


def test_materialize_curated_logo_creates_tenant_photo(tenant_ctx):
    from apps.core.curated_logos.materialize import materialize_curated_logo
    from apps.media.models import Photo

    row = CuratedLogo.objects.create(title="Mark", image_key="platform/curated-logos/mark.png", enabled=True)
    photo = materialize_curated_logo(row)
    again = materialize_curated_logo(row)
    assert photo.s3_key == row.image_key
    assert photo.pk == again.pk  # dedup by s3_key
    assert Photo.objects.filter(s3_key=row.image_key).count() == 1
    assert photo.width is None and photo.height is None
    assert photo.alt_text == "Mark"
