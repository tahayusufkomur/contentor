# Phase 0 — Idempotent backfill: ensure a Free PlatformPlan exists and
# every tenant with a NULL plan gets attached to it.

from django.conf import settings
from django.db import migrations


def backfill_free_plan(apps, schema_editor):
    PlatformPlan = apps.get_model("core", "PlatformPlan")
    Tenant = apps.get_model("core", "Tenant")

    free_name = getattr(settings, "BILLING_FREE_PLAN_NAME", "Free")

    # Reasonable Free-tier defaults. Tweakable via seed_plans on next reseed.
    defaults = {
        "price_monthly": 0,
        "transaction_fee_pct": 0,
        "max_students": 10,
        "max_storage_gb": 1,
        "max_streaming_hours": 2,
        "max_campaign_emails": 100,
        "stripe_price_id": "",
        "prices": {},
        "is_live_enabled": False,
    }
    free_plan, _ = PlatformPlan.objects.get_or_create(name=free_name, defaults=defaults)

    # Attach Free to every tenant without a plan. Idempotent.
    Tenant.objects.filter(plan__isnull=True).update(plan=free_plan)


def noop_reverse(apps, schema_editor):
    # Reversible no-op: we don't detach tenants on rollback to avoid orphaning.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_platform_subscription_webhook_event"),
    ]

    operations = [
        migrations.RunPython(backfill_free_plan, reverse_code=noop_reverse),
    ]
