from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("live", "0020_whiteboard_key")]

    operations = [
        migrations.AddField(
            model_name="liveclass",
            name="watermark",
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.AddField(
            model_name="livestream",
            name="watermark",
            field=models.BooleanField(db_default=False, default=False),
        ),
    ]
