from django.db import models
from django.utils.text import slugify


class FilterGroup(models.Model):
    """A coach-defined filter dimension (the UI calls it a "Filter"), e.g.
    "Level" or "Style". Holds a set of selectable FilterOptions."""

    APPLIES_TO = [("course", "Courses"), ("event", "Events"), ("both", "Both")]

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True)
    applies_to = models.CharField(max_length=10, choices=APPLIES_TO, default="both")
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "filters"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name

    @property
    def option_count(self):
        return self.options.count()

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:120] or "filter"
            base = self.slug
            counter = 1
            while FilterGroup.objects.filter(slug=self.slug).exclude(pk=self.pk).exists():
                self.slug = f"{base}-{counter}"
                counter += 1
        super().save(*args, **kwargs)


class FilterOption(models.Model):
    """A selectable value within a FilterGroup (the UI calls it an "Option"),
    e.g. "Beginner" under the "Level" filter."""

    group = models.ForeignKey(FilterGroup, related_name="options", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120)
    order = models.IntegerField(default=0)

    class Meta:
        app_label = "filters"
        ordering = ["order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["group", "slug"], name="uniq_option_slug_per_group")
        ]

    def __str__(self):
        return f"{self.group.name}: {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:120] or "option"
            base = self.slug
            counter = 1
            while (
                FilterOption.objects.filter(group=self.group, slug=self.slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                self.slug = f"{base}-{counter}"
                counter += 1
        super().save(*args, **kwargs)
