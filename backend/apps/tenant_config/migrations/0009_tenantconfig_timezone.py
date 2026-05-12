from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0008_backfill_logo_and_section_photos"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantconfig",
            name="timezone",
            field=models.CharField(default="UTC", max_length=50),
        ),
    ]
