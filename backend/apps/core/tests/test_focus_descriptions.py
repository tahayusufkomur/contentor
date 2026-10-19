"""The descriptions job: once she confirms the outline's titles, each empty
lesson gets a short description, one module per model call. The model call is
patched; what is under test is what gets written (her text always wins), the
events, Stop, a redraft under it, and Try again."""

import json
from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import analysis, descriptions, flow, jobs, outline
from apps.core.sanitize import clean_rich_html
from apps.courses.models import Course, Lesson
from apps.tenant_config.models import CopilotRun
from apps.tenant_config.setup_flow import _Module

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="descriptions-owner@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def enqueue():
    with mock.patch.object(tasks.run_focus_job, "delay") as delay:
        yield delay


@pytest.fixture(autouse=True)
def ai_on():
    with (
        mock.patch("apps.core.focus.outline.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.outline.ai_compose.record_spend"),
    ):
        yield


@pytest.fixture(autouse=True)
def no_reading():
    with mock.patch("apps.core.focus.analysis.read", side_effect=core_ai.AiError("off")):
        yield


def _draft(modules=2, lessons=2):
    return outline.OutlineDraft(
        title="Desk yoga, gently",
        description="For office workers.",
        modules=[
            _Module(title=f"Module {m}", lessons=[f"Lesson {m}.{n}" for n in range(1, lessons + 1)])
            for m in range(1, modules + 1)
        ],
    )


def _write_outline(creation, draft=None):
    with mock.patch("apps.core.focus.outline.core_ai.structured", return_value=(draft or _draft(), Decimal("0"), "x")):
        jobs.execute(SCHEMA, creation.outline_run_id)
    creation.refresh_from_db()
    return creation


@pytest.fixture()
def at_review(owner):
    """The outline written, the titles not yet confirmed."""
    creation = flow.answer(flow.start(owner, "course", value="A course on desk yoga"), "level", rest=True)
    return _write_outline(creation)


@pytest.fixture()
def texts():
    """The model, patched: a description per lesson of the module asked about.
    ``texts.calls`` holds each call's user turn; ``texts.during`` runs inside a call."""

    def fake(**kwargs):
        turn = json.loads(kwargs["user"])
        fake.calls.append(turn)
        if fake.during:
            fake.during(len(fake.calls), turn)
        lessons = [descriptions.LessonText(id=x["id"], text=f"About {x['title']}.") for x in turn["lessons"]]
        return descriptions.ModuleTexts(lessons=lessons), Decimal("0"), "x"

    fake.calls, fake.during = [], None
    with mock.patch("apps.core.focus.descriptions.core_ai.structured", side_effect=fake) as model:
        model.calls = fake.calls
        model.set_during = lambda fn: setattr(fake, "during", fn)
        yield model


def _lessons(creation):
    return list(Lesson.objects.filter(module__course_id=creation.record_id).order_by("module__order", "order"))


def _confirm(creation):
    creation = flow.answer(creation, "outline_review", value="ok")
    return creation, creation.runs["descriptions"]


def test_looks_good_starts_the_descriptions_and_says_so(owner, at_review):
    creation = flow.answer(at_review, "outline_review", value="ok")
    assert "descriptions" in creation.runs
    creation.chat.refresh_from_db()
    assert creation.chat.entries[-1]["text"].startswith("Writing a short description")
    assert flow.state(creation)["descriptions"] == {"status": "building", "run": creation.runs["descriptions"]}


def test_nothing_runs_before_she_confirms(owner, at_review):
    assert flow.state(at_review)["descriptions"] is None


def test_her_follow_up_answers_reach_the_descriptions(owner, at_review, texts):
    asked = [{"question": "Where do your students practise?", "answer": "Office", "slot": "outline"}]
    at_review.brief = {**at_review.brief, "followups": asked}
    at_review.save()
    creation, run_id = _confirm(at_review)
    jobs.execute(SCHEMA, run_id)
    assert texts.calls[0]["followups"] == asked


def test_each_lesson_gets_its_description_marked_as_drafted(owner, at_review, texts):
    creation, run_id = _confirm(at_review)
    jobs.execute(SCHEMA, run_id)
    lessons = _lessons(creation)
    assert len(lessons) == 4
    for lesson in lessons:
        assert lesson.content_html == lesson.drafted_html == f"<p>About {lesson.title}.</p>"
        assert lesson.empty()
    assert len(texts.calls) == 2  # one call per module
    assert [x["title"] for x in texts.calls[0]["lessons"]] == ["Lesson 1.1", "Lesson 1.2"]
    assert texts.calls[0]["course"] == "Desk yoga, gently"
    assert texts.calls[0]["topic"] == "A course on desk yoga"
    assert Course.objects.get(pk=creation.record_id).not_ready()  # untouched AI text is not hers
    run = CopilotRun.objects.get(pk=run_id)
    assert run.status == "done"
    assert run.result["text"] == "Wrote 4 lesson descriptions."
    types = list(run.events.values_list("type", flat=True))
    assert types == ["step", "field", "field", "field", "field", "step", "done"]
    first = run.events.filter(type="field").first().data
    assert first == {
        "record": f"lesson:{lessons[0].id}",
        "name": "content_html",
        "value": "About Lesson 1.1.",
    }
    assert run.events.filter(type="step").first().data["total"] == 4
    assert flow.state(creation)["descriptions"]["status"] == "ready"


def test_a_description_is_exactly_what_a_later_clean_leaves(owner, at_review, texts):
    """The lesson serializer re-cleans content_html on a save; the text must
    survive that unchanged or an untouched description would count as hers."""
    tricky = 'It\'s "quoted" & <b>bold</b> 5 < 6'
    html = clean_rich_html(f"<p>{descriptions.escape(tricky)}</p>")
    assert clean_rich_html(html) == html


