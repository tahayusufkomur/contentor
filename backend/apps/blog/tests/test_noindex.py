"""BlogPost.noindex: seeded AI drafts start noindex=True; a human editing the
post (perform_update) clears it so the post becomes indexable. Fixture pattern
copied from apps/blog/tests/test_admin_api.py."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog.models import BlogPost

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@noindextest.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def coach_client(coach):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


def test_noindex_defaults_false(tenant_ctx):
    p = BlogPost.objects.create(title="X", slug="x")
    assert p.noindex is False


def test_coach_edit_clears_noindex(coach_client):
    p = BlogPost.objects.create(title="Seeded", slug="seeded", noindex=True, source="ai")
    resp = coach_client.patch(f"/api/v1/admin/blog/posts/{p.pk}/", {"title": "Seeded edited"}, format="json")
    assert resp.status_code == 200
    p.refresh_from_db()
    assert p.noindex is False
