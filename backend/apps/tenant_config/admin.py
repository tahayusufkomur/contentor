from django.contrib import admin

from .models import TenantConfig


@admin.register(TenantConfig)
class TenantConfigAdmin(admin.ModelAdmin):
    list_display = ("brand_name", "primary_color", "font_family")
