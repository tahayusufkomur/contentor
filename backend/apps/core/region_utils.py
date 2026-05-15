"""Helpers to derive region info from request host and to build region apex URLs."""

import re
from typing import NamedTuple

from django.conf import settings

from .constants import (
    REGION_DEFAULT_LOCALE,
    REGION_GLOBAL,
    REGION_TR,
)


class HostInfo(NamedTuple):
    region: str
    tenant_slug: str | None
    locale: str


_TENANT_TR_RE = re.compile(r"^(?P<slug>[a-z0-9][a-z0-9-]*)\.tr\.(?P<base>.+)$")
_TENANT_GLOBAL_RE = re.compile(r"^(?P<slug>[a-z0-9][a-z0-9-]*)\.(?P<base>.+)$")

_TR_APEX_HOSTS = {"tr.contentor.app", "tr.localhost"}
_GLOBAL_APEX_HOSTS = {"contentor.app", "localhost"}


def resolve_host(host: str) -> HostInfo:
    """Parse a request host into (region, tenant_slug, locale).

    Order of matching matters: TR tenant pattern must be tried before global
    tenant pattern because `<slug>.tr.contentor.app` also matches the global
    regex.
    """
    host = (host or "").split(":")[0].lower()

    if host in _TR_APEX_HOSTS:
        return HostInfo(region=REGION_TR, tenant_slug=None, locale=REGION_DEFAULT_LOCALE[REGION_TR])

    if host in _GLOBAL_APEX_HOSTS:
        return HostInfo(region=REGION_GLOBAL, tenant_slug=None, locale=REGION_DEFAULT_LOCALE[REGION_GLOBAL])

    m = _TENANT_TR_RE.match(host)
    if m and f"tr.{m.group('base')}" in _TR_APEX_HOSTS:
        return HostInfo(region=REGION_TR, tenant_slug=m.group("slug"), locale=REGION_DEFAULT_LOCALE[REGION_TR])

    m = _TENANT_GLOBAL_RE.match(host)
    if m and m.group("base") in _GLOBAL_APEX_HOSTS:
        return HostInfo(
            region=REGION_GLOBAL,
            tenant_slug=m.group("slug"),
            locale=REGION_DEFAULT_LOCALE[REGION_GLOBAL],
        )

    return HostInfo(region=REGION_GLOBAL, tenant_slug=None, locale=REGION_DEFAULT_LOCALE[REGION_GLOBAL])


def region_apex(region: str, scheme: str = "https") -> str:
    base_domain = settings.CONTENTOR_DOMAIN
    if region == REGION_TR:
        return f"{scheme}://tr.{base_domain}"
    return f"{scheme}://{base_domain}"


def tenant_apex(region: str, slug: str, scheme: str = "https") -> str:
    base_domain = settings.CONTENTOR_DOMAIN
    if region == REGION_TR:
        return f"{scheme}://{slug}.tr.{base_domain}"
    return f"{scheme}://{slug}.{base_domain}"
