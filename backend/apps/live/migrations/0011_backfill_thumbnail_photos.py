from django.db import migrations


def backfill_live_class_thumbnails(apps, schema_editor):
    Photo = apps.get_model("media", "Photo")
    LiveClass = apps.get_model("live", "LiveClass")
    for lc in LiveClass.objects.filter(thumbnail__isnull=True).exclude(thumbnail_url=""):
        photo = Photo.objects.create(s3_key=lc.thumbnail_url, title=lc.title)
        lc.thumbnail = photo
        lc.save(update_fields=["thumbnail"])


def backfill_live_stream_thumbnails(apps, schema_editor):
    Photo = apps.get_model("media", "Photo")
    LiveStream = apps.get_model("live", "LiveStream")
    for ls in LiveStream.objects.filter(thumbnail__isnull=True).exclude(thumbnail_url=""):
        photo = Photo.objects.create(s3_key=ls.thumbnail_url, title=ls.title)
        ls.thumbnail = photo
        ls.save(update_fields=["thumbnail"])


class Migration(migrations.Migration):
    dependencies = [
        ("live", "0010_liveclass_thumbnail_livestream_thumbnail"),
        ("media", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_live_class_thumbnails, migrations.RunPython.noop),
        migrations.RunPython(backfill_live_stream_thumbnails, migrations.RunPython.noop),
    ]
