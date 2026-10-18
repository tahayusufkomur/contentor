"""The outline job: one model call writes the course's title, description,
modules and lessons in one step, then its run emits the reveal the course
page replays. The model call is patched; what is under test is what gets
written (her own edits win), the events and their order, and the fallback."""

import json
from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import flow, outline
from apps.core.focus.recipes import SIZES
from apps.courses.models import Course, Lesson, Module
from apps.tenant_config.models import CopilotRun
from apps.tenant_config.setup_flow import _Module

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="outline-owner@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def enqueue():
    with mock.patch.object(tasks.run_focus_outline, "delay") as delay:
        yield delay


@pytest.fixture(autouse=True)
def ai_on():
    with (
        mock.patch("apps.core.focus.outline.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.outline.ai_compose.record_spend"),
    ):
        yield


def _draft(modules=2, lessons=2):
    return outline.OutlineDraft(
        title="Desk yoga, gently",
        description="For office workers who sit all day. You will loosen up in ten minutes.",
        modules=[
            _Module(title=f"Module {m}", lessons=[f"Lesson {m}.{n}" for n in range(1, lessons + 1)])
            for m in range(1, modules + 1)
        ],
    )


def _model(**kwargs):
    if "side_effect" not in kwargs:
        kwargs["return_value"] = (kwargs.pop("draft", None) or _draft(), Decimal("0"), "x")
    return mock.patch("apps.core.focus.outline.core_ai.structured", **kwargs)


def _building(owner):
    """A creation whose outline run is queued (Just draft it after the topic)."""
    return flow.answer(flow.start(owner, "course", text="A course on desk yoga"), "level", rest=True)


def _types(run_id):
    return list(CopilotRun.objects.get(pk=run_id).events.values_list("type", flat=True))


def _course(creation):
    return Course.objects.get(pk=creation.record_id)


def test_start_queues_one_content_run_on_commit(owner, enqueue):
    creation = _building(owner)
    run = creation.outline_run
    assert run.specialist == "content"
    assert run.status == "queued"
    assert run.request == {"focus": creation.id, "job": "outline", "instruction": ""}
    enqueue.assert_called_once_with(SCHEMA, run.id)


def test_execute_writes_the_course_then_emits_title_description_and_rows_in_order(owner):
    creation = _building(owner)
    with _model():
        outline.execute(SCHEMA, creation.outline_run_id)
    assert _types(creation.outline_run_id) == ["step", "field", "field", "row", "row", "step", "done"]
    course = _course(creation)
    assert course.title == "Desk yoga, gently"
    assert Module.objects.filter(course=course).count() == 2
    assert Lesson.objects.filter(module__course=course).count() == 4
    run = CopilotRun.objects.get(pk=creation.outline_run_id)
    assert run.status == "done"
    events = list(run.events.values_list("data", flat=True))
    assert events[1] == {"record": f"course:{course.id}", "name": "title", "value": "Desk yoga, gently"}
    assert events[3] == {
        "record": f"course:{course.id}",
        "kind": "module",
        "value": {"title": "Module 1", "lessons": ["Lesson 1.1", "Lesson 1.2"]},
    }
    assert events[0]["specialist"] == "content"
    assert run.result["text"] == "Your outline is ready: 2 modules, 4 lessons."


def test_her_title_and_her_modules_win(owner):
    creation = _building(owner)
    course = _course(creation)
    course.title = "My own title"
    course.save()
    Module.objects.create(course=course, title="Mine", order=1)
    with _model():
        outline.execute(SCHEMA, creation.outline_run_id)
    course.refresh_from_db()
    assert course.title == "My own title"
    assert list(course.modules.values_list("title", flat=True)) == ["Mine"]
    run = CopilotRun.objects.get(pk=creation.outline_run_id)
    fields = [e.data["name"] for e in run.events.filter(type="field")]
    assert fields == ["description"]
    assert not run.events.filter(type="row").exists()


def test_a_model_failure_falls_back_to_an_honest_outline(owner):
    creation = _building(owner)
    with _model(side_effect=core_ai.AiError("down")):
        outline.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    assert course.modules.count() == SIZES["short"][0]
    assert course.title == "Desk yoga"  # the working title stays
    assert CopilotRun.objects.get(pk=creation.outline_run_id).status == "done"


