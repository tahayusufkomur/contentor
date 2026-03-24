from django.db import migrations


def backfill_lesson_videos(apps, schema_editor):
    Lesson = apps.get_model("courses", "Lesson")
    Video = apps.get_model("courses", "Video")

    for lesson in Lesson.objects.exclude(video_url="").filter(video__isnull=True):
        video = Video.objects.create(
            title=lesson.title,
            s3_key=lesson.video_url,
            duration_seconds=lesson.duration_seconds,
        )
        lesson.video = video
        lesson.save(update_fields=["video"])


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0004_lesson_video_fk"),
    ]

    operations = [
        migrations.RunPython(backfill_lesson_videos, reverse_backfill),
    ]
