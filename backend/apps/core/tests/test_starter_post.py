"""Starter blog post: LLM step mocked; draft creation + idempotency."""

from types import SimpleNamespace

import pytest

from apps.core.onboarding import starter_post
from apps.core.onboarding.ai_curate import CoachBrief

pytestmark = pytest.mark.django_db(transaction=True)


FIELDS = {
    "title": "Welcome to Glow Studio",
    "body_html": "<p>Hi, I'm your coach.</p>",
    "excerpt": "A first hello.",
    "meta_description": "Welcome post.",
    "tags": ["welcome"],
    "ai_model": "claude-haiku-4-5",
    "cover_photo_id": "",
    "image_placements": [],
}


def test_generate_starter_draft_records_spend(monkeypatch):
    from apps.blog import ai as blog_ai
    from apps.core.onboarding import ai_compose

    spends = []
    monkeypatch.setattr(ai_compose, "record_spend", lambda schema, usd: spends.append((schema, usd)))
    monkeypatch.setattr(starter_post.blog_curated, "curated_candidates", lambda topic, limit=8: [])
    monkeypatch.setattr(
        blog_ai,
        "generate_post",
        lambda brief, topic, instructions="", photos=(): SimpleNamespace(fields=dict(FIELDS), cost_usd=0.02),
    )
    fields = starter_post.generate_starter_draft(CoachBrief(niche="yoga", brand_name="Glow Studio"), "glow")
    assert fields["title"] == "Welcome to Glow Studio"
    assert spends == [("glow", 0.02)]


def test_create_starter_post_is_draft_and_seeded(tenant_ctx):
    from apps.blog.models import BlogPost
    from apps.tenant_config.models import SeededObject

    post = starter_post.create_starter_post(dict(FIELDS), niche="yoga")
    assert post.status == "draft"
    assert post.source == "ai"
    assert post.slug  # derived server-side
    assert SeededObject.objects.filter(object_id=str(post.pk)).exists()
    # Second call: a post exists -> no duplicate.
    assert starter_post.create_starter_post(dict(FIELDS), niche="yoga") is None
    assert BlogPost.objects.count() == 1
