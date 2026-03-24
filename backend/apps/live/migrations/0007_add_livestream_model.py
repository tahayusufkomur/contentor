import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("live", "0006_liveclass_auto_recording"),
    ]

    operations = [
        migrations.CreateModel(
            name="LiveStream",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("scheduled", "Scheduled"), ("live", "Live"), ("ended", "Ended")],
                        default="draft",
                        max_length=20,
                    ),
                ),
                (
                    "pricing_type",
                    models.CharField(
                        choices=[("free", "Free"), ("paid", "Paid"), ("subscription", "Subscription")],
                        default="free",
                        max_length=20,
                    ),
                ),
                ("price", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("thumbnail_url", models.CharField(blank=True, default="", max_length=2000)),
                ("recording_url", models.CharField(blank=True, default="", max_length=2000)),
                ("auto_recording", models.BooleanField(default=False)),
                ("room_name", models.CharField(editable=False, max_length=255, unique=True)),
                ("scheduled_at", models.DateTimeField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "instructor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="live_streams",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
