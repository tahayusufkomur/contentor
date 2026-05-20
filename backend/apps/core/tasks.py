import logging

from celery import shared_task
from django_tenants.utils import tenant_context

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def provision_tenant(self, tenant_id, owner_email, owner_name, niche=None):
    """Provision the tenant schema, owner, and config.

    If `niche` is set, also seed niche-themed content via the live-tenant
    seeder. Seeding runs after the base provision so the seeder can assume an
    owner + TenantConfig already exist.
    """
    from apps.core.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    try:
        tenant.provisioning_status = "provisioning"
        tenant.save(update_fields=["provisioning_status"])

        tenant.create_schema(check_if_exists=True, verbosity=0)

        # Create owner in main (public) schema if they don't exist yet.
        # If they do exist (e.g. they already own a tenant in another region),
        # do NOT mutate their User.region — it tracks first-signup origin only.
        # Cross-region isolation is enforced at the Tenant level via JWT claims.
        from apps.accounts.models import User
        from apps.core.constants import REGION_DEFAULT_LOCALE

        region = tenant.region or "global"
        preferred_locale = REGION_DEFAULT_LOCALE.get(region, "en")
        # Email is unique per-region: same email may have separate rows in
        # different regions, so the lookup key must include region.
        User.objects.get_or_create(
            email=owner_email,
            region=region,
            defaults={
                "name": owner_name,
                "role": "coach",
                "preferred_locale": preferred_locale,
                "accessible_regions": [],
            },
        )

        # Create owner + config in tenant schema
        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            TenantConfig.objects.create(
                brand_name=tenant.name,
                default_locale=preferred_locale,
                enabled_modules=[
                    "courses",
                    "live",
                    "community",
                    "downloads",
                    "billing",
                    "campaigns",
                    "analytics",
                    "pages",
                ],
                navbar_config={
                    "links": [{"label": "Courses", "href": "/courses"}],
                    "cta": {"text": "Get Started", "href": "/courses"},
                    "show_login": True,
                },
                landing_sections={
                    "hero": {
                        "enabled": True,
                        "headline": f"Welcome to {tenant.name}",
                        "subheadline": "Explore our courses and start learning today.",
                        "cta_text": "Browse Courses",
                        "cta_href": "/courses",
                        "bg_image_url": None,
                    },
                    "about": {"enabled": False, "heading": "About Me", "body": "", "image_url": None},
                    "courses": {"enabled": True, "heading": "Featured Courses"},
                    "testimonials": {"enabled": False, "heading": "What students say", "items": []},
                    "faq": {"enabled": False, "heading": "FAQ", "items": []},
                    "cta": {
                        "enabled": True,
                        "heading": "Ready to start learning?",
                        "button_text": "Join Now",
                        "button_href": "/courses",
                    },
                },
                onboarding_completed=False,
            )
            # Tenant schemas are isolated, but we still stamp region for
            # consistency with the public row and so JWT issuance has the
            # right value.
            User.objects.create_user(
                email=owner_email,
                name=owner_name,
                role="owner",
                is_staff=True,
                region=region,
                preferred_locale=preferred_locale,
                accessible_regions=[],
            )

        if niche:
            from apps.core.seed_template import TemplateSeedError, seed_template_into_tenant

            try:
                seed_template_into_tenant(tenant, niche, writer=logger.info)
                tenant.template_seed_status = "ready"
            except TemplateSeedError:
                logger.exception("Template seed failed for tenant %s (niche=%s)", tenant.slug, niche)
                tenant.template_seed_status = "failed"
            tenant.save(update_fields=["template_seed_status"])

        tenant.provisioning_status = "ready"
        tenant.save(update_fields=["provisioning_status"])
        logger.info("Tenant %s provisioned successfully", tenant.slug)

    except Exception as exc:
        tenant.provisioning_status = "failed"
        tenant.save(update_fields=["provisioning_status"])
        logger.exception("Tenant provisioning failed for %s", tenant.slug)
        raise self.retry(exc=exc) from exc
