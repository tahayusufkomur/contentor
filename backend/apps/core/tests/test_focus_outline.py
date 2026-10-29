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
from apps.core.focus import analysis, flow, jobs, outline
from apps.core.focus.kinds.course import SIZES, CourseFound
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
def no_followups():
    """The model is on here: no follow-up before the outline (test_focus_followup.py)."""
    with mock.patch("apps.core.focus.flow.followup_allowed", return_value=False):
        yield


@pytest.fixture(autouse=True)
def no_reading():
    """The outline reads a typed first answer itself when the analysis never ran
    (tests that tap their topic would otherwise reach the model)."""
    with mock.patch("apps.core.focus.analysis.read", side_effect=core_ai.AiError("off")):
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
    """A creation whose outline run is queued (Just draft it after the topic,
    tapped: a typed topic would wait on the analysis, tested in test_focus_flow)."""
    return flow.answer(flow.start(owner, "course", value="A course on desk yoga"), "level", rest=True)


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
        jobs.execute(SCHEMA, creation.outline_run_id)
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
        jobs.execute(SCHEMA, creation.outline_run_id)
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
        jobs.execute(SCHEMA, creation.outline_run_id)
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
        jobs.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    Module.objects.create(course=course, title="Mine", order=9)
    run = outline.start(creation, instruction="fewer lessons")
    with _model(draft=_draft(modules=1, lessons=1)) as model:
        jobs.execute(SCHEMA, run.id)
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
        jobs.execute(SCHEMA, creation.outline_run_id)
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


def test_run_focus_job_goes_to_the_agents_queue():
    assert tasks.run_focus_job.queue == "agents"


def test_the_prompt_knows_her_site_and_her_other_courses(owner):
    """A delegated topic must fit her site even when /setup left no niche."""
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="x")
    config.brand_name = "Yoga Studio"
    config.save()
    Course.objects.create(title="Morning flow", instructor=owner)
    creation = flow.answer(flow.start(owner, "course", delegate=True), "level", rest=True)
    with _model() as model:
        jobs.execute(SCHEMA, creation.outline_run_id)
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["topic"] == "delegate"
    assert turn["brand"] == "Yoga Studio"
    assert turn["her_courses"] == ["Morning flow"]


def test_the_outline_gives_no_cover_any_more(owner):
    creation = _building(owner)
    with _model(), mock.patch("apps.core.copilot.content._give_cover") as cover:
        jobs.execute(SCHEMA, creation.outline_run_id)
    cover.assert_not_called()
    assert Course.objects.get(pk=creation.record_id).thumbnail_id is None


def test_a_redraft_after_its_run_is_gone_never_doubles_the_modules(owner):
    """What an outline wrote is kept on the creation, not only on its run
    (runs are pruned after two weeks, and a Stop can beat the run's finish)."""
    creation = _building(owner)
    with _model():
        jobs.execute(SCHEMA, creation.outline_run_id)
    CopilotRun.objects.filter(pk=creation.outline_run_id).delete()
    creation.refresh_from_db()
    assert flow.outline_status(creation) == "ready"
    run = outline.start(creation, instruction="fewer modules")
    with _model(draft=_draft(modules=1, lessons=1)):
        jobs.execute(SCHEMA, run.id)
    assert _course(creation).modules.count() == 1


def test_a_redraft_keeps_a_module_she_filled_in(owner):
    creation = _building(owner)
    with _model():
        jobs.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    lesson = Lesson.objects.get(module__course=course, title="Lesson 1.1")
    lesson.content_html = "<p>My own words</p>"
    lesson.save()
    creation.refresh_from_db()
    run = outline.start(creation, instruction="fewer modules")
    with _model(draft=_draft(modules=1, lessons=1)) as model:
        jobs.execute(SCHEMA, run.id)
    modules = json.loads(model.call_args.kwargs["user"])["current_outline"]["modules"]
    assert [m.get("kept", False) for m in modules] == [True, False]
    assert Lesson.objects.filter(pk=lesson.pk).exists()
    assert course.modules.count() == 2  # hers, and the new outline's one


