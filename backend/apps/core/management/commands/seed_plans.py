from django.core.management.base import BaseCommand

from apps.core.models import PlatformPlan


class Command(BaseCommand):
    help = "Seed default platform plans"

    def handle(self, *args, **options):
        plans = [
            {
                "name": "free",
                "price_monthly": 0,
                "transaction_fee_pct": 0,
                "max_students": 0,
                "max_storage_gb": 0,
                "max_streaming_hours": 0,
                "max_campaign_emails": 0,
                "is_live_enabled": False,
            },
            {
                "name": "starter",
                "price_monthly": 19,
                "transaction_fee_pct": 8,
                "max_students": 100,
                "max_storage_gb": 100,
                "max_streaming_hours": 100,
                "max_campaign_emails": 1000,
                "is_live_enabled": True,
            },
            {
                "name": "pro",
                "price_monthly": 49,
                "transaction_fee_pct": 6,
                "max_students": 500,
                "max_storage_gb": 500,
                "max_streaming_hours": 500,
                "max_campaign_emails": 5000,
                "is_live_enabled": True,
            },
        ]
        for plan_data in plans:
            plan, created = PlatformPlan.objects.update_or_create(
                name=plan_data["name"], defaults=plan_data
            )
            action = "Created" if created else "Updated"
            self.stdout.write(f"{action} plan: {plan.name}")
        self.stdout.write(self.style.SUCCESS("Plans seeded successfully"))
