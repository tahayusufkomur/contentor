from django.db.models import F

from .models import CommunityMember, Post


def get_or_create_member(user):
    member, _ = CommunityMember.objects.get_or_create(
        user=user,
        defaults={
            "display_name": user.name or user.email.split("@")[0],
            "avatar_url": user.avatar_url or "",
        },
    )
    return member


def adjust_comment_count(post, delta):
    Post.objects.filter(pk=post.pk, comment_count__gte=max(0, -delta)).update(
        comment_count=F("comment_count") + delta
    )
