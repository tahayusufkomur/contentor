from django.db import migrations


def backfill_recording_videos(apps, schema_editor):
    LiveClass = apps.get_model("live", "LiveClass")
    LiveStream = apps.get_model("live", "LiveStream")
    Video = apps.get_model("courses", "Video")

    for lc in LiveClass.objects.exclude(recording_url="").filter(recording__isnull=True):
        video = Video.objects.create(
            title=f"Recording: {lc.title}",
            s3_key=lc.recording_url,
        )
        lc.recording = video
        lc.save(update_fields=["recording"])

    for ls in LiveStream.objects.exclude(recording_url="").filter(recording__isnull=True):
        video = Video.objects.create(
            title=f"Recording: {ls.title}",
            s3_key=ls.recording_url,
        )
        ls.recording = video
        ls.save(update_fields=["recording"])


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0004_lesson_video_fk"),
        ("live", "0008_liveclass_livestream_recording_fk"),
    ]

    operations = [
        migrations.RunPython(backfill_recording_videos, reverse_backfill),
    ]
