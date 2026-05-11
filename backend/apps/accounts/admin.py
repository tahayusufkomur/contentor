from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.core.admin import RegionScopedAdminMixin

from .models import User


@admin.register(User)
class UserAdmin(RegionScopedAdminMixin, BaseUserAdmin):
    list_display = ("email", "name", "role", "region", "preferred_locale", "is_active", "date_joined")
    list_filter = ("region", "role", "is_active")
    search_fields = ("email", "name")
    ordering = ("-date_joined",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("name", "avatar_url")}),
        ("Region & locale", {"fields": ("region", "preferred_locale", "accessible_regions")}),
        ("Permissions", {"fields": ("role", "is_active", "is_staff", "is_superuser")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "name", "role", "region", "password1", "password2"),
            },
        ),
    )
