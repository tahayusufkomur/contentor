import uuid

from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver


class Reel(models.Model):
    """A short vertical clip of one of the coach's videos, for Instagram Reels, TikTok or YouTube Shorts: the
    stretch it takes, how it is framed and captioned, and its file once rendered (apps.reels)."""

    DRAFT, RENDERING, READY, FAILED = "draft", "rendering", "ready", "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    video = models.ForeignKey("courses.Video", on_delete=models.CASCADE, related_name="reels")
    # The stretch of the video, in its seconds.
    start = models.FloatField()
    end = models.FloatField()
    # The hook shown over the clip, and the text of the post it goes out with.
    title = models.CharField(max_length=120, blank=True, default="")
    caption = models.TextField(blank=True, default="")
    # How strongly the moment stands on its own, 1-10 (moments.py).
    score = models.PositiveSmallIntegerField(default=0)
    style = models.CharField(max_length=12, default="bold")
    layout = models.CharField(max_length=8, default="auto")
    options = models.JSONField(default=dict, blank=True)
    # The faces found around the stretch: {"from", "to", "width", "height", "samples"} (framing.py).
    faces = models.JSONField(default=dict, blank=True)
    # Photo ideas for cutaways ([{"at": s, "query"}]) and the photos found for them ([{"at": s, "photo"}]).
    ideas = models.JSONField(default=list, blank=True)
    cutaways = models.JSONField(default=list, blank=True)
    # Captions in another language: {"language", "groups": [{"start", "end", "text"}], "of": fingerprint}.
    translation = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, default=DRAFT)
    error = models.CharField(max_length=300, blank=True, default="")
    file_key = models.CharField(max_length=500, blank=True, default="")
    file_size = models.BigIntegerField(default=0)
    duration = models.FloatField(default=0)
    # What the file was rendered from (render.fingerprint): an edit since makes it stale.
    rendered = models.CharField(max_length=40, blank=True, default="")
    made_by = models.CharField(max_length=20, blank=True, default="coach")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "reels"
        ordering = ["-created_at", "start"]

    def __str__(self):
        return self.title or f"Reel of {self.video_id}"


@receiver(post_delete, sender=Reel)
def _forget_file(sender, instance, **kwargs):
    """A reel's video file goes with it, however it is deleted (its own Delete, or its video's)."""
    if instance.file_key:
        from . import render

        transaction.on_commit(lambda: render.forget(instance.file_key))
