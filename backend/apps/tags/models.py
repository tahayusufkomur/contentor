from django.db import models
from django.utils.text import slugify

# The content types a tag can belong to. Each is its own free-text pool
# ("per content type"); the four event models all share the "event" pool.
SCOPES = [
    ("course", "Courses"),
    ("video", "Videos"),
    ("photo", "Photos"),
    ("download", "Downloads"),
    ("event", "Live events"),
]
SCOPE_VALUES = {value for value, _label in SCOPES}


class Tag(models.Model):
    """A flat, coach-defined free-text label used to organise and filter
    content in the admin. Tags are scoped per content type and never surface
    on the public/student side (that is the structured ``filters`` app)."""

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120)
    scope = models.CharField(max_length=10, choices=SCOPES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tags"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["scope", "slug"], name="uniq_tag_slug_per_scope")
        ]

    def __str__(self):
        return f"{self.get_scope_display()}: {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:120] or "tag"
            base = self.slug
            counter = 1
            while (
                Tag.objects.filter(scope=self.scope, slug=self.slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                self.slug = f"{base}-{counter}"
                counter += 1
        super().save(*args, **kwargs)
