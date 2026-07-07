from django.db.models import F
from django.utils import timezone

from .models import AUTO_HIDE_THRESHOLD, CommunityMember, Post, PostStatus, Report


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
    Post.objects.filter(pk=post.pk, comment_count__gte=max(0, -delta)).update(comment_count=F("comment_count") + delta)


def adjust_reaction_count(target, delta):
    type(target).objects.filter(pk=target.pk, reaction_count__gte=max(0, -delta)).update(
        reaction_count=F("reaction_count") + delta
    )


def report_target(member, *, post=None, comment=None, reason, detail=""):
    target = post or comment
    kwargs = {"post": post} if post else {"comment": comment}
    report, created = Report.objects.get_or_create(
        reporter=member, **kwargs, defaults={"reason": reason, "detail": detail}
    )
    if created:
        open_count = Report.objects.filter(status="open", **kwargs).count()
        if open_count >= AUTO_HIDE_THRESHOLD and target.status == PostStatus.VISIBLE:
            target.status = PostStatus.HIDDEN
            target.save(update_fields=["status"])
    return report


def resolve_target(*, post=None, comment=None, moderator, action):
    """action: 'remove' | 'keep'. Updates target status and resolves ALL open reports."""
    target = post or comment
    kwargs = {"post": post} if post else {"comment": comment}
    if action == "remove":
        if comment is not None and target.status in (PostStatus.VISIBLE, PostStatus.HIDDEN):
            adjust_comment_count(comment.post, -1)
        target.status = PostStatus.REMOVED
        target.save(update_fields=["status"])
    elif target.status == PostStatus.HIDDEN:
        target.status = PostStatus.VISIBLE
        target.save(update_fields=["status"])
    Report.objects.filter(status="open", **kwargs).update(
        status="resolved",
        action_taken="removed" if action == "remove" else "kept",
        resolved_by=moderator,
        resolved_at=timezone.now(),
    )
