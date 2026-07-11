"""Public endpoints: published-only, no auth required, drafts 404."""

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.blog.models import BlogPost

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def posts(tenant_ctx):
    BlogPost.objects.create(
        title="Pub", slug="pub", status="published", published_at=timezone.now(), body_html="<p>x</p>"
    )
    BlogPost.objects.create(title="Draft", slug="draft", status="draft")
    return tenant_ctx


def test_list_returns_only_published_without_auth(posts):
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/")
    assert res.status_code == 200
    slugs = [p["slug"] for p in res.data["results"]]
    assert slugs == ["pub"]
    assert "body_html" not in res.data["results"][0]  # list stays light


def test_detail_serves_published(posts):
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/pub/")
    assert res.status_code == 200
    assert res.data["body_html"] == "<p>x</p>"


def test_detail_404s_draft(posts):
    assert APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/draft/").status_code == 404


def test_detail_resolves_cover_photo_and_splices_inline_images(posts):
    from unittest import mock

    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="cover.jpg", title="Cover", alt_text="cover alt")
    inline = Photo.objects.create(s3_key="inline.jpg", title="Inline", alt_text="inline alt")
    post = BlogPost.objects.get(slug="pub")
    post.cover_photo = photo
    post.body_html = "<h2>Stretch first</h2><p>bend</p>"
    post.image_placements = [{"heading": "Stretch first", "photo_id": str(inline.id)}]
    post.save()

    with mock.patch(
        "apps.blog.images.generate_presigned_download_url",
        side_effect=lambda key: f"https://signed/{key}",
    ):
        res = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/pub/")

    assert res.data["cover_photo"] == {
        "id": str(photo.id),
        "signed_url": "https://signed/cover.jpg",
        "alt_text": "cover alt",
    }
    assert '<img src="https://signed/inline.jpg" alt="inline alt" loading="lazy">' in res.data["body_html"]


def test_detail_cover_photo_null_when_unset(posts):
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/pub/")
    assert res.data["cover_photo"] is None
