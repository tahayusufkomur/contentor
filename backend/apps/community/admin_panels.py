"""Studio admin-kit registrations for the community module (tenant schema).

The coach's day-to-day moderation lives at /admin/community; these panels are
the raw-data fallback (and what platform staff use via impersonation).
"""

from django.utils.translation import gettext_lazy, ngettext, pgettext_lazy

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site
from apps.core.permissions import IsCoachOrOwner

from .models import Comment, CommunityMember, Post, PostStatus, Report


@studio_site.register(Post)
class CommunityPostAdmin(ModelAdmin):
    label = gettext_lazy("Community Post")
    label_plural = gettext_lazy("Community Posts")
    key = "community-posts"
    icon = "message-square"
    description = gettext_lazy("Every community post, including hidden and removed ones.")
    field_labels = {
        "author": gettext_lazy("Author"),
        "body": gettext_lazy("Text"),
        "status": gettext_lazy("Status"),
        "is_pinned": gettext_lazy("Pinned"),
        "comment_count": gettext_lazy("Comments"),
        "reaction_count": gettext_lazy("Reactions"),
        "created_at": gettext_lazy("Created"),
    }
    permission_classes = (IsCoachOrOwner,)
    list_display = ("author", "body", "status", "is_pinned", "comment_count", "reaction_count", "created_at")
    search_fields = ("body", "author__display_name")
    list_filters = ("status", "is_pinned")
    ordering = ("-created_at",)
    fields = ("body", "status", "is_pinned")
    readonly_fields = ("comment_count", "reaction_count")

    @admin_action(
        label=gettext_lazy("Remove"),
        style="danger",
        confirm=gettext_lazy("Remove selected posts from the community?"),
    )
    def remove(self, request, queryset):
        updated = queryset.exclude(status=PostStatus.REMOVED).update(status=PostStatus.REMOVED)
        return ngettext("Removed %(count)d post.", "Removed %(count)d posts.", updated) % {"count": updated}


@studio_site.register(Comment)
class CommunityCommentAdmin(ModelAdmin):
    label = gettext_lazy("Community Comment")
    label_plural = gettext_lazy("Community Comments")
    key = "community-comments"
    icon = "message-circle"
    description = gettext_lazy("Every community comment, including removed ones.")
    field_labels = {
        "author": gettext_lazy("Author"),
        "body": gettext_lazy("Text"),
        "status": gettext_lazy("Status"),
        "post": pgettext_lazy("column of a comment: the post it is on", "Post"),
        "created_at": gettext_lazy("Created"),
    }
    permission_classes = (IsCoachOrOwner,)
    list_display = ("author", "body", "status", "post", "created_at")
    search_fields = ("body", "author__display_name")
    list_filters = ("status",)
    ordering = ("-created_at",)
    fields = ("body", "status")

    @admin_action(label=gettext_lazy("Remove"), style="danger", confirm=gettext_lazy("Remove selected comments?"))
    def remove(self, request, queryset):
        updated = queryset.exclude(status=PostStatus.REMOVED).update(status=PostStatus.REMOVED)
        return ngettext("Removed %(count)d comment.", "Removed %(count)d comments.", updated) % {"count": updated}


@studio_site.register(Report)
class CommunityReportAdmin(ModelAdmin):
    label = gettext_lazy("Community Report")
    label_plural = gettext_lazy("Community Reports")
    key = "community-reports"
    icon = "flag"
    description = gettext_lazy("Member reports on posts and comments. Resolve them from Community → Reports.")
    field_labels = {
        "reporter": gettext_lazy("Reporter"),
        "reason": gettext_lazy("Reason"),
        "status": gettext_lazy("Status"),
        "action_taken": gettext_lazy("Action taken"),
        "detail": gettext_lazy("Details"),
        "resolved_by": gettext_lazy("Resolved by"),
        "resolved_at": gettext_lazy("Resolved"),
        "created_at": gettext_lazy("Created"),
    }
    permission_classes = (IsCoachOrOwner,)
    list_display = ("reporter", "reason", "status", "action_taken", "created_at")
    search_fields = ("reporter__display_name", "detail")
    list_filters = ("status", "reason")
    ordering = ("-created_at",)
    fields = ("reason", "detail", "status", "action_taken")
    readonly_fields = ("reporter", "resolved_by", "resolved_at")


@studio_site.register(CommunityMember)
class CommunityMemberAdmin(ModelAdmin):
    label = gettext_lazy("Community Member")
    label_plural = gettext_lazy("Community Members")
    key = "community-members"
    icon = "users"
    description = gettext_lazy("Community profiles with moderation state (ban / mute / approval).")
    field_labels = {
        "display_name": gettext_lazy("Display name"),
        "is_banned": gettext_lazy("Banned"),
        "muted_until": gettext_lazy("Muted until"),
        "requires_approval": gettext_lazy("Needs approval"),
        "joined_at": gettext_lazy("Joined"),
    }
    permission_classes = (IsCoachOrOwner,)
    list_display = ("display_name", "is_banned", "muted_until", "requires_approval", "joined_at")
    search_fields = ("display_name", "user__email")
    list_filters = ("is_banned", "requires_approval")
    ordering = ("-joined_at",)
    fields = ("display_name", "is_banned", "muted_until", "requires_approval")
