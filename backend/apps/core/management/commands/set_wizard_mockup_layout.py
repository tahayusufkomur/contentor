"""Rewrite one page's blocks on the wizard-mockups scratch tenant to a
specific wizard layout choice, via the real compose pipeline — used by
tools/wizard-mockups/capture.mjs before screenshotting each layout."""

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.onboarding import wizard_catalog
from apps.core.onboarding.compose import build_config_overrides


class Command(BaseCommand):
    help = "Set one page's blocks on the wizard-mockups tenant to a specific wizard layout."

    def add_arguments(self, parser):
        parser.add_argument("page", help="Page key, e.g. home")
        parser.add_argument("layout_id", help="Layout id, e.g. home-story")

    def handle(self, *args, **options):
        page = options["page"]
        layout_id = options["layout_id"]

        valid_pages = set(wizard_catalog.PAGE_LAYOUTS.keys())
        if page not in valid_pages:
            raise CommandError(f"Unknown page '{page}'. Choices: {sorted(valid_pages)}")
        valid_layouts = {o["id"] for o in wizard_catalog.PAGE_LAYOUTS[page]}
        if layout_id not in valid_layouts:
            raise CommandError(f"Unknown layout '{layout_id}' for page '{page}'. Choices: {sorted(valid_layouts)}")

        schema_name = settings.WIZARD_MOCKUP_TENANT_SCHEMA
        try:
            tenant = Tenant.objects.get(schema_name=schema_name)
        except Tenant.DoesNotExist:
            raise CommandError(
                f"wizard-mockups tenant (schema '{schema_name}') not found — run seed_wizard_mockup_tenant first."
            ) from None

        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            config = TenantConfig.objects.first()
            if config is None:
                raise CommandError("wizard-mockups tenant has no TenantConfig — run seed_wizard_mockup_tenant first.")

            overrides = build_config_overrides(
                {"page_layouts": {page: layout_id}},
                brand_name=config.brand_name,
                landing_sections=config.landing_sections or {},
                locale="en",
            )
            pages = dict(config.pages or {})
            pages[page] = overrides["pages"][page]
            config.pages = pages
            config.save(update_fields=["pages"])

        # TenantConfigView.get_object() caches the config object for 5
        # minutes (apps/tenant_config/views.py), invalidated only on the
        # DRF update path (perform_update). This command writes via the ORM
        # directly, bypassing that — without this, every capture after the
        # first would silently serve the previous layout's cached response
        # for up to 5 minutes.
        cache.delete(f"tenant:{schema_name}:config")

        self.stdout.write(self.style.SUCCESS(f"{page} -> {layout_id}"))
