"""The backend half of the i18n guards in `make lint` (the frontends' is scripts/check-i18n.mjs).

    i18n_check [--update]

1. Ratchet: counts hard-coded user-facing strings per file under apps/ (`ast`) against
   apps/core/i18n/baseline.json. `--update` only lowers counts and removes files; with no baseline it writes all.
2. Coverage: every literal given to `_`, `gettext*`, `ngettext*`, `pgettext*` has a non-empty msgstr in each
   language's django.po, with the same placeholders. A non-literal argument or an f-string is an error.
3. Locale lists: no list or tuple holds two or more locale codes, except `languages.py`, migrations, tests and
   lines marked `# not-site-locales`.
4. Slugs: `django.utils.text.slugify` is imported only in `apps/core/slugs.py` (it drops ı, ł and ß); everyone else
   uses `apps.core.slugs.slugify`.
5. AI language: every call of the five `apps.core.ai` entry points passes `language=` (a code, `Mixed`, or None).

Spec: docs/superpowers/specs/2026-10-28-four-languages-design.md.
"""

import ast
import json
import re
from pathlib import Path

import polib
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core import languages

BASELINE = Path(__file__).resolve().parents[2] / "i18n" / "baseline.json"

GETTEXT = {
    "_": (0,),
    "gettext": (0,),
    "gettext_lazy": (0,),
    "gettext_noop": (0,),
    "ngettext": (0, 1),
    "ngettext_lazy": (0, 1),
    "pgettext": (0, 1),
    "pgettext_lazy": (0, 1),
    "npgettext": (0, 1, 2),
    "npgettext_lazy": (0, 1, 2),
}
CONTEXTUAL = {"pgettext", "pgettext_lazy", "npgettext", "npgettext_lazy"}  # their first argument is the context
EXCEPTIONS = {"ValidationError", "PermissionDenied", "NotFound", "ParseError", "AuthenticationFailed"}
DICT_KEYS = {"detail", "error"}
COPY_KEYS = {
    "subject", "title", "heading", "subheading", "body", "text", "label", "button", "cta", "ctaText",
    "buttonText", "submitLabel", "successMessage", "intro", "question", "hint", "placeholder", "description",
    "message", "note", "summary",
}  # fmt: skip
RATCHET_SKIP = ("management/commands/", "demo_seed/", "apps/core/platform/")
RATCHET_SKIP_NAMES = {"admin.py", "admin_panels.py"}
MARKER = "# not-site-locales"


def _rel(path: Path, base: Path) -> str:
    return path.relative_to(base).as_posix()


def _is_test_or_migration(rel: str) -> bool:
    parts = rel.split("/")
    name = parts[-1]
    return (
        "tests" in parts[:-1]
        or "migrations" in parts[:-1]
        or name.startswith("test_")
        or name in {"tests.py", "conftest.py"}
    )


def source_files(base: Path, folders=("apps",)):
    """-> [(path, rel)] of the .py files under `folders`, tests and migrations left out."""
    out = []
    for folder in folders:
        for path in sorted((base / folder).rglob("*.py")):
            rel = _rel(path, base)
            if not _is_test_or_migration(rel):
                out.append((path, rel))
    return out


def _callee(call: ast.Call):
    """The gettext name a call goes by (`_`, `gettext`, `translation.gettext`), else its plain name."""
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _gettext_name(call: ast.Call):
    func = call.func
    if isinstance(func, ast.Name) and func.id in GETTEXT:
        return func.id
    if (
        isinstance(func, ast.Attribute)
        and func.attr in GETTEXT
        and isinstance(func.value, ast.Name)
        and func.value.id == "translation"
    ):
        return func.attr
    return None


# --- 1. ratchet ---


def _texts(node) -> list[str]:
    """The literal text an expression gives directly: itself, an f-string's fixed parts, a conditional's branches,
    `"x" % y`, `"x".format(...)`. A call (a gettext call too) gives nothing."""
    if isinstance(node, ast.Constant):
        return [node.value] if isinstance(node.value, str) else []
    if isinstance(node, ast.JoinedStr):
        return [" ".join(part.value for part in node.values if isinstance(part, ast.Constant))]
    if isinstance(node, ast.IfExp):
        return _texts(node.body) + _texts(node.orelse)
    if isinstance(node, ast.BoolOp):
        return [text for value in node.values for text in _texts(value)]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mod):
        return _texts(node.left)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "format":
        return _texts(node.func.value)
    return []


def _argument_texts(node) -> list[str]:
    """An exception's argument: its text, or the texts inside a dict or list of messages."""
    if isinstance(node, ast.Dict):
        return [text for value in node.values for text in _argument_texts(value)]
    if isinstance(node, ast.List | ast.Tuple):
        return [text for item in node.elts for text in _argument_texts(item)]
    return _texts(node)


