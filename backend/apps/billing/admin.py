from django.contrib import admin

from .models import Bundle, BundleItem, Payment, PaymentItem, Subscription, SubscriptionPlan, SubscriptionPlanAccess


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "currency", "is_active", "sort_order")
    list_filter = ("is_active",)


@admin.register(SubscriptionPlanAccess)
class SubscriptionPlanAccessAdmin(admin.ModelAdmin):
    list_display = ("plan", "content_type", "object_id")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("student", "plan", "status", "billing_amount", "current_period_end")
    list_filter = ("status",)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "payment_type", "status", "amount", "currency", "created_at")
    list_filter = ("status", "payment_type", "provider")


@admin.register(PaymentItem)
class PaymentItemAdmin(admin.ModelAdmin):
    list_display = ("id", "payment", "content_type", "object_id", "item_price", "is_refunded")
    list_filter = ("is_refunded", "content_type")


@admin.register(Bundle)
class BundleAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "currency", "is_active", "created_at")
    list_filter = ("is_active",)


@admin.register(BundleItem)
class BundleItemAdmin(admin.ModelAdmin):
    list_display = ("id", "bundle", "content_type", "object_id")
