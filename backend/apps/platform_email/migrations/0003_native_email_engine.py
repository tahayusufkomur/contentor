from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("platform_email", "0002_alter_platformemailcampaign_status"),
    ]

    operations = [
        # Campaigns sent through MailCraft keep its template id under its own name.
        migrations.RenameField(
            model_name="platformemailcampaign",
            old_name="template_id",
            new_name="mailcraft_template_id",
        ),
        migrations.CreateModel(
            name="PlatformEmailTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("design", models.JSONField(default=dict)),
                ("subject", models.CharField(blank=True, default="", max_length=255)),
                ("preheader", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
        migrations.AddField(
            model_name="platformemailcampaign",
            name="design",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="platformemailcampaign",
            name="preheader",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="platformemailcampaign",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="platformemailcampaign",
            name="mailcraft_template_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AlterField(
            model_name="platformemailcampaign",
            name="recipient_filter",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="platformemailcampaign",
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
            model_name="platformemailcampaign",
            name="subject",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
