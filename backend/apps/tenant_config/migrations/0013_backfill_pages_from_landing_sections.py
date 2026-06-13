"""Backfill ``pages`` from the legacy ``landing_sections`` for every tenant.

Runs in each tenant schema via ``migrate_schemas``. Idempotent: a tenant that
already has ``pages`` (e.g. a freshly provisioned one, or a re-run) is skipped.
The legacy ``landing_sections`` column is left untouched as a safety net.
"""

from django.db import migrations


def backfill_pages(apps, schema_editor):
    from apps.tenant_config.defaults import pages_from_landing_sections

    TenantConfig = apps.get_model("tenant_config", "TenantConfig")

    for config in TenantConfig.objects.all():
        if config.pages:
            continue  # already populated — don't clobber
        config.pages = pages_from_landing_sections(
            config.landing_sections or {},
            brand_name=config.brand_name or "",
        )
        config.save(update_fields=["pages"])


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0012_tenantconfig_pages"),
    ]

    operations = [
        migrations.RunPython(backfill_pages, migrations.RunPython.noop),
    ]
