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
    # Connect (Express) payout-readiness, mirrored from the `account.updated`
    # webhook. `charges_enabled` gates taking money; `payouts_enabled` gates
    # money actually reaching the coach's bank. Both start False until Stripe
    # onboarding completes.
    stripe_charges_enabled = models.BooleanField(default=False)
    stripe_payouts_enabled = models.BooleanField(default=False)
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
    is_demo = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Read-only marketing demo. Mutating requests are rejected by DemoReadOnlyMiddleware.",
    )
    is_published = models.BooleanField(
        default=False,
        help_text="When false, the public site is hidden behind a preview gate until the coach marks it ready.",
    )
    preview_password = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Optional password that unlocks the public site while it is unpublished.",
    )
    template_niche = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Niche key chosen during onboarding (matches a module under demo_data/).",
    )
    template_goals = models.JSONField(
        default=list,
        blank=True,
        help_text="Multi-select goals captured during onboarding. Metadata only for now.",
    )
    template_seed_status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pending"),
            ("seeding", "Seeding"),
            ("ready", "Ready"),
            ("skipped", "Skipped"),
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

    @property
    def has_paid_platform_plan(self) -> bool:
        """Active/past-due subscription on a non-Free plan.

        Gates paid-tier perks (e.g. the platform mailbox address). past_due
        counts as paid so a failed card doesn't instantly cut off inbound mail.
        """
        if not self.is_subscription_active:
            return False
        return not self.platform_subscription.plan.is_free


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
    # AI blog generations included per calendar month (0 = feature not in plan).
    max_ai_blog_posts = models.PositiveIntegerField(default=0)
    # Student site-assistant questions included per calendar month; 0 = the
    # assistant is not in the plan (feature is paid-tier only).
    max_student_bot_questions = models.PositiveIntegerField(default=0)
    stripe_price_id = models.CharField(max_length=255, blank=True, default="")
    # Multi-currency prices. Shape:
    #   {"USD": {"amount_cents": 1900, "stripe_price_id": "price_..."},
    #    "TRY": {"amount_cents": 59900, "stripe_price_id": "price_..."}}
    prices = models.JSONField(default=dict, blank=True)
    is_live_enabled = models.BooleanField(default=False)
    # Archived plans stay in the DB (the Tenant.plan FK is PROTECT, so existing
    # subscribers keep their plan) but drop out of the public pricing catalog so
    # nobody new can subscribe. Archiving is blocked while tenants still
    # reference the plan — migrate them off first.
    is_active = models.BooleanField(default=True, db_index=True)

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
    PROVIDER_MANUAL = "manual"  # superadmin-granted comp; no Stripe billing behind it
    PROVIDER_CHOICES = [
        (PROVIDER_STRIPE, "Stripe"),
        (PROVIDER_BYPASS, "Bypass"),
        (PROVIDER_MANUAL, "Manual"),
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


class DevOutboundEmail(models.Model):
    """Dev-only sink for outbound mail (EMAIL_SINK_ENABLED). Lets local e2e
    read magic links / verification codes without a real inbox."""

    to = models.EmailField(db_index=True)
    subject = models.CharField(max_length=500)
    html = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class LogoAiUsage(models.Model):
    """Durable per-tenant-per-month accounting for the Logo Studio AI Brand
    Pack feature (apps.tenant_config.logo_ai). Serves two purposes: (1) the
    per-tenant monthly quota (5 packs max — ``packs_used``), and (2) summed
    across all tenants for a month, the global monthly USD budget
    kill-switch (``usd_spent``). Public schema and DB-backed rather than
    cache-backed so a Redis restart can't reset billing-relevant state.

    ``usd_spent`` accrues on every Anthropic call attempt (success or
    failure) so a systematic-failure loop still trips the kill-switch;
    ``packs_used`` increments only after a successful, validated pack.
    """

    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    packs_used = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(fields=["tenant_schema", "month"], name="uniq_logo_ai_usage_tenant_month"),
        ]

    def __str__(self):
        return f"{self.tenant_schema} {self.month}: {self.packs_used} packs / ${self.usd_spent}"


class HelpBotUsage(models.Model):
    """Durable per-tenant-per-month accounting for the Ask Contentor help
    chat (apps.tenant_config.help_bot) — same design as LogoAiUsage: DB-backed
    (not cache) so a Redis restart can't reset billing-relevant state.

    ``usd_spent`` accrues on every answer attempt (success or failure) so a
    systematic-failure loop still trips the global kill-switch; ``questions``
    backs the per-tenant monthly question cap. The dev "cli" provider records
    $0 (subscription usage) but still counts questions.
    """

    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    questions = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(fields=["tenant_schema", "month"], name="uniq_help_bot_usage_tenant_month"),
        ]

    def __str__(self):
        return f"{self.tenant_schema} {self.month}: {self.questions} questions / ${self.usd_spent}"