def _counts(text: str) -> bool:
    if sum(c.isalpha() for c in text) < 2 or text.startswith("contentor:"):  # `contentor:` = a Hub AI-call label
        return False
    # not text: UPPER_SNAKE codes, URLs, and lowercase identifiers (`not_found`, `post.not_ready`)
    return not re.fullmatch(r"[A-Z][A-Z0-9_]*|[a-z][a-z0-9_.-]*", text) and not re.match(r"https?://|/", text)


def count_literals(source: str) -> int:
    """Hard-coded user-facing strings in one module's source (see the module docstring)."""
    n = 0
    for node in ast.walk(ast.parse(source)):
        texts: list[str] = []
        if isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values, strict=True):
                if isinstance(key, ast.Constant) and key.value in DICT_KEYS | COPY_KEYS:
                    texts += _texts(value)
        elif isinstance(node, ast.Call):
            for keyword in node.keywords:
                if keyword.arg in COPY_KEYS:
                    texts += _texts(keyword.value)
            if _callee(node) in EXCEPTIONS:
                if node.args:
                    texts += _argument_texts(node.args[0])
                texts += [t for kw in node.keywords if kw.arg == "detail" for t in _argument_texts(kw.value)]
        n += sum(_counts(text) for text in texts)
    return n


def ratchet_counts(base: Path) -> dict[str, int]:
    counts = {}
    for path, rel in source_files(base):
        if rel.split("/")[-1] in RATCHET_SKIP_NAMES or any(part in rel for part in RATCHET_SKIP):
            continue
        n = count_literals(path.read_text(encoding="utf-8"))
        if n:
            counts[rel] = n
    return counts


def ratchet(counts: dict, baseline: dict):
    """-> (files that got more, files that got fewer)."""
    higher, lower = [], []
    for rel in sorted(set(counts) | set(baseline)):
        now, was = counts.get(rel, 0), baseline.get(rel, 0)
        if now > was:
            higher.append(f"{rel}: {now} hard-coded text(s), baseline {was}")
        elif now < was:
            lower.append(f"{rel}: {now}, baseline {was}")
    return higher, lower


def updated(counts: dict, baseline: dict | None) -> dict:
    """The baseline after --update: only lower counts and removed files; the full counts when there is none."""
    if baseline is None:
        return dict(sorted(counts.items()))
    return {rel: min(counts[rel], was) for rel, was in sorted(baseline.items()) if counts.get(rel, 0) > 0}


# --- 2. coverage ---


def _names(text: str) -> set[str]:
    return set(re.findall(r"%\(\w+\)[sd]|%[sd]|\{\w+\}", text))


def gettext_literals(source: str, rel: str):
    """-> (set of (context, msgid, plural) literals, [problems]) for one module."""
    found, problems = set(), []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call) or (name := _gettext_name(node)) is None:
            continue
        positions = GETTEXT[name]
        if len(node.args) < len(positions):
            problems.append(f"{rel}:{node.lineno}: {name}() needs {len(positions)} argument(s)")
            continue
        args = [node.args[i] for i in positions]
        bad = next((a for a in args if not (isinstance(a, ast.Constant) and isinstance(a.value, str))), None)
        if bad is not None:
            what = "an f-string" if isinstance(bad, ast.JoinedStr) else "not a literal"
            problems.append(f"{rel}:{node.lineno}: {name}() argument is {what}")
            continue
        values = [a.value for a in args]
        context = values.pop(0) if name in CONTEXTUAL else None
        found.add((context, values[0], values[1] if len(values) > 1 else None))
    return found, problems


def _entry_problem(entry, plural: str | None):
    if plural is not None or entry.msgid_plural:
        forms = list(entry.msgstr_plural.values())
        if not forms or not all(form.strip() for form in forms):
            return "has an empty translation"
        allowed = _names(entry.msgid_plural or plural)
        if any(not _names(form) <= allowed for form in forms):
            return "has placeholders the English does not"
        return None
    if not entry.msgstr.strip():
        return "has an empty translation"
    if _names(entry.msgstr) != _names(entry.msgid):
        return "has different placeholders from the English"
    return None


def coverage(base: Path, locale_dir: Path, langs) -> list[str]:
    literals, problems = {}, []
    for path, rel in source_files(base, ("apps", "config")):
        found, bad = gettext_literals(path.read_text(encoding="utf-8"), rel)
        problems += bad
        for key in found:
            literals.setdefault(key, rel)
    for lang in langs:
        po_path = locale_dir / lang / "LC_MESSAGES" / "django.po"
        if not po_path.exists():
            problems.append(f"{_rel(po_path, base) if po_path.is_relative_to(base) else po_path}: file missing")
            continue
        entries = {(e.msgctxt, e.msgid): e for e in polib.pofile(str(po_path)) if not e.obsolete}
        for (context, msgid, plural), rel in sorted(literals.items(), key=lambda item: item[1]):
            entry = entries.get((context, msgid))
            label = f"{lang}: {rel}: {msgid[:60]!r}"
            if entry is None:
                problems.append(f"{label}: not in django.po")
            elif reason := _entry_problem(entry, plural):
                problems.append(f"{label}: {reason}")
    return problems


