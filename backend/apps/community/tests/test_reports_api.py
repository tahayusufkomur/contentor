import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import (
    Comment,
    CommunityMember,
    CommunitySettings,
    Post,
    PostStatus,
    Report,
)

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email):
    user = User.objects.create_user(email=email, name=email.split("@")[0], password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def post(enabled):
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    return Post.objects.create(author=author, body="reportable")


def test_report_creates_open_report(post):
    client, _ = make_client("r1@x.com")
    resp = client.post(f"/api/v1/community/posts/{post.id}/report/", {"reason": "spam"}, format="json")
    assert resp.status_code == 204
    report = Report.objects.get(post=post)
    assert report.status == "open"
    assert report.reason == "spam"


def test_duplicate_report_idempotent(post):
    client, _ = make_client("r1@x.com")
    for _ in range(2):
        resp = client.post(f"/api/v1/community/posts/{post.id}/report/", {"reason": "spam"}, format="json")
        assert resp.status_code == 204
    assert Report.objects.filter(post=post).count() == 1


def test_invalid_reason_400(post):
    client, _ = make_client("r1@x.com")
    resp = client.post(f"/api/v1/community/posts/{post.id}/report/", {"reason": "ugly"}, format="json")
    assert resp.status_code == 400


def test_three_reports_auto_hide(post):
    for i in range(3):
        client, _ = make_client(f"r{i}@x.com")
        client.post(f"/api/v1/community/posts/{post.id}/report/", {"reason": "spam"}, format="json")
    post.refresh_from_db()
    assert post.status == PostStatus.HIDDEN
    viewer, _ = make_client("v@x.com")
    feed = viewer.get("/api/v1/community/posts/").json()
    assert feed["results"] == []


def test_comment_report_auto_hide(post):
    comment = Comment.objects.create(post=post, author=post.author, body="bad")
    for i in range(3):
        client, _ = make_client(f"c{i}@x.com")
        resp = client.post(
            f"/api/v1/community/comments/{comment.id}/report/",
            {"reason": "harassment"},
            format="json",
        )
        assert resp.status_code == 204
    comment.refresh_from_db()
    assert comment.status == PostStatus.HIDDEN
