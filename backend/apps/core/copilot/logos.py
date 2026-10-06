"""Curated-logo pick behind the copilot's set_logo action — the logo sibling
of photos.py: deterministic shortlist, no extra AI call, DB writes in the
execute view."""

import re


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


MARK_ROLES = ("mark", "mark2", "accent")
_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


def mark_of(row) -> dict | None:
    """A curated logo's traced vector mark for rendering in the site's own
    colours: its paths (fill as a colour role, never a hex) and a viewBox
    hugging the artwork, so the mark fills its height instead of sitting
    small inside the PNG's margins. None when it was never traced."""
    paths = [p for p in row.mark_paths or [] if isinstance(p, dict) and isinstance(p.get("d"), str) and p["d"]]
    xs: list[float] = []
    ys: list[float] = []
    for p in paths:
        nums = [float(n) for n in _NUMBER.findall(p["d"])]  # traces are absolute M/C/Z: x, y pairs
        xs += nums[0::2]
        ys += nums[1::2]
    if not xs or not ys:
        return None
    pad = 1.5
    x, y = min(xs) - pad, min(ys) - pad
    w, h = max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad
    return {
        "box": f"{x:.1f} {y:.1f} {w:.1f} {h:.1f}",
        "paths": [
            {
                "d": p["d"],
                "role": p.get("fill") if p.get("fill") in MARK_ROLES else "mark",
                **({"fill_rule": p["fill_rule"]} if p.get("fill_rule") in ("nonzero", "evenodd") else {}),
                **({"opacity": p["opacity"]} if isinstance(p.get("opacity"), int | float) else {}),
            }
            for p in paths
        ],
    }


def mark_for_key(s3_key: str) -> dict | None:
    """The traced mark of the curated logo stored at ``s3_key`` (a tenant's
    logo picked from the library), cached; None for any other image."""
    from django.core.cache import cache
    from django_tenants.utils import schema_context

    from apps.core.models import CuratedLogo

    if not isinstance(s3_key, str) or not s3_key.startswith("platform/curated-logos/"):
        return None
    key = f"curated-mark:{s3_key}"
    cached = cache.get(key)
    if cached is None:
        with schema_context("public"):
            row = CuratedLogo.objects.filter(image_key=s3_key).first()
        cached = (mark_of(row) if row else None) or {}
        cache.set(key, cached, 3600)
    return cached or None


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
