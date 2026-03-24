from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0002_alter_course_thumbnail_url"),
    ]

    operations = [
        migrations.CreateModel(
            name="Video",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, default="")),
                ("s3_key", models.CharField(blank=True, default="", max_length=500)),
                ("duration_seconds", models.IntegerField(default=0)),
                (
                    "thumbnail_url",
                    models.CharField(blank=True, default="", max_length=2000),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