# --- 3. locale lists ---


def locale_lists(source: str, rel: str, codes) -> list[str]:
    lines = source.splitlines()
    problems = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.List | ast.Tuple):
            continue
        found = {e.value for e in node.elts if isinstance(e, ast.Constant) and e.value in codes}
        if len(found) >= 2 and not any(MARKER in line for line in lines[node.lineno - 1 : node.end_lineno]):
            problems.append(
                f"{rel}:{node.lineno}: a list of locale codes (use apps.core.languages; or mark it {MARKER})"
            )
    return problems


def locale_list_problems(base: Path, codes) -> list[str]:
    problems = []
    for path, rel in source_files(base, ("apps", "config")):
        if rel != "apps/core/languages.py":
            problems += locale_lists(path.read_text(encoding="utf-8"), rel, codes)
    return problems


# --- 4. slugify ---

SLUGS_MODULE = "apps/core/slugs.py"


def slugify_imports(source: str, rel: str) -> list[str]:
    problems = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ImportFrom) and node.module == "django.utils.text":
            bad = any(alias.name == "slugify" for alias in node.names)
        elif isinstance(node, ast.Attribute) and node.attr == "slugify":
            bad = ast.unparse(node.value) in ("text", "django.utils.text")
        else:
            continue
        if bad:
            problems.append(f"{rel}:{node.lineno}: import slugify from apps.core.slugs, not django.utils.text")
    return problems


def slugify_problems(base: Path) -> list[str]:
    return [
        problem
        for path, rel in source_files(base, ("apps", "config"))
        if rel != SLUGS_MODULE
        for problem in slugify_imports(path.read_text(encoding="utf-8"), rel)
    ]


# --- 5. AI language ---

AI_ENTRY_POINTS = {"structured", "structured_stream", "structured_messages", "stream_text", "agentc_look"}


def ai_calls_without_language(source: str, rel: str) -> list[str]:
    return [
        f"{rel}:{node.lineno}: {_callee(node)}() needs language= (a code, languages.Mixed, or None)"
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.Call)
        and _callee(node) in AI_ENTRY_POINTS
        and not any(keyword.arg == "language" for keyword in node.keywords)
    ]


def ai_language_problems(base: Path) -> list[str]:
    return [
        problem
        for path, rel in source_files(base)
        for problem in ai_calls_without_language(path.read_text(encoding="utf-8"), rel)
    ]


class Command(BaseCommand):
    help = "The i18n guards of make lint: hard-coded strings, .po coverage and locale lists (see the module docstring)."
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument(
            "--update", action="store_true", help="lower the baseline (writes it all when there is none)"
        )

    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        counts = ratchet_counts(base)
        baseline = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else None
        if options["update"]:
            BASELINE.write_text(json.dumps(updated(counts, baseline), indent=2) + "\n", encoding="utf-8")
            self.stdout.write(f"{BASELINE.name} {'lowered' if baseline is not None else 'written'}")
            return
        higher, lower = ratchet(counts, baseline or {})
        failures = []
        if higher:
            failures.append(
                "i18n: hard-coded text added:\n  "
                + "\n  ".join(higher)
                + "\nwrap it in gettext: see CLAUDE.md 'Text and languages'"
            )
        if lower:
            failures.append(
                "i18n: hard-coded text removed (good):\n  "
                + "\n  ".join(lower)
                + "\nrun `python manage.py i18n_check --update`"
            )
        missing = coverage(base, Path(settings.LOCALE_PATHS[0]), [c for c in languages.CODES if c != languages.DEFAULT])
        if missing:
            failures.append("i18n: the .po files are incomplete:\n  " + "\n  ".join(missing) + "\nrun `make translate`")
        lists = locale_list_problems(base, languages.CODES)
        if lists:
            failures.append("i18n: locale lists:\n  " + "\n  ".join(lists))
        slugs = slugify_problems(base)
        if slugs:
            failures.append("i18n: slugify:\n  " + "\n  ".join(slugs))
        ai_calls = ai_language_problems(base)
        if ai_calls:
            failures.append("i18n: AI calls:\n  " + "\n  ".join(ai_calls))
        if failures:
            raise CommandError("\n\n".join(failures))
        self.stdout.write(f"i18n_check OK ({sum(counts.values())} hard-coded texts left in {len(counts)} files)")
