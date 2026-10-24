from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("live", "0019_alter_livestream_pricing_type")]

    operations = [
        migrations.AddField(
            model_name="liveclass",
            name="whiteboard_key",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="livestream",
            name="whiteboard_key",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
    ]
