"""Studio admin-kit registrations (coach SPA, tenant-schema billing models)."""

from django.utils.translation import ngettext

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsOwner

from .models import Bundle, Payment, SubscriptionPlan


@studio_site.register(SubscriptionPlan)
class SubscriptionPlanAdmin(ModelAdmin):
    icon = "credit-card"
    description = (
        "Recurring membership plans students subscribe to. Price/interval changes provision a new "
        "Stripe price at the next checkout; existing subscribers keep their old terms."
    )
    permission_classes = (IsOwner,)
    list_display = ("name", "price", "currency", "billing_interval_months", "is_active", "sort_order")
    search_fields = ("name",)
    list_filters = ("is_active",)
    ordering = ("sort_order",)
    fields = ("name", "description", "price", "billing_interval_months", "sort_order", "is_active")
    readonly_fields = ("currency", "stripe_price_id")

    def perform_create(self, request, serializer):
        # Charge currency is a tenant-level invariant, never user input.
        serializer.save(currency=tenant_charge_currency())

    @admin_action(
        label="Deactivate",
        style="danger",
        confirm="Deactivate selected plans? Students can no longer subscribe to them.",
    )
    def deactivate(self, request, queryset):
        updated = queryset.update(is_active=False)
        return ngettext(
            "Deactivated %(count)d plan.",
            "Deactivated %(count)d plans.",
            updated,
        ) % {"count": updated}

    @admin_action(label="Activate", style="primary")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        return ngettext(
            "Activated %(count)d plan.",
            "Activated %(count)d plans.",
            updated,
        ) % {"count": updated}


@studio_site.register(Bundle)
class BundleAdmin(ModelAdmin):
    icon = "package"
    description = "Discounted product groupings. Manage bundle contents from Billing → Bundles."
    permission_classes = (IsOwner,)
    list_display = ("name", "price", "currency", "is_active", "created_at")
    search_fields = ("name",)
    list_filters = ("is_active",)
    ordering = ("-created_at",)
    fields = ("name", "description", "price", "thumbnail_url", "is_active")
    readonly_fields = ("currency",)

    def perform_create(self, request, serializer):
        serializer.save(currency=tenant_charge_currency())

    @admin_action(label="Deactivate", style="danger")
    def deactivate(self, request, queryset):
        updated = queryset.update(is_active=False)
        return ngettext(
            "Deactivated %(count)d bundle.",
            "Deactivated %(count)d bundles.",
            updated,
        ) % {"count": updated}

    @admin_action(label="Activate", style="primary")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        return ngettext(
            "Activated %(count)d bundle.",
            "Activated %(count)d bundles.",
            updated,
        ) % {"count": updated}


@studio_site.register(Payment)
class PaymentAdmin(ModelAdmin):
    icon = "receipt"
    description = "Every charge and refund in this studio (read-only)."
    permission_classes = (IsOwner,)
    list_display = ("student", "payment_type", "status", "amount", "currency", "provider", "created_at")
    search_fields = ("student__email", "provider_payment_id")
    list_filters = ("status", "payment_type", "provider")
    ordering = ("-created_at",)
    list_select_related = ("student",)
    fields = ()
    readonly_fields = (
        "student",
        "payment_type",
        "status",
        "amount",
        "platform_fee",
        "submerchant_payout",
        "currency",
        "provider",
        "provider_payment_id",
        "created_at",
    )
    can_create = False
    can_edit = False
    can_delete = False
