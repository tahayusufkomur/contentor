"""Serve-time photo resolution: never bake a signed URL into stored content
(see the model docstring / spec §3) — these functions only ever run against
a response payload, never before a save()."""

from unittest import mock

import pytest

from apps.blog.images import resolve_cover_photo, resolve_inline_photos, splice_image_placements

pytestmark = pytest.mark.django_db(transaction=True)


def test_resolve_cover_photo_none_when_unset():
    post = mock.Mock(cover_photo_id=None, cover_photo=None)
    assert resolve_cover_photo(post) is None


def test_resolve_cover_photo_signs_fresh(settings):
    photo = mock.Mock(id="p1", s3_key="k", alt_text="a woman stretching")
    post = mock.Mock(cover_photo_id="p1", cover_photo=photo)
    with mock.patch("apps.blog.images.generate_presigned_download_url", return_value="https://signed/1"):
        resolved = resolve_cover_photo(post)
    assert resolved == {"id": "p1", "signed_url": "https://signed/1", "alt_text": "a woman stretching"}


def test_resolve_inline_photos_empty_for_no_placements():
    assert resolve_inline_photos([]) == {}


def test_resolve_inline_photos_signs_each_referenced_photo(tenant_ctx):
    # apps.media.Photo is a TENANT_APPS model (schema-per-tenant), so writing
    # one requires an active tenant schema — plain `db` leaves the connection
    # on the public schema, where media_photo doesn't exist.
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="k", title="p", alt_text="stretching")
    with mock.patch("apps.blog.images.generate_presigned_download_url", return_value="https://signed/2"):
        resolved = resolve_inline_photos([{"heading": "Stretch first", "photo_id": str(photo.id)}])
    assert resolved == {
        str(photo.id): {"id": str(photo.id), "signed_url": "https://signed/2", "alt_text": "stretching"}
    }


def test_resolve_inline_photos_omits_deleted_photo(tenant_ctx):
    assert resolve_inline_photos([{"heading": "Gone", "photo_id": "00000000-0000-0000-0000-000000000000"}]) == {}


def test_resolve_inline_photos_skips_malformed_entries(tenant_ctx):
    # image_placements is writable via the admin API with no shape
    # validation — a missing photo_id key (or a non-dict entry entirely)
    # must not raise (this feeds the public blog detail page).
    assert resolve_inline_photos([{"heading": "x"}, "not-a-dict", {"photo_id": ""}]) == {}


def test_splice_inserts_after_matching_heading():
    html = "<h2>Intro</h2><p>hi</p><h2>Stretch first</h2><p>bend</p>"
    placements = [{"heading": "Stretch first", "photo_id": "p2"}]
    photos = {"p2": {"id": "p2", "signed_url": "https://signed/2", "alt_text": "stretching"}}
    out = splice_image_placements(html, placements, photos)
    assert '<h2>Stretch first</h2><img src="https://signed/2" alt="stretching" loading="lazy">' in out


def test_splice_matches_heading_with_apostrophe():
    # render_body() emits headings as plain text (markdown/nh3 only escape
    # &/</>), so apostrophes/quotes in a heading must stay literal for the
    # match to work — a naive quote=True escape would turn ' into &#x27;
    # and silently drop the placement.
    html = "<h2>Intro</h2><p>hi</p><h2>Here's Why</h2><p>bend</p>"
    placements = [{"heading": "Here's Why", "photo_id": "p2"}]
    photos = {"p2": {"id": "p2", "signed_url": "https://signed/2", "alt_text": "stretching"}}
    out = splice_image_placements(html, placements, photos)
    assert "<h2>Here's Why</h2><img src=\"https://signed/2\" alt=\"stretching\" loading=\"lazy\">" in out


def test_splice_skips_placement_with_no_matching_heading():
    html = "<h2>Intro</h2><p>hi</p>"
    placements = [{"heading": "Gone now", "photo_id": "p2"}]
    photos = {"p2": {"id": "p2", "signed_url": "https://signed/2", "alt_text": "x"}}
    assert splice_image_placements(html, placements, photos) == html


def test_splice_skips_placement_with_unresolvable_photo():
    html = "<h2>Stretch first</h2><p>bend</p>"
    placements = [{"heading": "Stretch first", "photo_id": "deleted"}]
    assert splice_image_placements(html, placements, {}) == html
