"""Polish drafts never address the reader (or speak for the creator) in a gendered form.

The backend twin of frontend-customer/src/lib/__tests__/pl-gender.test.ts: same patterns, run over
backend/locale/pl. `\\w` stands in for `\\p{L}` (it is Unicode-aware in Python 3).
"""

import re
from pathlib import Path

import polib

PO = Path(__file__).resolve().parents[3] / "locale/pl/LC_MESSAGES/django.po"
W = r"[^\W\d_]"  # one letter

# "tytułem", "ciałem"… end in -łem but are instrumental nouns, not "I did".
NOUN_IN_LEM = "tytuł|zespoł|artykuł|szczegół|ciał|oryginał|materiał|kanał"
FIRST_PERSON_PAST = re.compile(rf"(?<!{W})(?!{W}*({NOUN_IN_LEM})em(?!{W})){W}*(łem|łam|łeś|łaś)(?!{W})", re.I)
GENDERED_JOB = re.compile(
    rf"(?<!{W})(certyfikowan[ya]|instruktor(ka)?|trener(ka)?|wizażyst(ka)?|zawodni(k|czka)"
    rf"|(zupełnie|jesteś) początkując[ya])(?!{W})",
    re.I,
)
READER_READY = re.compile(rf"(jesteś|bądź)\s+gotow[ya](?!{W})", re.I)
READER_PARTICIPLE = re.compile(
    rf"jesteś\s+(już\s+)?(zapisan|zalogowan|zarejestrowan|zweryfikowan|zainteresowan|pewn)[ya](?!{W})", re.I
)
SLASH_FORM = re.compile(rf"{W}\((a|ła|ka|-a)\)(?!{W})|(?<={W})/(a|ła)(?!{W})", re.I)


def _texts():
    for entry in polib.pofile(str(PO)):
        for text in [entry.msgstr, *entry.msgstr_plural.values()]:
            if text:
                yield entry.msgid, text


def _hits(pattern):
    return [(msgid, text) for msgid, text in _texts() if pattern.search(text)]


def test_the_patterns_themselves():
    assert FIRST_PERSON_PAST.search("Zbudowałem coś")
    assert FIRST_PERSON_PAST.search("Zrobiłaś to.")
    assert not FIRST_PERSON_PAST.search("Zdjęcie z tytułem")
    assert READER_READY.search("Czy jesteś gotowy?")
    assert not READER_READY.search("Twoja strona jest gotowa.")
    assert READER_PARTICIPLE.search("Jesteś już zapisany.")
    assert not READER_PARTICIPLE.search("Masz już zapis.")
    assert SLASH_FORM.search("skomentował(a)")
    assert GENDERED_JOB.search("Certyfikowana instruktorka")
    assert not GENDERED_JOB.search("Osoby zupełnie początkujące")


def test_there_is_something_to_check():
    assert len(list(_texts())) > 1000


def test_no_first_person_past_form():
    assert _hits(FIRST_PERSON_PAST) == []


def test_no_gendered_job_title_or_beginner():
    assert _hits(GENDERED_JOB) == []


def test_the_reader_is_never_gendered_ready_or_enrolled():
    assert _hits(READER_READY) == []
    assert _hits(READER_PARTICIPLE) == []


def test_no_slash_forms():
    assert _hits(SLASH_FORM) == []