def test_a_module_whose_only_text_is_drafted_is_not_kept(owner):
    creation = _building(owner)
    with _model():
        jobs.execute(SCHEMA, creation.outline_run_id)
    course = _course(creation)
    lesson = Lesson.objects.get(module__course=course, title="Lesson 1.1")
    lesson.content_html = lesson.drafted_html = "<p>What this covers.</p>"
    lesson.save()
    creation.refresh_from_db()
    run = outline.start(creation, instruction="fewer modules")
    with _model(draft=_draft(modules=1, lessons=1)):
        jobs.execute(SCHEMA, run.id)
    assert not Lesson.objects.filter(pk=lesson.pk).exists()
    assert course.modules.count() == 1


def test_conform_keeps_her_counts():
    out = outline.conform(_draft(modules=6, lessons=5), {"modules": 4, "lessons": 3}, first=True)
    assert len(out.modules) == 4 and all(len(m.lessons) == 3 for m in out.modules)


def test_conform_pads_honestly_when_the_model_wrote_too_few():
    out = outline.conform(_draft(modules=2, lessons=2), {"modules": 3, "lessons": 3}, first=True)
    assert out.modules[2].title == "Module 3" and out.modules[0].lessons[2] == "Lesson 3"
    assert [len(m.lessons) for m in out.modules] == [3, 3, 3]


def test_conform_uses_her_titles_word_for_word_in_her_order():
    brief = {"named": [{"title": "Wake up your neck", "lessons": ["Chin tucks"]}, {"title": "", "lessons": []}]}
    out = outline.conform(_draft(), brief, first=True)
    assert out.modules[0].title == "Wake up your neck" and out.modules[0].lessons == ["Chin tucks", "Lesson 1.2"]
    assert out.modules[1].title == "Module 2"  # an untitled one keeps the model's


def test_her_titles_are_only_for_the_first_draft():
    brief = {"named": [{"title": "Wake up your neck", "lessons": []}]}
    assert outline.conform(_draft(), brief, first=False).modules[0].title == "Module 1"


def test_named_modules_beyond_what_the_model_wrote_are_added():
    brief = {"named": [{"title": f"Mine {n}", "lessons": []} for n in (1, 2, 3)]}
    out = outline.conform(_draft(modules=2), brief, first=True)
    assert [m.title for m in out.modules] == ["Mine 1", "Mine 2", "Mine 3"]
    assert len(out.modules[2].lessons) == 2


def test_a_total_alone_is_kept_exactly():
    out = outline.conform(_draft(modules=3, lessons=4), {"total": 10}, first=True)
    assert sum(len(m.lessons) for m in out.modules) == 10
    assert len(out.modules) == 3 and all(m.lessons for m in out.modules)


def test_a_total_pads_from_the_last_module():
    out = outline.conform(_draft(modules=2, lessons=2), {"total": 7}, first=True)
    assert [len(m.lessons) for m in out.modules] == [2, 5]
    assert out.modules[1].lessons[-1] == "Lesson 5"


def test_a_total_beyond_the_modules_room_adds_modules_never_over_twelve_lessons():
    out = outline.conform(_draft(modules=2, lessons=2), {"total": 30}, first=True)
    assert sum(len(m.lessons) for m in out.modules) == 30
    assert max(len(m.lessons) for m in out.modules) <= outline.MAX_LESSONS


def test_a_total_smaller_than_the_modules_drops_the_last_ones():
    out = outline.conform(_draft(modules=4, lessons=3), {"total": 2}, first=True)
    assert [len(m.lessons) for m in out.modules] == [1, 1]


def test_a_total_with_her_module_count_keeps_both():
    out = outline.conform(_draft(modules=2, lessons=2), {"modules": 4, "total": 10}, first=True)
    assert len(out.modules) == 4 and sum(len(m.lessons) for m in out.modules) == 10


@pytest.mark.parametrize(
    ("brief", "sizes"),
    [
        ({"total": 21}, [7, 7, 7]),  # whole weeks
        ({"total": 28}, [7, 7, 7, 7]),
        ({"total": 30}, [6] * 5),
        ({"total": 10}, [5, 5]),
        ({"total": 5}, [5]),
        ({"total": 100}, [9] * 4 + [8] * 8),  # never over twelve modules
        ({"total": 144}, [12] * 12),
        ({"total": 21, "modules": 4}, [6, 5, 5, 5]),  # her modules, shared evenly
        ({"modules": 8}, []),
        ({"total": 12, "lessons": 3}, []),
    ],
)
def test_a_total_is_planned_in_whole_weeks_or_evenly_over_her_modules(brief, sizes):
    assert outline.plan(brief) == sizes


