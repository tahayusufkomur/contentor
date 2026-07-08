import pytest

from apps.accounts.models import User
from apps.community.models import Comment, CommunityMember, CommunitySettings, Post
from apps.community import tasks
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def _member(email, name, role="student", is_staff=False):
    user = User.objects.create_user(
        email=email, name=name, password="pw123456", role=role, is_staff=is_staff
    )
    PushSubscription.objects.create(
        user=user, endpoint=f"https://push.example/{email}", p256dh="k", auth="a"
    )
    return CommunityMember.objects.create(user=user, display_name=name)


@pytest.fixture()
def sent(monkeypatch):
    """Capture (endpoints, payload) pairs instead of sending real pushes."""
    calls = []

    def fake_send(queryset, payload):
        calls.append((sorted(s.endpoint for s in queryset), payload))
        return len(calls[-1][0])

    monkeypatch.setattr(tasks, "send_to_subscriptions", fake_send)
    return calls


def test_coach_post_fans_out_to_everyone_but_author(enabled, sent, tenant_ctx):
    coach = _member("coach@x.com", "Coach", role="owner", is_staff=True)
    _member("s1@x.com", "S1")
    _member("s2@x.com", "S2")

    # Create a user with a push subscription but NO CommunityMember row
    non_member_user = User.objects.create_user(
        email="non-member@x.com", name="NonMember", password="pw123456"
    )
    PushSubscription.objects.create(
        user=non_member_user,
        endpoint="https://push.example/non-member@x.com",
        p256dh="k",
        auth="a",
    )

    post = Post.objects.create(author=coach, body="New class Friday!")

    tasks.fanout_community_post(post.id, tenant_ctx.schema_name)

    assert len(sent) == 1
    endpoints, payload = sent[0]
    # Verify that only members' endpoints are included, not the non-member
    assert endpoints == ["https://push.example/s1@x.com", "https://push.example/s2@x.com"]
    assert "https://push.example/non-member@x.com" not in endpoints
    assert payload["url"] == "/community"
    assert "Coach" in payload["title"]


def test_student_post_does_not_fan_out(enabled, sent, tenant_ctx):
    student = _member("s3@x.com", "S3")
    post = Post.objects.create(author=student, body="hello")
    tasks.fanout_community_post(post.id, tenant_ctx.schema_name)
    assert sent == []


def test_notify_toggle_off_suppresses_fanout(enabled, sent, tenant_ctx):
    enabled.notify_on_coach_post = False
    enabled.save()
    coach = _member("coach2@x.com", "Coach2", role="coach")
    post = Post.objects.create(author=coach, body="quiet post")
    tasks.fanout_community_post(post.id, tenant_ctx.schema_name)
    assert sent == []


def test_comment_notifies_post_author_only(enabled, sent, tenant_ctx):
    author = _member("a@x.com", "Author")
    commenter = _member("c@x.com", "Commenter")
    post = Post.objects.create(author=author, body="post")
    comment = Comment.objects.create(post=post, author=commenter, body="nice!")

    tasks.notify_post_comment(comment.id, tenant_ctx.schema_name)

    assert len(sent) == 1
    endpoints, payload = sent[0]
    assert endpoints == ["https://push.example/a@x.com"]
    assert "Commenter" in payload["title"]


def test_own_comment_is_silent(enabled, sent, tenant_ctx):
    author = _member("a2@x.com", "Author2")
    post = Post.objects.create(author=author, body="post")
    comment = Comment.objects.create(post=post, author=author, body="self reply")
    tasks.notify_post_comment(comment.id, tenant_ctx.schema_name)
    assert sent == []


def test_deleted_post_is_noop(enabled, sent, tenant_ctx):
    tasks.fanout_community_post(999999, tenant_ctx.schema_name)
    assert sent == []


def test_post_create_enqueues_fanout(enabled, monkeypatch, tenant_ctx):
    from rest_framework.test import APIClient

    calls = []
    monkeypatch.setattr(
        "apps.community.tasks.fanout_community_post.delay",
        lambda *args: calls.append(args),
    )
    user = User.objects.create_user(
        email="q@x.com", name="Q", password="pw123456", role="owner", is_staff=True
    )
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    resp = client.post("/api/v1/community/posts/", {"body": "ping"}, format="json")
    assert resp.status_code == 201
    assert len(calls) == 1
    assert calls[0][0] == resp.json()["id"]
    assert calls[0][1] == "shared_test"


def test_pending_post_does_not_enqueue(enabled, monkeypatch, tenant_ctx):
    from rest_framework.test import APIClient

    calls = []
    monkeypatch.setattr(
        "apps.community.tasks.fanout_community_post.delay",
        lambda *args: calls.append(args),
    )
    user = User.objects.create_user(email="p@x.com", name="P", password="pw123456")
    CommunityMember.objects.create(user=user, display_name="P", requires_approval=True)
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    resp = client.post("/api/v1/community/posts/", {"body": "wait"}, format="json")
    assert resp.status_code == 201
    assert calls == []


def test_comment_create_enqueues_notify(enabled, monkeypatch, tenant_ctx):
    from rest_framework.test import APIClient

    calls = []
    monkeypatch.setattr(
        "apps.community.tasks.notify_post_comment.delay",
        lambda *args: calls.append(args),
    )
    author = _member("pa@x.com", "PA")
    post = Post.objects.create(author=author, body="post")
    user = User.objects.create_user(email="cm@x.com", name="CM", password="pw123456")
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    resp = client.post(
        f"/api/v1/community/posts/{post.id}/comments/", {"body": "hey"}, format="json"
    )
    assert resp.status_code == 201
    assert len(calls) == 1
    assert calls[0][0] == resp.json()["id"]
