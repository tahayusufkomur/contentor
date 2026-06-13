"""Add the publish gate (is_published + preview_password) to Tenant.

Existing tenants are already live, so they're backfilled to published=True;
new tenants start unpublished (model default) and gated until the coach marks
them ready. Demo tenants are also marked published so they stay viewable.
"""

from django.db import migrations, models


def publish_existing_tenants(apps, schema_editor):
    Tenant = apps.get_model("core", "Tenant")
    Tenant.objects.exclude(schema_name="public").update(is_published=True)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0011_tenant_stripe_charges_enabled_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="is_published",
            field=models.BooleanField(
                default=False,
                help_text="When false, the public site is hidden behind a preview gate until the coach marks it ready.",
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="preview_password",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Optional password that unlocks the public site while it is unpublished.",
                max_length=128,
            ),
        ),
        migrations.RunPython(publish_existing_tenants, migrations.RunPython.noop),
    ]