def test_the_plan_leaves_out_the_modules_a_redraft_keeps():
    assert outline.plan({"total": 21, "modules": 4}, kept=1) == [7, 7, 7]
    assert outline.plan({"total": 21, "modules": 1}, kept=1) == []


def test_the_model_is_told_the_plan_and_the_outline_is_exactly_her_total(owner):
    run_id, creation = _typed(owner, {"analysed": True, "total": 21})
    with _model(draft=_draft(modules=4, lessons=3)) as model:  # the model ignores the plan
        jobs.execute(SCHEMA, run_id)
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["exact"]["total"] == 21 and turn["exact"]["lessons_per_module"] == [7, 7, 7]
    assert Lesson.objects.filter(module__course=_course(creation)).count() == 21


def test_a_total_above_twelve_by_twelve_is_held_there_and_says_so(owner):
    brief = analysis.brief_from(CourseFound(total=365), {})
    assert brief["total"] == 144 and brief["capped"] is True
    run_id, creation = _typed(owner, brief)
    with _model(draft=_draft(modules=12, lessons=12)):
        jobs.execute(SCHEMA, run_id)
    assert Lesson.objects.filter(module__course=_course(creation)).count() == 144
    assert CopilotRun.objects.get(pk=run_id).result["text"].endswith(str(outline.CAPPED) % {"max": outline.MAX_MODULES})


def test_the_fallback_shapes_a_total_by_the_plan():
    draft = outline.fallback({"size": "21 lessons"}, "Yoga", {"total": 21})
    assert [len(m.lessons) for m in draft.modules] == [7, 7, 7]


def test_a_redraft_counts_the_modules_she_keeps():
    out = outline.conform(_draft(modules=5), {"modules": 5}, first=False, kept=1)
    assert len(out.modules) == 4
    assert len(outline.conform(_draft(modules=5), {"modules": 1}, first=False, kept=3).modules) == 0


def test_without_counts_the_model_is_only_clamped():
    out = outline.conform(_draft(modules=15, lessons=15), {}, first=True)
    assert len(out.modules) == outline.MAX_MODULES == 12
    assert all(len(m.lessons) == outline.MAX_LESSONS == 12 for m in out.modules)


def test_the_fallback_honours_her_counts_and_titles():
    brief = {"modules": 8, "lessons": 2, "named": [{"title": "Wake up your neck", "lessons": ["Chin tucks"]}]}
    draft = outline.fallback({"size": "4 modules"}, "Breathing", brief)
    assert [m.title for m in draft.modules][:2] == ["Wake up your neck", "Building the basics"]
    assert draft.modules[6].title == "Module 7"
    assert len(draft.modules) == 8 and draft.modules[0].lessons == ["Chin tucks", "Lesson 2"]
    assert draft.modules[1].lessons == ["Lesson 1", "Lesson 2"]


def _typed(owner, brief=None):
    """A creation with a typed topic whose analysis never ran (the analysis failed)."""
    creation = flow.start(owner, "course", value="A course on desk yoga", text="A course on desk yoga")
    creation.brief = brief or {}
    creation.answers = {**creation.answers, "topic": "A course on desk yoga. 2 modules", "level": "x", "size": "x"}
    creation.pending = {}
    creation.save()
    return outline.start(creation).id, creation


def test_the_outline_reads_her_first_answer_itself_when_the_analysis_failed(owner):
    run_id, creation = _typed(owner)
    found = CourseFound(modules=2, lessons=3, notes="Ten minute lessons")
    with (
        mock.patch("apps.core.focus.analysis.read", return_value=found) as read,
        _model(draft=_draft(modules=5, lessons=5)) as model,
    ):
        jobs.execute(SCHEMA, run_id)
    assert read.call_args.args[1] == "A course on desk yoga. 2 modules"
    assert read.call_args.kwargs["outline_exists"] is False
    assert _course(creation).modules.count() == 2
    assert Lesson.objects.filter(module__course=_course(creation)).count() == 6
    creation.refresh_from_db()
    assert creation.brief["analysed"] is True and creation.brief["modules"] == 2
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["exact"] == {"modules": 2, "lessons": 3, "total": None, "named": []}
    assert turn["notes"] == "Ten minute lessons"


