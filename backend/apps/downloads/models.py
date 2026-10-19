from django.db import models


class DownloadFile(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    file_url = models.CharField(max_length=500, blank=True, default="")
    file_size = models.BigIntegerField(default=0)
    download_count = models.IntegerField(default=0)
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid"), ("subscription", "Included in subscription")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tags = models.ManyToManyField("tags.Tag", blank=True, related_name="downloads")
    thumbnail = models.ForeignKey(
        "media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="downloads"
    )
    # False = a draft (focus mode makes these): hidden from students, the store and checkout until she publishes.
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "downloads"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
