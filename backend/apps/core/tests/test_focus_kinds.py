"""Focus mode's kind adapters (apps.core.focus.kinds): what the flow asks
each kind's module for, and the switch (FOCUS_KINDS) that turns a kind on."""

import dataclasses
import importlib
import json
import sys
import types
from decimal import Decimal
from unittest import mock

import pytest
from django.db import transaction
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.focus import analysis, announce, copywriter, covers, flow, followup, jobs, kinds, outline
from apps.courses.models import Course, Lesson, Module
from apps.media.models import Design
from apps.tenant_config.models import CopilotRun
from apps.tenant_config.setup_flow import _Module

pytestmark = pytest.mark.django_db(transaction=True)

ADAPTER = (
    "RECIPE",
    "NOUN",
    "NEW_TITLE",
    "create_draft",
    "record",
    "payload",
    "retitle",
    "set_price",
    "put_in_plan",
    "not_ready",
    "cannot_sell",
    "go_live",
    "CLOSING",
    "NOT_READY_LINE",
    "skips",
    "FOUND",
    "RULES",
    "apply_found",
    "UNCLEAR_FIELDS",
    "apply_change",
    "apply_clarified",
    "COVER",
    "cover_target",
    "cover_facts",
    "suggest_price",
    "price_tiles",
    "FINISH",
    "ANNOUNCER",
    "announce_facts",
    "DRAFT_SLOT",
    "DRAFT_WHAT",
    "REVIEWED_LINE",
    "SETUP_TOPIC",
    "start_draft",
)
# A kind the copy job drafts (its ``start_draft`` is copywriter.start) has all of these; the course none.
COPY = ("COPY_RULES", "COPY_FIELDS", "copy_facts", "write_copy")
STUB = "apps.core.tests.focus_stub_kind"
SCHEMA = "shared_test"
# Each builds its kind's prompt once (``system_for``): a stub's must never outlive its test.
PROMPTED = (analysis, covers, followup, announce, copywriter)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="focus-kinds@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def no_celery():
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


def _stub(monkeypatch, skips=frozenset(), *, without=(), **names):
    """A kind with no record before a later answer (G10): the course's
    adapter, with a recipe of its own (the course's questions but
    ``without``), ``create_draft`` making nothing yet, no cover, no
    announcement and no suggested price. ``names`` override any of it."""
    for module in PROMPTED:
        module.system_for.cache_clear()
    course = kinds.get("course")
    stub = types.ModuleType(STUB)
    stub.__dict__.update({name: getattr(course, name) for name in ADAPTER})
    questions = tuple(q for q in course.RECIPE.questions if q.id not in without)
    stub.RECIPE = dataclasses.replace(course.RECIPE, kind="stub", questions=questions)
    stub.create_draft = lambda actor, title, answers: None
    stub.record = lambda record_id: None
    stub.skips = lambda creation: set(skips)
    stub.FOUND, stub.RULES, stub.UNCLEAR_FIELDS = analysis.Found, "", ("price",)
    stub.apply_found = lambda creation, found: None
    stub.apply_change = lambda creation, found, **step: None
    stub.apply_clarified = lambda creation, field, value: False
    stub.COVER, stub.ANNOUNCER, stub.SETUP_TOPIC = None, None, None
    stub.suggest_price = lambda record: None
    stub.price_tiles = lambda creation, record: None
    stub.__dict__.update(names)
    monkeypatch.setitem(sys.modules, STUB, stub)
    monkeypatch.setitem(kinds.KINDS, "stub", STUB)
    return stub


