"""Studio admin-kit registration for tenant users (coach SPA)."""

from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site

from .impersonation import impersonate_same_tenant_user
from .models import User


@studio_site.register(User)
class StudioUserAdmin(ModelAdmin):
    key = "users"
    label = gettext_lazy("User")
    label_plural = gettext_lazy("Users")
    icon = "users"
    description = gettext_lazy("Students and staff in this studio. Log in as a student to see exactly what they see.")
    field_labels = {
        "email": gettext_lazy("Email"),
        "name": gettext_lazy("Name"),
        "role": gettext_lazy("Role"),
        "date_joined": gettext_lazy("Joined"),
        "last_login": gettext_lazy("Last login"),
    }
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
        label=gettext_lazy("Log in as"),
        style="primary",
        row=True,
        confirm=gettext_lazy("Open this student's account? You'll see the site exactly as they do, until you exit."),
    )
    def login_as(self, request, queryset):
        user = queryset.first()
        if user is None:
            return {"detail": _("User not found.")}
        if user.role != "student":
            return {"detail": _("Only student accounts can be opened from here.")}
        return impersonate_same_tenant_user(request, user, scope="studio")
