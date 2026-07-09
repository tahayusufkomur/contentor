"""Platform blog: public read, superadmin-only generate, USD-only metering
(runs in the PUBLIC schema — no tenant fixture)."""

from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog import ai
from apps.core.models import BlogAiUsage, PlatformBlogPost

pytestmark = pytest.mark.django_db

HOST = "shared-test.localhost"


def make_client(user=None):
    client = APIClient(HTTP_HOST=HOST)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def superadmin(restore_public):
    return User.objects.create(
        email="root@blogplatformtest.com", region="global", role="owner", is_staff=True, is_superuser=True
    )


@pytest.fixture()
def superadmin_client(superadmin):
    return make_client(superadmin)


@pytest.fixture(autouse=True)
def _clean():
    def _scrub():
        PlatformBlogPost.objects.all().delete()
        BlogAiUsage.objects.filter(tenant_schema="public").delete()

    _scrub()
    yield
    _scrub()


def test_public_list_and_detail(restore_public):
    PlatformBlogPost.objects.create(
        title="P", slug="p", status="published", published_at=timezone.now(), body_html="<p>x</p>"
    )
    PlatformBlogPost.objects.create(title="D", slug="d", status="draft")
    client = make_client()
    res = client.get("/api/v1/platform/blog/posts/")
    assert [x["slug"] for x in res.data["results"]] == ["p"]
    assert client.get("/api/v1/platform/blog/posts/d/").status_code == 404


def test_generate_requires_superuser(restore_public):
    res = make_client().post("/api/v1/platform/blog/generate/", {"topic": "x"}, format="json")
    assert res.status_code in (401, 403)


def test_generate_records_public_usage_no_quota(superadmin_client, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    result = ai.DraftResult(
        {"title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m", "tags": [], "ai_model": "x"},
        Decimal("0.03"),
    )
    with mock.patch.object(ai, "generate_post", return_value=result):
        res = superadmin_client.post(
            "/api/v1/platform/blog/generate/", {"topic": "why coaches need a website"}, format="json"
        )
    assert res.status_code == 200 and res.data["post"]["slug"]
    row = BlogAiUsage.objects.get(tenant_schema="public")
    assert row.usd_spent == Decimal("0.03")
