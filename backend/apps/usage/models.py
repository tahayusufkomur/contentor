from django.conf import settings
from django.db import models


class UsageEvent(models.Model):
    MODE_CHOICES = [("pwa", "PWA"), ("browser", "Browser")]
    PLATFORM_CHOICES = [
        ("ios", "iOS"),
        ("android", "Android"),
        ("desktop", "Desktop"),
        ("other", "Other"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="usage_events")
    mode = models.CharField(max_length=10, choices=MODE_CHOICES)
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    day = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "usage"
        unique_together = ("user", "mode", "platform", "day")

    def __str__(self) -> str:
        return f"UsageEvent<{self.user_id}:{self.mode}/{self.platform}:{self.day}>"