def test_every_kind_module_has_the_whole_adapter():
    for kind, path in kinds.KINDS.items():
        module = importlib.import_module(path)
        assert kinds.get(kind) is module
        missing = [name for name in ADAPTER if not hasattr(module, name)]
        assert not missing, f"{kind}: {missing}"
        assert module.RECIPE.kind == kind
        assert set(module.CLOSING) == {value for value, _label in module.FINISH}
        assert module.COVER in ("styles", "photo", None)
        # None only for a kind without that step: no cover, no announcement, no price.
        has_step = {
            "cover_target": module.COVER,
            "cover_facts": module.COVER,
            "announce_facts": module.ANNOUNCER,
            "set_price": any(q.id == "access" for q in module.RECIPE.questions),
        }
        for name in ("cover_target", "cover_facts", "suggest_price", "price_tiles", "announce_facts"):
            assert callable(getattr(module, name)) or not has_step.get(name, True), f"{kind}.{name}"
        for name in ("create_draft", "record", "payload", "retitle", "set_price", "not_ready", "cannot_sell"):
            assert callable(getattr(module, name)) or not has_step.get(name, True), f"{kind}.{name}"
        assert callable(module.go_live) and callable(module.skips) and callable(module.apply_found)
        assert callable(module.apply_change) and callable(module.apply_clarified)
        assert issubclass(module.FOUND, analysis.Found) and module.UNCLEAR_FIELDS
        assert module.put_in_plan is None or callable(module.put_in_plan)
        copy = [name for name in COPY if hasattr(module, name)]
        assert copy in ([], list(COPY)), f"{kind}: {copy}"
        assert copywriter.drafts(kind) is bool(copy)
    assert copywriter.drafts("event") and copywriter.drafts("message") and not copywriter.drafts("course")
    # A membership (R1): the copy job writes its plan's name, and it has no cover nor a plan to be put in.
    assert copywriter.drafts("membership") and kinds.get("membership").COPY_FIELDS[0] == "name"
    assert kinds.get("membership").COVER is None and kinds.get("membership").put_in_plan is None


def test_a_kind_reads_only_its_own_fields(monkeypatch):
    stub = _stub(monkeypatch)
    assert stub.FOUND is analysis.Found
    assert "modules" not in stub.FOUND.model_json_schema()["properties"]
    course = kinds.get("course").FOUND.model_json_schema()
    assert "modules" in course["properties"]
    # The model may only be unclear about the course's own fields: the schema says so, not just the prompt.
    assert course["$defs"]["CourseUnclear"]["properties"]["field"]["enum"] == list(kinds.get("course").UNCLEAR_FIELDS)


def test_an_unclear_field_outside_the_kind_is_dropped(tenant_ctx, monkeypatch):
    _stub(monkeypatch)  # asks about "price" only
    found = analysis.Found(
        unclear=[analysis.Unclear(field=field, question="?", options=[]) for field in ("modules", "price")]
    )
    with (
        mock.patch("apps.core.focus.analysis.core_ai.structured", return_value=(found, Decimal("0"), "x")) as model,
        mock.patch("apps.core.focus.analysis.ai_compose.record_spend"),
    ):
        read = analysis.read(tenant_ctx, "x", kind="stub", question="?", outline_exists=False, currency="usd")
    assert [u.field for u in read.unclear] == ["price"]
    assert model.call_args.kwargs["output_model"] is analysis.Found


@pytest.mark.parametrize("words", ["zoom", "7"])
@pytest.mark.parametrize("typed", [False, True])
def test_a_clarify_answer_for_a_field_the_kind_lacks_is_kept(owner, monkeypatch, settings, words, typed):
    _stub(monkeypatch)
    settings.FOCUS_KINDS = ["course", "stub"]
    creation = flow.start(owner, "stub", value="x")
    ask = {"field": "where", "question": "Where?", "options": []}
    creation.brief = {**creation.brief, "clarify": [ask]}
    creation.pending = {"field": "clarify", "text": words}
    flow.apply(creation, analysis.Found(answer=words) if typed else None)
    assert creation.answers["where"] == words
    assert creation.brief["clarify"] == [] and creation.brief["asked"] == ["where"]


def test_an_unknown_kind_is_refused():
    with pytest.raises(flow.FlowError, match="unknown_kind"):
        kinds.get("nope")