class BlogAiUsage(models.Model):
    """Durable per-tenant-per-month accounting for AI blog generation
    (apps.blog.ai) — same design as LogoAiUsage: DB-backed so a Redis restart
    can't reset billing-relevant state.

    ``usd_spent`` accrues on EVERY attempt (success or failure) so a
    systematic-failure loop still trips the global kill-switch;
    ``generations_used`` (the plan quota) increments only on success.
    Platform-blog generations record under tenant_schema="public" (USD only —
    no quota applies there).
    """

    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    generations_used = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(fields=["tenant_schema", "month"], name="uniq_blog_ai_usage_tenant_month"),
        ]

    def __str__(self):
        return f"{self.tenant_schema} {self.month}: {self.generations_used} posts / ${self.usd_spent}"


class PlatformBlogPost(models.Model):
    """contentor.app marketing blog (public SEO). Same content shape as
    apps.blog.BlogPost but lives in the public schema — superadmin-managed,
    generated via the same AI engine with no per-month quota (only the
    global BlogAiUsage budget kill-switch applies, tenant_schema="public")."""

    STATUS = [("draft", "Draft"), ("published", "Published")]
    SOURCE = [("manual", "Manual"), ("ai", "AI")]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=70, unique=True)
    body_html = models.TextField(blank=True, default="")
    excerpt = models.CharField(max_length=300, blank=True, default="")
    meta_description = models.CharField(max_length=170, blank=True, default="")
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default="draft")
    source = models.CharField(max_length=12, choices=SOURCE, default="manual")
    ai_model = models.CharField(max_length=60, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        ordering = ["-created_at"]

    def __str__(self):
        return f"PlatformBlogPost<{self.pk}:{self.slug}:{self.status}>"


class AiTranscript(models.Model):
    """One row per completed assistant exchange (help bot + student site
    assistant) — the audit trail behind the superadmin AI dashboard and the
    coach's "improve from real questions" loop. Public schema so superadmin
    reads cross-tenant without schema iteration. Content is purged after
    ``AI_TRANSCRIPT_RETENTION_DAYS`` by a beat task; billing state lives in
    the *Usage models, never here."""

    feature = models.CharField(max_length=20)  # help_bot | student_bot
    audience = models.CharField(max_length=10)  # coach | visitor | student
    tenant_schema = models.CharField(max_length=63)  # or "__marketing__"
    session_id = models.CharField(max_length=36, blank=True, default="")
    question = models.TextField()
    answer = models.TextField()
    cost_usd = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    provider = models.CharField(max_length=12)
    model = models.CharField(max_length=40)
    prompt_version = models.PositiveSmallIntegerField(default=1)
    kb_hash = models.CharField(max_length=12, blank=True, default="")
    rating = models.CharField(max_length=4, blank=True, default="")  # "" | up | down
    is_preview = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "core"
        indexes = [
            models.Index(fields=["feature", "created_at"]),
            models.Index(fields=["tenant_schema", "created_at"]),
            models.Index(fields=["session_id"]),
        ]

    def __str__(self):
        return f"{self.feature}/{self.audience} {self.tenant_schema} {self.created_at:%Y-%m-%d}"


class StudentBotUsage(models.Model):
    """Durable per-tenant-per-month accounting for the student site assistant
    (apps.tenant_config.student_bot) — same design as HelpBotUsage: DB-backed
    so a Redis restart can't reset billing-relevant state. ``usd_spent``
    accrues on every answer attempt; ``questions`` backs the per-plan monthly
    question quota (PlatformPlan.max_student_bot_questions)."""

    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    questions = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(fields=["tenant_schema", "month"], name="uniq_student_bot_usage_tenant_month")
        ]

    def __str__(self):
        return f"{self.tenant_schema} {self.month}: {self.questions} questions / ${self.usd_spent}"


class PlatformKbEntry(models.Model):
    """Superadmin-editable prompt addenda — fix a wrong bot answer between
    deploys without touching help_kb.md. Injected as an authoritative
    "PLATFORM NOTES" section; audience-scoped."""

    AUDIENCES = [("coach", "Coach"), ("visitor", "Visitor"), ("student", "Student"), ("all", "All")]

    audience = models.CharField(max_length=10, choices=AUDIENCES, default="all")
    title = models.CharField(max_length=120)
    content = models.TextField(max_length=2000)
    enabled = models.BooleanField(default=True)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.audience}: {self.title}"
