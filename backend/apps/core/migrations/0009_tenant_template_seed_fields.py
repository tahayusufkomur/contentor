from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_remove_tenant_core_tenant_slug_region_unique_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="template_niche",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Niche key chosen during onboarding (matches a module under demo_data/).",
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="template_goals",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Multi-select goals captured during onboarding. Metadata only for now.",
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="template_seed_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("seeding", "Seeding"),
                    ("ready", "Ready"),
                    ("skipped", "Skipped"),
                    ("failed", "Failed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