def test_a_description_she_typed_meanwhile_is_never_overwritten(owner, at_review, texts):
    creation, run_id = _confirm(at_review)
    lesson = _lessons(creation)[0]
    lesson.content_html = "<p>Mine.</p>"
    lesson.save()
    jobs.execute(SCHEMA, run_id)
    lesson.refresh_from_db()
    assert lesson.content_html == "<p>Mine.</p>"
    assert lesson.drafted_html == ""
    run = CopilotRun.objects.get(pk=run_id)
    assert not run.events.filter(type="field", data__record=f"lesson:{lesson.id}").exists()
    assert run.result["text"] == "Wrote 3 lesson descriptions."
    assert [x["title"] for x in texts.calls[0]["lessons"]] == ["Lesson 1.2"]  # hers is not even asked about


def test_text_she_types_while_the_model_writes_is_kept(owner, at_review, texts):
    creation, run_id = _confirm(at_review)
    lesson = _lessons(creation)[1]

    def type_meanwhile(call, _turn):
        if call == 1:
            Lesson.objects.filter(pk=lesson.pk).update(content_html="<p>Typed just now.</p>")

    texts.set_during(type_meanwhile)
    jobs.execute(SCHEMA, run_id)
    lesson.refresh_from_db()
    assert lesson.content_html == "<p>Typed just now.</p>"
    assert not CopilotRun.objects.get(pk=run_id).events.filter(data__record=f"lesson:{lesson.id}").exists()


def test_stop_keeps_what_was_written(owner, at_review, texts):
    creation, run_id = _confirm(at_review)
    texts.set_during(lambda call, _turn: runs.stop(run_id) if call == 2 else None)
    jobs.execute(SCHEMA, run_id)
    first, second = _lessons(creation)[:2], _lessons(creation)[2:]
    assert all(lesson.content_html for lesson in first)
    assert all(lesson.content_html == "" for lesson in second)
    assert CopilotRun.objects.get(pk=run_id).status == "stopped"


def test_lessons_deleted_meanwhile_are_skipped(owner, at_review, texts):
    creation, run_id = _confirm(at_review)
    gone = _lessons(creation)[0]

    def delete_meanwhile(call, _turn):
        if call == 1:
            Lesson.objects.filter(pk=gone.pk).delete()

    texts.set_during(delete_meanwhile)
    jobs.execute(SCHEMA, run_id)
    run = CopilotRun.objects.get(pk=run_id)
    assert run.status == "done"
    assert run.result["text"] == "Wrote 3 lesson descriptions."
    assert not run.events.filter(data__record=f"lesson:{gone.id}").exists()


def test_a_redraft_stops_the_descriptions_and_rewrites_the_new_lessons(owner, at_review, texts):
    creation, old_run = _confirm(at_review)
    found = analysis.Analysis(outline_change="make it one module")
    creation.pending = {"field": "outline_review", "text": found.outline_change}
    flow.apply(creation, found)
    creation.save()
    assert CopilotRun.objects.get(pk=old_run).status == "stopped"
    jobs.execute(SCHEMA, old_run)  # a stopped run is never claimed
    assert not Lesson.objects.filter(module__course_id=creation.record_id).exclude(content_html="").exists()

    creation = _write_outline(creation, _draft(modules=1, lessons=3))
    new_run = creation.runs["descriptions"]
    assert new_run != old_run
    jobs.execute(SCHEMA, new_run)
    lessons = _lessons(creation)
    assert [lesson.title for lesson in lessons] == ["Lesson 1.1", "Lesson 1.2", "Lesson 1.3"]
    assert all(lesson.content_html == f"<p>About {lesson.title}.</p>" for lesson in lessons)


def test_a_redraft_before_she_confirmed_starts_no_descriptions(owner, at_review):
    found = analysis.Analysis(outline_change="make it one module")
    at_review.pending = {"field": "outline_review", "text": found.outline_change}
    flow.apply(at_review, found)
    at_review.save()
    creation = _write_outline(at_review, _draft(modules=1))
    assert "descriptions" not in (creation.runs or {})


def test_a_failed_run_offers_try_again(owner, at_review, texts):
    creation, run_id = _confirm(at_review)
    texts.side_effect = core_ai.AiError("down")
    jobs.execute(SCHEMA, run_id)
    state = flow.state(creation)
    assert state["descriptions"] == {"status": "failed", "run": run_id}
    texts.side_effect = None
    again = flow.retry_descriptions(creation)
    assert again.runs["descriptions"] != run_id
    assert flow.state(again)["descriptions"]["status"] == "building"
    flow.retry_descriptions(again)  # a double tap while it builds
    assert flow.state(again)["descriptions"]["run"] == again.runs["descriptions"]
    assert CopilotRun.objects.filter(request__job="descriptions").count() == 2


def test_try_again_waits_for_her_confirmation(owner, at_review):
    flow.retry_descriptions(at_review)
    assert "descriptions" not in (at_review.runs or {})


def test_without_a_model_the_run_fails(owner, at_review):
    creation, run_id = _confirm(at_review)
    with mock.patch("apps.core.focus.outline.ai_compose.compose_available", return_value=False):
        jobs.execute(SCHEMA, run_id)
    assert flow.state(creation)["descriptions"]["status"] == "failed"


def test_confirming_while_the_outline_still_writes_waits_for_it(owner):
    creation = flow.answer(flow.start(owner, "course", value="A course on desk yoga"), "level", rest=True)
    creation = flow.answer(creation, "outline_review", value="ok")
    assert "descriptions" not in (creation.runs or {})  # no lessons yet: the outline job starts them
    creation = _write_outline(creation)
    assert "descriptions" in creation.runs
