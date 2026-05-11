from django.contrib import admin
from django_tenants.admin import TenantAdminMixin

from .models import Domain, PlatformPlan, Tenant, TenantUsage


class RegionScopedAdminMixin:
    """Filters list views by the logged-in superadmin's accessible_regions.

    Superusers (is_superuser=True) bypass the filter and see everything.
    A user with empty accessible_regions sees nothing — fail closed.
    """

    region_field = "region"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        if user.is_superuser:
            return qs
        allowed = getattr(user, "accessible_regions", None) or []
        return qs.filter(**{f"{self.region_field}__in": allowed})


@admin.register(Tenant)
class TenantAdmin(RegionScopedAdminMixin, TenantAdminMixin, admin.ModelAdmin):
    list_display = ("name", "slug", "region", "billing_currency", "provisioning_status", "is_active", "created_at")
    list_filter = ("region", "provisioning_status", "is_active")


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ("domain", "tenant", "is_primary", "ssl_status")


@admin.register(PlatformPlan)
class PlatformPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "price_monthly", "transaction_fee_pct", "is_live_enabled")


@admin.register(TenantUsage)
class TenantUsageAdmin(admin.ModelAdmin):
    list_display = ("tenant", "month", "student_count", "storage_bytes")
