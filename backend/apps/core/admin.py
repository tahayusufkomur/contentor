from django.contrib import admin
from django_tenants.admin import TenantAdminMixin

from .models import Domain, PlatformPlan, Tenant, TenantUsage


@admin.register(Tenant)
class TenantAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ("name", "slug", "provisioning_status", "is_active", "created_at")
    list_filter = ("provisioning_status", "is_active")


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ("domain", "tenant", "is_primary", "ssl_status")


@admin.register(PlatformPlan)
class PlatformPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "price_monthly", "transaction_fee_pct", "is_live_enabled")


@admin.register(TenantUsage)
class TenantUsageAdmin(admin.ModelAdmin):
    list_display = ("tenant", "month", "student_count", "storage_bytes")
