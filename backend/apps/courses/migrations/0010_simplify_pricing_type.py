from django.db import migrations, models


def migrate_subscription_to_paid(apps, schema_editor):
    Course = apps.get_model("courses", "Course")
    Course.objects.filter(pricing_type="subscription").update(pricing_type="paid")


class Migration(migrations.Migration):

    dependencies = [
        ("courses", "0009_enrollment_is_active"),
    ]

    operations = [
        migrations.RunPython(migrate_subscription_to_paid, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="course",
            name="pricing_type",
            field=models.CharField(
                choices=[("free", "Free"), ("paid", "Paid")],
                default="free",
                max_length=20,
            ),
        ),
    ]
