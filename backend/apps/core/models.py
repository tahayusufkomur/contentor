from django.conf import settings
from django.db import models
from django_tenants.models import DomainMixin, TenantMixin

from .constants import CURRENCY_CHOICES, REGION_CHOICES, REGION_GLOBAL
from .validators import validate_tenant_slug


class Tenant(TenantMixin):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, max_length=63)
    owner_email = models.EmailField()
    is_active = models.BooleanField(default=True)
    region = models.CharField(
        max_length=8,
        choices=REGION_CHOICES,
        default=REGION_GLOBAL,
        db_index=True,
        help_text="Immutable. Set at signup from the request host.",
    )
    billing_currency = models.CharField(
        max_length=3,
        choices=CURRENCY_CHOICES,
        blank=True,
        default="",
        help_text="Set at first Stripe checkout, immutable thereafter.",
    )
    plan = models.ForeignKey(
        "PlatformPlan",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="tenants",
    )
    subdomain = models.CharField(max_length=63, unique=True)
    stripe_account_id = models.CharField(max_length=255, blank=True, default="")
    iyzico_submerchant_id = models.CharField(max_length=255, blank=True, default="")
    provisioning_status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pending"),
            ("provisioning", "Provisioning"),
            ("ready", "Ready"),
            ("failed", "Failed"),
        ],
        default="pending",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    auto_create_schema = False

    class Meta:
        app_label = "core"

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        # The django-tenants base row uses the reserved slug intentionally.
        if self.schema_name != "public":
            validate_tenant_slug(self.slug)

    @property
    def is_subscription_active(self) -> bool:
        """True iff a PlatformSubscription exists with status in {active, past_due}.

        Free-tier tenants (no PlatformSubscription row) return False here; quota
        helpers separately fall back to Free limits for them.
        """
        try:
            sub = self.platform_subscription
        except PlatformSubscription.DoesNotExist:
            return False
        return sub.status in ("active", "past_due")


class Domain(DomainMixin):
    ssl_status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pending"),
            ("active", "Active"),
            ("error", "Error"),
        ],
        default="pending",
    )

    class Meta:
        app_label = "core"

    def __str__(self):
        return self.domain


class PlatformPlan(models.Model):
    name = models.CharField(max_length=50, unique=True)
    price_monthly = models.DecimalField(max_digits=8, decimal_places=2)
    transaction_fee_pct = models.DecimalField(max_digits=5, decimal_places=2)
    max_students = models.IntegerField(default=0)
    max_storage_gb = models.IntegerField(default=0)
    max_streaming_hours = models.IntegerField(default=0)
    max_campaign_emails = models.IntegerField(default=0)
    stripe_price_id = models.CharField(max_length=255, blank=True, default="")
    # Multi-currency prices. Shape:
    #   {"USD": {"amount_cents": 1900, "stripe_price_id": "price_..."},
    #    "TRY": {"amount_cents": 59900, "stripe_price_id": "price_..."}}
    prices = models.JSONField(default=dict, blank=True)
    is_live_enabled = models.BooleanField(default=False)

    class Meta:
        app_label = "core"

    def __str__(self):
        return self.name

    def get_price(self, currency: str) -> dict | None:
        """Return {amount_cents, stripe_price_id} for the given currency, or None.

        Falls back to legacy price_monthly + stripe_price_id (treated as USD) if
        the prices JSONB doesn't have an entry. Callers should use this instead
        of reading prices directly so a future migration to a PlanPrice table
        is a one-place change.
        """
        if isinstance(self.prices, dict) and currency in self.prices:
            entry = self.prices[currency]
            if isinstance(entry, dict) and "amount_cents" in entry:
                return entry
        if currency == "USD" and self.price_monthly:
            return {
                "amount_cents": int(self.price_monthly * 100),
                "stripe_price_id": self.stripe_price_id or "",
            }
        return None

    @property
    def is_free(self) -> bool:
        """True if this plan represents the Free tier.

        Recognized by name == BILLING_FREE_PLAN_NAME OR price_monthly == 0.
        """
        from django.conf import settings as _settings

        free_name = getattr(_settings, "BILLING_FREE_PLAN_NAME", "Free")
        if self.name and self.name.lower() == free_name.lower():
            return True
        return self.price_monthly == 0


class TenantUsage(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="usage_records")
    month = models.DateField()
    student_count = models.IntegerField(default=0)
    storage_bytes = models.BigIntegerField(default=0)
    streaming_minutes = models.IntegerField(default=0)
    emails_sent = models.IntegerField(default=0)

    class Meta:
        app_label = "core"
        unique_together = ("tenant", "month")

    def __str__(self):
        return f"{self.tenant.slug} - {self.month}"


class PlatformSubscription(models.Model):
    """Coach-to-platform subscription. Public-schema concern (SHARED_APPS).

    Distinct from `apps.billing.Subscription`, which is the future
    student-to-coach (tenant-scoped) subscription model.
    """

    STATUS_INCOMPLETE = "incomplete"
    STATUS_ACTIVE = "active"
    STATUS_PAST_DUE = "past_due"
    STATUS_CANCELED = "canceled"
    STATUS_CHOICES = [
        (STATUS_INCOMPLETE, "Incomplete"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_PAST_DUE, "Past due"),
        (STATUS_CANCELED, "Canceled"),
    ]

    PROVIDER_STRIPE = "stripe"
    PROVIDER_BYPASS = "bypass"
    PROVIDER_CHOICES = [
        (PROVIDER_STRIPE, "Stripe"),
        (PROVIDER_BYPASS, "Bypass"),
    ]

    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name="platform_subscription",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="platform_subscriptions",
    )
    plan = models.ForeignKey(
        PlatformPlan,
        on_delete=models.PROTECT,
        related_name="platform_subscriptions",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_INCOMPLETE,
    )
    provider = models.CharField(
        max_length=20,
        choices=PROVIDER_CHOICES,
        default=PROVIDER_STRIPE,
    )
    provider_subscription_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    provider_customer_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "provider_subscription_id"],
                condition=~models.Q(provider_subscription_id=""),
                name="uniq_provider_subscription_id",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "current_period_end"]),
        ]

    def __str__(self):
        return f"{self.tenant.slug} -> {self.plan.name} ({self.status})"


class WebhookEvent(models.Model):
    """Idempotency record for provider webhook events. Public schema."""

    provider = models.CharField(max_length=20)
    provider_event_id = models.CharField(max_length=255)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processing_error = models.TextField(blank=True, default="")

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "provider_event_id"],
                name="uniq_provider_event_id",
            ),
        ]
        indexes = [
            models.Index(fields=["provider", "event_type"]),
        ]

    def __str__(self):
        return f"{self.provider}:{self.provider_event_id} ({self.event_type})"
