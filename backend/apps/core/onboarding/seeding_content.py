"""Seed a 'complete site': a couple of niche AI blog drafts (noindex until
reviewed) and a few draft course outlines the coach can finish. Fail-soft:
an AI failure seeds fewer (or zero) items and never raises — callers (the
reveal's compose_wizard_site) must always still reach 'ready'.
Spec: docs/superpowers/plans/2026-07-26-ai-seeding.md
"""

import logging

from apps.blog.curated import resolve_curated_photo_ids
from apps.blog.models import BlogPost, unique_slug
from apps.tenant_config.seeding import register_seeded

logger = logging.getLogger(__name__)

STARTER_TOPICS = [
    "Three things every beginner in {niche} should know",
    "How I help my {niche} students get results",
]


def _draft_one(brief, tenant_schema, topic):
    """One AI draft's fields dict, or None on failure. Mirrors
    starter_post.generate_starter_draft but with an explicit topic."""
    from apps.core.onboarding import starter_post

    try:
        return starter_post.generate_starter_draft(brief, tenant_schema, topic=topic)
    except Exception:  # noqa: BLE001 — fail-soft, seed fewer
        logger.warning("starter post draft failed for %s", tenant_schema)
        return None


def seed_starter_posts(tenant, brief, *, count=2) -> int:
    """Up to `count` AI draft BlogPosts (noindex=True, source="ai",
    registered seeded). Must run inside the caller's tenant_context. Returns
    how many were actually created."""
    from apps.core.onboarding import ai_compose

    if not ai_compose.compose_available():
        return 0
    niche = (getattr(brief, "niche", "") or "your topic").replace("_", " ")
    made = 0
    for i in range(count):
        topic = STARTER_TOPICS[i % len(STARTER_TOPICS)].format(niche=niche)
        fields = _draft_one(brief, tenant.schema_name, topic)
        if not fields:
            continue
        resolve_curated_photo_ids(fields)
        post = BlogPost.objects.create(
            slug=unique_slug(fields["title"]),
            status="draft",
            source="ai",
            noindex=True,
            cover_photo_id=fields.get("cover_photo_id") or None,
            title=fields["title"],
            body_html=fields["body_html"],
            excerpt=fields["excerpt"],
            meta_description=fields["meta_description"],
            tags=fields["tags"],
            ai_model=fields["ai_model"],
            image_placements=fields["image_placements"],
        )
        register_seeded([post], niche=tenant.template_niche or "general")
        made += 1
    return made
