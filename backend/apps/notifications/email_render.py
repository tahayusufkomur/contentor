from django.conf import settings
from django.core import signing

from apps.core.models import Domain
from apps.tenant_config.defaults import sanitize_rich_text

_SALT = "notifications.email.unsubscribe"

# Keys MUST match TenantTheme choice values (tenant_config/models.py):
# ocean, ember, forest, sunset, violet, slate
THEME_EMAIL_COLORS = {
    "ocean": "#0391F9",
    "ember": "#ea580c",
    "forest": "#16a34a",
    "sunset": "#f97316",
    "violet": "#7c3aed",
    "slate": "#334155",
}
_DEFAULT_COLOR = "#0391F9"


def tenant_base_url(tenant) -> str:
    domain = Domain.objects.filter(tenant=tenant, is_primary=True).first()
    if domain:
        return f"https://{domain.domain}"
    return f"https://{tenant.subdomain}.{settings.CONTENTOR_DOMAIN}"


def unsubscribe_url(tenant, *, user_id=None, email=None) -> str:
    token = signing.dumps(
        {"schema": tenant.schema_name, "user_id": user_id, "email": email}, salt=_SALT
    )
    return f"{tenant_base_url(tenant)}/api/v1/notifications/email/unsubscribe/?t={token}"


def decode_unsubscribe(token: str):
    try:
        return signing.loads(token, salt=_SALT, max_age=60 * 60 * 24 * 90)
    except signing.BadSignature:
        return None


def _abs(base_url: str, link: str) -> str:
    if not link:
        return base_url
    return link if link.startswith("http") else f"{base_url}{link}"


def announcement_email_html(announcement, cfg, base_url: str):
    """Return (subject, html) for a theme-branded announcement email.

    The caller must set ``announcement.email_unsub_url`` (a transient attribute,
    not a DB field) to the per-recipient unsubscribe link before calling.
    """
    color = THEME_EMAIL_COLORS.get(getattr(cfg, "theme", ""), _DEFAULT_COLOR)
    brand = (cfg.brand_name if cfg else "") or "Contentor"
    subject = announcement.title or brand
    body = sanitize_rich_text(announcement.body or "")
    logo = cfg.logo_url if cfg and cfg.logo_url else ""
    header = (
        f'<img src="{logo}" alt="{brand}" style="height:40px;margin-bottom:16px"/>'
        if logo
        else f'<h2 style="color:{color};margin:0 0 16px">{brand}</h2>'
    )
    cta = ""
    if announcement.link:
        cta = (
            f'<a href="{_abs(base_url, announcement.link)}" '
            f'style="display:inline-block;background:{color};color:#fff;padding:12px 28px;'
            f'border-radius:999px;text-decoration:none;font-weight:600;margin:20px 0">Open</a>'
        )
    unsub = getattr(announcement, "email_unsub_url", base_url)
    html = f"""
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 20px">
      {header}
      <h1 style="font-size:20px;color:#1a1a2e;margin:0 0 12px">{announcement.title}</h1>
      <div style="color:#444;font-size:15px;line-height:1.5">{body}</div>
      {cta}
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
      <p style="color:#aaa;font-size:12px">{brand} · <a href="{unsub}" style="color:#aaa">Unsubscribe</a></p>
    </div>"""
    return subject, html
