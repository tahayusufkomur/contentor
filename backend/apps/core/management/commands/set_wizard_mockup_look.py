"""Set the wizard-mockups scratch tenant's theme and/or home hero style —
used by tools/wizard-mockups/capture.mjs for the wizard's theme and
welcome (hero) screenshot sets. Same cache-invalidation notes as
set_wizard_mockup_layout: direct ORM writes must purge the 5-minute
TenantConfigView cache themselves."""

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.onboarding import wizard_catalog
from apps.core.onboarding.compose import build_config_overrides


class Command(BaseCommand):
    help = "Set theme and/or home hero style on the wizard-mockups tenant."

    def add_arguments(self, parser):
        parser.add_argument("--theme", help=f"One of: {', '.join(wizard_catalog.THEMES)}")
        parser.add_argument("--hero", help=f"One of: {', '.join(wizard_catalog.HERO_STYLES)}")

    def handle(self, *args, **options):
        theme = options.get("theme")
        hero = options.get("hero")
        if not theme and not hero:
            raise CommandError("Pass --theme and/or --hero.")
        if theme and theme not in wizard_catalog.THEMES:
            raise CommandError(f"Unknown theme '{theme}'. Choices: {sorted(wizard_catalog.THEMES)}")
        if hero and hero not in wizard_catalog.HERO_STYLES:
            raise CommandError(f"Unknown hero style '{hero}'. Choices: {sorted(wizard_catalog.HERO_STYLES)}")

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

            update_fields = []
            if theme:
                config.theme = theme
                update_fields.append("theme")
            if hero:
                # No page_layouts answer -> home falls back to the recommended
                # home-spotlight, so hero captures share one canonical layout.
                overrides = build_config_overrides(
                    {"hero_style": hero},
                    brand_name=config.brand_name,
                    landing_sections=config.landing_sections or {},
                    locale="en",
                )
                pages = dict(config.pages or {})
                pages["home"] = overrides["pages"]["home"]
                config.pages = pages
                update_fields.append("pages")
            config.save(update_fields=update_fields)

        cache.delete(f"tenant:{schema_name}:config")
        self.stdout.write(self.style.SUCCESS(f"look -> theme={theme or '-'} hero={hero or '-'}"))