def test_a_creation_without_a_record_yet_stays_active(owner, monkeypatch, settings):
    _stub(monkeypatch)
    settings.FOCUS_KINDS = ["course", "stub"]
    creation = flow.start(owner, "stub", value="x")
    assert creation.record_id is None
    body = flow.state(creation)
    assert body["record"] is None
    assert body["status"] == "active"
    creation.refresh_from_db()
    assert creation.status == "active"


def test_a_skipped_question_is_never_current(owner, monkeypatch, settings):
    _stub(monkeypatch, skips={"level"})
    settings.FOCUS_KINDS = ["course", "stub"]
    creation = flow.start(owner, "stub", value="x")
    assert flow.current_field(creation) == "size"


# ── The shared steps read the adapter ───────────────────────────────────────

# What a question before the one under test is answered with.
ANSWERED = {"outline_review": "ok", "cover": "later", "access": "free"}
# A kind whose finish step sends: its go-live option first, its keep option second.
SENDS = {"FINISH": (("send", "Send"), ("hold", "Keep it back")), "CLOSING": {"send": "Sent.", "hold": "Kept back."}}


def _on_a_course(monkeypatch, settings, **names):
    """The stub, switched on, making a real draft course: its steps have a record to work on."""
    course = kinds.get("course")
    stub = _stub(monkeypatch, create_draft=course.create_draft, record=course.record, **names)
    settings.FOCUS_KINDS = ["course", "stub"]
    return stub


def _at(owner, field, kind="stub", *, lesson=False):
    """A creation of ``kind`` with every question before ``field`` answered;
    with ``lesson``, its course has a lesson she wrote, so it can go live."""
    creation = flow.start(owner, kind, value="A course on desk yoga")
    ids = [q.id for q in kinds.get(kind).RECIPE.questions]
    creation.answers = {**creation.answers, **{i: ANSWERED.get(i, "x") for i in ids[: ids.index(field)]}}
    creation.save()
    if lesson:
        module = Module.objects.create(course_id=creation.record_id, title="Basics", order=1)
        Lesson.objects.create(module=module, title="Lesson 1", order=1, content_html="<p>Breathe in.</p>")
    assert flow.current_field(creation) == field
    return creation


def test_the_cover_step_draws_for_the_adapters_target(owner, monkeypatch, settings):
    target = mock.Mock(side_effect=kinds.get("course").cover_target)
    facts = {"title": "Desk yoga, gently", "description": "For office workers."}
    _on_a_course(monkeypatch, settings, COVER="styles", cover_target=target, cover_facts=lambda record: facts)
    creation = _at(owner, "cover")
    with transaction.atomic():
        run = covers.start(flow._locked(creation), ahead=False)
    styles = [
        covers.CoverStyle(layout=layout, panel="accent", title_font="body", upper=False, subtitle="")
        for layout in ("panel", "full", "title", "band")
    ]
    with (
        mock.patch("apps.core.focus.covers.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.covers.ai_compose.record_spend"),
        mock.patch(
            "apps.core.focus.covers.core_ai.structured",
            return_value=(covers.CoverPlan(photo_query="desk", styles=styles), Decimal("0"), "x"),
        ) as model,
        mock.patch("apps.core.focus.covers.pick_photo", return_value=None),
    ):
        jobs.execute(SCHEMA, run.id)
    creation.refresh_from_db()
    assert len(creation.covers["rounds"][-1]) == 4
    assert json.loads(model.call_args.kwargs["user"])["course"] == "Desk yoga, gently"
    covers.keep(creation, 0, owner)
    target.assert_called()
    kept = Design.objects.get(kind="cover", state="kept")
    assert (kept.target_kind, kept.target_key) == ("course", str(creation.record_id))
    creation.refresh_from_db()
    assert creation.answers["cover"] == "kept"


