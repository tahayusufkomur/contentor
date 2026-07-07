import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import Comment, CommunityMember, CommunitySettings, Post, Reaction

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


def test_react_and_change_emoji(post):
    client, _ = make_client()
    resp = client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "❤️"}, format="json")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 1
    resp = client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "💪"}, format="json")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 1
    assert Reaction.objects.get(post=post).emoji == "💪"


def test_invalid_emoji_400(post):
    client, _ = make_client()
    resp = client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "🦄"}, format="json")
    assert resp.status_code == 400


def test_unreact_idempotent(post):
    client, _ = make_client()
    client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "❤️"}, format="json")
    assert client.delete(f"/api/v1/community/posts/{post.id}/reaction/").status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 0
    assert client.delete(f"/api/v1/community/posts/{post.id}/reaction/").status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 0


def test_comment_reaction(post):
    client, _ = make_client()
    comment = Comment.objects.create(post=post, author=post.author, body="c")
    resp = client.put(f"/api/v1/community/comments/{comment.id}/reaction/", {"emoji": "🎉"}, format="json")
    assert resp.status_code == 204
    comment.refresh_from_db()
    assert comment.reaction_count == 1


def test_my_reaction_in_feed(post):
    client, _ = make_client()
    client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "❤️"}, format="json")
    feed = client.get("/api/v1/community/posts/").json()
    assert feed["results"][0]["my_reaction"] == "❤️"
