import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post, PostStatus

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="u@x.com"):
    user = User.objects.create_user(email=email, name="U", password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_no_member_row_means_false_and_creates_nothing(enabled):
    client, user = make_client()
    resp = client.get("/api/v1/community/settings/")
    assert resp.status_code == 200
    assert resp.json()["has_new_posts"] is False
    assert not CommunityMember.objects.filter(user=user).exists()


def test_new_visible_post_flips_flag(enabled):
    client, user = make_client(email="m@x.com")
    CommunityMember.objects.create(user=user, display_name="M", last_seen_at=timezone.now())
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o@x.com", name="O", password="pw123456"),
        display_name="O",
    )
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is False

    Post.objects.create(author=other, body="fresh")
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is True

    # Visiting the community (GET me/) stamps last_seen and clears the flag.
    client.get("/api/v1/community/me/")
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is False


def test_hidden_posts_do_not_count(enabled):
    client, user = make_client(email="h@x.com")
    CommunityMember.objects.create(user=user, display_name="H", last_seen_at=timezone.now())
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o2@x.com", name="O2", password="pw123456"),
        display_name="O2",
    )
    Post.objects.create(author=other, body="hidden", status=PostStatus.HIDDEN)
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is False


def test_disabled_module_is_false(tenant_ctx):
    client, _ = make_client(email="d@x.com")
    resp = client.get("/api/v1/community/settings/")
    assert resp.json().get("has_new_posts") is False
