from django.conf import settings
from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.core.models import Domain, PlatformPlan, Tenant


class Command(BaseCommand):
    help = "Seed default platform plans, public tenant, and superusers"

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
        else:
            self.stdout.write("Public tenant already exists")

        # All marketing-apex hostnames point at the public tenant. We do this
        # unconditionally (not gated on `created`) so adding new hosts (e.g.
        # the TR apex) gets picked up by an existing install on the next seed.
        platform_hosts = [
            (settings.CONTENTOR_DOMAIN, True),  # contentor.localhost (or prod equivalent)
            ("localhost", False),
            ("django", False),  # internal Docker hostname for SSR fetches
            # Turkish region apex — required for tr.localhost and
            # tr.contentor.localhost routing into the public tenant.
            ("tr.localhost", False),
            (f"tr.{settings.CONTENTOR_DOMAIN}", False),
        ]
        for host, is_primary in platform_hosts:
            Domain.objects.get_or_create(
                domain=host,
                defaults={"tenant": public_tenant, "is_primary": is_primary},
            )
        self.stdout.write("Platform domains ensured")

        free_name = getattr(settings, "BILLING_FREE_PLAN_NAME", "Free")

        # Stripe Price ID env mapping per (plan_name, currency).
        price_ids = {
            ("starter", "USD"): settings.STRIPE_PRICE_STARTER_USD,
            ("starter", "TRY"): settings.STRIPE_PRICE_STARTER_TRY,
            ("pro", "USD"): settings.STRIPE_PRICE_PRO_USD,
            ("pro", "TRY"): settings.STRIPE_PRICE_PRO_TRY,
        }

        plans = [
            {
                "name": free_name,
                "price_monthly": 0,
                "transaction_fee_pct": 0,
                "max_students": 10,
                "max_storage_gb": 1,
                "max_streaming_hours": 2,
                "max_campaign_emails": 100,
                "is_live_enabled": False,
                "prices": {},
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
                "prices": {
                    "USD": {
                        "amount_cents": 1900,
                        "stripe_price_id": price_ids[("starter", "USD")],
                    },
                    "TRY": {
                        "amount_cents": 65000,
                        "stripe_price_id": price_ids[("starter", "TRY")],
                    },
                },
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
                "prices": {
                    "USD": {
                        "amount_cents": 4900,
                        "stripe_price_id": price_ids[("pro", "USD")],
                    },
                    "TRY": {
                        "amount_cents": 169000,
                        "stripe_price_id": price_ids[("pro", "TRY")],
                    },
                },
            },
        ]

        free_plan = None
        for plan_data in plans:
            plan, created = PlatformPlan.objects.update_or_create(name=plan_data["name"], defaults=plan_data)
            action = "Created" if created else "Updated"
            self.stdout.write(f"{action} plan: {plan.name}")
            if plan.name == free_name:
                free_plan = plan
        self.stdout.write(self.style.SUCCESS("Plans seeded successfully"))

        # Phase 0 idempotent backfill: any tenant with no plan gets pinned to
        # Free. The data migration also does this — the seed command keeps it
        # working for ongoing local resets.
        if free_plan is not None:
            updated = Tenant.objects.filter(plan__isnull=True).update(plan=free_plan)
            if updated:
                self.stdout.write(f"Backfilled Free plan onto {updated} tenant(s)")

        # Optional Stripe Price ID validation. Only runs if both STRIPE_SECRET_KEY
        # is set and the `stripe` SDK is importable. Phase 0 does not hard-require
        # either — production setups will turn this on.
        if settings.STRIPE_SECRET_KEY:
            try:
                import stripe

                stripe.api_key = settings.STRIPE_SECRET_KEY
                non_empty_ids = [pid for pid in price_ids.values() if pid]
                for pid in non_empty_ids:
                    try:
                        stripe.Price.retrieve(pid)
                        self.stdout.write(f"Validated Stripe price: {pid}")
                    except Exception as exc:  # noqa: BLE001 — log and continue
                        self.stdout.write(self.style.WARNING(f"Stripe price retrieve failed for {pid}: {exc}"))
            except ImportError:
                self.stdout.write(self.style.WARNING("stripe SDK not installed; skipping price validation"))

        # Sync superusers from CONTENTOR_SUPERUSERS env var
        superuser_emails = set(settings.CONTENTOR_SUPERUSERS)
        if not superuser_emails:
            return

        # Create missing superusers (region='global' is the platform-default;
        # superusers can see both regions in admin via accessible_regions).
        for email in superuser_emails:
            user, created = User.objects.get_or_create(
                email=email,
                region="global",
                defaults={
                    "name": email.split("@")[0],
                    "role": "owner",
                    "is_staff": True,
                    "is_superuser": True,
                    "accessible_regions": ["global", "tr"],
                },
            )
            if created:
                user.set_unusable_password()
                user.save()
                self.stdout.write(f"Created superuser: {email}")
            else:
                changed = False
                if not user.is_superuser:
                    user.is_superuser = True
                    changed = True
                if not user.is_staff:
                    user.is_staff = True
                    changed = True
                if changed:
                    user.save(update_fields=["is_superuser", "is_staff"])
                    self.stdout.write(f"Promoted to superuser: {email}")
                else:
                    self.stdout.write(f"Superuser already exists: {email}")

        # Revoke superuser from anyone not in the list
        removed = User.objects.filter(is_superuser=True).exclude(email__in=superuser_emails).update(is_superuser=False)
        if removed:
            self.stdout.write(f"Revoked superuser from {removed} user(s) not in CONTENTOR_SUPERUSERS")

        self.stdout.write(self.style.SUCCESS("Superusers synced"))

        # Seed demo tenants
        from pathlib import Path

        from django.core.management import call_command

        demo_data_dir = Path(__file__).parent / "demo_data"
        niches = [f.stem for f in demo_data_dir.glob("*.py") if f.stem != "__init__"]
        if niches:
            self.stdout.write(f"\nSeeding {len(niches)} demo tenants...")
            for niche in sorted(niches):
                try:
                    call_command("seed_demo_tenant", niche=niche, stdout=self.stdout)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"Failed to seed {niche}: {e}"))
            self.stdout.write(self.style.SUCCESS("Demo tenants seeded"))