@pytest.mark.parametrize("kind", ["course", "stub"])
def test_no_covers_are_drafted_for_a_kind_without_a_cover(owner, monkeypatch, settings, kind):
    _on_a_course(monkeypatch, settings, without=("cover",))
    creation = flow.answer(flow.start(owner, kind, value="A course on desk yoga"), "level", rest=True)
    draft = outline.OutlineDraft(title="Desk yoga", description="", modules=[_Module(title="M", lessons=["L"])])
    with (
        mock.patch("apps.core.focus.outline.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.outline.ai_compose.record_spend"),
        mock.patch("apps.core.focus.analysis.read", side_effect=core_ai.AiError("off")),
        mock.patch("apps.core.focus.outline.core_ai.structured", return_value=(draft, Decimal("0"), "x")),
    ):
        jobs.execute(SCHEMA, creation.outline_run_id)
    creation.refresh_from_db()
    assert (creation.drafted or {}).get("modules")
    # The course still draws its covers ahead once its outline is written.
    assert ("covers" in (creation.runs or {})) is (kind == "course")


@pytest.mark.parametrize("announcer", [None, "community"])
def test_no_announcement_offer_without_an_announcer(owner, monkeypatch, settings, announcer):
    _on_a_course(monkeypatch, settings, ANNOUNCER=announcer)
    creation = flow.finish(_at(owner, "finish", lesson=True), publish=True, announce=True)
    assert Course.objects.get(pk=creation.record_id).is_published is True
    if announcer is None:
        assert "announce" not in (creation.runs or {})
        assert creation.status == "done" and creation.answers["announce"] == "skip"
    else:
        assert jobs.status(creation, "announce") == "building"
        assert creation.runs["announce"] and flow.current_field(creation) == "announce"
        assert CopilotRun.objects.get(pk=creation.runs["announce"]).specialist == "community"


def test_the_finish_options_come_from_the_adapter(owner, monkeypatch, settings):
    _on_a_course(monkeypatch, settings, **SENDS)
    creation = _at(owner, "finish", lesson=True)
    question = flow.state(creation)["question"]
    assert [(o["value"], o["label"]) for o in question["options"]] == [("send", "Send"), ("hold", "Keep it back")]
    creation = flow.finish(creation, publish=True)
    assert creation.answers["finish"] == "send"
    assert {"field": "finish", "label": "Send"} in flow.state(creation)["answered"]
    creation.chat.refresh_from_db()
    assert [e["text"] for e in creation.chat.entries][-2:] == ["Send", "Sent."]


def test_an_empty_lesson_drops_the_kinds_go_live_option(owner, monkeypatch, settings):
    _on_a_course(monkeypatch, settings, **SENDS)
    creation = _at(owner, "finish")  # no lesson yet
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["hold"]
    creation = flow.finish(creation, publish=True)
    assert creation.answers["finish"] == "hold"


@pytest.mark.parametrize("ticked", [True, False])
def test_the_tick_goes_to_a_kind_without_an_announcer_before_it_goes_live(owner, monkeypatch, settings, ticked):
    order = []
    course = kinds.get("course")
    _on_a_course(
        monkeypatch,
        settings,
        apply_tick=lambda record_id, on: order.append(("tick", record_id, on)),
        go_live=lambda record_id: order.append(("live", record_id)) or course.go_live(record_id),
    )
    creation = flow.finish(_at(owner, "finish", lesson=True), publish=True, announce=ticked)
    assert order == [("tick", creation.record_id, ticked), ("live", creation.record_id)]
    assert "announce" not in (creation.runs or {})


def test_a_recipe_without_a_price_step_reaches_finish(owner, monkeypatch, settings):
    _on_a_course(monkeypatch, settings, without=("cover", "access"))
    creation = flow.answer(flow.start(owner, "stub", value="A course on desk yoga"), "level", rest=True)
    assert "access" not in creation.answers
    creation = flow.answer(creation, "outline_review", value="ok")
    assert flow.current_field(creation) == "finish"
    assert flow.state(creation)["question"]["field"] == "finish"
    creation = flow.finish(creation, publish=False)
    assert creation.status == "done" and creation.answers["finish"] == "draft"


