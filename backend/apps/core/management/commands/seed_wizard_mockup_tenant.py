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
from apps.core.onboarding import wizard_catalog
from apps.core.tasks import _create_default_config

# "general" is the sparsest niche module (no subscription plans, FAQ
# disabled with zero items) — meant as a blank-slate fallback for real
# coaches, not for producing convincing screenshots. "yoga" has real
# content for every block type this tool captures (FAQ, pricing plans,
# testimonials), so mockups don't show empty states.
NICHE = "yoga"


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

        # frontend-customer's fetchTenantConfig() keeps its own 60s in-memory
        # cache keyed by domain (frontend-customer/src/lib/tenant.ts,
        # independent of Next's own caching) — capturing two layouts back to
        # back on the SAME domain would silently serve the first layout's
        # cached config for the second. One extra domain per layout id gives
        # each capture its own cache key without touching that app-level
        # cache at all.
        layout_ids = [option["id"] for options in wizard_catalog.PAGE_LAYOUTS.values() for option in options]
        for layout_id in layout_ids:
            Domain.objects.create(domain=f"wm-{layout_id}.{settings.CONTENTOR_DOMAIN}", tenant=tenant)
        self.stdout.write(f"Created {len(layout_ids)} per-layout capture domains")

        # Theme and hero captures get their own domains for the same
        # frontend-customer 60s config-cache reason as the layouts above.
        look_domains = [f"wm-theme-{theme}" for theme in wizard_catalog.THEMES] + [
            f"wm-hero-{style}" for style in wizard_catalog.HERO_STYLES
        ]
        for sub in look_domains:
            Domain.objects.create(domain=f"{sub}.{settings.CONTENTOR_DOMAIN}", tenant=tenant)
        self.stdout.write(f"Created {len(look_domains)} per-look capture domains")

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

            # seed_template_into_tenant creates courses as drafts (correct
            # for a real coach's fresh signup — they review before publishing).
            # This tenant only exists to look like a real, finished site in
            # screenshots, so publish everything it seeded.
            from apps.courses.models import Course

            published = Course.objects.filter(is_published=False).update(is_published=True)
            self.stdout.write(f"Published {published} seeded course(s)")

        self.stdout.write(self.style.SUCCESS(f"\nwizard-mockups tenant ready at: {domain}"))
