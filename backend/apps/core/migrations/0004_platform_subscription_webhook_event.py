# Phase 0 — Platform subscription payments.
# Creates PlatformSubscription and WebhookEvent in the public schema.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_platformplan_prices"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformSubscription",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("incomplete", "Incomplete"),
                            ("active", "Active"),
                            ("past_due", "Past due"),
                            ("canceled", "Canceled"),
                        ],
                        default="incomplete",
                        max_length=20,
                    ),
                ),
                (
                    "provider",
                    models.CharField(
                        choices=[("stripe", "Stripe"), ("bypass", "Bypass")],
                        default="stripe",
                        max_length=20,
                    ),
                ),
                (
                    "provider_subscription_id",
                    models.CharField(blank=True, db_index=True, default="", max_length=255),
                ),
                (
                    "provider_customer_id",
                    models.CharField(blank=True, db_index=True, default="", max_length=255),
                ),
                ("current_period_start", models.DateTimeField(blank=True, null=True)),
                ("current_period_end", models.DateTimeField(blank=True, null=True)),
                ("cancel_at_period_end", models.BooleanField(default=False)),
                ("canceled_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "plan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="platform_subscriptions",
                        to="core.platformplan",
                    ),
                ),
                (
                    "tenant",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="platform_subscription",
                        to="core.tenant",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="platform_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="platformsubscription",
            index=models.Index(
                fields=["status", "current_period_end"],
                name="core_platfo_status_ffce54_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformsubscription",
            constraint=models.UniqueConstraint(
                condition=models.Q(("provider_subscription_id", ""), _negated=True),
                fields=("provider", "provider_subscription_id"),
                name="uniq_provider_subscription_id",
            ),
        ),
        migrations.CreateModel(
            name="WebhookEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("provider", models.CharField(max_length=20)),
                ("provider_event_id", models.CharField(max_length=255)),
                ("event_type", models.CharField(max_length=100)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("processing_error", models.TextField(blank=True, default="")),
            ],
        ),
        migrations.AddIndex(
            model_name="webhookevent",
            index=models.Index(
                fields=["provider", "event_type"],
                name="core_webhoo_provide_870e6a_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="webhookevent",
            constraint=models.UniqueConstraint(
                fields=("provider", "provider_event_id"),
                name="uniq_provider_event_id",
            ),
        ),
    ]
