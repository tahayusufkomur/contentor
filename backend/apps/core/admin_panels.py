"""Platform admin-kit registrations (superadmin SPA, public-schema models)."""

from apps.accounts.impersonation import impersonate_tenant_admin
from apps.accounts.models import User
from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import platform_site

from .models import PlatformPlan, PlatformSubscription, Tenant, WebhookEvent


@platform_site.register(PlatformPlan)
class PlatformPlanAdmin(ModelAdmin):
    label = "Platform Plan"
    label_plural = "Platform Plans"
    icon = "credit-card"
    description = "The subscription tiers coaches can buy."
    list_display = ("name", "price_monthly", "transaction_fee_pct", "max_students", "is_live_enabled", "is_active")
    search_fields = ("name",)
    list_filters = ("is_active", "is_live_enabled")
    ordering = ("price_monthly",)
    fields = (
        "name",
        "price_monthly",
        "transaction_fee_pct",
        "max_students",
        "max_storage_gb",
        "max_streaming_hours",
        "max_campaign_emails",
        "is_live_enabled",
        "is_active",
        "prices",
    )
    # Tenant.plan is PROTECT — archiving (is_active=False) is the removal path.
    can_delete = False

    @admin_action(
        label="Archive", style="danger", confirm="Archive selected plans? They disappear from the pricing catalog."
    )
    def archive(self, request, queryset):
        updated = queryset.update(is_active=False)
        return f"Archived {updated} plan(s)."

    @admin_action(label="Restore", style="primary")
    def restore(self, request, queryset):
        updated = queryset.update(is_active=True)
        return f"Restored {updated} plan(s)."


@platform_site.register(Tenant)
class TenantAdmin(ModelAdmin):
    icon = "building-2"
    description = "Coach workspaces. Provisioning owns creation; edit sparingly."
    list_display = ("name", "slug", "owner_email", "region", "plan", "provisioning_status", "is_active", "created_at")
    search_fields = ("name", "slug", "owner_email")
    list_filters = ("is_active", "region", "provisioning_status", "plan", "is_demo")
    ordering = ("-created_at",)
    list_select_related = ("plan",)
    fields = ("name", "plan", "is_active")
    readonly_fields = (
        "slug",
        "subdomain",
        "owner_email",
        "region",
        "billing_currency",
        "stripe_account_id",
        "stripe_charges_enabled",
        "stripe_payouts_enabled",
        "provisioning_status",
        "is_demo",
        "created_at",
    )
    # Tenants are created by signup provisioning and removed by an offboarding
    # flow that drops the schema — not from a list view.
    can_create = False
    can_delete = False

    def get_queryset(self, request):
        return super().get_queryset(request).exclude(schema_name="public")

    @admin_action(label="Deactivate", style="danger", confirm="Deactivate selected tenants? Their sites stop serving.")
    def deactivate(self, request, queryset):
        updated = queryset.update(is_active=False)
        return f"Deactivated {updated} tenant(s)."

    @admin_action(label="Activate", style="primary")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        return f"Activated {updated} tenant(s)."

    @admin_action(
        label="Log in as admin",
        style="primary",
        row=True,
        confirm="Open a session as this tenant's admin? You'll act as them until you exit.",
    )
    def login_as_admin(self, request, queryset):
        tenant = queryset.first()
        if tenant is None:
            return {"detail": "Tenant not found."}
        return impersonate_tenant_admin(request, tenant, scope="platform")


@platform_site.register(User)
class PlatformUserAdmin(ModelAdmin):
    key = "users"
    label = "User"
    label_plural = "Users"
    icon = "users"
    description = "Registered accounts (coaches & staff). Open a coach's workspace to debug as them."
    list_display = ("email", "name", "role", "region", "is_superuser", "date_joined", "last_login")
    search_fields = ("email", "name")
    list_filters = ("role", "region", "is_superuser")
    ordering = ("-date_joined",)
    fields = ()
    readonly_fields = ("email", "name", "role", "region", "is_superuser", "date_joined", "last_login")
    can_create = False
    can_edit = False
    can_delete = False

    @admin_action(
        label="Open workspace",
        style="primary",
        row=True,
        confirm="Open this coach's workspace as their admin? You'll act as them until you exit.",
    )
    def open_workspace(self, request, queryset):
        user = queryset.first()
        if user is None:
            return {"detail": "User not found."}
        tenants = list(Tenant.objects.exclude(schema_name="public").filter(owner_email=user.email))
        if not tenants:
            return {"detail": f"{user.email} owns no tenant workspace."}
        if len(tenants) > 1:
            return {"detail": f"{user.email} owns {len(tenants)} workspaces — open one from the Tenants page."}
        return impersonate_tenant_admin(request, tenants[0], scope="platform")


@platform_site.register(PlatformSubscription)
class PlatformSubscriptionAdmin(ModelAdmin):
    icon = "receipt"
    description = "Coach subscriptions to platform plans (read-only; Stripe is the source of truth)."
    list_display = ("tenant", "plan", "status", "provider", "cancel_at_period_end", "current_period_end")
    search_fields = ("tenant__name", "tenant__slug", "provider_subscription_id")
    list_filters = ("status", "provider", "plan")
    ordering = ("-current_period_end",)
    list_select_related = ("tenant", "plan")
    fields = ()
    readonly_fields = (
        "tenant",
        "plan",
        "status",
        "provider",
        "provider_subscription_id",
        "current_period_start",
        "current_period_end",
        "cancel_at_period_end",
    )
    can_create = False
    can_edit = False
    can_delete = False

    def get_queryset(self, request):
        return super().get_queryset(request).exclude(tenant__schema_name="public")


@platform_site.register(WebhookEvent)
class WebhookEventAdmin(ModelAdmin):
    icon = "webhook"
    description = "Provider webhook deliveries and their processing outcome."
    list_display = ("provider", "event_type", "provider_event_id", "state", "received_at")
    search_fields = ("event_type", "provider_event_id")
    list_filters = ("provider", "event_type")
    ordering = ("-received_at",)
    fields = ()
    readonly_fields = (
        "provider",
        "event_type",
        "provider_event_id",
        "received_at",
        "processed_at",
        "processing_error",
        "payload",
    )
    can_create = False
    can_edit = False
    can_delete = False

    def state(self, obj):
        if obj.processing_error:
            return "failed"
        return "processed" if obj.processed_at else "pending"

    state.short_description = "State"
