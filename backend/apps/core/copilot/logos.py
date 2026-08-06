"""Curated-logo pick behind the copilot's set_logo action — the logo sibling
of photos.py: deterministic shortlist, no extra AI call, DB writes in the
execute view."""


class LogoOpError(Exception):
    """User-safe message describing why a logo operation was refused."""


SHORTLIST_LIMIT = 30


def pick_logo(description, tenant, *, exclude_s3_key=None):
    """Best-matching enabled CuratedLogo for the coach's real profile (niche,
    onboarding description) plus the model's per-turn style description. See
    photos.pick_photo's docstring for why the brief comes from the tenant,
    not from niche + the model's text alone (same bug, same fix, logo
    sibling)."""
    from django_tenants.utils import schema_context

    from apps.core.models import CuratedLogo
    from apps.core.onboarding.ai_curate import brief_with_turn_style, shortlist

    with schema_context("public"):
        rows = [
            r
            for r in CuratedLogo.objects.filter(enabled=True).order_by("position", "id")
            if r.image_key.startswith("platform/") and r.image_key != (exclude_s3_key or "")
        ]
    if not rows:
        raise LogoOpError("no logos are available in the library yet")
    brief = brief_with_turn_style(tenant, description)
    return shortlist(rows, brief, limit=SHORTLIST_LIMIT)[0]


def preview_url(row):
    """Presigned URL for the card's logo preview (24h, matches the curated
    search endpoint)."""
    from apps.core.storage import generate_presigned_download_url

    return generate_presigned_download_url(row.image_key, expiry=86400)


def current_logo_key(tenant):
    """s3_key of the tenant's current logo Photo (to exclude on re-pick)."""
    from django_tenants.utils import tenant_context

    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.select_related("logo").first()
        return cfg.logo.s3_key if cfg and cfg.logo_id and cfg.logo else None
