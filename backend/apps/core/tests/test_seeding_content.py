"""AI seeding of a 'complete site': a couple of niche AI blog drafts (noindex
until reviewed) and a few draft course outlines the coach can finish.
Fail-soft by design — AI is mocked here to avoid a live call; the
compose_available() gate is mocked too since test settings carry no
ANTHROPIC_API_KEY by default (mirrors apps/core/tests/test_reveal_compose.py)."""

from unittest import mock

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)


def _tenant(schema="seedc"):
    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name=schema, name=schema, slug=schema, subdomain=schema, owner_email=f"{schema}@e.com", region="global"
    )
    provision_tenant_schema(t, t.owner_email, "Owner", "en")
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_seeds_noindex_draft_posts(restore_public):
    from apps.core.onboarding import seeding_content

    t = _tenant("seedc_posts")
    fake = {
        "title": "Welcome",
        "body_html": "<p>hi</p>",
        "excerpt": "",
        "meta_description": "",
        "tags": [],
        "ai_model": "test",
        "image_placements": [],
        "cover_photo_id": "",
    }
    try:
        with (
            mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
            mock.patch.object(seeding_content, "_draft_one", return_value=fake),
            tenant_context(t),
        ):
            n = seeding_content.seed_starter_posts(t, brief=None, count=2)
            from apps.blog.models import BlogPost

            posts = list(BlogPost.objects.all())
            assert n == 2 and len(posts) == 2
            assert all(p.noindex and p.status == "draft" and p.source == "ai" for p in posts)
    finally:
        _drop("seedc_posts")
