"""Studio admin-kit registrations for the community module (tenant schema).

The coach's day-to-day moderation lives at /admin/community; these panels are
the raw-data fallback (and what platform staff use via impersonation).
"""

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site
from apps.core.permissions import IsCoachOrOwner

from .models import Comment, CommunityMember, Post, PostStatus, Report


@studio_site.register(Post)
class CommunityPostAdmin(ModelAdmin):
    label = "Community Post"
    label_plural = "Community Posts"
    key = "community-posts"
    icon = "message-square"
    description = "Every community post, including hidden and removed ones."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("author", "body", "status", "is_pinned", "comment_count", "reaction_count", "created_at")
    search_fields = ("body", "author__display_name")
    list_filters = ("status", "is_pinned")
    ordering = ("-created_at",)
    fields = ("body", "status", "is_pinned")
    readonly_fields = ("comment_count", "reaction_count")

    @admin_action(label="Remove", style="danger", confirm="Remove selected posts from the community?")
    def remove(self, request, queryset):
        updated = queryset.exclude(status=PostStatus.REMOVED).update(status=PostStatus.REMOVED)
        return f"Removed {updated} post(s)."


@studio_site.register(Comment)
class CommunityCommentAdmin(ModelAdmin):
    label = "Community Comment"
    label_plural = "Community Comments"
    key = "community-comments"
    icon = "message-circle"
    description = "Every community comment, including removed ones."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("author", "body", "status", "post", "created_at")
    search_fields = ("body", "author__display_name")
    list_filters = ("status",)
    ordering = ("-created_at",)
    fields = ("body", "status")

    @admin_action(label="Remove", style="danger", confirm="Remove selected comments?")
    def remove(self, request, queryset):
        updated = queryset.exclude(status=PostStatus.REMOVED).update(status=PostStatus.REMOVED)
        return f"Removed {updated} comment(s)."


@studio_site.register(Report)
class CommunityReportAdmin(ModelAdmin):
    label = "Community Report"
    label_plural = "Community Reports"
    key = "community-reports"
    icon = "flag"
    description = "Member reports on posts and comments. Resolve them from Community → Reports."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("reporter", "reason", "status", "action_taken", "created_at")
    search_fields = ("reporter__display_name", "detail")
    list_filters = ("status", "reason")
    ordering = ("-created_at",)
    fields = ("reason", "detail", "status", "action_taken")
    readonly_fields = ("reporter", "resolved_by", "resolved_at")


@studio_site.register(CommunityMember)
class CommunityMemberAdmin(ModelAdmin):
    label = "Community Member"
    label_plural = "Community Members"
    key = "community-members"
    icon = "users"
    description = "Community profiles with moderation state (ban / mute / approval)."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("display_name", "is_banned", "muted_until", "requires_approval", "joined_at")
    search_fields = ("display_name", "user__email")
    list_filters = ("is_banned", "requires_approval")
    ordering = ("-joined_at",)
    fields = ("display_name", "is_banned", "muted_until", "requires_approval")
