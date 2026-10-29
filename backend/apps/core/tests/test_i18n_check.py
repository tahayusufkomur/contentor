import polib

from apps.core.management.commands.i18n_check import (
    ai_calls_without_language,
    count_literals,
    coverage,
    locale_lists,
    ratchet,
    ratchet_counts,
    slugify_imports,
    updated,
)

CODES = ("en", "tr", "de", "pl")


def test_counts_user_facing_strings():
    source = """
from django.utils.translation import gettext as _
from rest_framework.exceptions import ValidationError, PermissionDenied

def view(request):
    ok = Response({"detail": _("Fine")})                       # gettext: not counted
    a = Response({"detail": "Not allowed here"})                # 1
    b = Response({"error": "NOT_ALLOWED"})                      # code: not counted
    c = Response({"error": "not_found"})                        # identifier: not counted
    d = Response({"detail": "https://example.com/x"})           # URL: not counted
    e = Email(subject="Welcome aboard", body="Hello there")     # 2
    f = {"title": "Intro", "slug": "intro-course"}              # 1
    raise ValidationError("Too short")                          # 1
    raise PermissionDenied(detail="Nope, sorry")                # 1
    raise ValidationError(_("Too long"))                        # gettext: not counted
    raise ValidationError({"email": "Taken already"})           # 1
    return Response({"detail": "Saved" if x else "Failed"})     # 2
"""
    assert count_literals(source) == 9


def test_ai_call_labels_are_not_counted():
    assert count_literals('call(label="contentor:x.y")') == 0
    assert count_literals('call(label="Save")') == 1


def test_ratchet_counts_skip_tests_migrations_commands_and_admin(tmp_path):
    text = 'x = {"detail": "Some text"}\n'
    for rel in (
        "apps/a/views.py",
        "apps/a/tests/test_views.py",
        "apps/a/migrations/0001_initial.py",
        "apps/a/management/commands/run.py",
        "apps/a/admin.py",
        "apps/core/platform/views.py",
        "apps/demo_seed/data.py",
    ):
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    assert ratchet_counts(tmp_path) == {"apps/a/views.py": 1}


def test_ratchet_and_update_only_go_down():
    assert ratchet({"a": 2, "b": 1}, {"a": 1, "b": 1, "c": 3}) == (
        ["a: 2 hard-coded text(s), baseline 1"],
        ["c: 0, baseline 3"],
    )
    assert updated({"a": 5, "b": 1}, {"a": 2, "b": 3, "c": 1}) == {"a": 2, "b": 1}
    assert updated({"b": 1, "a": 5}, None) == {"a": 5, "b": 1}


def _project(tmp_path, source, entries):
    (tmp_path / "apps/x").mkdir(parents=True)
    (tmp_path / "apps/x/views.py").write_text(source)
    (tmp_path / "config").mkdir()
    po = polib.POFile()
    for entry in entries:
        po.append(entry)
    path = tmp_path / "locale/tr/LC_MESSAGES/django.po"
    path.parent.mkdir(parents=True)
    po.save(str(path))
    return tmp_path, tmp_path / "locale"


def test_coverage_passes_with_a_full_po(tmp_path):
    base, locale = _project(
        tmp_path,
        "from django.utils.translation import gettext as _, pgettext\n"
        'a = _("Hello %(name)s")\nb = pgettext("menu", "Open")\n',
        [
            polib.POEntry(msgid="Hello %(name)s", msgstr="Merhaba %(name)s", flags=["fuzzy"]),
            polib.POEntry(msgctxt="menu", msgid="Open", msgstr="Ac"),
        ],
    )
    assert coverage(base, locale, ["tr"]) == []


def test_coverage_flags_fstrings_and_variables(tmp_path):
    base, locale = _project(tmp_path, 'a = _(f"x {y}")\nb = _(name)\n', [])
    problems = coverage(base, locale, ["tr"])
    assert any("views.py:1" in p and "f-string" in p for p in problems)
    assert any("views.py:2" in p and "not a literal" in p for p in problems)


def test_coverage_flags_a_missing_or_empty_entry_and_a_missing_file(tmp_path):
    base, locale = _project(
        tmp_path,
        'a = _("One")\nb = _("Two")\n',
        [polib.POEntry(msgid="Two", msgstr="")],
    )
    problems = coverage(base, locale, ["tr", "de"])
    assert any("tr:" in p and "'One'" in p and "not in django.po" in p for p in problems)
    assert any("tr:" in p and "'Two'" in p and "empty" in p for p in problems)
    assert any("de" in p and "file missing" in p for p in problems)


def test_coverage_flags_a_placeholder_mismatch(tmp_path):
    base, locale = _project(
        tmp_path,
        'a = _("Hello %(name)s")\nb = ngettext("%(count)d course", "%(count)d courses", n)\n',
        [
            polib.POEntry(msgid="Hello %(name)s", msgstr="Merhaba %(isim)s"),
            polib.POEntry(
                msgid="%(count)d course",
                msgid_plural="%(count)d courses",
                msgstr_plural={0: "%(n)d kurs", 1: "%(n)d kurs"},
            ),
        ],
    )
    problems = coverage(base, locale, ["tr"])
    assert any("'Hello" in p and "placeholders" in p for p in problems)
    assert any("'%(count)d course'" in p and "placeholders" in p for p in problems)


def test_locale_lists():
    assert locale_lists('X = ("en", "tr")\n', "apps/a.py", CODES)
    assert not locale_lists('X = ("en", "xx")\n', "apps/a.py", CODES)
    assert not locale_lists('X = ["en", "tr"]  # not-site-locales\n', "apps/a.py", CODES)
    assert not locale_lists('X = [\n    "en",\n    "tr",  # not-site-locales\n]\n', "apps/a.py", CODES)


def test_slugify_comes_from_apps_core_slugs():
    assert slugify_imports("from django.utils.text import slugify\n", "apps/a.py")
    assert slugify_imports("from django.utils.text import capfirst, slugify as s\n", "apps/a.py")
    assert slugify_imports("from django.utils import text\nx = text.slugify('a')\n", "apps/a.py")
    assert not slugify_imports("from django.utils.text import capfirst\n", "apps/a.py")
    assert not slugify_imports("from apps.core.slugs import slugify\n", "apps/a.py")


def test_ai_calls_pass_a_language():
    assert ai_calls_without_language("core_ai.structured(system=s, user=u)\n", "apps/a.py")
    assert ai_calls_without_language("ai.stream_text(system=s)\n", "apps/a.py")
    assert ai_calls_without_language("structured_messages(system=s)\n", "apps/a.py")
    assert not ai_calls_without_language("core_ai.structured(system=s, language=None)\n", "apps/a.py")
    assert not ai_calls_without_language("core_ai.agentc_look(language=Mixed(a, b))\n", "apps/a.py")
    assert not ai_calls_without_language("run_chat(system=s)\n", "apps/a.py")
