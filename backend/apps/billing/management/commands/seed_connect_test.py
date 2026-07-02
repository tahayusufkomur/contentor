"""Create a Stripe TEST-MODE connected account for a tenant so marketplace
checkout works locally without hosted Express onboarding.

Uses a Custom account with Stripe's documented test data (tos_acceptance,
test routing/account numbers) so charges_enabled flips on programmatically.
"""
import time

import stripe
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Seed a test-mode Stripe Connect account onto a tenant (dev/e2e only)"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="tenant slug, e.g. demo-yoga")

    def handle(self, *args, **options):
        key = settings.STRIPE_SECRET_KEY
        if not key.startswith("sk_test_"):
            raise CommandError("seed_connect_test requires a sk_test_* key (never live).")
        stripe.api_key = key

        tenant = Tenant.objects.get(slug=options["tenant"])
        if tenant.stripe_account_id and tenant.stripe_charges_enabled:
            self.stdout.write(f"{tenant.slug}: already enabled ({tenant.stripe_account_id})")
            return

        acct = stripe.Account.create(
            type="custom",
            country="US",
            email=tenant.owner_email,
            capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
            business_type="individual",
            business_profile={"mcc": "8299", "url": "https://accessible.stripe.com"},
            individual={
                "first_name": "E2E", "last_name": "Coach",
                "email": tenant.owner_email, "phone": "0000000000",
                "dob": {"day": 1, "month": 1, "year": 1990},
                "address": {"line1": "address_full_match", "city": "Columbus",
                            "state": "OH", "postal_code": "43214", "country": "US"},
                "ssn_last_4": "0000",
            },
            tos_acceptance={"date": int(time.time()), "ip": "127.0.0.1"},
            external_account={"object": "bank_account", "country": "US", "currency": "usd",
                              "routing_number": "110000000", "account_number": "000123456789"},
        )
        for _ in range(30):
            acct = stripe.Account.retrieve(acct.id)
            if acct.charges_enabled:
                break
            time.sleep(2)
        if not acct.charges_enabled:
            raise CommandError(f"{acct.id} never reached charges_enabled; check test data")

        Tenant.objects.filter(pk=tenant.pk).update(
            stripe_account_id=acct.id, stripe_charges_enabled=True
        )
        self.stdout.write(self.style.SUCCESS(f"{tenant.slug} ← {acct.id} (charges_enabled)"))
