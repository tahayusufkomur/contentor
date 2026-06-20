from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Course(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="courses_taught",
    )
    filter_options = models.ManyToManyField(
        "filters.FilterOption", blank=True, related_name="courses"
    )
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="courses"
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid")],
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
    is_free_preview = models.BooleanField(default=False)

    class Meta:
        app_label = "courses"
        ordering = ["order"]

    def __str__(self):
        return self.title


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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "courses"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


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