def test_without_a_suggestion_or_memberships_the_price_step_offers_free(owner, monkeypatch, settings):
    _on_a_course(monkeypatch, settings, put_in_plan=None)
    creation = _at(owner, "access")
    asked = flow.state(creation)["question"]
    assert asked["options"] == [{"value": "free", "label": "Free", "hint": ""}]
    assert asked["suggested"] is None


def test_a_kinds_own_price_tiles_are_shown_and_a_tap_goes_to_its_set_price(owner, monkeypatch, settings):
    tiles = {"options": [{"value": "month:29", "label": "$29 a month", "hint": ""}], "suggested": "month:29"}
    set_price = mock.Mock()
    _on_a_course(monkeypatch, settings, price_tiles=lambda creation, record: tiles, set_price=set_price)
    creation = _at(owner, "access")
    asked = flow.state(creation)["question"]
    assert (asked["options"], asked["suggested"]) == (tiles["options"], "month:29")
    flow.answer(creation, "access", value="year:290")  # not one of its tiles
    set_price.assert_not_called()
    creation = flow.answer(creation, "access", value="month:29")
    set_price.assert_called_once_with(creation.record_id, "month:29")
    assert creation.answers["access"] == "month:29"
    creation.chat.refresh_from_db()
    assert creation.chat.entries[-1]["text"] == "$29 a month"
    assert {"field": "access", "label": "$29 a month"} in flow.state(creation)["answered"]
    tiles["options"] = []  # its tiles changed since: her line still reads, never a 500
    assert {"field": "access", "label": "month:29"} in flow.state(creation)["answered"]


def test_the_starter_tile_reads_the_kinds_setup_answer(owner, tenant_ctx, monkeypatch, settings):
    monkeypatch.setattr(
        tenant_ctx, "wizard_state", {"flow": "interview", "answers": {"course_topic": "Desk yoga", "x_topic": "Chess"}}
    )
    _stub(monkeypatch, SETUP_TOPIC="x_topic")
    assert flow.question("course", "topic")["options"] == [{"value": "Desk yoga", "label": "Desk yoga", "hint": ""}]
    assert flow.question("stub", "topic")["options"] == [{"value": "Chess", "label": "Chess", "hint": ""}]
    _stub(monkeypatch)  # no /setup answer of its own
    assert flow.question("stub", "topic")["options"] == []


# ── The switch, through the endpoints ───────────────────────────────────────

URL = "/api/v1/admin/focus/"


@pytest.fixture()
def client(owner):
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=owner)
    return c


def test_a_kind_not_switched_on_cannot_start(client, settings):
    settings.FOCUS_KINDS = []
    response = client.post(URL, {"kind": "course", "text": "A course on desk yoga"}, format="json")
    assert response.status_code == 400
    assert response.json() == {"detail": "unknown_kind"}


def test_overview_lists_only_switched_on_kinds(client, monkeypatch, settings):
    _stub(monkeypatch)  # known, but not switched on
    settings.FOCUS_KINDS = ["course"]
    body = client.get(URL).json()
    assert body["kinds"] == ["course"]
    assert set(body["first"]) == {"course"}
    assert kinds.enabled() == ["course"]


def test_form_timing_takes_the_kind(client, owner, monkeypatch):
    from apps.tenant_config.models import FocusCreation

    _stub(monkeypatch, record=lambda record_id: Course.objects.filter(pk=record_id).first())
    course = Course.objects.create(title="By hand", instructor=owner)
    res = client.post(f"{URL}form-timing/", {"kind": "stub", "record_id": course.id, "active_ms": 7}, format="json")
    assert res.status_code == 201
    assert FocusCreation.objects.get(mode="form").kind == "stub"
    # Checked through that kind's adapter: none of its records, or an unknown kind, stamps nothing.
    _stub(monkeypatch)
    assert client.post(f"{URL}form-timing/", {"kind": "stub", "record_id": course.id}, format="json").status_code == 404
    assert client.post(f"{URL}form-timing/", {"kind": "nope", "record_id": course.id}, format="json").status_code == 404
