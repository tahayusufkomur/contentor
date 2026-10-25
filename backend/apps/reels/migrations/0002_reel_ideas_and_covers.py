from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reels", "0001_initial"),
    ]

    # Database defaults: the node still on the older code keeps inserting reels during a rolling deploy.
    operations = [
        migrations.AddField(
            model_name="reel",
            name="kind",
            field=models.CharField(blank=True, db_default="", default="", max_length=12),
        ),
        migrations.AddField(
            model_name="reel",
            name="why",
            field=models.CharField(blank=True, db_default="", default="", max_length=200),
        ),
        migrations.AddField(
            model_name="reel",
            name="frames",
            field=models.JSONField(blank=True, db_default=[], default=list),
        ),
        migrations.AddField(
            model_name="reel",
            name="cover",
            field=models.JSONField(blank=True, db_default={}, default=dict),
        ),
        migrations.AddField(
            model_name="reel",
            name="cover_key",
            field=models.CharField(blank=True, db_default="", default="", max_length=500),
        ),
    ]
