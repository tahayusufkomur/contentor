"""Coach blog: public posts on the tenant site, an AI topic queue, and the
autopilot schedule rule. See docs/superpowers/specs/2026-07-09-ai-blog-design.md."""

from django.conf import settings
from django.db import models
from django.utils.text import slugify

MAX_SLUG_LEN = 60


def unique_slug(title):
    """Kebab slug from a title, unique among BlogPosts (suffix -2, -3, …).
    Always derived server-side — never trusted from AI or client input."""
    base = slugify(title)[:MAX_SLUG_LEN].strip("-") or "post"
    slug, n = base, 1
    while BlogPost.objects.filter(slug=slug).exists():
        n += 1
        slug = f"{base[: MAX_SLUG_LEN - len(str(n)) - 1]}-{n}"
    return slug


class BlogPost(models.Model):
    STATUS = [("draft", "Draft"), ("published", "Published")]
    SOURCE = [("manual", "Manual"), ("ai", "AI"), ("autopilot", "Autopilot")]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=70, unique=True)
    body_html = models.TextField(blank=True, default="")  # sanitized HTML only
    excerpt = models.CharField(max_length=300, blank=True, default="")
    meta_description = models.CharField(max_length=170, blank=True, default="")
    tags = models.JSONField(default=list, blank=True)
    cover_photo = models.ForeignKey(
        "media.Photo", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    image_placements = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default="draft")
    source = models.CharField(max_length=12, choices=SOURCE, default="manual")
    ai_model = models.CharField(max_length=60, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "blog"
        ordering = ["-created_at"]

    def __str__(self):
        return f"BlogPost<{self.pk}:{self.slug}:{self.status}>"


class BlogTopicIdea(models.Model):
    """AI-suggested topics. Batched 12-at-a-time on the cheap model so picking
    a topic never costs a per-decision LLM call (token-efficiency contract)."""

    STATUS = [("available", "Available"), ("used", "Used"), ("dismissed", "Dismissed")]

    title = models.CharField(max_length=200)
    angle = models.CharField(max_length=300, blank=True, default="")
    status = models.CharField(max_length=12, choices=STATUS, default="available")
    batch_id = models.CharField(max_length=36, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "blog"
        ordering = ["created_at"]


class BlogAutopilot(models.Model):
    """Singleton (pk=1) per tenant: the hands-off generation schedule.
    Field shapes mirror notifications.RecurringAnnouncement so the shared
    recurrence.next_occurrence() math applies unchanged."""

    FREQ = [("weekly", "Weekly"), ("monthly", "Monthly")]

    is_enabled = models.BooleanField(default=False)
    frequency = models.CharField(max_length=10, choices=FREQ, default="weekly")
    generate_time = models.TimeField(default="09:00")
    weekday = models.SmallIntegerField(null=True, blank=True)  # 0=Mon..6=Sun (weekly)
    day_of_month = models.SmallIntegerField(null=True, blank=True)  # 1..31 (monthly)
    auto_publish = models.BooleanField(default=False)  # False = review-first draft
    next_run_at = models.DateTimeField(null=True, blank=True)
    # "YYYY-MM" of the last out-of-credits notice, so a weekly schedule doesn't
    # nag the coach 4x in an exhausted month.
    last_skip_notice_month = models.CharField(max_length=7, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "blog"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
