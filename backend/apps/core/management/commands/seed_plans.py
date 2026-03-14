from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.models import Domain, PlatformPlan, Tenant


class Command(BaseCommand):
    help = "Seed default platform plans and public tenant"

    def handle(self, *args, **options):
        # Create public tenant (required by django-tenants)
        public_tenant, created = Tenant.objects.get_or_create(
            schema_name="public",
            defaults={
                "name": "Contentor Platform",
                "slug": "public",
                "subdomain": "public",
                "owner_email": "admin@contentor.com",
                "provisioning_status": "ready",
            },
        )
        if created:
            self.stdout.write("Created public tenant")
            Domain.objects.get_or_create(
                domain=settings.CONTENTOR_DOMAIN,
                defaults={"tenant": public_tenant, "is_primary": True},
            )
            Domain.objects.get_or_create(
                domain="localhost",
                defaults={"tenant": public_tenant, "is_primary": False},
            )
            self.stdout.write("Created platform domains")
        else:
            self.stdout.write("Public tenant already exists")

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
