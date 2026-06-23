"""Platform admin-kit registrations (superadmin SPA, public-schema domain models)."""

from apps.adminkit.options import ModelAdmin
from apps.adminkit.sites import platform_site

from .models import CustomDomain, DomainSubscription


@platform_site.register(CustomDomain)
class CustomDomainAdmin(ModelAdmin):
    label = "Custom Domain"
    label_plural = "Custom Domains"
    icon = "globe"
    description = "Coach custom domains: registration + provisioning status, yearly price, expiry."
    list_display = ("domain", "tenant", "provisioning_status", "price_minor", "currency", "expires_at")
    search_fields = ("domain",)
    list_filters = ("provisioning_status", "currency")
    ordering = ("-created_at",)
    can_delete = False
    # Read-only: domains are managed via the provisioning pipeline, not hand-edited.
    readonly_fields = (
        "domain",
        "tenant",
        "registrar",
        "registrar_status",
        "cloudflare_zone_id",
        "resend_domain_id",
        "forward_to_email",
        "cost_minor",
        "price_minor",
        "currency",
        "fx_rate",
        "provisioning_status",
        "failed_step",
        "expires_at",
        "auto_renew",
        "is_primary",
    )


@platform_site.register(DomainSubscription)
class DomainSubscriptionAdmin(ModelAdmin):
    label = "Domain Subscription"
    label_plural = "Domain Subscriptions"
    icon = "credit-card"
    description = "Annual Stripe subscriptions backing custom domains."
    list_display = ("custom_domain", "tenant", "status", "provider", "current_period_end")
    search_fields = ("provider_subscription_id",)
    list_filters = ("status", "provider")
    ordering = ("-created_at",)
    can_delete = False
    readonly_fields = (
        "tenant",
        "custom_domain",
        "provider",
        "provider_subscription_id",
        "provider_customer_id",
        "status",
        "current_period_start",
        "current_period_end",
    )
