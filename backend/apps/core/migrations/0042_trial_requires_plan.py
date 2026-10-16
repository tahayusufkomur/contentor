from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0041_cx_registry"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="requires_plan",
            field=models.BooleanField(
                db_default=False,
                default=False,
                help_text=(
                    "Signed up after the Free plan was retired (2026-10-16): with no trial or paid plan the "
                    "site pauses instead of falling back to Free. False keeps a tenant's Free plan."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="platformsubscription",
            name="status",
            field=models.CharField(
                choices=[
                    ("incomplete", "Incomplete"),
                    ("trialing", "Trialing"),
                    ("active", "Active"),
                    ("past_due", "Past due"),
                    ("canceled", "Canceled"),
                ],
                default="incomplete",
                max_length=20,
            ),
        ),
    ]
