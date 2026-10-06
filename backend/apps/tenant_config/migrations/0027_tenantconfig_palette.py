from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0026_tenantconfig_setup_flow"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantconfig",
            name="palette",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
