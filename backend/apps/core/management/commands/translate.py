"""Draft translations with the model and the glossary (dev tool; polib is a dev dependency).

    translate --draft <lang>        stdin {"items": [{"key", "en", "where"}]} -> stdout {"<key>": "<translation>"}
    translate --po [--to <lang>] [--redraft]
                                    refresh backend/locale/*/django.po and draft what is missing
    translate --export <lang>       one JSON line per fuzzy (unreviewed) .po entry
    translate --import <lang>       the same lines back, with the reviewed translation

`scripts/translate.py` (make translate) drives the JSON message files through --draft.
Pipes carry ASCII-only JSON, so the container's locale cannot garble them.
"""

import gettext
import json
import os
import re
import sys
from pathlib import Path

import polib
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.core.management.commands import makemessages
from pydantic import BaseModel

from apps.core import ai, languages

BATCH = 40
PLURAL_SEP = " ||| "  # joins the forms of a plural entry in an export row


class _Item(BaseModel):
    key: str
    en: str
    text: str


class _Drafts(BaseModel):
    items: list[_Item]


_SYSTEM = (
    "You translate the interface text of Contentor, a platform where creators build and sell online courses, "
    "memberships and downloads, from English into {name}. The user message is a JSON list of items, each with a "
    "key, the English text (en) and where it appears (where; context only). Reply with one item per key: the same "
    "key, the same en copied exactly as given, and text, the translation of that en. "
    "Keep placeholders exactly as written: {{name}}, {{count}}, %(name)s. "
    "In ICU messages keep the argument names and the words plural, select, one, other and the # sign, translate "
    "only the text inside the branches, and write every plural category {name} needs (Polish needs one, few, many "
    "and other). Keep HTML-like tags such as <b>...</b> in place and translate the words between them. Keep the "
    "punctuation, capital-letter style, emoji and trailing colon or full stop of the English. A label stays a "
    "short label. Add no notes.\n\n"
)


def _tokens(text: str):
    """What a translation must keep: argument names, tags and printf placeholders."""
    text = re.sub(
        r"(?:\b(?:zero|one|two|few|many|other)|=\d+)\s*\{", "[", text
    )  # a plural branch is text, not an argument
    return (
        set(re.findall(r"\{\s*(\w+)\s*[,}]", text)),
        sorted(re.findall(r"</?\w+\s*/?>", text)),
        sorted(re.findall(r"%\(\w+\)[sd]|%[sd]", text)),
    )


def _ok(item: dict, text) -> bool:
    return bool(text and text.strip()) and _tokens(item["en"]) == _tokens(text)


def _same(a: str, b: str) -> bool:
    return " ".join(a.split()) == " ".join(b.split())


def _draft_batch(lang: str, batch: list[dict]) -> dict:
    system = _SYSTEM.format(name=languages.info(lang)["name"]).rstrip()
    user = json.dumps({"items": batch}, ensure_ascii=False)
    try:
        out, _cost, _model = ai.structured(
            system=system,
            user=user,
            output_model=_Drafts,
            model=settings.TRANSLATE_MODEL,
            max_tokens=8000,
            label=f"translate-{lang}",
            language=lang,
        )
    except ai.AiError as exc:
        sys.stderr.write(f"translate: a batch of {len(batch)} failed: {exc}\n")
        return {}
    english = {item["key"]: item["en"] for item in batch}
    # a reply that slid onto the next key echoes another item's English: refuse it
    return {item.key: item.text for item in out.items if _same(item.en, english.get(item.key, ""))}


def draft(lang: str, items: list[dict]):
    """-> ({key: translation}, [keys that could not be drafted]). A batch the model got wrong
    (call failed, key missing, placeholder lost) gets one more try."""
    done, failed = {}, []
    for start in range(0, len(items), BATCH):
        batch = items[start : start + BATCH]
        got = _draft_batch(lang, batch)
        bad = [item for item in batch if not _ok(item, got.get(item["key"]))]
        if bad:
            got.update(_draft_batch(lang, bad))
        for item in batch:
            if _ok(item, got.get(item["key"])):
                done[item["key"]] = got[item["key"]]
            else:
                failed.append(item["key"])
    return done, failed


