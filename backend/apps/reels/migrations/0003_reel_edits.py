from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reels", "0002_reel_ideas_and_covers"),
    ]

    # A database default: the node still on the older code keeps inserting reels during a rolling deploy.
    operations = [
        migrations.AddField(
            model_name="reel",
            name="edits",
            field=models.JSONField(blank=True, db_default={}, default=dict),
        ),
    ]
