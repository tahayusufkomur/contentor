"""Helpers to derive region info from request host and to build apex URLs.

There is a single region ("global"); the region plumbing stays because
`Tenant.region`, `User.region` and the JWT claim are keyed on it.
"""

import re
from typing import NamedTuple

from django.conf import settings

from .constants import REGION_DEFAULT_LOCALE, REGION_GLOBAL


class HostInfo(NamedTuple):
    region: str
    tenant_slug: str | None
    locale: str


_TENANT_RE = re.compile(r"^(?P<slug>[a-z0-9][a-z0-9-]*)\.(?P<base>.+)$")
_APEX_HOSTS = {"contentor.app", "localhost"}


def resolve_host(host: str) -> HostInfo:
    """Parse a request host into (region, tenant_slug, locale)."""
    host = (host or "").split(":")[0].lower()
    locale = REGION_DEFAULT_LOCALE[REGION_GLOBAL]

    if host in _APEX_HOSTS:
        return HostInfo(region=REGION_GLOBAL, tenant_slug=None, locale=locale)

    m = _TENANT_RE.match(host)
    if m and m.group("base") in _APEX_HOSTS:
        return HostInfo(region=REGION_GLOBAL, tenant_slug=m.group("slug"), locale=locale)

    return HostInfo(region=REGION_GLOBAL, tenant_slug=None, locale=locale)


def region_apex(region: str, scheme: str = "https") -> str:
    return f"{scheme}://{settings.CONTENTOR_DOMAIN}"


def tenant_apex(region: str, slug: str, scheme: str = "https") -> str:
    return f"{scheme}://{slug}.{settings.CONTENTOR_DOMAIN}"
