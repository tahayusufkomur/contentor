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
