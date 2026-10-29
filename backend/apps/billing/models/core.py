from decimal import Decimal

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core import monetization
from apps.core.currency import tenant_charge_currency


class SubscriptionPlan(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default=tenant_charge_currency)
    # Billing cycle length in months: 1 = monthly, 12 = yearly, anything else
    # is a custom cycle. Stripe caps recurring periods at 3 years (36 months).
    billing_interval_months = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(36)]
    )
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # The recurring Stripe Price provisioned on the coach's connected account.
    # `stripe_price_amount_cents` / `stripe_price_interval_months` record what
    # it was created for; when either changes, a *new* Price is provisioned
    # (D1 grandfathering) and the fields updated, leaving existing subscribers
    # on their old Price.
    stripe_price_id = models.CharField(max_length=255, blank=True, default="")
    stripe_price_amount_cents = models.IntegerField(default=0)
    stripe_price_interval_months = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "billing"
        ordering = ["sort_order"]

    def __str__(self):
        return self.name

    # Why it cannot go on sale yet (focus mode's finish, the plan page's On sale switch and its PATCH).
    NO_ITEMS, NO_PRICE = _("Add what members get first"), _("Set its price first")
    NOT_SELLING = monetization.NOT_SELLING

    def not_ready(self) -> str:
        """Why it cannot go on sale yet ("" when it can): what members get, then a price."""
        if not self.access_items.exists():
            return str(self.NO_ITEMS)
        return "" if self.price > 0 else str(self.NO_PRICE)

    def cannot_sell(self) -> bool:
        """Always paid: off sale while selling is not open yet (her plan, then payouts; the Starter trial
        cannot sell). Not before it has a price: "Set its price first" comes first."""
        from django.db import connection

        return self.price > 0 and not monetization.can_monetize(connection.tenant)

    def refusal(self) -> str:
        """Why putting it on sale is refused, as a sentence; "" when it can go on sale."""
        if gap := self.not_ready():
            return f"{gap}."
        return self.NOT_SELLING if self.cannot_sell() else ""


class AccessWindowFields(models.Model):
    """When an item is open: a span after the person gets in, a calendar date, or both ends."""

    opens_after_days = models.PositiveIntegerField(null=True, blank=True)
    opens_on = models.DateField(null=True, blank=True)
    closes_after_days = models.PositiveIntegerField(null=True, blank=True)
    closes_on = models.DateField(null=True, blank=True)

    class Meta:
        abstract = True


class AccessWindow(AccessWindowFields):
    """The window of one way in (free or buy) on one item; plan links carry their own."""

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    way = models.CharField(max_length=10, choices=[("free", "Free"), ("buy", "Sell it once")])

    class Meta:
        app_label = "billing"
        unique_together = ("content_type", "object_id", "way")

    def __str__(self):
        return f"{self.way} window on {self.content_type} #{self.object_id}"


class SubscriptionPlanAccess(AccessWindowFields):
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
    billing_currency = models.CharField(max_length=3, default=tenant_charge_currency)
    status = models.CharField(
        max_length=20,
        choices=[("active", "Active"), ("past_due", "Past Due"), ("expired", "Expired")],
        default="active",
    )
    # Provider linkage (Stripe Connect). `provider="bypass"` keeps the dev/CI
    # path working with no real subscription.
    provider = models.CharField(
        max_length=20,
        choices=[("stripe", "Stripe"), ("bypass", "Bypass")],
        default="bypass",
    )
    provider_subscription_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    provider_customer_id = models.CharField(max_length=255, blank=True, default="")
    cancel_at_period_end = models.BooleanField(default=False)
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
    # Providers: `stripe` (live, via Stripe Connect) and `bypass` (dev/CI).
    provider = models.CharField(
        max_length=20,
        choices=[("stripe", "Stripe"), ("bypass", "Bypass")],
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
    """Individual item within a payment. One purchased item (course, bundle, download…) of a Payment."""

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="items")
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    item_price = models.DecimalField(max_digits=10, decimal_places=2)
    submerchant_payout = models.DecimalField(max_digits=10, decimal_places=2)
    is_refunded = models.BooleanField(default=False)
    # Stamped when the payment completes, so a purchase keeps the terms it was bought on.
    access_starts_at = models.DateTimeField(null=True, blank=True)
    access_ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "billing"
        unique_together = ("payment", "content_type", "object_id")

    def __str__(self):
        return f"PaymentItem #{self.pk} - Payment #{self.payment_id}"


def is_draft(obj) -> bool:
    """A course or download not published yet, or a class held in draft (G4): students never see it listed."""
    return getattr(obj, "is_published", True) is False or getattr(obj, "status", "") == "draft"


def is_over(obj) -> bool:
    """An in-person session that is over: the store and checkout no longer sell it (live ones they still do)."""
    return obj._meta.label_lower == "live.onsiteevent" and obj.computed_status == "ended"


def listed_items(bundle, *, drafts: bool) -> list:
    """The bundle's items as the viewer sees them: a draft only with ``drafts`` (her own view)."""
    return [i for i in bundle.items.all() if drafts or not is_draft(i.content_object)]


def original_price(items) -> Decimal:
    """What the items cost bought apart: an in-person session that is over cannot be."""
    total = Decimal("0.00")
    for item in items:
        content_obj = item.content_object
        if content_obj is not None and not is_over(content_obj):
            price = getattr(content_obj, "price", None)
            # Free keeps a covered price on the item; it is not part of what the bundle saves.
            if price is not None and getattr(content_obj, "pricing_type", "paid") == "paid":
                total += Decimal(str(price))
    return total


def item_count(rows, *, drafts: bool) -> int:
    """A bundle's or a plan's items (rows with a content_object) as the viewer sees them: a draft only with
    ``drafts`` (her own view), and a class series (sessions sharing a model and a title) once."""
    return len(
        {
            (row.content_type_id, obj.title if hasattr(obj, "scheduled_at") else row.object_id)
            for row in rows
            if (obj := row.content_object) is not None and (drafts or not is_draft(obj))
        }
    )


class Bundle(models.Model):
    """Coach-defined product grouping multiple content items at a discount."""

    # Not a column: a bundle is always sold. The paywall (apps.core.access)
    # reads pricing_type and takes a missing one as free.
    pricing_type = "paid"

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default=tenant_charge_currency)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    is_active = models.BooleanField(default=True)
    # False = a draft (focus mode makes these): hidden from students, the store and checkout until she publishes.
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "billing"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    # Why a draft cannot be published yet (focus mode's finish, the page's Publish and its PATCH).
    NO_ITEMS, NO_PRICE = _("Add at least two items"), _("Set its price first")  # a bundle of one is just the item
    NOT_SELLING = monetization.NOT_SELLING

    def item_count(self, *, drafts: bool = False) -> int:
        """Its items as students see them (``drafts``: as she does), a class series once."""
        return item_count(self.items.all(), drafts=drafts)

    def not_ready(self) -> str:
        """Why it cannot be published yet ("" when it can): two items, then a price."""
        if self.item_count() < 2:
            return str(self.NO_ITEMS)
        return "" if self.price > 0 else str(self.NO_PRICE)

    def cannot_sell(self) -> bool:
        """Priced while selling is not open yet (her plan, then payouts)."""
        from django.db import connection

        from apps.core import monetization

        return self.price > 0 and not monetization.can_monetize(connection.tenant)

    def refusal(self) -> str:
        """Why publishing it is refused, as a sentence; "" when it can be published."""
        if gap := self.not_ready():
            return f"{gap}."
        return self.NOT_SELLING if self.cannot_sell() else ""


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
