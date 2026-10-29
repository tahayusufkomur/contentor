import io
import json
import shutil
import subprocess
from decimal import Decimal

import polib
import pytest
from django.core.management import CommandError, call_command

from apps.core import languages
from apps.core.management.commands import translate as cmd

PLURAL_ROW = cmd.PLURAL_SEP.join(["%(count)d rzecz", "%(count)d rzeczy"])  # three are needed
PLURALS = {
    "tr": "nplurals=1; plural=0;",
    "de": "nplurals=2; plural=(n != 1);",
    "pl": "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<12 || n%100>14) ? 1 : 2);",
}


@pytest.fixture
def calls(monkeypatch):
    """ai.structured faked: every text comes back as "[x] <english>"."""
    seen = []

    def fake(**kwargs):
        seen.append(kwargs)
        items = json.loads(kwargs["user"])["items"]
        drafts = cmd._Drafts(items=[cmd._Item(key=i["key"], en=i["en"], text=f"[x] {i['en']}") for i in items])
        return drafts, Decimal("0"), kwargs["model"]

    monkeypatch.setattr(cmd.ai, "structured", fake)
    return seen


@pytest.fixture
def locale(tmp_path, settings, monkeypatch):
    """A scratch locale dir; makemessages is skipped, compilemessages recorded."""
    settings.LOCALE_PATHS = [tmp_path]
    compiled = []
    monkeypatch.setattr(cmd, "_makemessages", lambda langs: None)
    monkeypatch.setattr(cmd, "_compile", compiled.append)
    return compiled


def _write(tmp_path, lang, *entries):
    po = polib.POFile()
    po.metadata = {"Language": lang, "Content-Type": "text/plain; charset=UTF-8", "Plural-Forms": PLURALS[lang]}
    for entry in entries:
        po.append(entry)
    path = tmp_path / lang / "LC_MESSAGES" / "django.po"
    path.parent.mkdir(parents=True)
    po.save(str(path))
    return path


def _read(path):
    return {e.msgid: e for e in polib.pofile(str(path))}


def test_draft_mode_maps_keys_and_sends_the_rule(calls, monkeypatch, settings):
    items = [{"key": "a.b", "en": "Hello {name}", "where": "admin"}, {"key": "c", "en": "Save", "where": "admin"}]
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps({"items": items})))
    out = io.StringIO()
    call_command("translate", draft="de", stdout=out, stderr=io.StringIO())
    assert json.loads(out.getvalue()) == {"a.b": "[x] Hello {name}", "c": "[x] Save"}
    system = calls[0]["system"]
    assert "German" in system
    assert calls[0]["language"] == "de"  # ai.structured appends the rule: the glossary and the voice
    assert calls[0]["model"] == settings.TRANSLATE_MODEL


def test_draft_retries_a_lost_placeholder_then_gives_up(monkeypatch):
    attempts = []

    def fake(**kwargs):
        attempts.append(1)
        key = json.loads(kwargs["user"])["items"][0]["key"]
        return cmd._Drafts(items=[cmd._Item(key=key, en="Hello {name}", text="Hallo")]), Decimal("0"), "m"

    monkeypatch.setattr(cmd.ai, "structured", fake)
    done, failed = cmd.draft("de", [{"key": "k", "en": "Hello {name}", "where": ""}])
    assert (done, failed, len(attempts)) == ({}, ["k"], 2)


def _shifted(attempts):
    """A model whose reply slid by one item: key N carries item N+1's English and translation."""

    def fake(**kwargs):
        attempts.append(1)
        items = json.loads(kwargs["user"])["items"]
        moved = items[1:] + items[:1]
        out = [cmd._Item(key=i["key"], en=m["en"], text=f"[x] {m['en']}") for i, m in zip(items, moved, strict=False)]
        return cmd._Drafts(items=out), Decimal("0"), "m"

    return fake


def test_draft_rejects_a_reply_shifted_onto_the_next_key(monkeypatch):
    attempts = []
    monkeypatch.setattr(cmd.ai, "structured", _shifted(attempts))
    items = [{"key": str(n), "en": text, "where": ""} for n, text in enumerate(["Start now", "Price", "Join"])]
    done, failed = cmd.draft("de", items)
    assert (done, failed, len(attempts)) == ({}, ["0", "1", "2"], 2)  # retried once, never accepted


