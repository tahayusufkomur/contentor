# Phase 0 — Add Payment.platform_subscription FK (nullable, blank).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0003_alter_payment_provider"),
        ("core", "0004_platform_subscription_webhook_event"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="platform_subscription",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="payments",
                to="core.platformsubscription",
            ),
        ),
    ]
