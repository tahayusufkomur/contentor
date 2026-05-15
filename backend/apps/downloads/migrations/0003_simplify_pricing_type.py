from django.db import migrations, models


def migrate_subscription_to_paid(apps, schema_editor):
    DownloadFile = apps.get_model("downloads", "DownloadFile")
    DownloadFile.objects.filter(pricing_type="subscription").update(pricing_type="paid")


class Migration(migrations.Migration):
    dependencies = [
        ("downloads", "0002_rename_access_type_add_price"),
    ]

    operations = [
        migrations.RunPython(migrate_subscription_to_paid, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="downloadfile",
            name="pricing_type",
            field=models.CharField(
                choices=[("free", "Free"), ("paid", "Paid")],
                default="free",
                max_length=20,
            ),
        ),
    ]
