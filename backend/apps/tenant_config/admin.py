from django.contrib import admin

from .models import TenantConfig


@admin.register(TenantConfig)
class TenantConfigAdmin(admin.ModelAdmin):
    list_display = ("brand_name", "style", "palette", "dark_mode_enabled")
