import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0003_add_video_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="lesson",
            name="video",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="lessons",
                to="courses.video",
            ),
        ),
    ]
