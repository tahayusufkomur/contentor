from django.db import models


class DownloadFile(models.Model):
    title = models.CharField(max_length=200)
    file_url = models.CharField(max_length=500)
    file_size = models.BigIntegerField(default=0)
    download_count = models.IntegerField(default=0)
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "downloads"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
