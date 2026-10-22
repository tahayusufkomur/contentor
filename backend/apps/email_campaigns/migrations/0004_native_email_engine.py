import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("email_campaigns", "0003_emailcampaign_scheduled_at_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Campaigns sent through MailCraft keep its template id under its own name.
        migrations.RenameField(
            model_name="emailcampaign",
            old_name="template_id",
            new_name="mailcraft_template_id",
        ),
        migrations.CreateModel(
            name="EmailTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("newsletter", "Newsletter"),
                            ("launch", "Launch"),
                            ("event", "Class or event"),
                            ("note", "Personal note"),
                            ("offer", "Offer"),
                            ("welcome", "Welcome"),
                            ("other", "Other"),
                        ],
                        default="other",
                        max_length=20,
                    ),
                ),
                ("design", models.JSONField(default=dict)),
                ("subject", models.CharField(blank=True, default="", max_length=255)),
                ("preheader", models.CharField(blank=True, default="", max_length=255)),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("starter", "Made at setup"),
                            ("designer", "Designed by the Designer"),
                            ("coach", "Her own"),
                            ("imported", "Imported from MailCraft"),
                        ],
                        default="coach",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
        migrations.AddField(
            model_name="emailcampaign",
            name="design",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="emailcampaign",
            name="preheader",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="emailcampaign",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="emailcampaign",
            name="mailcraft_template_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AlterField(
            model_name="emailcampaign",
            name="recipient_filter",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="emailcampaign",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("scheduled", "Scheduled"),
                    ("sending", "Sending"),
                    ("sent", "Sent"),
                    ("partial", "Partial"),
                    ("failed", "Failed"),
                ],
                default="sending",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="emailcampaign",
            name="subject",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.CreateModel(
            name="EmailDesignJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("mode", models.CharField(default="new", max_length=10)),
                ("brief", models.TextField()),
                ("block_id", models.CharField(blank=True, default="", max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[("queued", "Queued"), ("working", "Working"), ("done", "Done"), ("failed", "Failed")],
                        default="queued",
                        max_length=10,
                    ),
                ),
                ("step", models.CharField(blank=True, default="", max_length=200)),
                ("warnings", models.JSONField(blank=True, default=list)),
                ("error", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "campaign",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="email_campaigns.emailcampaign",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="email_campaigns.emailtemplate",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddField(
            model_name="emailcampaign",
            name="template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="campaigns",
                to="email_campaigns.emailtemplate",
            ),
        ),
    ]
