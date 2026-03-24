from django.contrib import admin

from .models import EmailCampaign


@admin.register(EmailCampaign)
class EmailCampaignAdmin(admin.ModelAdmin):
    list_display = (
        "subject",
        "sender",
        "status",
        "recipient_count",
        "success_count",
        "failure_count",
        "created_at",
    )
    list_filter = ("status",)
    readonly_fields = ("created_at", "sent_at")
