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


@pytest.fixture()
def member(enabled):
    return CommunityMember.objects.create(
        user=User.objects.create_user(email="m@x.com", name="M", password="pw123456"),
        display_name="M",
    )


def _report_post(post, n=1):
    for i in range(n):
        reporter = CommunityMember.objects.create(
            user=User.objects.create_user(email=f"rep{i}-{post.id}@x.com", name="R", password="pw123456"),
            display_name="R",
        )
        Report.objects.create(reporter=reporter, post=post, reason="spam")


def test_queue_requires_moderator(enabled):
    client, _ = make_client("stu@x.com")
    assert client.get("/api/v1/community/moderation/queue/").status_code == 403


def test_queue_lists_open_reports_and_pending(coach_client, member):
    reported = Post.objects.create(author=member, body="reported")
    _report_post(reported)
    Post.objects.create(author=member, body="pending", status=PostStatus.PENDING)
    body = coach_client.get("/api/v1/community/moderation/queue/").json()
    assert len(body["reports"]) == 1
    assert body["reports"][0]["target_type"] == "post"
    assert body["reports"][0]["post"]["body"] == "reported"
    assert [p["body"] for p in body["pending_posts"]] == ["pending"]


def test_resolve_remove(coach_client, member):
    post = Post.objects.create(author=member, body="bad")
    _report_post(post, n=2)
    report = Report.objects.filter(post=post).first()
    resp = coach_client.post(
        f"/api/v1/community/moderation/reports/{report.id}/resolve/",
        {"action": "remove"},
        format="json",
    )
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.status == PostStatus.REMOVED
    assert Report.objects.filter(post=post, status="open").count() == 0
    assert set(Report.objects.filter(post=post).values_list("action_taken", flat=True)) == {"removed"}


def test_resolve_keep_restores_hidden(coach_client, member):
    post = Post.objects.create(author=member, body="fine", status=PostStatus.HIDDEN)
    _report_post(post)
    report = Report.objects.get(post=post)
    resp = coach_client.post(
        f"/api/v1/community/moderation/reports/{report.id}/resolve/",
        {"action": "keep"},
        format="json",
    )
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.status == PostStatus.VISIBLE


def test_remove_comment_decrements_count(coach_client, member):
    post = Post.objects.create(author=member, body="p", comment_count=1)
    comment = Comment.objects.create(post=post, author=member, body="c")
    resp = coach_client.post(f"/api/v1/community/moderation/comments/{comment.id}/remove/")
    assert resp.status_code == 204
    comment.refresh_from_db()
    post.refresh_from_db()
    assert comment.status == PostStatus.REMOVED
    assert post.comment_count == 0


def test_pin_unpin(coach_client, member):
    post = Post.objects.create(author=member, body="pin me")
    assert coach_client.post(f"/api/v1/community/moderation/posts/{post.id}/pin/").status_code == 204
    post.refresh_from_db()
    assert post.is_pinned is True
    assert coach_client.post(f"/api/v1/community/moderation/posts/{post.id}/unpin/").status_code == 204
    post.refresh_from_db()
    assert post.is_pinned is False


def test_approve_pending(coach_client, member):
    post = Post.objects.create(author=member, body="waiting", status=PostStatus.PENDING)
    resp = coach_client.post(f"/api/v1/community/moderation/posts/{post.id}/approve/")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.status == PostStatus.VISIBLE
