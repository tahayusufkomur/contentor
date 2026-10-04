from django.db import migrations


def clear_stale_prices(apps, schema_editor):
    apps.get_model("downloads", "DownloadFile").objects.exclude(pricing_type="paid").update(price=0)


class Migration(migrations.Migration):
    dependencies = [("downloads", "0006_alter_downloadfile_pricing_type")]
    operations = [migrations.RunPython(clear_stale_prices, migrations.RunPython.noop)]
