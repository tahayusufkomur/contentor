from django.db import migrations
from django_tenants.utils import get_public_schema_name


def link_unlinked(apps, schema_editor):
    # The public schema holds no tenant items. The live models are used on purpose: this
    # depends on the latest billing, courses, downloads and live migrations, so the schema matches.
    if schema_editor.connection.schema_name == get_public_schema_name():
        return
    from apps.billing.ways import link_unlinked_members_only

    link_unlinked_members_only()


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0009_paymentitem_access_ends_at_and_more"),
        ("courses", "0019_enrollment_access_ends_at_and_more"),
        ("downloads", "0007_clear_stale_free_prices"),
        ("live", "0019_alter_livestream_pricing_type"),
    ]
    operations = [migrations.RunPython(link_unlinked, migrations.RunPython.noop)]
