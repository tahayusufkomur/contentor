from django.db import migrations


def backfill_course_thumbnails(apps, schema_editor):
    Photo = apps.get_model("media", "Photo")
    Course = apps.get_model("courses", "Course")
    for course in Course.objects.filter(thumbnail__isnull=True).exclude(thumbnail_url=""):
        photo = Photo.objects.create(s3_key=course.thumbnail_url, title=course.title)
        course.thumbnail = photo
        course.save(update_fields=["thumbnail"])


def backfill_video_thumbnails(apps, schema_editor):
    Photo = apps.get_model("media", "Photo")
    Video = apps.get_model("courses", "Video")
    for video in Video.objects.filter(thumbnail__isnull=True).exclude(thumbnail_url=""):
        photo = Photo.objects.create(s3_key=video.thumbnail_url, title=video.title)
        video.thumbnail = photo
        video.save(update_fields=["thumbnail"])


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0006_course_thumbnail_video_thumbnail"),
        ("media", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_course_thumbnails, migrations.RunPython.noop),
        migrations.RunPython(backfill_video_thumbnails, migrations.RunPython.noop),
    ]
