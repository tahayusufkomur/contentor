import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email, role="student", is_staff=False):
    user = User.objects.create_user(
        email=email, name=email.split("@")[0], password="pw123456", role=role, is_staff=is_staff
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def coach_client(enabled):
    client, _ = make_client("coach@x.com", role="owner", is_staff=True)
    return client


def test_ban_blocks_everything(coach_client, enabled):
    student, user = make_client("s@x.com")
    student.post("/api/v1/community/posts/", {"body": "hi"}, format="json")
    member = CommunityMember.objects.get(user=user)
    assert coach_client.post(f"/api/v1/community/moderation/members/{member.id}/ban/").status_code == 204
    assert student.get("/api/v1/community/posts/").status_code == 403
    assert student.post("/api/v1/community/posts/", {"body": "x"}, format="json").status_code == 403
    assert coach_client.post(f"/api/v1/community/moderation/members/{member.id}/unban/").status_code == 204
    assert student.get("/api/v1/community/posts/").status_code == 200


def test_mute_blocks_writes_only(coach_client, enabled):
    student, user = make_client("s2@x.com")
    student.get("/api/v1/community/me/")
    member = CommunityMember.objects.get(user=user)
    resp = coach_client.post(f"/api/v1/community/moderation/members/{member.id}/mute/", {"days": 7}, format="json")
    assert resp.status_code == 204
    member.refresh_from_db()
    assert member.muted_until > timezone.now()
    assert student.get("/api/v1/community/posts/").status_code == 200
    assert student.post("/api/v1/community/posts/", {"body": "x"}, format="json").status_code == 403
    resp = coach_client.post(f"/api/v1/community/moderation/members/{member.id}/mute/", {"days": 0}, format="json")
    assert resp.status_code == 204
    assert student.post("/api/v1/community/posts/", {"body": "x"}, format="json").status_code == 201


def test_require_approval_flow(coach_client, enabled):
    student, user = make_client("s3@x.com")
    student.get("/api/v1/community/me/")
    member = CommunityMember.objects.get(user=user)
    resp = coach_client.post(
        f"/api/v1/community/moderation/members/{member.id}/require-approval/",
        {"value": True},
        format="json",
    )
    assert resp.status_code == 204
    created = student.post("/api/v1/community/posts/", {"body": "pending?"}, format="json").json()
    assert created["status"] == "pending"


def test_members_list_with_search_and_counts(coach_client, enabled):
    student, user = make_client("ayse@x.com")
    student.post("/api/v1/community/posts/", {"body": "1"}, format="json")
    student.post("/api/v1/community/posts/", {"body": "2"}, format="json")
    body = coach_client.get("/api/v1/community/moderation/members/?q=ayse").json()
    assert len(body["results"]) == 1
    row = body["results"][0]
    assert row["post_count"] == 2
    assert row["email"] == "ayse@x.com"


def test_members_endpoints_require_moderator(enabled):
    student, user = make_client("s4@x.com")
    student.get("/api/v1/community/me/")
    member = CommunityMember.objects.get(user=user)
    assert student.get("/api/v1/community/moderation/members/").status_code == 403
    assert student.post(f"/api/v1/community/moderation/members/{member.id}/ban/").status_code == 403