# --- .po files ---


def _po_path(lang: str) -> Path:
    return Path(settings.LOCALE_PATHS[0]) / lang / "LC_MESSAGES" / "django.po"


def _in_backend_dir(name: str, **options):
    previous = os.getcwd()
    os.chdir(settings.BASE_DIR)
    try:
        call_command(name, verbosity=0, **options)
    finally:
        os.chdir(previous)


class _Makemessages(makemessages.Command):
    # msgmerge pre-fills a new msgid from a similar old one and flags it fuzzy, but when the old one is itself
    # a fuzzy draft it writes no `#| msgid` line, so the guess looks like a finished draft. A changed or new
    # English text arrives empty instead, and gets drafted.
    msgmerge_options = [*makemessages.Command.msgmerge_options, "--no-fuzzy-matching"]


def _makemessages(langs):
    _in_backend_dir(_Makemessages(), locale=langs, add_location="file", no_obsolete=True)


def _compile(langs):
    _in_backend_dir("compilemessages", locale=langs, use_fuzzy=True)


def _entry_key(entry) -> str:
    return "backend:" + (f"{entry.msgctxt}\x04" if entry.msgctxt else "") + entry.msgid


def _where(entry) -> str:
    parts = [" ".join(sorted({path for path, _line in entry.occurrences}))]
    if entry.msgctxt:
        parts.append(f"context: {entry.msgctxt}")
    if entry.comment:
        parts.append(entry.comment.replace("\n", " "))
    return "; ".join(part for part in parts if part)


def _plural_forms(po):
    """-> (nplurals, function n -> form index) from the file's Plural-Forms header."""
    header = po.metadata.get("Plural-Forms", "nplurals=2; plural=(n != 1);")
    nplurals = int(re.search(r"nplurals=(\d+)", header).group(1))
    return nplurals, gettext.c2py(re.search(r"plural=(.*?);?\s*$", header).group(1).rstrip(";"))


def _needs_draft(entry, redraft: bool) -> bool:
    if entry.obsolete:
        return False
    if entry.previous_msgid or entry.previous_msgid_plural:
        return True  # English changed since the draft
    filled = all(entry.msgstr_plural.values()) if entry.msgid_plural else bool(entry.msgstr)
    return not filled or (redraft and "fuzzy" in entry.flags)


def _items_for(index: int, entry, nplurals: int, form_of) -> list[dict]:
    where = _where(entry)
    if not entry.msgid_plural:
        return [{"key": str(index), "en": entry.msgid, "where": where}]
    items = []
    for form in range(nplurals):
        counts = [n for n in range(0, 200) if form_of(n) == form][:3]
        english = entry.msgid if counts[:1] == [1] else entry.msgid_plural
        items.append(
            {
                "key": f"{index}:{form}",
                "en": english,
                "where": "; ".join(
                    filter(None, [where, f"this form is used for counts like {', '.join(map(str, counts))}"])
                ),
            }
        )
    return items


def _draft_po(lang: str, redraft: bool, stderr) -> None:
    po = polib.pofile(str(_po_path(lang)))
    nplurals, form_of = _plural_forms(po)
    items, entries = [], {}
    for index, entry in enumerate(po):
        if _needs_draft(entry, redraft):
            entries[index] = entry
            items += _items_for(index, entry, nplurals, form_of)
    done, failed = draft(lang, items)
    for index, entry in entries.items():
        if entry.msgid_plural:
            forms = {form: done.get(f"{index}:{form}") for form in range(nplurals)}
            if not all(forms.values()):
                continue
            entry.msgstr_plural = forms
        elif str(index) in done:
            entry.msgstr = done[str(index)]
        else:
            continue
        if "fuzzy" not in entry.flags:
            entry.flags.append("fuzzy")
        entry.previous_msgctxt = entry.previous_msgid = entry.previous_msgid_plural = None
    po.metadata.pop("POT-Creation-Date", None)  # changes on every makemessages run: pure diff noise
    po.save()
    stderr.write(f"translate: {lang}.po drafted {len(items) - len(failed)} of {len(items)} text(s)")
    if failed:
        stderr.write(f"translate: {lang}.po not drafted (run again): {', '.join(failed)}")


