from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0011_tenantconfig_default_locale"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantconfig",
            name="pages",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
