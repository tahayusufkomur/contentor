from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class SubscriptionPlan(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="TRY")
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "billing"
        ordering = ["sort_order"]

    def __str__(self):
        return self.name


class SubscriptionPlanAccess(models.Model):
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.CASCADE, related_name="access_items")
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        app_label = "billing"
        unique_together = ("plan", "content_type", "object_id")

    def __str__(self):
        return f"{self.plan.name} -> {self.content_type} #{self.object_id}"


class Subscription(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT, related_name="subscriptions")
    pending_plan = models.ForeignKey(
        SubscriptionPlan, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    billing_amount = models.DecimalField(max_digits=10, decimal_places=2)
    billing_currency = models.CharField(max_length=3, default="TRY")
    status = models.CharField(
        max_length=20,
        choices=[("active", "Active"), ("past_due", "Past Due"), ("expired", "Expired")],
        default="active",
    )
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "billing"

    def __str__(self):
        return f"{self.student.email} - {self.plan.name} ({self.status})"


class Payment(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payments")
    payment_type = models.CharField(
        max_length=20,
        choices=[("one_time", "One Time"), ("subscription", "Subscription"), ("refund", "Refund")],
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pending"),
            ("completed", "Completed"),
            ("failed", "Failed"),
            ("refunded", "Refunded"),
            ("partially_refunded", "Partially Refunded"),
        ],
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2)
    submerchant_payout = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3)
    provider = models.CharField(
        max_length=20,
        choices=[("iyzico", "iyzico"), ("stripe", "Stripe"), ("bypass", "Bypass")],
    )
    provider_payment_id = models.CharField(max_length=255, blank=True, default="")
    original_payment = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="refunds"
    )
    subscription = models.ForeignKey(
        Subscription, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments"
    )
    # FK to a public-schema model. We set db_constraint=False because
    # django-tenants creates the FK separately per tenant schema, which
    # makes a cross-schema TRUNCATE on test teardown blow up. The integrity
    # check is enforced at the ORM layer (and via webhook handlers in M1).
    platform_subscription = models.ForeignKey(
        "core.PlatformSubscription",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="payments",
        db_constraint=False,
    )
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "billing"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Payment #{self.pk} - {self.payment_type} ({self.status})"


class PaymentItem(models.Model):
    """Individual item within a payment. Maps 1:1 to iyzico basket items."""

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="items")
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    item_price = models.DecimalField(max_digits=10, decimal_places=2)
    submerchant_payout = models.DecimalField(max_digits=10, decimal_places=2)
    is_refunded = models.BooleanField(default=False)

    class Meta:
        app_label = "billing"
        unique_together = ("payment", "content_type", "object_id")

    def __str__(self):
        return f"PaymentItem #{self.pk} - Payment #{self.payment_id}"


class Bundle(models.Model):
    """Coach-defined product grouping multiple content items at a discount."""

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="TRY")
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "billing"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class BundleItem(models.Model):
    """Content items within a bundle."""

    bundle = models.ForeignKey(Bundle, on_delete=models.CASCADE, related_name="items")
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        app_label = "billing"
        unique_together = ("bundle", "content_type", "object_id")

    def __str__(self):
        return f"BundleItem #{self.pk} - {self.bundle.name}"
