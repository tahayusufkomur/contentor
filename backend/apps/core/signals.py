from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .constants import REGION_DEFAULT_CURRENCY
from .models import PlatformPlan, PlatformSubscription, Tenant
from .validators import validate_tenant_slug


@receiver(pre_save, sender=Tenant)
def tenant_pre_save(sender, instance, **kwargs):
    # Re-validate the slug — catches direct ORM creation, admin actions, and signup flows alike.
    # The system `public` schema is exempt: it's the django-tenants base tenant
    # row and intentionally uses the reserved slug.
    if instance.slug and instance.schema_name != "public":
        validate_tenant_slug(instance.slug)

    if not instance.pk:
        # Creation: mirror billing_currency from region if not explicitly set.
        if not instance.billing_currency:
            instance.billing_currency = REGION_DEFAULT_CURRENCY.get(instance.region, "USD")
        return

    # Update: prevent region and billing_currency from being changed once set.
    try:
        old = Tenant.objects.only("region", "billing_currency").get(pk=instance.pk)
    except Tenant.DoesNotExist:
        return
    if old.region and old.region != instance.region:
        raise ValidationError("Tenant.region is immutable once a tenant has been created.")
    if old.billing_currency and old.billing_currency != instance.billing_currency:
        raise ValidationError("Tenant.billing_currency is immutable once set.")


# --- PlatformSubscription is the single source of truth for a tenant's plan;
#     Tenant.plan is a mirror kept current here so no write path can diverge. ---


def _mirror_plan_onto_tenant(tenant_id: int, plan_id: int | None) -> None:
    """Set Tenant.plan (public-schema, so safe from any active schema).

    `plan_id=None` means "no active plan" — resolve the Free plan so quota
    limits fall back to the Free tier rather than zero. Uses .update() to write
    directly without re-triggering tenant save signals.
    """
    if plan_id is None:
        free_name = getattr(settings, "BILLING_FREE_PLAN_NAME", "Free")
        free = PlatformPlan.objects.filter(name__iexact=free_name).first()
        plan_id = free.pk if free else None
    Tenant.objects.filter(pk=tenant_id).update(plan=plan_id)


@receiver(post_save, sender=PlatformSubscription)
def subscription_mirror_plan_on_save(sender, instance, **kwargs):
    # A non-canceled subscription grants its plan; a canceled one reverts to Free.
    plan_id = None if instance.status == PlatformSubscription.STATUS_CANCELED else instance.plan_id
    _mirror_plan_onto_tenant(instance.tenant_id, plan_id)


@receiver(post_delete, sender=PlatformSubscription)
def subscription_mirror_plan_on_delete(sender, instance, **kwargs):
    _mirror_plan_onto_tenant(instance.tenant_id, None)
