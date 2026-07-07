import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import Comment, CommunityMember, CommunitySettings, Post, PostStatus

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="s@x.com"):
    user = User.objects.create_user(email=email, name="S", password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def post(enabled):
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    return Post.objects.create(author=author, body="a post")


def test_comment_bumps_count(post):
    client, _ = make_client()
    resp = client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": "nice"}, format="json")
    assert resp.status_code == 201
    post.refresh_from_db()
    assert post.comment_count == 1


def test_comments_listed_oldest_first(post):
    client, _ = make_client()
    for i in range(3):
        client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": f"c{i}"}, format="json")
    resp = client.get(f"/api/v1/community/posts/{post.id}/comments/")
    assert resp.status_code == 200
    assert [c["body"] for c in resp.json()["results"]] == ["c0", "c1", "c2"]


def test_comment_on_hidden_post_404(post):
    client, _ = make_client()
    post.status = PostStatus.HIDDEN
    post.save()
    resp = client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": "x"}, format="json")
    assert resp.status_code == 404


def test_delete_own_comment_decrements(post):
    client, _ = make_client()
    cid = client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": "bye"}, format="json").json()["id"]
    resp = client.delete(f"/api/v1/community/comments/{cid}/")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.comment_count == 0
    assert not Comment.objects.filter(id=cid).exists()


def test_cannot_delete_others_comment(post):
    client, _ = make_client()
    other_client, _ = make_client(email="o@x.com")
    cid = client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": "mine"}, format="json").json()["id"]
    resp = other_client.delete(f"/api/v1/community/comments/{cid}/")
    assert resp.status_code == 404
