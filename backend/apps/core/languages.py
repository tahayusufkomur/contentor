"""The locale list and the two languages in play: the site's and the creator's.

The list is packages/shared/src/i18n/locales.json (synced copy in apps/core/i18n).
ENABLED_LOCALES decides which of them the public sees; anything else resolves to English.
"""

import contextlib
import contextvars
import functools
import json
from pathlib import Path
from typing import NamedTuple

from django.conf import settings
from django.db import connection
from django.utils import translation
from django_tenants.utils import get_public_schema_name, schema_context

_DATA = json.loads((Path(__file__).parent / "i18n" / "locales.json").read_text(encoding="utf-8"))
_BY_CODE = {entry["code"]: entry for entry in _DATA["locales"]}
_GLOSSARY = json.loads((Path(__file__).parent / "i18n" / "glossary.json").read_text(encoding="utf-8"))

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


_inside = contextvars.ContextVar("site_language_inside", default=None)  # (schema, language) while one is active


@contextlib.contextmanager
def site_language_context():
    """Everything inside is in the language of the site this connection is on: for what students are sent
    from a task, a webhook or a studio request (whose own language is the creator's). The language is looked
    up once: a nested use on the same schema (a send inside a fan-out) reuses it."""
    schema = connection.schema_name
    active = _inside.get()
    if active is not None and active == (schema, translation.get_language()):
        yield
        return
    language = site_language()
    token = _inside.set((schema, language))
    try:
        with translation.override(language):
            yield
    finally:
        _inside.reset(token)


def in_site_language(fn):
    """`fn` runs inside `site_language_context()`."""

    @functools.wraps(fn)
    def run(*args, **kwargs):
        with site_language_context():
            return fn(*args, **kwargs)

    return run


def creator_language(user=None) -> str:
    """The creator's language: the user's preferred_locale, else (no user) the tenant owner's."""
    if user is None:
        from apps.accounts.models import User

        user = User.objects.filter(role="owner").order_by("id").first()
        if user is None:
            return DEFAULT
    return resolve(user.preferred_locale)


class Mixed(NamedTuple):
    """An AI call whose output has two readers: the creator (talked to) and the site (written for)."""

    creator: str
    site: str


_KEEP = (
    "Keep brand names and the creator's own words as they wrote them. "
    "Search terms, photo briefs and image prompts stay in English."
)


def _words(code: str) -> str:
    """The voice and glossary sentences of a non-English language."""
    terms = "; ".join(f"{term['en']} = {term[code]}" for term in _GLOSSARY["terms"])
    return f"{_GLOSSARY['voice'][code]} Use these words: {terms}."


def rule(language: "str | Mixed | None") -> str:
    """The sentence that goes at the end of an AI system prompt so the model writes in `language`.
    None (nobody reads the output) gives ""; English needs no voice or glossary lines."""
    if language is None:
        return ""
    if isinstance(language, Mixed):
        text = (
            f"Talk to the creator in {info(language.creator)['name']}. "
            f"Write every word that goes on their site in {info(language.site)['name']}. {_KEEP}"
        )
        codes = dict.fromkeys(code for code in (language.creator, language.site) if code != DEFAULT)
    else:
        text = f"Write every word a reader will see in {info(language)['name']}. {_KEEP}"
        codes = [language] if language != DEFAULT else []
    return " ".join([text, *(_words(code) for code in codes)])
