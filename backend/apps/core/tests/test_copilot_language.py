"""Copilot, focus and reels speak to the creator in the creator's language (Task 4.3d)."""

import sys
import types
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import translation
from django.utils.translation import ngettext

from apps.accounts.models import User
from apps.billing import ways
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import jobs
from apps.core.tests.i18n_utils import creator_client, translated
from apps.tenant_config.models import CopilotRun

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SCHEMA = "shared_test"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@errorlang-d.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
        preferred_locale="tr",
    )


def test_errors_follow_the_creator_language(tenant_ctx, owner):
    client = creator_client(tenant_ctx, owner)
    res = client.get("/api/v1/reels/?video=abc", HTTP_HOST=HOST)
    assert res.status_code == 400
    assert res.json()["detail"] == translated("video is a video's id.")


def test_a_copilot_run_is_carried_out_in_the_creator_language(owner):
    seen = {}

    def run_turn(*args, **kwargs):
        seen["language"] = translation.get_language()
        return {"kind": "answer", "text": "ok", "specialist": "finance"}, Decimal("0")

    run = CopilotRun.objects.create(actor=owner, specialist="finance", request={"message": "hi"})
    with mock.patch("apps.core.copilot.runs.engine.run_turn", side_effect=run_turn):
        runs.execute(SCHEMA, run.id)
    assert seen["language"] == "tr"
    assert translation.get_language() != "tr"  # and only for the run


def test_a_focus_job_is_carried_out_in_the_creator_language(owner, monkeypatch):
    seen = {}
    stub = types.SimpleNamespace(carry_out=lambda tenant, run_id: seen.update(language=translation.get_language()))
    monkeypatch.setitem(sys.modules, "lang_handler", stub)
    monkeypatch.setitem(jobs.HANDLERS, "lang", "lang_handler")
    run = CopilotRun.objects.create(actor=owner, specialist="content", request={"job": "lang"})
    with mock.patch.object(tasks.run_focus_job, "delay"):
        jobs.execute(SCHEMA, run.id)
    assert seen["language"] == "tr"


def test_the_ways_in_are_one_translated_sentence(owner):
    with translation.override("tr"):
        text = ways.describe({"free": {"window": None}, "buy": None, "plans": []})
    assert text == translated("Free for everyone") + "."


# ── fix round 1 ─────────────────────────────────────────────────────────────


def _site(locale):
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale=locale)


def test_a_fallback_outline_is_written_in_the_site_language_not_the_creators(tenant_ctx):
    """The titles land in the course students read: a tr site with a de creator gets Turkish, all of it."""
    from apps.core.focus import outline
    from apps.core.tests.i18n_utils import gettext_in

    _site("tr")
    brief = {"modules": 8, "lessons": 3, "total": 0}
    with translation.override("de"):
        draft = outline.fallback({"size": "4 modules"}, "Breathing", brief)
        padded = outline.conform(outline.OutlineDraft(title="T", description="", modules=[]), brief, first=True)
    names = [gettext_in(n, "tr") for n in ("Getting started", "Building the basics", "Putting it into practice")]
    assert [m.title for m in draft.modules][:3] == names
    assert draft.modules[6].title == gettext_in("Module %(n)d", "tr") % {"n": 7}
    assert draft.modules[0].lessons[0] == gettext_in("Lesson %(n)d", "tr") % {"n": 1}
    assert padded.modules[0].title == gettext_in("Module %(n)d", "tr") % {"n": 1}
    assert padded.modules[0].lessons[0] == gettext_in("Lesson %(n)d", "tr") % {"n": 1}


def test_a_followup_step_is_worded_in_the_creator_language():
    from apps.core.focus import followup

    with translation.override("tr"):
        assert followup.label("course") == translated("Thinking about your course")


def test_a_failure_choosing_the_language_still_fails_the_job(owner, monkeypatch):
    run = CopilotRun.objects.create(actor=owner, specialist="content", request={"job": "lang"})
    with mock.patch("apps.core.focus.jobs.languages.creator_language", side_effect=RuntimeError("boom")):
        jobs.execute(SCHEMA, run.id)
    run.refresh_from_db()
    assert run.status == "failed"


def test_a_copilot_run_without_an_actor_uses_the_owners_language(owner):
    seen = {}

    def run_turn(*args, **kwargs):
        seen["language"] = translation.get_language()
        return {"kind": "answer", "text": "ok", "specialist": "finance"}, Decimal("0")

    run = CopilotRun.objects.create(actor=None, specialist="finance", request={"message": "hi"})
    with mock.patch("apps.core.copilot.runs.engine.run_turn", side_effect=run_turn):
        runs.execute(SCHEMA, run.id)
    assert seen["language"] == "tr"
    User.objects.filter(pk=owner.pk).delete()
    run = CopilotRun.objects.create(actor=None, specialist="finance", request={"message": "hi"})
    with mock.patch("apps.core.copilot.runs.engine.run_turn", side_effect=run_turn):
        runs.execute(SCHEMA, run.id)
    assert seen["language"] == "en"


def test_curriculum_refusals_and_card_rows_follow_the_creator_language(tenant_ctx, owner):
    from apps.core.copilot import content
    from apps.core.tests.i18n_utils import gettext_in
    from apps.courses.models import Course, Lesson, Module

    course = Course.objects.create(title="Yoga", instructor=owner)
    module = Module.objects.create(course=course, title="Basics", order=1)
    lesson = Lesson.objects.create(module=module, title="Breath", order=1)
    with translation.override("tr"):
        _course, steps = content.curriculum_steps(
            course.pk,
            [
                {"op": "add_module", "title": "Flow", "lessons": ["A"]},
                {"op": "rename_lesson", "lesson_id": lesson.pk, "title": "Air"},
            ],
        )
    with translation.override("tr"):
        add = ngettext("Add module '%(title)s' with %(n)d lesson", "Add module '%(title)s' with %(n)d lessons", 1)
    assert add != "Add module '%(title)s' with %(n)d lesson", "tr has no translation: run make translate"
    assert steps[0][1] == add % {"title": "Flow", "n": 1}
    assert steps[1][1] == gettext_in("Rename lesson '%(old)s' to '%(new)s'", "tr") % {"old": "Breath", "new": "Air"}
    with translation.override("tr"):
        message = str(content._GENERIC_INVALID_MESSAGE)
    assert message == translated("Some details were invalid — could you rephrase?")