def test_draft_accepts_items_that_echo_their_own_english(calls):
    items = [
        {"key": "0", "en": "Start  now", "where": ""},
        {"key": "1", "en": "Price", "where": ""},
    ]
    done, failed = cmd.draft("de", items)
    assert done == {"0": "[x] Start  now", "1": "[x] Price"} and failed == []


def test_draft_ignores_whitespace_differences_in_the_echo(monkeypatch):
    def fake(**kwargs):
        key = json.loads(kwargs["user"])["items"][0]["key"]
        return cmd._Drafts(items=[cmd._Item(key=key, en=" Start\n now ", text="Jetzt starten")]), Decimal("0"), "m"

    monkeypatch.setattr(cmd.ai, "structured", fake)
    assert cmd.draft("de", [{"key": "k", "en": "Start now", "where": ""}]) == ({"k": "Jetzt starten"}, [])


def test_po_mode_drafts_untranslated_entries_as_fuzzy(calls, locale, tmp_path):
    path = _write(
        tmp_path,
        "tr",
        polib.POEntry(msgid="Save", msgstr=""),
        polib.POEntry(msgid="Done", msgstr="Bitti"),
    )
    call_command("translate", po=True, to="tr", stderr=io.StringIO())
    entries = _read(path)
    assert entries["Save"].msgstr == "[x] Save" and "fuzzy" in entries["Save"].flags
    assert entries["Done"].msgstr == "Bitti" and "fuzzy" not in entries["Done"].flags
    assert locale == [["tr"]]


def test_po_mode_redrafts_an_entry_whose_english_changed(calls, locale, tmp_path):
    changed = polib.POEntry(msgid="Save now", msgstr="Kaydet", flags=["fuzzy"], previous_msgid="Save")
    own_draft = polib.POEntry(msgid="Done", msgstr="Bitti", flags=["fuzzy"])
    path = _write(tmp_path, "tr", changed, own_draft)
    call_command("translate", po=True, to="tr", stderr=io.StringIO())
    entries = _read(path)
    assert entries["Save now"].msgstr == "[x] Save now"
    assert entries["Save now"].previous_msgid is None and "fuzzy" in entries["Save now"].flags
    assert entries["Done"].msgstr == "Bitti"  # an earlier draft stays unless --redraft
    call_command("translate", po=True, to="tr", redraft=True, stderr=io.StringIO())
    assert _read(path)["Done"].msgstr == "[x] Done"


def test_a_polish_plural_gets_three_forms(calls, locale, tmp_path):
    path = _write(
        tmp_path,
        "pl",
        polib.POEntry(msgid="%(count)d item", msgid_plural="%(count)d items", msgstr_plural={0: "", 1: "", 2: ""}),
    )
    call_command("translate", po=True, to="pl", stderr=io.StringIO())
    entry = _read(path)["%(count)d item"]
    assert sorted(entry.msgstr_plural) == [0, 1, 2] and all(entry.msgstr_plural.values())
    where = {i["key"]: i["where"] for i in json.loads(calls[0]["user"])["items"]}
    assert "counts like 1" in where["0:0"] and "2, 3, 4" in where["0:1"] and "0, 5, 6" in where["0:2"]


def test_export_and_import_clear_fuzzy(locale, tmp_path, monkeypatch):
    path = _write(
        tmp_path,
        "tr",
        polib.POEntry(msgid="Save", msgstr="Kayit", flags=["fuzzy"], occurrences=[("apps/a.py", "1")]),
        polib.POEntry(msgctxt="menu", msgid="Open", msgstr="Ac", flags=["fuzzy"]),
        polib.POEntry(msgid="Done", msgstr="Bitti"),
    )
    out = io.StringIO()
    call_command("translate", export="tr", stdout=out)
    rows = [json.loads(line) for line in out.getvalue().splitlines()]
    assert [r["key"] for r in rows] == ["backend:Save", "backend:menu\x04Open"]
    assert rows[0]["where"] == "apps/a.py"
    rows[0]["translation"] = "Kaydet"
    monkeypatch.setattr("sys.stdin", io.StringIO("\n".join(json.dumps(r) for r in rows)))
    call_command("translate", import_lang="tr", stderr=io.StringIO())
    entries = _read(path)
    assert entries["Save"].msgstr == "Kaydet" and "fuzzy" not in entries["Save"].flags
    assert "fuzzy" not in entries["Open"].flags
    assert locale == [["tr"]]


