"""One draft welcome blog post at provisioning time.

Reuses the blog writer's own machinery (generate_post + curated candidates +
resolve/materialize) so the post is indistinguishable from a coach-initiated
AI draft — but the spend lands on the ONBOARDING budget, not the coach's blog
quota. Draft-only, registered as seeded, erasable.
Spec: docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.blog import curated as blog_curated

if TYPE_CHECKING:
    from apps.core.onboarding.ai_curate import CoachBrief

MAX_CANDIDATE_PHOTOS = 8


def _blog_brief(brief: CoachBrief) -> str:
    return "\n".join(
        [
            "<brand_brief>",
            f"Brand: {brief.brand_name or 'a coaching brand'}",
            f"About: {brief.niche} — {brief.description[:200] or '-'}",
            "Audience: this coach's students and prospective students.",
            "</brand_brief>",
        ]
    )


def generate_starter_draft(brief: CoachBrief, tenant_schema: str) -> dict:
    """LLM step — safe for provision_tenant's worker thread (public-schema
    reads only). Returns BlogPost-ready fields with curated:<pk> photo ids
    still unresolved. Raises on any provider failure; spend is recorded
    either way against the onboarding budget."""
    from apps.blog import ai as blog_ai
    from apps.core.onboarding import ai_compose

    language = "Turkish" if brief.locale == "tr" else "English"
    topic = f"Welcome to {brief.brand_name or 'my studio'}: what I offer and how to start"
    instructions = (
        f"Write in {language}. This is the coach's very first post, introducing themselves and their "
        f"{brief.niche} practice to brand-new students. In the coach's own words: {brief.description[:300]}"
    )
    photos = blog_curated.curated_candidates(f"{brief.niche} {brief.description}", limit=MAX_CANDIDATE_PHOTOS)
    try:
        result = blog_ai.generate_post(_blog_brief(brief), topic, instructions, photos=photos)
    except blog_ai.BlogAiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise
    ai_compose.record_spend(tenant_schema, float(result.cost_usd or 0))
    return result.fields


def create_starter_post(fields: dict, niche: str):
    """Persist the draft. Must run inside the tenant context. Returns the
    BlogPost, or None when the tenant already has any post (retry safety)."""
    from apps.blog.models import BlogPost, unique_slug
    from apps.tenant_config.seeding import register_seeded

    if BlogPost.objects.exists():
        return None
    blog_curated.resolve_curated_photo_ids(fields)
    cover_id = fields.get("cover_photo_id") or ""
    post = BlogPost.objects.create(
        slug=unique_slug(fields["title"]),
        status="draft",
        source="ai",
        cover_photo_id=cover_id or None,
        title=fields["title"],
        body_html=fields["body_html"],
        excerpt=fields["excerpt"],
        meta_description=fields["meta_description"],
        tags=fields["tags"],
        ai_model=fields["ai_model"],
        image_placements=fields["image_placements"],
    )
    register_seeded([post], niche=niche)
    return post