def _export(lang: str, stdout) -> None:
    for entry in polib.pofile(str(_po_path(lang))):
        if entry.obsolete or "fuzzy" not in entry.flags:
            continue
        if entry.msgid_plural:
            english = entry.msgid + PLURAL_SEP + entry.msgid_plural
            translation = PLURAL_SEP.join(entry.msgstr_plural[i] for i in sorted(entry.msgstr_plural))
        else:
            english, translation = entry.msgid, entry.msgstr
        row = {"key": _entry_key(entry), "english": english, "translation": translation, "where": _where(entry)}
        stdout.write(json.dumps(row, ensure_ascii=False))


def _plural_problem(entry, forms: list[str], nplurals: int):
    if len(forms) != nplurals:
        return f"needs {nplurals} forms joined by {PLURAL_SEP.strip()!r}, got {len(forms)}"
    if not all(form.strip() for form in forms):
        return "a form is empty"
    allowed = _tokens(entry.msgid_plural)
    for form in forms:
        args, tags, printf = _tokens(form)
        if not (args <= allowed[0] and set(tags) <= set(allowed[1]) and set(printf) <= set(allowed[2])):
            return "a form has placeholders or tags the English does not"
    return None


def _import(lang: str, lines, stderr) -> int:
    """Take reviewed rows into the .po -> the number of rows refused (blank, or placeholders lost)."""
    path = _po_path(lang)
    po = polib.pofile(str(path))
    nplurals, _form_of = _plural_forms(po)
    by_key = {_entry_key(entry): entry for entry in po}
    count = refused = 0
    for line in lines:
        if not line.strip():
            continue
        row = json.loads(line)
        entry = by_key.get(row["key"])
        if entry is None:
            stderr.write(f"translate: skipped {row['key']!r}: no such entry")
            refused += 1
            continue
        if entry.msgid_plural:
            forms = row["translation"].split(PLURAL_SEP)
            reason = _plural_problem(entry, forms, nplurals)
        else:
            reason = None if _ok({"en": entry.msgid}, row["translation"]) else "empty, or placeholders/tags differ"
        if reason:
            stderr.write(f"translate: skipped {row['key']!r}: {reason}")
            refused += 1
            continue
        if entry.msgid_plural:
            entry.msgstr_plural = dict(enumerate(forms))
        else:
            entry.msgstr = row["translation"]
        if "fuzzy" in entry.flags:
            entry.flags.remove("fuzzy")
        count += 1
    po.save()
    stderr.write(f"translate: {lang}.po took {count} reviewed text(s)")
    return refused


class Command(BaseCommand):
    help = "Draft translations with the model and the glossary (see the module docstring)."
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument("--draft", metavar="LANG")
        parser.add_argument("--po", action="store_true")
        parser.add_argument("--to", metavar="LANG")
        parser.add_argument("--redraft", action="store_true")
        parser.add_argument("--export", metavar="LANG")
        parser.add_argument("--import", dest="import_lang", metavar="LANG")

    def handle(self, *args, **options):
        for name in ("draft", "to", "export", "import_lang"):
            if options[name] and options[name] not in languages.CODES:
                raise CommandError(f"unknown language {options[name]!r}")
        if options["draft"]:
            items = json.loads(sys.stdin.read())["items"]
            done, failed = draft(options["draft"], items)
            self.stdout.write(json.dumps(done))  # ASCII only: safe through any pipe
            self.stderr.write(f"translate: {len(done)} drafted, {len(failed)} failed")
        elif options["po"]:
            langs = [options["to"]] if options["to"] else [c for c in languages.CODES if c != languages.DEFAULT]
            _makemessages(langs)
            for lang in langs:
                _draft_po(lang, options["redraft"], self.stderr)
            _compile(langs)
        elif options["export"]:
            _export(options["export"], self.stdout)
        elif options["import_lang"]:
            refused = _import(options["import_lang"], sys.stdin.read().splitlines(), self.stderr)
            _compile([options["import_lang"]])
            if refused:
                raise CommandError(f"{refused} row(s) skipped")
        else:
            raise CommandError("give one of --draft, --po, --export, --import")
