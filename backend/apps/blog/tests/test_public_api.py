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


def test_public_detail_has_cover_url_and_injected_images(tenant_ctx):
    from apps.blog.models import BlogPost
    from apps.media.models import Photo

    cover = Photo.objects.create(s3_key="platform/curated-photos/c.png", title="Cover")
    inline = Photo.objects.create(s3_key="platform/curated-photos/i.png", title="Inline", alt_text="inline alt")
    BlogPost.objects.create(
        title="Post", slug="post", status="published",
        body_html="<p>a</p><h2>Sec</h2><p>b</p>",
        cover_photo=cover,
        image_placements=[{"heading": "Sec", "photo_id": str(inline.id)}],
    )
    client = APIClient(HTTP_HOST="shared-test.localhost")
    res = client.get("/api/v1/blog/posts/post/")
    assert res.status_code == 200
    assert res.data["cover_photo_url"]
    assert '<figure class="blog-inline-image">' in res.data["body_html"]

    listing = client.get("/api/v1/blog/posts/")
    assert listing.data["results"][0]["cover_photo_url"]
