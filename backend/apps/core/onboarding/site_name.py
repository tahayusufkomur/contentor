"""A site's name and its address, <slug>.<CONTENTOR_DOMAIN>. Signup gives a new
site a temporary address; the creator names it in /setup, and the address
follows the name. The schema keeps the temporary one for life (storage too,
core.storage.storage_folder), so tokens find a site by its schema."""

import secrets

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils.text import slugify

from apps.core.constants import RESERVED_SLUGS, SITE_PLACEHOLDER_PREFIX

# Tenant.name until the creator names the site.
PLACEHOLDER_NAME = "New site"
NAME_MAX = 100


class NameRefusedError(ValueError):
    """The name can't be used; the message is an i18n_helpers.msg key."""


def placeholder_site() -> str:
    """A free temporary address (and schema name) for a site not named yet."""
    from apps.core.models import Tenant

    while True:
        site = SITE_PLACEHOLDER_PREFIX + secrets.token_hex(3)
        if not Tenant.objects.filter(schema_name=site).exists() and not Tenant.objects.filter(slug=site).exists():
            return site


def is_placeholder(slug: str) -> bool:
    return slug.startswith(SITE_PLACEHOLDER_PREFIX)


def token_tenant(payload: dict):
    """The site a signup or wizard token is for: by its schema; a token minted
    before the ``site`` claim, by the address its brand name made."""
    from apps.core.models import Tenant

    if site := payload.get("site"):
        return Tenant.objects.filter(schema_name=site).first()
    slug = slugify(payload.get("brand_name") or "")[:63]
    return Tenant.objects.filter(slug=slug, region=payload.get("region", "global")).first() if slug else None


def name_problem(name: str, tenant=None) -> str | None:
    """Why ``name`` can't name a site (an i18n_helpers.msg key), or None.
    ``tenant`` may keep the address it already has."""
    from apps.core.models import Tenant

    slug = slugify(name)[:63]
    if not slug:
        return "brand_unusable"
    taken = Tenant.objects.filter(slug=slug)
    if tenant is not None:
        taken = taken.exclude(pk=tenant.pk)
    if slug in RESERVED_SLUGS or is_placeholder(slug) or taken.exists():
        return "brand_taken"
    return None


def setup_login_url(tenant, email: str) -> str:
    """A one-click sign-in for ``email`` on the site's current address, landing in /setup."""
    from apps.accounts.tokens import create_magic_link_token

    magic = create_magic_link_token(email, tenant.schema_name, tenant.slug)
    return f"{settings.SITE_SCHEME}://{tenant.slug}.{settings.CONTENTOR_DOMAIN}/callback?token={magic}&next=/setup"


def rename(tenant, name: str) -> None:
    """Names the site: Tenant.name, and the address made from it. Raises
    NameRefusedError. The caller sets the brand name in the tenant's own config."""
    from apps.core.models import Domain, Tenant

    name = name.strip()[:NAME_MAX]
    if problem := name_problem(name, tenant):
        raise NameRefusedError(problem)
    slug = slugify(name)[:63]
    if slug != tenant.slug:
        base = settings.CONTENTOR_DOMAIN
        try:
            with transaction.atomic():
                Domain.objects.filter(tenant=tenant, domain=f"{tenant.slug}.{base}").update(domain=f"{slug}.{base}")
                Tenant.objects.filter(pk=tenant.pk).update(slug=slug, subdomain=slug)
        except IntegrityError:  # someone took it a moment ago
            raise NameRefusedError("brand_taken") from None
    Tenant.objects.filter(pk=tenant.pk).update(name=name)
    tenant.name, tenant.slug, tenant.subdomain = name, slug, slug
