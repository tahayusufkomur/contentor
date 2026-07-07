from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post, PostStatus
from apps.community.throttling import CommunityPostThrottle

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    yield
    cache.clear()


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="s@x.com", role="student"):
    user = User.objects.create_user(email=email, name="S", password="pw123456", role=role)
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_create_post(enabled):
    client, _ = make_client()
    resp = client.post("/api/v1/community/posts/", {"body": "hello world"}, format="json")
    assert resp.status_code == 201
    body = resp.json()
    assert body["body"] == "hello world"
    assert body["status"] == "visible"
    assert body["author"]["display_name"] == "S"


def test_create_post_rejects_five_images(enabled):
    client, _ = make_client()
    keys = [f"shared-test/community/{i}.jpg" for i in range(5)]
    resp = client.post("/api/v1/community/posts/", {"body": "x", "image_keys": keys}, format="json")
    assert resp.status_code == 400


def test_create_post_rejects_foreign_keys(enabled):
    client, _ = make_client()
    resp = client.post(
        "/api/v1/community/posts/",
        {"body": "x", "image_keys": ["shared-test/videos/secret.mp4"]},
        format="json",
    )
    assert resp.status_code == 400


def test_feed_first_page_has_pinned_and_excludes_hidden(enabled):
    client, user = make_client()
    member = CommunityMember.objects.create(
        user=User.objects.create_user(email="o@x.com", name="O", password="pw123456"),
        display_name="Other",
    )
    Post.objects.create(author=member, body="normal")
    Post.objects.create(author=member, body="pinned!", is_pinned=True)
    Post.objects.create(author=member, body="hidden", status=PostStatus.HIDDEN)
    resp = client.get("/api/v1/community/posts/")
    assert resp.status_code == 200
    body = resp.json()
    assert [p["body"] for p in body["pinned"]] == ["pinned!"]
    assert [p["body"] for p in body["results"]] == ["normal"]


def test_feed_cursor_pagination(enabled):
    client, _ = make_client()
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o2@x.com", name="O2", password="pw123456"),
        display_name="O2",
    )
    for i in range(25):
        Post.objects.create(author=other, body=f"post {i}")
    first = client.get("/api/v1/community/posts/").json()
    assert len(first["results"]) == 20
    assert first["next"]
    second = client.get(first["next"]).json()
    assert len(second["results"]) == 5
    assert "pinned" not in second


def test_author_sees_own_pending_post(enabled):
    client, user = make_client()
    CommunityMember.objects.create(user=user, display_name="S", requires_approval=True)
    resp = client.post("/api/v1/community/posts/", {"body": "await ok"}, format="json")
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"
    feed = client.get("/api/v1/community/posts/").json()
    assert [p["body"] for p in feed["results"]] == ["await ok"]
    other_client, _ = make_client(email="v@x.com")
    other_feed = other_client.get("/api/v1/community/posts/").json()
    assert other_feed["results"] == []


def test_edit_own_post_sets_edited_at(enabled):
    client, _ = make_client()
    post_id = client.post("/api/v1/community/posts/", {"body": "v1"}, format="json").json()["id"]
    resp = client.patch(f"/api/v1/community/posts/{post_id}/", {"body": "v2"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["body"] == "v2"
    assert resp.json()["edited_at"] is not None


def test_cannot_edit_others_post(enabled):
    client, _ = make_client()
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o3@x.com", name="O3", password="pw123456"),
        display_name="O3",
    )
    post = Post.objects.create(author=other, body="theirs")
    resp = client.patch(f"/api/v1/community/posts/{post.id}/", {"body": "hax"}, format="json")
    assert resp.status_code == 404


def test_delete_own_post_hard_deletes(enabled):
    client, _ = make_client()
    post_id = client.post("/api/v1/community/posts/", {"body": "bye"}, format="json").json()["id"]
    resp = client.delete(f"/api/v1/community/posts/{post_id}/")
    assert resp.status_code == 204
    assert not Post.objects.filter(id=post_id).exists()


def test_post_throttle(enabled):
    # SimpleRateThrottle.THROTTLE_RATES is snapshotted at class-definition time from
    # api_settings, so django.test.override_settings(REST_FRAMEWORK=...) does not
    # reach it — patch the throttle class attribute directly instead.
    with patch.object(CommunityPostThrottle, "THROTTLE_RATES", {"community_posts": "2/hour"}):
        client, _ = make_client()
        assert client.post("/api/v1/community/posts/", {"body": "1"}, format="json").status_code == 201
        assert client.post("/api/v1/community/posts/", {"body": "2"}, format="json").status_code == 201
        resp = client.post("/api/v1/community/posts/", {"body": "3"}, format="json")
        assert resp.status_code == 429
