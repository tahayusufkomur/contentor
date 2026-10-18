from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0034_focuscreation_runs_brief_pending"),
    ]

    operations = [
        migrations.AddField(
            model_name="focuscreation",
            name="covers",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
