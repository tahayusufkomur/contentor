import json
import logging
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django_tenants.utils import schema_context

from .constants import REGION_DEFAULT_CURRENCY
from .models import CuratedLogo, PlatformPlan, PlatformSubscription, Tenant
from .storage import get_s3_client
from .validators import validate_tenant_slug

logger = logging.getLogger(__name__)


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


def _mirror_curated_logos(fetch_png_for=None):
    """Dev-only DB->repo mirror of the curated logo catalog. Rewrites
    logo_meta.json (enabled rows, Phase 1 schema) and writes the saved row's
    PNG. Never deletes files; never raises into the caller's save()."""
    sync_dir = settings.CURATED_LOGO_SYNC_DIR
    if not sync_dir:
        return
    try:
        out = Path(sync_dir)
        out.mkdir(parents=True, exist_ok=True)
        with schema_context("public"):
            rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
        meta = [
            {
                "title": r.title,
                "filename": r.image_key.rsplit("/", 1)[-1],
                "prompt": r.prompt,
                "tags": r.tags,
            }
            for r in rows
            if (r.image_key or "").startswith("platform/")
        ]
        (out / "logo_meta.json").write_text(json.dumps(meta, indent=4, ensure_ascii=False) + "\n")
        if fetch_png_for is not None and (fetch_png_for.image_key or "").startswith("platform/"):
            body = (
                get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=fetch_png_for.image_key)["Body"].read()
            )
            (out / fetch_png_for.image_key.rsplit("/", 1)[-1]).write_bytes(body)
    except Exception:
        logger.exception("curated-logo mirror sync failed")


@receiver(post_save, sender=CuratedLogo)
def curated_logo_mirror_on_save(sender, instance, **kwargs):
    _mirror_curated_logos(fetch_png_for=instance)


@receiver(post_delete, sender=CuratedLogo)
def curated_logo_mirror_on_delete(sender, instance, **kwargs):
    _mirror_curated_logos()
