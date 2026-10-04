from django.db import migrations


def clear_stale_prices(apps, schema_editor):
    apps.get_model("courses", "Course").objects.exclude(pricing_type="paid").update(price=0)


class Migration(migrations.Migration):
    dependencies = [("courses", "0014_alter_course_pricing_type")]
    operations = [migrations.RunPython(clear_stale_prices, migrations.RunPython.noop)]
