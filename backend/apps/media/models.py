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
    # A photo the coach uploaded herself (apps.media.own_photos): where it stands
    # on its way into her private search index. "" = not one of hers (a catalog
    # copy, a logo), "pending" = uploaded, not yet optimized, "queued" =
    # optimized, waiting to be sent, "indexing" = sent and being described,
    # "ready" = findable by what it shows, "failed" = left out of the index
    # (on her site all the same, found by its name).
    index_status = models.CharField(max_length=12, blank=True, default="", db_index=True)
    # Its upload id in the image service's private collection.
    catalog_id = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "media"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or self.s3_key


class Design(models.Model):
    """Something she designed, as the recipe the front end draws it from (design_recipe.py).

    It belongs to a target: a course (by id), or an event series (the event kind and its exact
    title). It stays a draft until she keeps it; a target has at most one kept design, and keeping
    a new one retires the old one.
    """

    TARGET_KINDS = [
        ("course", "Course"),
        ("live", "Live class"),
        ("stream", "Live stream"),
        ("zoom", "Zoom class"),
        ("onsite", "Onsite event"),
    ]
    STATES = [("draft", "Draft"), ("kept", "Kept"), ("retired", "Retired")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, default="cover")
    target_kind = models.CharField(max_length=10, choices=TARGET_KINDS)
    # The course id as text, or the event series title.
    target_key = models.CharField(max_length=200)
    state = models.CharField(max_length=10, choices=STATES, default="draft", db_index=True)
    recipe = models.JSONField()
    # "" = she made it herself, otherwise the key of the specialist who did.
    made_by = models.CharField(max_length=20, blank=True, default="")
    run_id = models.CharField(max_length=40, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    kept_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "media"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["kind", "target_kind", "target_key"],
                condition=models.Q(state="kept"),
                name="media_one_kept_design_per_target",
            ),
        ]

    def __str__(self):
        return f"{self.kind} {self.target_kind}:{self.target_key} ({self.state})"
