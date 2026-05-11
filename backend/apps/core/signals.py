from django.core.exceptions import ValidationError
from django.db.models.signals import pre_save
from django.dispatch import receiver

from .constants import REGION_DEFAULT_CURRENCY
from .models import Tenant
from .validators import validate_tenant_slug


@receiver(pre_save, sender=Tenant)
def tenant_pre_save(sender, instance, **kwargs):
    # Always re-validate the slug — catches direct ORM creation, admin actions, and signup flows alike.
    if instance.slug:
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
