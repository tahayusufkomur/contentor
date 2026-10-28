"""The locale list and the two languages in play: the site's and the creator's.

The list is packages/shared/src/i18n/locales.json (synced copy in apps/core/i18n).
ENABLED_LOCALES decides which of them the public sees; anything else resolves to English.
"""

import json
from pathlib import Path

from django.conf import settings
from django_tenants.utils import get_public_schema_name, schema_context

_DATA = json.loads((Path(__file__).parent / "i18n" / "locales.json").read_text(encoding="utf-8"))
_BY_CODE = {entry["code"]: entry for entry in _DATA["locales"]}

CODES = tuple(_BY_CODE)
DEFAULT = _DATA["default"]
CREATOR_ROLES = ("owner", "coach")


def info(code: str) -> dict:
    return _BY_CODE[code]


def enabled() -> tuple[str, ...]:
    return tuple(settings.ENABLED_LOCALES)


def resolve(code: str | None) -> str:
    return code if code in enabled() else DEFAULT


def site_language(tenant=None) -> str:
    """The site's language: TenantConfig.default_locale of the current schema (or `tenant`'s)."""
    from django.db import connection

    if tenant is not None:
        with schema_context(tenant.schema_name):
            return site_language()
    if connection.schema_name == get_public_schema_name():
        return DEFAULT
    from apps.tenant_config.models import TenantConfig

    return resolve(TenantConfig.objects.values_list("default_locale", flat=True).first())


def creator_language(user=None) -> str:
    """The creator's language: the user's preferred_locale, else (no user) the tenant owner's."""
    if user is None:
        from apps.accounts.models import User

        user = User.objects.filter(role="owner").order_by("id").first()
        if user is None:
            return DEFAULT
    return resolve(user.preferred_locale)