def test_rule():
    assert languages.rule(None) == ""
    english = languages.rule("en")
    assert english.startswith("Write every word a reader will see in English.") and "Use these words" not in english
    polish = languages.rule("pl")
    assert "in Polish." in polish and "Address the reader informally with ty." in polish
    assert "creator = twórca" in polish and polish.endswith("sign in = zaloguj się.")


def test_a_one_word_plural_branch_is_not_an_argument():
    english = {"en": "{count, plural, one {Continue} other {Continue with #}}"}
    assert cmd._ok(english, "{count, plural, one {Devam et} other {# ile devam et}}")
    assert not cmd._ok(english, "{total, plural, one {Devam et} other {# ile devam et}}")


def test_import_refuses_blank_and_broken_rows_but_takes_the_rest(locale, tmp_path, monkeypatch):
    path = _write(
        tmp_path,
        "pl",
        polib.POEntry(msgid="Hello %(name)s", msgstr="Czesc", flags=["fuzzy"]),
        polib.POEntry(msgid="Save", msgstr="Zapis", flags=["fuzzy"]),
        polib.POEntry(msgid="Done", msgstr="Gotowe", flags=["fuzzy"]),
        polib.POEntry(
            msgid="%(count)d item", msgid_plural="%(count)d items", msgstr_plural={0: "", 1: "", 2: ""}, flags=["fuzzy"]
        ),
    )
    rows = [
        {"key": "backend:Hello %(name)s", "translation": "Czesc"},
        {"key": "backend:Save", "translation": " "},
        {"key": "backend:Done", "translation": "Zrobione"},
        {"key": "backend:%(count)d item", "translation": PLURAL_ROW},
    ]
    monkeypatch.setattr("sys.stdin", io.StringIO("\n".join(json.dumps(r) for r in rows)))
    err = io.StringIO()
    with pytest.raises(CommandError, match="3 row"):
        call_command("translate", import_lang="pl", stderr=err)
    entries = _read(path)
    assert "fuzzy" in entries["Hello %(name)s"].flags and "fuzzy" in entries["Save"].flags
    assert entries["Save"].msgstr == "Zapis"
    assert "fuzzy" in entries["%(count)d item"].flags  # two forms of three: refused
    assert entries["Done"].msgstr == "Zrobione" and "fuzzy" not in entries["Done"].flags
    assert "'backend:Save'" in err.getvalue() and locale == [["pl"]]


@pytest.mark.skipif(shutil.which("msgmerge") is None, reason="gettext tools missing")
def test_a_msgmerge_guess_from_a_fuzzy_draft_is_drafted_not_kept(calls, locale, tmp_path, monkeypatch):
    """msgmerge writes no `#| msgid` when the entry it matches is itself a fuzzy draft; run with its
    stock options "See all courses" keeps the neighbour's text as if it were a finished draft."""
    path = _write(
        tmp_path,
        "tr",
        polib.POEntry(msgid="See all sessions", msgstr="Tüm oturumları gör", flags=["fuzzy"]),
        polib.POEntry(msgid="I also teach %(also)s.", msgstr="Ben de %(also)s öğretirim.", flags=["fuzzy"]),
    )
    pot = polib.POFile()
    pot.metadata = {"Content-Type": "text/plain; charset=UTF-8"}
    pot.append(polib.POEntry(msgid="See all courses", msgstr=""))
    pot.append(polib.POEntry(msgid="We also teach %(also)s.", msgstr=""))
    pot.save(str(tmp_path / "django.pot"))

    def merge(langs):  # what makemessages does for each language, with the options translate gives it
        args = [shutil.which("msgmerge"), *cmd._Makemessages.msgmerge_options, str(path), str(tmp_path / "django.pot")]
        subprocess.run(args, check=True)  # noqa: S603  # fixed arguments from this test

    monkeypatch.setattr(cmd, "_makemessages", merge)
    call_command("translate", po=True, to="tr", stderr=io.StringIO())
    entries = _read(path)
    assert entries["See all courses"].msgstr == "[x] See all courses"
    assert entries["We also teach %(also)s."].msgstr == "[x] We also teach %(also)s."
    assert all("fuzzy" in e.flags for e in entries.values())
