from django.conf import settings
from django.core import signing

from apps.core.models import Domain
from apps.tenant_config.defaults import sanitize_rich_text

_SALT = "notifications.email.unsubscribe"


def tenant_base_url(tenant) -> str:
    """Her site's root: https in prod, plain http on the dev stack (SITE_SCHEME)."""
    domain = Domain.objects.filter(tenant=tenant, is_primary=True).first()
    host = domain.domain if domain else f"{tenant.subdomain}.{settings.CONTENTOR_DOMAIN}"
    return f"{settings.SITE_SCHEME}://{host}"


def unsubscribe_url(tenant, *, user_id=None, email=None) -> str:
    token = signing.dumps({"schema": tenant.schema_name, "user_id": user_id, "email": email}, salt=_SALT)
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


def announcement_email(announcement, base_url: str, unsubscribe: str):
    """An announcement as a transactional.Email in her email style: her own text, sanitized."""
    from .transactional import Email

    return Email(
        subject=announcement.title or "News",
        heading=announcement.title,
        body_html=sanitize_rich_text(announcement.body or ""),
        button="Open" if announcement.link else "",
        link=_abs(base_url, announcement.link) if announcement.link else "",
        unsubscribe=unsubscribe,
    )
