from datetime import UTC, datetime, timedelta

import jwt
from django.conf import settings
from django.test import Client
from django.utils.translation import gettext, override


def translated(msgid: str, lang: str = "tr") -> str:
    """The msgstr of ``msgid`` in ``lang``. Fails while it is still English, so a leak
    test can't pass on an untranslated message."""
    text = gettext_in(msgid, lang)
    assert text != msgid, f"{lang} has no translation for {msgid!r}: run make translate"
    return text


def gettext_in(msgid: str, lang: str) -> str:
    with override(lang):
        return gettext(msgid)


def creator_client(tenant_ctx, owner, locale: str = "tr") -> Client:
    """A test client signed in as ``owner`` on the shared test tenant, with the creator's ``user-locale`` cookie."""
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "user_id": owner.id,
            "tenant_id": tenant_ctx.schema_name,
            "role": owner.role,
            "iat": now,
            "exp": now + timedelta(days=1),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    client = Client()
    client.cookies["contentor_access_token"] = token
    client.cookies["user-locale"] = locale
    return client
