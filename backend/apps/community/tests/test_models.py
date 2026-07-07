import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.accounts.models import User
from apps.community.models import (
    CommunityMember,
    CommunitySettings,
    Comment,
    Post,
    PostStatus,
    Reaction,
    Report,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def member(tenant_ctx):
    user = User.objects.create_user(email="s1@x.com", name="Student One", password="pw123456")
    return CommunityMember.objects.create(user=user, display_name=user.name)


def test_settings_singleton_load(tenant_ctx):
    a = CommunitySettings.load()
    b = CommunitySettings.load()
    assert a.pk == b.pk == 1
    assert a.is_enabled is False
    assert a.notify_on_coach_post is True


def test_member_is_muted_property(member):
    assert member.is_muted is False
    member.muted_until = timezone.now() + timezone.timedelta(hours=1)
    assert member.is_muted is True
    member.muted_until = timezone.now() - timezone.timedelta(hours=1)
    assert member.is_muted is False


def test_post_defaults(member):
    post = Post.objects.create(author=member, body="hello")
    assert post.status == PostStatus.VISIBLE
    assert post.is_pinned is False
    assert post.image_keys == []
    assert post.comment_count == 0
    assert post.reaction_count == 0


def test_reaction_unique_per_member_and_post(member):
    post = Post.objects.create(author=member, body="hi")
    Reaction.objects.create(member=member, post=post, emoji="❤️")
    with pytest.raises(IntegrityError):
        Reaction.objects.create(member=member, post=post, emoji="👍")


def test_reaction_requires_exactly_one_target(member):
    post = Post.objects.create(author=member, body="hi")
    comment = Comment.objects.create(post=post, author=member, body="yo")
    with pytest.raises(IntegrityError):
        Reaction.objects.create(member=member, post=post, comment=comment, emoji="❤️")


def test_report_unique_per_reporter_and_target(member):
    post = Post.objects.create(author=member, body="hi")
    Report.objects.create(reporter=member, post=post, reason="spam")
    with pytest.raises(IntegrityError):
        Report.objects.create(reporter=member, post=post, reason="other")
