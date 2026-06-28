import uuid
from datetime import timedelta

from django.conf import settings
from django.db import connection, models
from django.utils import timezone


class _EventStatusMixin:
    """Compute status dynamically from scheduled_at + duration_minutes."""

    def _computed_status(self, live_label="live"):
        if self.scheduled_at is None:
            return "draft"
        now = timezone.now()
        end = self.scheduled_at + timedelta(minutes=self.duration_minutes)
        if now < self.scheduled_at:
            return "scheduled"
        if now < end:
            return live_label
        return "ended"

    def _computed_ended_at(self):
        if self.ended_at:
            return self.ended_at
        if self.scheduled_at:
            return self.scheduled_at + timedelta(minutes=self.duration_minutes)
        return None


class LiveClass(_EventStatusMixin, models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="live_classes",
    )
    filter_options = models.ManyToManyField("filters.FilterOption", blank=True, related_name="live_classes")
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="live_classes")
    status = models.CharField(
        max_length=20,
        choices=[
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("live", "Live"),
            ("ended", "Ended"),
        ],
        default="draft",
    )
    # Pricing
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_minutes = models.PositiveIntegerField(default=60)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="live_classes"
    )
    recording = models.ForeignKey(
        "courses.Video",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="live_class_recordings",
    )
    recording_url = models.CharField(max_length=2000, blank=True, default="")
    auto_recording = models.BooleanField(default=False)
    room_name = models.CharField(max_length=255, unique=True, editable=False)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "live"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    @property
    def computed_status(self):
        return self._computed_status("live")

    @property
    def computed_ended_at(self):
        return self._computed_ended_at()

    def save(self, *args, **kwargs):
        if not self.room_name:
            tenant_slug = getattr(connection.tenant, "slug", "unknown")
            self.room_name = f"{tenant_slug}-{uuid.uuid4().hex[:12]}"
        super().save(*args, **kwargs)


class LiveStream(_EventStatusMixin, models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="live_streams",
    )
    filter_options = models.ManyToManyField("filters.FilterOption", blank=True, related_name="live_streams")
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="live_streams")
    status = models.CharField(
        max_length=20,
        choices=[
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("live", "Live"),
            ("ended", "Ended"),
        ],
        default="draft",
    )
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_minutes = models.PositiveIntegerField(default=60)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="live_streams"
    )
    recording = models.ForeignKey(
        "courses.Video",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="live_stream_recordings",
    )
    recording_url = models.CharField(max_length=2000, blank=True, default="")
    auto_recording = models.BooleanField(default=False)
    room_name = models.CharField(max_length=255, unique=True, editable=False)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "live"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    @property
    def computed_status(self):
        return self._computed_status("live")

    @property
    def computed_ended_at(self):
        return self._computed_ended_at()

    def save(self, *args, **kwargs):
        if not self.room_name:
            tenant_slug = getattr(connection.tenant, "slug", "unknown")
            self.room_name = f"{tenant_slug}-ls-{uuid.uuid4().hex[:12]}"
        super().save(*args, **kwargs)


class ZoomClass(_EventStatusMixin, models.Model):
    """Live class hosted via external Zoom link."""

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="zoom_classes",
    )
    filter_options = models.ManyToManyField("filters.FilterOption", blank=True, related_name="zoom_classes")
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="zoom_classes")
    status = models.CharField(
        max_length=20,
        choices=[
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("live", "Live"),
            ("ended", "Ended"),
        ],
        default="draft",
    )
    zoom_link = models.URLField(max_length=500, blank=True, default="")
    zoom_meeting_id = models.CharField(max_length=100, blank=True, default="")
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_minutes = models.PositiveIntegerField(default=60)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="zoom_classes"
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "live"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    @property
    def computed_status(self):
        return self._computed_status("live")

    @property
    def computed_ended_at(self):
        return self._computed_ended_at()


class OnsiteEvent(_EventStatusMixin, models.Model):
    """In-person / on-site live event."""

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="onsite_events",
    )
    filter_options = models.ManyToManyField("filters.FilterOption", blank=True, related_name="onsite_events")
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="onsite_events")
    status = models.CharField(
        max_length=20,
        choices=[
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("ongoing", "Ongoing"),
            ("ended", "Ended"),
        ],
        default="draft",
    )
    location = models.CharField(max_length=500, blank=True, default="")
    address = models.TextField(blank=True, default="")
    max_capacity = models.PositiveIntegerField(null=True, blank=True)
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_minutes = models.PositiveIntegerField(default=60)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="onsite_events"
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "live"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    @property
    def computed_status(self):
        return self._computed_status("ongoing")

    @property
    def computed_ended_at(self):
        return self._computed_ended_at()
