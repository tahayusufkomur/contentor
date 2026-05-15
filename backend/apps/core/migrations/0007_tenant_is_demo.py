from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_alter_tenant_slug_alter_tenant_subdomain_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="is_demo",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text=(
                    "Read-only marketing demo. Mutating requests are rejected "
                    "by DemoReadOnlyMiddleware."
                ),
            ),
        ),
    ]