def test_the_fallback_respects_the_size_she_picked():
    draft = outline.fallback({"size": "full"}, "Breathing")
    assert len(draft.modules) == SIZES["full"][0]
    assert all(len(m.lessons) == SIZES["full"][1] for m in draft.modules)
    assert draft.title == "Breathing"
    assert draft.description == ""


def test_a_redraft_replaces_only_the_previous_outline(owner):
    creation = _building(owner)
    with _model():
        outline.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    Module.objects.create(course=course, title="Mine", order=9)
    run = outline.start(creation, instruction="fewer lessons")
    with _model(draft=_draft(modules=1, lessons=1)) as model:
        outline.execute(SCHEMA, run.id)
    assert "fewer lessons" in model.call_args.kwargs["user"]
    assert "Module 2" in model.call_args.kwargs["user"]  # the outline she is changing
    titles = sorted(course.modules.values_list("title", flat=True))
    assert titles == ["Mine", "Module 1"]
    assert CopilotRun.objects.get(pk=run.id).status == "done"


def test_a_run_stopped_during_the_model_call_writes_nothing(owner):
    creation = _building(owner)

    def stop_then_draft(**_kwargs):
        runs.stop(creation.outline_run_id)
        return _draft(), Decimal("0"), "x"

    with _model(side_effect=stop_then_draft):
        outline.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    assert course.modules.count() == 0
    assert course.title == "Desk yoga"
    assert CopilotRun.objects.get(pk=creation.outline_run_id).status == "stopped"


def test_claim_takes_a_queued_run_once(owner):
    run_id = _building(owner).outline_run_id
    assert runs.claim(run_id) is True
    assert runs.claim(run_id) is False
    assert CopilotRun.objects.get(pk=run_id).status == "working"


def test_finish_never_revives_a_stopped_run(owner):
    run_id = _building(owner).outline_run_id
    runs.stop(run_id)
    runs.finish(run_id, True, {"text": "late"})
    assert CopilotRun.objects.get(pk=run_id).status == "stopped"
    assert "done" not in _types(run_id)


def test_run_focus_outline_goes_to_the_agents_queue():
    assert tasks.run_focus_outline.queue == "agents"


def test_the_prompt_knows_her_site_and_her_other_courses(owner):
    """A delegated topic must fit her site even when /setup left no niche."""
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="x")
    config.brand_name = "Yoga Studio"
    config.save()
    Course.objects.create(title="Morning flow", instructor=owner)
    creation = flow.answer(flow.start(owner, "course", delegate=True), "level", rest=True)
    with _model() as model:
        outline.execute(SCHEMA, creation.outline_run_id)
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["topic"] == "delegate"
    assert turn["brand"] == "Yoga Studio"
    assert turn["her_courses"] == ["Morning flow"]


def test_the_outline_gives_the_course_its_cover_once_written(owner):
    creation = _building(owner)
    with _model(), mock.patch("apps.core.copilot.content._give_cover") as cover:
        outline.execute(SCHEMA, creation.outline_run_id)
    cover.assert_called_once()
    assert cover.call_args.args[0].title == "Desk yoga, gently"


def test_a_redraft_after_its_run_is_gone_never_doubles_the_modules(owner):
    """What an outline wrote is kept on the creation, not only on its run
    (runs are pruned after two weeks, and a Stop can beat the run's finish)."""
    creation = _building(owner)
    with _model():
        outline.execute(SCHEMA, creation.outline_run_id)
    CopilotRun.objects.filter(pk=creation.outline_run_id).delete()
    creation.refresh_from_db()
    assert flow.outline_status(creation) == "ready"
    run = outline.start(creation, instruction="fewer modules")
    with _model(draft=_draft(modules=1, lessons=1)):
        outline.execute(SCHEMA, run.id)
    assert _course(creation).modules.count() == 1


def test_a_redraft_keeps_a_module_she_filled_in(owner):
    creation = _building(owner)
    with _model():
        outline.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    lesson = Lesson.objects.get(module__course=course, title="Lesson 1.1")
    lesson.content_html = "<p>My own words</p>"
    lesson.save()
    creation.refresh_from_db()
    run = outline.start(creation, instruction="fewer modules")
    with _model(draft=_draft(modules=1, lessons=1)) as model:
        outline.execute(SCHEMA, run.id)
    modules = json.loads(model.call_args.kwargs["user"])["current_outline"]["modules"]
    assert [m.get("kept", False) for m in modules] == [True, False]
    assert Lesson.objects.filter(pk=lesson.pk).exists()
    assert course.modules.count() == 2  # hers, and the new outline's one
