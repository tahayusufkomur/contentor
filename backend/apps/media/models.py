import uuid

from django.db import models


class Photo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    s3_key = models.CharField(max_length=500)
    alt_text = models.CharField(max_length=300, blank=True, default="")
    title = models.CharField(max_length=200, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.BigIntegerField(default=0)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="photos")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "media"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or self.s3_key
