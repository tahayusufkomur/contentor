from django.db import migrations, models


def migrate_subscription_to_paid(apps, schema_editor):
    LiveClass = apps.get_model("live", "LiveClass")
    LiveStream = apps.get_model("live", "LiveStream")
    ZoomClass = apps.get_model("live", "ZoomClass")
    OnsiteEvent = apps.get_model("live", "OnsiteEvent")
    for Model in [LiveClass, LiveStream, ZoomClass, OnsiteEvent]:
        Model.objects.filter(pricing_type="subscription").update(pricing_type="paid")


class Migration(migrations.Migration):

    dependencies = [
        ("live", "0014_add_thumbnail_to_zoom_onsite"),
    ]

    operations = [
        migrations.RunPython(migrate_subscription_to_paid, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="liveclass",
            name="pricing_type",
            field=models.CharField(
                choices=[("free", "Free"), ("paid", "Paid")],
                default="free",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="livestream",
            name="pricing_type",
            field=models.CharField(
                choices=[("free", "Free"), ("paid", "Paid")],
                default="free",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="zoomclass",
            name="pricing_type",
            field=models.CharField(
                choices=[("free", "Free"), ("paid", "Paid")],
                default="free",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="onsiteevent",
            name="pricing_type",
            field=models.CharField(
                choices=[("free", "Free"), ("paid", "Paid")],
                default="free",
                max_length=20,
            ),
        ),
    ]
