from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db import connection

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

    # --- Public-schema delete handling ---
    #
    # Tenant-only apps (courses, downloads, live, billing, etc.) have FKs to
    # User. Their tables do NOT exist in the public schema. Django's delete
    # Collector walks every reverse FK regardless of schema, which fails with
    # `relation "courses_course" does not exist` in the public admin.
    #
    # In the public schema there are exactly two tables with FKs to
    # accounts_user: accounts_user_groups and accounts_user_user_permissions
    # (Django auth m2m through-tables, NO ACTION at the DB level). We delete
    # those rows explicitly then the user, bypassing the Collector.
    #
    # In tenant schemas, default Django delete behavior is correct.

    def get_deleted_objects(self, objs, request):
        if connection.schema_name == "public":
            verbose = self.model._meta.verbose_name_plural
            return (
                [str(obj) for obj in objs],
                {str(verbose): len(objs)},
                set(),
                [],
            )
        return super().get_deleted_objects(objs, request)

    def delete_model(self, request, obj):
        if connection.schema_name == "public":
            self._public_delete([obj.pk])
            return
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        if connection.schema_name == "public":
            self._public_delete(list(queryset.values_list("pk", flat=True)))
            return
        super().delete_queryset(request, queryset)

    @staticmethod
    def _public_delete(user_ids):
        if not user_ids:
            return
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM accounts_user_groups WHERE user_id = ANY(%s)", [user_ids])
            cursor.execute("DELETE FROM accounts_user_user_permissions WHERE user_id = ANY(%s)", [user_ids])
            cursor.execute("DELETE FROM accounts_user WHERE id = ANY(%s)", [user_ids])
