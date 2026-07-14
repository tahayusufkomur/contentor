"""Create/reset the hidden scratch tenant used by tools/wizard-mockups/
to capture real-page screenshots for the signup wizard's page-layout
step. Never linked from any public page. Re-run whenever the demo
content or page templates change meaningfully; safe to re-run anytime
(tears down and recreates)."""

from django.conf import settings
from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.demo.seed_template import seed_template_into_tenant
from apps.core.models import Domain, Tenant
from apps.core.tasks import _create_default_config

NICHE = "general"


class Command(BaseCommand):
    help = "Create/reset the wizard-mockups scratch tenant (screenshot capture only)."

    def handle(self, *args, **options):
        schema_name = settings.WIZARD_MOCKUP_TENANT_SCHEMA
        slug = schema_name.replace("_", "-")

        existing = Tenant.objects.filter(schema_name=schema_name).first()
        if existing is not None:
            self.stdout.write(f"Found existing '{schema_name}' tenant, tearing down...")
            Domain.objects.filter(tenant=existing).delete()
            existing.delete(force_drop=True)

        tenant = Tenant.objects.create(
            name="Wizard Mockups",
            slug=slug,
            subdomain=slug,
            schema_name=schema_name,
            owner_email="wizard-mockups@example.com",
            provisioning_status="ready",
            is_demo=True,
        )
        self.stdout.write(f"Created tenant: {tenant.name} (is_demo=True)")

        domain = f"{slug}.{settings.CONTENTOR_DOMAIN}"
        Domain.objects.create(domain=domain, tenant=tenant, is_primary=True)
        self.stdout.write(f"Created domain: {domain}")

        tenant.create_schema(check_if_exists=True, verbosity=0)
        self.stdout.write(f"Created schema: {tenant.schema_name}")

        with tenant_context(tenant):
            _create_default_config(tenant, "en")
            User.objects.create_user(
                email=tenant.owner_email,
                name="Wizard Mockups",
                role="owner",
                is_staff=True,
            )
            seed_template_into_tenant(tenant, NICHE, writer=self.stdout.write)

        self.stdout.write(self.style.SUCCESS(f"\nwizard-mockups tenant ready at: {domain}"))
