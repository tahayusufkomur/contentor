import pytest
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


def make_client(email="s@x.com", role="student", **user_kwargs):
    user = User.objects.create_user(
        email=email, name="Student", password="pw123456", role=role, **user_kwargs
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_me_lazy_creates_member_with_defaults(enabled):
    client, user = make_client()
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Student"
    assert body["is_moderator"] is False
    member = CommunityMember.objects.get(user=user)
    assert member.last_seen_at is not None


def test_me_patch_updates_profile(enabled):
    client, _ = make_client()
    resp = client.patch(
        "/api/v1/community/me/",
        {"display_name": "Ayşe", "avatar_key": "shared-test/community/abc.jpg"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Ayşe"


def test_me_404_when_disabled(tenant_ctx):
    client, _ = make_client()
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 404


def test_me_403_when_banned(enabled):
    client, user = make_client()
    CommunityMember.objects.create(user=user, display_name="X", is_banned=True)
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 403


def test_presign_accepts_images_only(enabled):
    client, _ = make_client()
    resp = client.post(
        "/api/v1/community/presign/",
        {"filename": "cv.pdf", "content_type": "application/pdf"},
        format="json",
    )
    assert resp.status_code == 400


def test_presign_returns_upload_url(enabled):
    client, _ = make_client()
    resp = client.post(
        "/api/v1/community/presign/",
        {"filename": "photo.jpg", "content_type": "image/jpeg"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["method"] == "PUT"
    assert "community" in body["s3_key"]
    assert body["upload_url"]
