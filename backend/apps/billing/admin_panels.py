"""Studio admin-kit registrations (coach SPA, tenant-schema billing models)."""

from django.utils.translation import gettext_lazy, ngettext

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsOwner

from .models import Bundle, Payment, SubscriptionPlan


@studio_site.register(SubscriptionPlan)
class SubscriptionPlanAdmin(ModelAdmin):
    key = "subscription-plans"
    label = gettext_lazy("Subscription Plan")
    label_plural = gettext_lazy("Subscription Plans")
    icon = "credit-card"
    description = gettext_lazy(
        "Recurring membership plans students subscribe to. Price/interval changes provision a new "
        "Stripe price at the next checkout; existing subscribers keep their old terms."
    )
    field_labels = {
        "name": gettext_lazy("Name"),
        "description": gettext_lazy("Description"),
        "price": gettext_lazy("Price"),
        "currency": gettext_lazy("Currency"),
        "billing_interval_months": gettext_lazy("Billing interval (months)"),
        "is_active": gettext_lazy("Active"),
        "sort_order": gettext_lazy("Order"),
        "stripe_price_id": gettext_lazy("Stripe price ID"),
    }
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
        label=gettext_lazy("Deactivate"),
        style="danger",
        confirm=gettext_lazy("Deactivate selected plans? Students can no longer subscribe to them."),
    )
    def deactivate(self, request, queryset):
        updated = queryset.update(is_active=False)
        return ngettext(
            "Deactivated %(count)d plan.",
            "Deactivated %(count)d plans.",
            updated,
        ) % {"count": updated}

    @admin_action(label=gettext_lazy("Activate"), style="primary")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        return ngettext(
            "Activated %(count)d plan.",
            "Activated %(count)d plans.",
            updated,
        ) % {"count": updated}


@studio_site.register(Bundle)
class BundleAdmin(ModelAdmin):
    key = "bundles"
    label = gettext_lazy("Bundle")
    label_plural = gettext_lazy("Bundles")
    icon = "package"
    description = gettext_lazy("Discounted product groupings. Manage bundle contents from Billing → Bundles.")
    field_labels = {
        "name": gettext_lazy("Name"),
        "description": gettext_lazy("Description"),
        "price": gettext_lazy("Price"),
        "currency": gettext_lazy("Currency"),
        "thumbnail_url": gettext_lazy("Thumbnail URL"),
        "is_active": gettext_lazy("Active"),
        "created_at": gettext_lazy("Created"),
    }
    permission_classes = (IsOwner,)
    list_display = ("name", "price", "currency", "is_active", "created_at")
    search_fields = ("name",)
    list_filters = ("is_active",)
    ordering = ("-created_at",)
    fields = ("name", "description", "price", "thumbnail_url", "is_active")
    readonly_fields = ("currency",)

    def perform_create(self, request, serializer):
        serializer.save(currency=tenant_charge_currency())

    @admin_action(label=gettext_lazy("Deactivate"), style="danger")
    def deactivate(self, request, queryset):
        updated = queryset.update(is_active=False)
        return ngettext(
            "Deactivated %(count)d bundle.",
            "Deactivated %(count)d bundles.",
            updated,
        ) % {"count": updated}

    @admin_action(label=gettext_lazy("Activate"), style="primary")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        return ngettext(
            "Activated %(count)d bundle.",
            "Activated %(count)d bundles.",
            updated,
        ) % {"count": updated}


@studio_site.register(Payment)
class PaymentAdmin(ModelAdmin):
    key = "payments"
    label = gettext_lazy("Payment")
    label_plural = gettext_lazy("Payments")
    icon = "receipt"
    description = gettext_lazy("Every charge and refund in this studio (read-only).")
    field_labels = {
        "student": gettext_lazy("Student"),
        "payment_type": gettext_lazy("Type"),
        "status": gettext_lazy("Status"),
        "amount": gettext_lazy("Amount"),
        "platform_fee": gettext_lazy("Platform fee"),
        "submerchant_payout": gettext_lazy("Payout"),
        "currency": gettext_lazy("Currency"),
        "provider": gettext_lazy("Provider"),
        "provider_payment_id": gettext_lazy("Provider payment ID"),
        "created_at": gettext_lazy("Created"),
    }
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
