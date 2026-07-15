import logging

from celery import shared_task
from django_tenants.utils import tenant_context

logger = logging.getLogger(__name__)


def _set_provisioning_stage(tenant, stage):
    """Best-effort theater checkpoint for the signup progress screen."""
    try:
        state = dict(tenant.wizard_state or {})
        state["provisioning_stage"] = stage
        tenant.wizard_state = state
        tenant.save(update_fields=["wizard_state"])
    except Exception:
        logger.exception(
            "Failed to set provisioning stage %s for tenant %s; ignoring",
            stage,
            tenant.slug,
        )


def _create_default_config(tenant, preferred_locale):
    """Create the tenant's default TenantConfig (called once per tenant schema)."""
    from apps.tenant_config.defaults import default_pages
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.create(
        brand_name=tenant.name,
        default_locale=preferred_locale,
        pages=default_pages(tenant.name),
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
            "links": [
                {"label": "Courses", "href": "/courses"},
                {"label": "Events", "href": "/events"},
                {"label": "About", "href": "/about"},
            ],
            "cta": {"text": "Get Started", "href": "/courses"},
            "show_login": True,
            "layout": "classic",
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


def _apply_wizard_answers(tenant, answers, preferred_locale):
    """Overlay the coach's wizard choices on the freshly-seeded tenant.

    Runs after the niche seeder so the merged landing_sections (niche copy +
    photo ids) are available as raw material — and so these values WIN over
    the niche defaults. Pure overwrites, so a Celery retry is safe.
    """
    from apps.core.onboarding.compose import apply_wizard_logo, build_config_overrides
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        config = TenantConfig.objects.first()
        if config is None:  # provisioning failed before config; retry will recreate
            return
        overrides = build_config_overrides(
            answers,
            brand_name=config.brand_name,
            landing_sections=config.landing_sections or {},
            locale=preferred_locale,
        )

        _set_provisioning_stage(tenant, "ai_copy")

        state = dict(tenant.wizard_state or {})
        ai_status = None
        if not state.get("ai_compose_status"):
            overrides["pages"], ai_status = _compose_pages_with_ai(
                tenant, answers, overrides["pages"], preferred_locale
            )

        for field, value in overrides.items():
            setattr(config, field, value)
        config.onboarding_completed = True
        apply_wizard_logo(config, answers, tenant)
        config.save()

        if ai_status is not None:
            state["ai_compose_status"] = ai_status
            tenant.wizard_state = state
            tenant.save(update_fields=["wizard_state"])

        if "build_community" in (answers.get("goals") or []):
            from apps.community.models import CommunitySettings

            community = CommunitySettings.load()
            if not community.is_enabled:
                community.is_enabled = True
                community.save(update_fields=["is_enabled", "updated_at"])


AI_COMPOSE_TIMEOUT_SECONDS = 90


def _compose_pages_with_ai(tenant, answers, pages, preferred_locale):
    """AI copy pass with a hard time cap. Returns (pages, status). NEVER
    raises: any failure returns the static pages unchanged. Runs the call in
    a worker thread (fresh connection, public schema) so a hung provider
    can't stall provisioning past the cap."""
    from apps.core.onboarding import ai_compose

    if not ai_compose.compose_available():
        return pages, "skipped"

    from concurrent.futures import ThreadPoolExecutor
    from concurrent.futures import TimeoutError as FutureTimeout

    def run():
        from django.db import close_old_connections

        close_old_connections()
        try:
            return ai_compose.compose_pages(
                pages,
                brand_name=tenant.name,
                niche=answers.get("niche") or "general",
                description=answers.get("description") or "",
                followups=list(((answers.get("description_followups") or {}).get("items")) or []),
                goals=list(answers.get("goals") or []),
                locale=preferred_locale,
                tenant_schema=tenant.schema_name,
            )
        finally:
            close_old_connections()

    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(run)
    try:
        result = future.result(timeout=AI_COMPOSE_TIMEOUT_SECONDS)
    except FutureTimeout:
        logger.warning("onboarding AI compose timed out for %s", tenant.slug)
        pool.shutdown(wait=False)
        return pages, "failed"
    except Exception:
        logger.exception("onboarding AI compose failed for %s", tenant.slug)
        pool.shutdown(wait=False)
        return pages, "failed"
    pool.shutdown(wait=False)
    return result, "ok"


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def provision_tenant(self, tenant_id, owner_email, owner_name, niche=None):
    """Provision the tenant schema, owner, and config.

    Idempotent: every step reuses existing rows, so a retry after partial
    progress completes the signup instead of duplicating a TenantConfig or
    crashing on a duplicate owner user.

    If `niche` is set, also seed niche-themed content via the live-tenant
    seeder. Seeding runs after the base provision so the seeder can assume an
    owner + TenantConfig already exist.
    """
    from apps.core.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    try:
        tenant.provisioning_status = "provisioning"
        tenant.save(update_fields=["provisioning_status"])
        _set_provisioning_stage(tenant, "schema")

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

        # Create owner + config in the tenant schema. Both steps are guarded so
        # a retry after partial progress reuses what exists instead of creating
        # a duplicate TenantConfig / crashing on the duplicate owner.
        _set_provisioning_stage(tenant, "config")
        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            if not TenantConfig.objects.exists():
                _create_default_config(tenant, preferred_locale)

            # Tenant schemas are isolated, but we still stamp region for
            # consistency with the public row and so JWT issuance has the
            # right value.
            User.objects.get_or_create(
                email=owner_email,
                region=region,
                defaults={
                    "name": owner_name,
                    "role": "owner",
                    "is_staff": True,
                    "preferred_locale": preferred_locale,
                    "accessible_regions": [],
                },
            )

        _set_provisioning_stage(tenant, "seed")
        if niche and tenant.template_seed_status != "ready":
            from apps.core.demo.seed_template import TemplateSeedError, seed_template_into_tenant

            try:
                seed_template_into_tenant(tenant, niche, writer=logger.info)
                tenant.template_seed_status = "ready"
            except TemplateSeedError:
                logger.exception("Template seed failed for tenant %s (niche=%s)", tenant.slug, niche)
                tenant.template_seed_status = "failed"
            tenant.save(update_fields=["template_seed_status"])

        wizard_answers = (tenant.wizard_state or {}).get("answers") or {}
        if wizard_answers:
            _apply_wizard_answers(tenant, wizard_answers, preferred_locale)

        _set_provisioning_stage(tenant, "finalizing")
        tenant.provisioning_status = "ready"
        tenant.save(update_fields=["provisioning_status"])
        logger.info("Tenant %s provisioned successfully", tenant.slug)

    except Exception as exc:
        tenant.provisioning_status = "failed"
        tenant.save(update_fields=["provisioning_status"])
        logger.exception("Tenant provisioning failed for %s", tenant.slug)
        raise self.retry(exc=exc) from exc


@shared_task
def purge_ai_transcripts():
    """Retention: drop assistant transcripts older than
    AI_TRANSCRIPT_RETENTION_DAYS (audit content, not billing state — the
    *Usage meters are permanent)."""
    from datetime import timedelta

    from django.conf import settings
    from django.utils import timezone

    from apps.core.models import AiConversation, AiTranscript

    cutoff = timezone.now() - timedelta(days=settings.AI_TRANSCRIPT_RETENTION_DAYS)
    deleted, _ = AiTranscript.objects.filter(created_at__lt=cutoff).delete()
    logger.info("purge_ai_transcripts: deleted %s rows", deleted)

    convos, _ = AiConversation.objects.filter(updated_at__lt=cutoff).delete()
    logger.info("purge_ai_transcripts: deleted %s conversations", convos)


@shared_task
def send_wizard_recovery_emails():
    """Hourly beat: one nudge to coaches who abandoned the signup wizard."""
    from apps.core.onboarding import recovery

    sent = 0
    for tenant in recovery.recovery_candidates():
        if recovery.send_recovery_email(tenant):
            sent += 1
    if sent:
        logger.info("wizard recovery: sent %d email(s)", sent)
    return sent