def test_an_analysed_brief_is_not_read_again(owner):
    run_id, _creation = _typed(owner, {"analysed": True, "modules": 1})
    with mock.patch("apps.core.focus.analysis.read") as read, _model():
        jobs.execute(SCHEMA, run_id)
    read.assert_not_called()


def test_a_delegated_topic_is_not_read(owner):
    creation = flow.answer(flow.start(owner, "course", delegate=True), "level", rest=True)
    with mock.patch("apps.core.focus.analysis.read") as read, _model():
        jobs.execute(SCHEMA, creation.outline_run_id)
    read.assert_not_called()


def test_a_failed_reading_goes_on_without_it(owner):
    run_id, creation = _typed(owner)
    with mock.patch("apps.core.focus.analysis.read", side_effect=core_ai.AiError("down")), _model():
        jobs.execute(SCHEMA, run_id)
    assert CopilotRun.objects.get(pk=run_id).status == "done"
    assert _course(creation).modules.count() == 2
    creation.refresh_from_db()
    assert not creation.brief.get("analysed")


def test_a_redraft_never_reads_the_topic_again(owner):
    run_id, creation = _typed(owner, {"modules": 2})
    with _model():
        jobs.execute(SCHEMA, run_id)
    run = outline.start(creation, instruction="shorter")
    with mock.patch("apps.core.focus.analysis.read") as read, _model(draft=_draft(modules=1)):
        jobs.execute(SCHEMA, run.id)
    read.assert_not_called()


def test_a_capped_brief_says_so_in_the_finish_text(owner):
    run_id, _creation = _typed(owner, {"analysed": True, "modules": 12, "capped": True})
    with _model(draft=_draft(modules=12, lessons=1)):
        jobs.execute(SCHEMA, run_id)
    text = CopilotRun.objects.get(pk=run_id).result["text"]
    assert text.endswith(" I drafted the first 12 modules; add the rest on the page.")
    assert "12 modules" in text


def test_a_preset_size_still_trims_the_model(owner):
    creation = flow.start(owner, "course", value="A course on desk yoga")
    creation = flow.answer(flow.answer(creation, "level", value="beginners"), "size", value="quick")
    with _model(draft=_draft(modules=5)):
        jobs.execute(SCHEMA, creation.outline_run_id)
    assert _course(creation).modules.count() == SIZES["quick"][0]


def _redrafted(owner, found, model_draft):
    """A 4x3 outline written from her first answer's counts, then her change
    (analysed as ``found``) at the review, written by the real outline job."""
    creation = _building(owner)
    creation.brief = {"modules": 4, "lessons": 3, "analysed": True}
    creation.save()
    with _model(draft=_draft(modules=4, lessons=3)):
        jobs.execute(SCHEMA, creation.outline_run_id)
    creation.refresh_from_db()
    creation.pending = {"field": "outline_review", "text": found.change}
    flow.apply(creation, found)
    creation.save()
    with _model(draft=model_draft):
        jobs.execute(SCHEMA, creation.outline_run_id)
    creation.refresh_from_db()
    return creation


def test_a_redraft_without_a_count_is_not_cut_back_to_the_first_answers_counts(owner):
    found = CourseFound(change="add a module on stretching")
    creation = _redrafted(owner, found, _draft(modules=5, lessons=3))
    assert _course(creation).modules.count() == 5


def test_removing_a_module_pads_nothing_back(owner):
    found = CourseFound(change="remove module 3")
    creation = _redrafted(owner, found, _draft(modules=3, lessons=3))
    assert list(_course(creation).modules.values_list("title", flat=True)) == ["Module 1", "Module 2", "Module 3"]
    assert "capped" not in creation.brief


def test_a_redraft_that_names_new_counts_still_gets_them_exactly(owner):
    found = CourseFound(change="make it 6 modules", modules=6)
    creation = _redrafted(owner, found, _draft(modules=4, lessons=3))
    assert _course(creation).modules.count() == 6


def test_a_redraft_does_not_re_emit_unchanged_title_or_description(owner):
    creation = _building(owner)
    with _model():
        jobs.execute(SCHEMA, creation.outline_run_id)
    creation.refresh_from_db()
    run = outline.start(creation, instruction="add a third lesson to module 2")
    with _model(draft=_draft(modules=2, lessons=3)):
        jobs.execute(SCHEMA, run.id)
    assert _types(run.id) == ["step", "row", "row", "step", "done"]
