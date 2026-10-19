"""Focus mode's kind adapters (apps.core.focus.kinds): what the flow asks
each kind's module for, and the switch (FOCUS_KINDS) that turns a kind on."""

import dataclasses
import importlib
import sys
import types
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import tasks
from apps.core.focus import analysis, flow, kinds

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
)
STUB = "apps.core.tests.focus_stub_kind"


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


def _stub(monkeypatch, skips=frozenset()):
    """A kind with no record before a later answer (G10): the course's
    adapter, with a recipe of its own, ``create_draft`` making nothing yet."""
    course = kinds.get("course")
    stub = types.ModuleType(STUB)
    stub.__dict__.update({name: getattr(course, name) for name in ADAPTER})
    stub.RECIPE = dataclasses.replace(course.RECIPE, kind="stub")
    stub.create_draft = lambda actor, title, answers: None
    stub.record = lambda record_id: None
    stub.skips = lambda creation: set(skips)
    stub.FOUND, stub.RULES, stub.UNCLEAR_FIELDS = analysis.Found, "", ("price",)
    stub.apply_found = lambda creation, found: None
    stub.apply_change = lambda creation, found, **step: None
    stub.apply_clarified = lambda creation, field, value: False
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
        assert set(module.CLOSING) == {"publish", "draft"}
        for name in ("create_draft", "record", "payload", "retitle", "set_price", "not_ready", "cannot_sell"):
            assert callable(getattr(module, name)), f"{kind}.{name}"
        assert callable(module.go_live) and callable(module.skips) and callable(module.apply_found)
        assert callable(module.apply_change) and callable(module.apply_clarified)
        assert issubclass(module.FOUND, analysis.Found) and module.UNCLEAR_FIELDS
        assert module.put_in_plan is None or callable(module.put_in_plan)


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
