"""BlogPost slugging, BlogAutopilot singleton, topic queue basics."""

import pytest

from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea, unique_slug

pytestmark = pytest.mark.django_db(transaction=True)


def test_unique_slug_deduplicates(tenant_ctx):
    BlogPost.objects.create(title="Morning Habits", slug=unique_slug("Morning Habits"))
    assert unique_slug("Morning Habits") == "morning-habits-2"


def test_unique_slug_truncates_and_kebabs(tenant_ctx):
    slug = unique_slug("A" * 300 + " çok güzel Bir Başlık!!")
    assert len(slug) <= 60
    assert " " not in slug and slug == slug.lower()


def test_autopilot_singleton(tenant_ctx):
    a = BlogAutopilot.load()
    b = BlogAutopilot.load()
    assert a.pk == b.pk == 1
    assert a.is_enabled is False and a.auto_publish is False


def test_topic_defaults_available(tenant_ctx):
    t = BlogTopicIdea.objects.create(title="5 stretches", angle="quick wins")
    assert t.status == "available"


def test_blog_post_image_fields_default_empty(tenant_ctx):
    post = BlogPost.objects.create(title="x", slug="x")
    assert post.cover_photo is None
    assert post.image_placements == []


def test_blog_post_cover_photo_set_null_on_photo_delete(tenant_ctx):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="k", title="p")
    post = BlogPost.objects.create(title="x", slug="x", cover_photo=photo)
    photo.delete()
    post.refresh_from_db()
    assert post.cover_photo is None
