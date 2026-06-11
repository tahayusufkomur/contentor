"""Studio admin-kit registration for tenant users (coach SPA)."""

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site

from .impersonation import impersonate_same_tenant_user
from .models import User


@studio_site.register(User)
class StudioUserAdmin(ModelAdmin):
    key = "users"
    label = "User"
    label_plural = "Users"
    icon = "users"
    description = "Students and staff in this studio. Log in as a student to see exactly what they see."
    list_display = ("email", "name", "role", "date_joined", "last_login")
    search_fields = ("email", "name")
    list_filters = ("role",)
    ordering = ("-date_joined",)
    fields = ()
    readonly_fields = ("email", "name", "role", "date_joined", "last_login")
    can_create = False
    can_edit = False
    can_delete = False

    @admin_action(
        label="Log in as",
        style="primary",
        row=True,
        confirm="Open this student's account? You'll see the site exactly as they do, until you exit.",
    )
    def login_as(self, request, queryset):
        user = queryset.first()
        if user is None:
            return {"detail": "User not found."}
        if user.role != "student":
            return {"detail": "Only student accounts can be opened from here."}
        return impersonate_same_tenant_user(request, user, scope="studio")
