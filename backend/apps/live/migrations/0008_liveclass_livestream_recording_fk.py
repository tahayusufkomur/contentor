import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0004_lesson_video_fk"),
        ("live", "0007_add_livestream_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="liveclass",
            name="recording",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="live_class_recordings",
                to="courses.video",
            ),
        ),
        migrations.AddField(
            model_name="livestream",
            name="recording",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="live_stream_recordings",
                to="courses.video",
            ),
        ),
    ]
