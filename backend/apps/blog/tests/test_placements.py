"""Serve-time placement rendering: photo-id resolution + <figure> injection.
body_html never stores image URLs (presigned URLs expire) — images attach at
serialization time only."""

import pytest

from apps.blog.placements import inject_placement_images, resolve_placements

pytestmark = pytest.mark.django_db(transaction=True)


def test_inject_after_matching_h2():
    html = "<p>intro</p><h2>Stretch first</h2><p>body</p>"
    out = inject_placement_images(html, [{"heading": "Stretch first", "url": "https://x/img.png", "alt": "a"}])
    assert '<h2>Stretch first</h2><figure class="blog-inline-image">' in out
    assert '<img src="https://x/img.png" alt="a" loading="lazy" />' in out
    assert out.endswith("<p>body</p>")


def test_inject_skips_unmatched_heading_and_escapes():
    html = "<h2>A &amp; B</h2><p>x</p>"
    out = inject_placement_images(html, [{"heading": "A & B", "url": "u", "alt": ""}])
    assert "<figure" in out  # heading matched via HTML-escaped comparison
    out2 = inject_placement_images(html, [{"heading": "Nope", "url": "u", "alt": ""}])
    assert "<figure" not in out2


def test_resolve_drops_missing_and_malformed_photos(tenant_ctx):
    from apps.blog.models import BlogPost
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="platform/curated-photos/x.png", title="X", alt_text="alt x")
    post = BlogPost.objects.create(
        title="t",
        slug="t",
        image_placements=[
            {"heading": "Good", "photo_id": str(photo.id)},
            {"heading": "Gone", "photo_id": "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a"},
            {"heading": "Bad", "photo_id": "not-a-uuid"},
        ],
    )
    resolved = resolve_placements(post)
    assert len(resolved) == 1
    assert resolved[0]["heading"] == "Good"
    assert resolved[0]["alt"] == "alt x"
    assert resolved[0]["photo_id"] == str(photo.id)
    assert resolved[0]["url"]
