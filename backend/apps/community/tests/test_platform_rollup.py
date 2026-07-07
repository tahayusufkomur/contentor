import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post, Report

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def seeded_tenant_data(tenant_ctx):
    """Enable community in the shared tenant and create one open report + one pending post."""
    settings_obj = CommunitySettings.load()
    settings_obj.is_enabled = True
    settings_obj.save()
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    reporter = CommunityMember.objects.create(
        user=User.objects.create_user(email="r@x.com", name="R", password="pw123456"),
        display_name="R",
    )
    post = Post.objects.create(author=author, body="reported")
    Report.objects.create(reporter=reporter, post=post, reason="spam")
    Post.objects.create(author=author, body="pending", status="pending")
    return tenant_ctx


def _superadmin_client():
    connection.set_schema_to_public()
    admin = User.objects.create_superuser(email="root@x.com", name="Root", password="pw123456")
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=admin)
    return client


def test_rollup_requires_superuser(seeded_tenant_data):
    connection.set_schema_to_public()
    plain = User.objects.create_user(email="pleb@x.com", name="P", password="pw123456")
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=plain)
    assert client.get("/api/v1/platform/community/reports/").status_code == 403


def test_rollup_counts_shared_tenant(seeded_tenant_data):
    client = _superadmin_client()
    resp = client.get("/api/v1/platform/community/reports/")
    assert resp.status_code == 200
    body = resp.json()
    row = next((t for t in body["by_tenant"] if t["slug"] == "shared-test"), None)
    assert row is not None
    assert row["enabled"] is True
    assert row["open_reports"] == 1
    assert row["pending_posts"] == 1
    assert body["total_open_reports"] >= 1
