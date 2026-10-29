from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils.translation import gettext as _
from django.utils.translation import ngettext

from apps.core.slugs import slugify

# A lesson with nothing for a student yet: no video, and no text of hers. Text
# the AI drafted (``drafted_html``) and she has not touched does not count.
EMPTY_LESSON = Q(video__isnull=True, video_url="") & (Q(content_html="") | Q(content_html=F("drafted_html")))


def publish_gap(empty: int, total: int) -> str | None:
    """Why a course with ``total`` lessons, ``empty`` of them empty, cannot go
    live yet; None when it can."""
    if not total:
        return _(
            "a course goes live once every lesson has a video, or text you wrote or edited, and it has no lessons yet"
        )
    if empty:
        return ngettext(
            "a course goes live once every lesson has a video, or text you wrote or edited, "
            "and %(empty)s of its %(total)s lessons have none yet",
            "a course goes live once every lesson has a video, or text you wrote or edited, "
            "and %(empty)s of its %(total)s lessons have none yet",
            empty,
        ) % {"empty": empty, "total": total}
    return None


class Course(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="courses_taught",
    )
    filter_options = models.ManyToManyField("filters.FilterOption", blank=True, related_name="courses")
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="courses")
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="courses"
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid"), ("subscription", "Included in subscription")],
        default="free",
    )
    is_published = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "courses"
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.title

    def not_ready(self) -> str | None:
        """Why it cannot go live yet, or None. Asked wherever a course goes
        live (owner, 2026-10-18): the course API, copilot.content.publish_course
        (the assistant, focus mode, /setup) and the studio's Publish action.
        Courses already live are left as they are."""
        lessons = Lesson.objects.filter(module__course=self)
        return publish_gap(lessons.filter(EMPTY_LESSON).count(), lessons.count())

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:200]
            # Ensure uniqueness
            original_slug = self.slug
            counter = 1
            while Course.objects.filter(slug=self.slug).exclude(pk=self.pk).exists():
                self.slug = f"{original_slug}-{counter}"
                counter += 1
        super().save(*args, **kwargs)


class Module(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    title = models.CharField(max_length=200)
    order = models.IntegerField(default=0)

    class Meta:
        app_label = "courses"
        ordering = ["order"]

    def __str__(self):
        return f"{self.course.title} - {self.title}"


class Lesson(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=200)
    order = models.IntegerField(default=0)
    video = models.ForeignKey("Video", null=True, blank=True, on_delete=models.SET_NULL, related_name="lessons")
    video_url = models.CharField(max_length=500, blank=True, default="")
    duration_seconds = models.IntegerField(default=0)
    content_html = models.TextField(blank=True, default="")
    # Exactly what the Content Creating Specialist wrote into content_html. The
    # text is hers once the two differ, so an edit needs no clearing hook.
    # db_default: a worker still on the old code mid-deploy inserts lessons
    # without this column.
    drafted_html = models.TextField(blank=True, default="", db_default="")
    is_free_preview = models.BooleanField(default=False)

    class Meta:
        app_label = "courses"
        ordering = ["order"]

    def __str__(self):
        return self.title

    def empty(self) -> bool:
        """EMPTY_LESSON, for code that holds the row."""
        no_video = self.video_id is None and not self.video_url
        return no_video and self.content_html in ("", self.drafted_html)


class Video(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    s3_key = models.CharField(max_length=500, blank=True, default="")
    duration_seconds = models.IntegerField(default=0)
    file_size = models.BigIntegerField(default=0)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="videos"
    )
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="videos")
    # Captions from Scribe (apps.courses.captions) for the file in captions_key,
    # while captions_job is the Scribe job still writing them: a new file
    # makes them stale until it is transcribed.
    captions_key = models.CharField(max_length=500, blank=True, default="")
    captions_job = models.CharField(max_length=64, blank=True, default="")
    captions_vtt = models.TextField(blank=True, default="")
    captions_language = models.CharField(max_length=8, blank=True, default="")
    # Every word of those captions, [[start, end, text], ...] in seconds (the text keeps its leading space):
    # what reels cut and highlight on (apps.reels). In the database too: code without this field still
    # inserts videos mid-deploy.
    captions_words = models.JSONField(default=list, blank=True, db_default=[])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "courses"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    @property
    def has_captions(self):
        return bool(self.captions_vtt) and self.captions_key == self.s3_key

    @property
    def has_words(self):
        return bool(self.captions_words) and self.captions_key == self.s3_key


class Enrollment(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="enrollments")
    enrolled_at = models.DateTimeField(auto_now_add=True)
    payment_id = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    # The coach's "Give access" on a student: the paywall opens the course for
    # these rows only, as a member's own enrollment outlives the membership.
    granted = models.BooleanField(default=False)
    # The terms this enrollment was bought or given on, stamped when it is created.
    access_starts_at = models.DateTimeField(null=True, blank=True)
    access_ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "courses"
        unique_together = ("user", "course")

    def __str__(self):
        return f"{self.user.email} -> {self.course.title}"


class Progress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="lesson_progress",
    )
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="progress_records")
    completed = models.BooleanField(default=False)
    watched_seconds = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "courses"
        unique_together = ("user", "lesson")

    def __str__(self):
        return f"{self.user.email} - {self.lesson.title}"
