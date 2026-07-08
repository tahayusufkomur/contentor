import logging

from celery import shared_task
from django_tenants.utils import get_tenant_model, tenant_context

from apps.notifications.models import PushSubscription
from apps.notifications.services import send_to_subscriptions

from .payloads import community_comment_payload, community_post_payload

logger = logging.getLogger(__name__)


def _with_tenant(schema_name):
    tenant_model = get_tenant_model()
    try:
        return tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return None


@shared_task
def fanout_community_post(post_id: int, schema_name: str) -> None:
    """Push to every member's subscriptions except the author's — but only for
    moderator-authored posts, and only while notify_on_coach_post is on."""
    tenant = _with_tenant(schema_name)
    if tenant is None:
        return
    with tenant_context(tenant):
        from .models import CommunitySettings, Post
        from .permissions import is_moderator

        post = Post.objects.select_related("author__user").filter(pk=post_id).first()
        if not post:
            return
        if not is_moderator(post.author.user):
            return
        if not CommunitySettings.load().notify_on_coach_post:
            return
        subs = PushSubscription.objects.filter(user__community_member__isnull=False).exclude(user=post.author.user)
        send_to_subscriptions(subs, community_post_payload(post.author.display_name, post.body))


@shared_task
def notify_post_comment(comment_id: int, schema_name: str) -> None:
    """Push to the post author when someone else comments on their post."""
    tenant = _with_tenant(schema_name)
    if tenant is None:
        return
    with tenant_context(tenant):
        from .models import Comment

        comment = Comment.objects.select_related("author", "post__author__user").filter(pk=comment_id).first()
        if not comment or comment.author_id == comment.post.author_id:
            return
        subs = PushSubscription.objects.filter(user=comment.post.author.user)
        send_to_subscriptions(subs, community_comment_payload(comment.author.display_name, comment.body))
