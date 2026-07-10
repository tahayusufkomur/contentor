"""Platform admin-kit registrations (superadmin SPA, public-schema models)."""

from decimal import Decimal

from apps.accounts.impersonation import impersonate_tenant_admin
from apps.accounts.models import User
from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import platform_site

from .models import PlatformBlogPost, PlatformKbEntry, PlatformPlan, PlatformSubscription, Tenant, WebhookEvent
from .stripe_pricing import apply_amounts


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
        "max_ai_blog_posts",
        "is_live_enabled",
        "is_active",
        "prices",
    )
    # Tenant.plan is PROTECT — archiving (is_active=False) is the removal path.
    can_delete = False
    # `prices` carries the canonical per-currency amounts the form edits as JSON,
    # e.g. {"USD": {"amount_cents": 1900}, "TRY": {"amount_cents": 59900}}.

    def _sync_pricing(self, plan):
        """Provision Stripe Prices from the just-saved plan, mirroring the
        bespoke plan editor. Paid plans only — Free coaches can never charge."""
        if plan.is_free:
            return
        amounts: dict[str, int] = {}
        for currency, entry in (plan.prices or {}).items():
            if isinstance(entry, dict) and entry.get("amount_cents"):
                amounts[str(currency).upper()] = int(entry["amount_cents"])
        # Fall back to the legacy USD price_monthly when prices has no USD entry.
        if "USD" not in amounts and plan.price_monthly:
            amounts["USD"] = int(Decimal(str(plan.price_monthly)) * 100)
        if not amounts:
            return
        update_fields: set[str] = set()
        apply_amounts(plan, amounts, update_fields)
        if update_fields:
            plan.save(update_fields=list(update_fields))

    def perform_create(self, request, serializer):
        plan = serializer.save()
        self._sync_pricing(plan)

    def perform_update(self, request, serializer):
        plan = serializer.save()
        self._sync_pricing(plan)

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
    list_display = (
        "name",
        "slug",
        "owner_email",
        "region",
        "plan",
        "provisioning_status",
        "is_active",
        "is_published",
        "created_at",
    )
    search_fields = ("name", "slug", "owner_email")
    list_filters = ("is_active", "is_published", "region", "provisioning_status", "plan", "is_demo")
    ordering = ("-created_at",)
    list_select_related = ("plan",)
    fields = ("name", "plan", "is_active", "is_published")
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

    def perform_update(self, request, serializer):
        # The `plan` field is only a denormalized mirror; the source of truth is
        # PlatformSubscription (a signal mirrors it back onto Tenant.plan). So a
        # plan change here grants/cancels the subscription — the same end-state a
        # Stripe checkout or the bypass provider produces. Wrapped in a
        # transaction so a rejected grant (e.g. live Stripe sub) rolls the plan
        # write back instead of leaving a half-state (requests are not atomic).
        from django.db import transaction

        with transaction.atomic():
            old_plan_id = serializer.instance.plan_id
            tenant = serializer.save()
            if tenant.plan_id != old_plan_id:
                self._sync_platform_subscription(tenant)
        return tenant

    @staticmethod
    def _sync_platform_subscription(tenant):
        from django.utils import timezone
        from django_tenants.utils import schema_context
        from rest_framework.serializers import ValidationError

        # PlatformSubscription and its user FK live in the public schema, and
        # accounts_user PKs differ per schema — so resolve the owner and write
        # the subscription with public explicitly active, regardless of which
        # tenant schema this request happened to resolve to.
        with schema_context("public"):
            sub = PlatformSubscription.objects.filter(tenant=tenant).first()
            # Never desync a live Stripe subscription from this manual editor.
            if (
                sub is not None
                and sub.provider == PlatformSubscription.PROVIDER_STRIPE
                and sub.status in (PlatformSubscription.STATUS_ACTIVE, PlatformSubscription.STATUS_PAST_DUE)
            ):
                raise ValidationError(
                    {
                        "plan": "This tenant has an active Stripe subscription — change the plan in Stripe, "
                        "not here, or billing will desync."
                    }
                )

            plan = tenant.plan
            # Free / no plan → ensure nothing reads as an active paid subscription.
            if plan is None or plan.is_free:
                if sub is not None and sub.status != PlatformSubscription.STATUS_CANCELED:
                    sub.status = PlatformSubscription.STATUS_CANCELED
                    sub.canceled_at = timezone.now()
                    sub.save(update_fields=["status", "canceled_at", "updated_at"])
                return

            # Paid → grant/refresh a manually-provisioned active subscription.
            # The subscription's user FK is PROTECT + non-null, so a real owner
            # account must exist.
            owner = User.objects.filter(email__iexact=tenant.owner_email).first()
            if owner is None:
                raise ValidationError(
                    {"plan": f"No owner account found for {tenant.owner_email}; cannot grant a subscription."}
                )
            PlatformSubscription.objects.update_or_create(
                tenant=tenant,
                defaults={
                    "user": owner,
                    "plan": plan,
                    "status": PlatformSubscription.STATUS_ACTIVE,
                    "provider": PlatformSubscription.PROVIDER_MANUAL,
                    "current_period_start": timezone.now(),
                    "current_period_end": None,
                    "cancel_at_period_end": False,
                    "canceled_at": None,
                    "provider_subscription_id": "",
                    "provider_customer_id": "",
                },
            )

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

    @admin_action(label="Details", row=True)
    def details(self, request, queryset):
        """Open the read-only tenant drill-down (usage, monetization, marketplace)."""
        tenant = queryset.first()
        if tenant is None:
            return {"detail": "Tenant not found."}
        return {"redirect": f"/admin/tenants/{tenant.slug}"}


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


@platform_site.register(PlatformBlogPost)
class PlatformBlogPostAdmin(ModelAdmin):
    icon = "newspaper"
    description = "Contentor.app marketing blog posts (public SEO). Generate drafts from Admin → Blog."
    list_display = ("title", "slug", "status", "source", "published_at")
    search_fields = ("title", "slug")
    list_filters = ("status", "source")
    ordering = ("-created_at",)
    fields = ("title", "slug", "excerpt", "meta_description", "tags", "body_html", "status", "published_at")


@platform_site.register(PlatformKbEntry)
class PlatformKbEntryAdmin(ModelAdmin):
    key = "platform-kb"
    icon = "book-open"
    description = "Prompt addenda for the AI assistants — fix or extend bot answers without a deploy."
    list_display = ("title", "audience", "enabled", "position", "updated_at")
    search_fields = ("title", "content")
    list_filters = ("audience", "enabled")
    ordering = ("position", "id")
    fields = ("audience", "title", "content", "enabled", "position")
