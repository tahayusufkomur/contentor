from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

REACTION_EMOJIS = ["❤️", "👍", "🎉", "💪", "😂"]
AUTO_HIDE_THRESHOLD = 3
MAX_POST_IMAGES = 4


class CommunitySettings(models.Model):
    """Per-tenant singleton (pk=1). is_enabled is the feature gate — the
    legacy "community" entry in TenantConfig.enabled_modules is inert."""

    is_enabled = models.BooleanField(default=False)
    welcome_message = models.TextField(blank=True, default="")
    notify_on_coach_post = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class CommunityMember(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="community_member"
    )
    display_name = models.CharField(max_length=150)
    avatar_url = models.URLField(blank=True, default="")  # stable external URL (from user)
    avatar_key = models.CharField(max_length=500, blank=True, default="")  # uploaded, signed at read
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    is_banned = models.BooleanField(default=False)
    muted_until = models.DateTimeField(null=True, blank=True)
    requires_approval = models.BooleanField(default=False)

    @property
    def is_muted(self):
        return bool(self.muted_until and self.muted_until > timezone.now())


class PostStatus(models.TextChoices):
    VISIBLE = "visible", "Visible"
    PENDING = "pending", "Pending approval"
    HIDDEN = "hidden", "Auto-hidden by reports"
    REMOVED = "removed", "Removed by moderator"


class Post(models.Model):
    author = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="posts")
    body = models.TextField(max_length=10000)
    image_keys = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=PostStatus.choices, default=PostStatus.VISIBLE)
    is_pinned = models.BooleanField(default=False)
    comment_count = models.PositiveIntegerField(default=0)
    reaction_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "is_pinned", "-created_at"])]


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="comments")
    body = models.TextField(max_length=5000)
    status = models.CharField(max_length=10, choices=PostStatus.choices, default=PostStatus.VISIBLE)
    reaction_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class Reaction(models.Model):
    member = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="reactions")
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE, related_name="reactions")
    comment = models.ForeignKey(
        Comment, null=True, blank=True, on_delete=models.CASCADE, related_name="reactions"
    )
    emoji = models.CharField(max_length=8)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["member", "post"], condition=Q(post__isnull=False), name="uniq_reaction_member_post"
            ),
            models.UniqueConstraint(
                fields=["member", "comment"],
                condition=Q(comment__isnull=False),
                name="uniq_reaction_member_comment",
            ),
            models.CheckConstraint(
                condition=Q(post__isnull=False, comment__isnull=True)
                | Q(post__isnull=True, comment__isnull=False),
                name="reaction_exactly_one_target",
            ),
        ]


class Report(models.Model):
    REASON_CHOICES = [
        ("spam", "Spam"),
        ("inappropriate", "Inappropriate"),
        ("harassment", "Harassment"),
        ("other", "Other"),
    ]
    STATUS_CHOICES = [("open", "Open"), ("resolved", "Resolved")]
    ACTION_CHOICES = [("removed", "Removed"), ("kept", "Kept")]

    reporter = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="reports")
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE, related_name="reports")
    comment = models.ForeignKey(
        Comment, null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    detail = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="open")
    action_taken = models.CharField(max_length=10, choices=ACTION_CHOICES, blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["reporter", "post"], condition=Q(post__isnull=False), name="uniq_report_reporter_post"
            ),
            models.UniqueConstraint(
                fields=["reporter", "comment"],
                condition=Q(comment__isnull=False),
                name="uniq_report_reporter_comment",
            ),
            models.CheckConstraint(
                condition=Q(post__isnull=False, comment__isnull=True)
                | Q(post__isnull=True, comment__isnull=False),
                name="report_exactly_one_target",
            ),
        ]
