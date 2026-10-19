"""The copy job (apps.core.focus.copywriter, G5): the review step's drafting
for a kind it drafts (the event): one model call writes the record's title
and description, each written only while it is blank or still holds what the
job last wrote, and each emitted as a ``field`` event the page types in. The
model call is patched; what is under test is what gets written (her edits
win), the events, the failure path and the prompt."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.focus import copywriter, flow, jobs
from apps.core.focus.kinds import event
from apps.live.models import LiveClass
from apps.tenant_config.models import CopilotRun, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"
ZONE = "Europe/Istanbul"
TITLE = "Morning breath, slowly"
DESCRIPTION = "A live online class on morning breath. Breathe together and start your day."


@pytest.fixture()
def owner(tenant_ctx):
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Studio")
    config.timezone = ZONE
    config.save(update_fields=["timezone"])
    return User.objects.create_user(
        email="focus-copy@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def on(settings):
    settings.FOCUS_KINDS = ["course", "event"]
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


@pytest.fixture(autouse=True)
def ai_on():
    with (
        mock.patch("apps.core.focus.copywriter.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.copywriter.ai_compose.record_spend"),
        mock.patch("apps.core.focus.flow.followup_allowed", return_value=False),
    ):
        yield


def _copy(title=TITLE, description=DESCRIPTION):
    return copywriter.output_for("event")(title=title, description=description)


def _model(**kwargs):
    if "side_effect" not in kwargs:
        kwargs["return_value"] = (kwargs.pop("copy", None) or _copy(), Decimal("0"), "x")
    return mock.patch("apps.core.focus.copywriter.core_ai.structured", **kwargs)


def _once(days: int) -> str:
    now = timezone.now().astimezone(ZoneInfo(ZONE))
    at = (now + timedelta(days=days)).replace(hour=18, minute=0, second=0, microsecond=0)
    return f'{{"mode": "once", "at": "{at:%Y-%m-%dT%H:%M}"}}'


def _at_review(owner):
    """A live class with its kind and date: the review is the question, and its copy run is queued."""
    creation = flow.answer(flow.start(owner, "event", value="A class on morning breath"), "where", value="live")
    creation = flow.answer(creation, "when", value=_once(3))
    assert flow.current_field(creation) == "review"
    return creation


def _row(creation):
    return event.record(creation.record_id)


def _fields(run_id):
    return [e.data for e in CopilotRun.objects.get(pk=run_id).events.filter(type="field")]


def _typed_at_review(creation, words, found):
    """Her words at the review, read by the analysis as ``found``."""
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.answer(creation, "review", text=words)
    with mock.patch("apps.core.focus.analysis.read", return_value=found):
        jobs.execute(SCHEMA, creation.pending["run"])
    creation.refresh_from_db()
    return creation


# ── The brief's tests ───────────────────────────────────────────────────────


def test_copy_writes_each_field_as_a_field_event(owner):
    creation = _at_review(owner)
    run_id = creation.runs["copy"]
    run = CopilotRun.objects.get(pk=run_id)
    assert run.specialist == "content"
    assert run.request == {"focus": creation.id, "job": "copy", "instruction": ""}
    assert flow.state(creation)["copy"] == {"status": "building", "run": run_id}
    with _model() as model:
        jobs.execute(SCHEMA, run_id)
    assert model.call_args.kwargs["label"] == "contentor:copilot"
    turn = json.loads(model.call_args.kwargs["user"])
    assert (turn["topic"], turn["where"], turn["instruction"]) == ("A class on morning breath", "Live online", "")
    assert turn["schedule"].endswith("at 6:00 PM")
    assert turn["current"] == {"title": "Morning breath", "description": ""}
    row = _row(creation)
    assert (row.title, row.description, row.status) == (TITLE, DESCRIPTION, "draft")
    assert _fields(run_id) == [
        {"record": f"live:{row.pk}", "name": "title", "value": TITLE},
        {"record": f"live:{row.pk}", "name": "description", "value": DESCRIPTION},
    ]
    creation.refresh_from_db()
    assert creation.drafted["copy"] == {"title": TITLE, "description": DESCRIPTION}
    assert flow.state(creation)["copy"] == {"status": "ready", "run": run_id}
    # The Designer drafts the covers ahead of the cover step, as after the course's outline.
    covers_run = CopilotRun.objects.get(pk=creation.runs["covers"])
    assert covers_run.request["ahead"] is True


def test_a_redraft_never_overwrites_a_field_she_edited(owner):
    creation = _at_review(owner)
    with _model():
        jobs.execute(SCHEMA, creation.runs["copy"])
    LiveClass.objects.filter(pk=_row(creation).pk).update(description="My own words about it.")
    first = creation.runs["copy"]
    creation = _typed_at_review(
        creation, "a shorter title please", event.EventFound(answer="a shorter title please", change="shorter title")
    )
    assert "review" not in creation.answers and flow.current_field(creation) == "review"
    redraft = creation.runs["copy"]
    assert redraft != first
    assert CopilotRun.objects.get(pk=redraft).request["instruction"] == "a shorter title please"
    with _model(copy=_copy("Morning breath", "Something else entirely.")) as model:
        jobs.execute(SCHEMA, redraft)
    assert json.loads(model.call_args.kwargs["user"])["current"]["description"] == "My own words about it."
    row = _row(creation)
    assert (row.title, row.description) == ("Morning breath", "My own words about it.")
    assert [f["name"] for f in _fields(redraft)] == ["title"]
    creation.refresh_from_db()
    assert creation.drafted["copy"] == {"title": "Morning breath", "description": DESCRIPTION}
    assert "covers" in creation.runs and CopilotRun.objects.filter(request__job="covers").count() == 1


def test_her_title_set_back_to_the_working_title_survives_a_redraft(owner):
    creation = _at_review(owner)
    with _model():
        jobs.execute(SCHEMA, creation.runs["copy"])
    LiveClass.objects.filter(pk=_row(creation).pk).update(title="Morning breath")  # hers now
    creation = _typed_at_review(
        creation, "make the description warmer", event.EventFound(answer="", change="a warmer description")
    )
    with _model(copy=_copy("Morning breath, warmly", "A warmer live class on morning breath.")):
        jobs.execute(SCHEMA, creation.runs["copy"])
    row = _row(creation)
    assert (row.title, row.description) == ("Morning breath", "A warmer live class on morning breath.")
    assert [f["name"] for f in _fields(creation.runs["copy"])] == ["description"]


def test_a_copy_finishing_after_publish_writes_nothing(owner):
    creation = flow.answer(_at_review(owner), "review", value="ok")  # "Looks good" while the copy is written
    creation.answers = {**creation.answers, "cover": "later"}
    creation.save()
    creation = flow.answer(creation, "access", value="free")
    run = creation.runs["copy"]

    def published(**kwargs):
        flow.finish(creation, publish=True)  # before the hub returned
        return (_copy(), Decimal("0"), "x")

    with _model(side_effect=published):
        jobs.execute(SCHEMA, run)
    assert CopilotRun.objects.get(pk=run).status == "stopped"  # finish stopped it
    row = _row(creation)
    assert (row.title, row.description, row.status) == ("Morning breath", "", "scheduled")
    assert _fields(run) == []
    creation.refresh_from_db()
    assert "covers" not in (creation.runs or {}) and "copy" not in (creation.drafted or {})

    # Published by hand on the page while the model wrote: nothing written on the live class either.
    other = _at_review(owner)
    pk = _row(other).pk

    def by_hand(**kwargs):
        LiveClass.objects.filter(pk=pk).update(status="scheduled")
        return (_copy(), Decimal("0"), "x")

    with _model(side_effect=by_hand):
        jobs.execute(SCHEMA, other.runs["copy"])
    assert (_row(other).title, _row(other).description) == ("Morning breath", "")
    assert CopilotRun.objects.get(pk=other.runs["copy"]).status == "done" and _fields(other.runs["copy"]) == []
    other.refresh_from_db()
    assert "covers" not in (other.runs or {})


def test_her_edit_during_the_run_is_kept(owner):
    creation = _at_review(owner)
    pk = _row(creation).pk

    def she_edits(**kwargs):
        LiveClass.objects.filter(pk=pk).update(title="Breathe with Ayşe")
        return (_copy(), Decimal("0"), "x")

    with _model(side_effect=she_edits):
        jobs.execute(SCHEMA, creation.runs["copy"])
    row = _row(creation)
    assert (row.title, row.description) == ("Breathe with Ayşe", DESCRIPTION)
    assert [f["name"] for f in _fields(creation.runs["copy"])] == ["description"]
    creation.refresh_from_db()
    assert creation.drafted["copy"] == {"description": DESCRIPTION}


def test_a_failed_copy_keeps_her_working_title_and_offers_try_again(owner):
    creation = _at_review(owner)
    first = creation.runs["copy"]
    with _model(side_effect=core_ai.AiError("down")):
        jobs.execute(SCHEMA, first)
    row = _row(creation)
    assert (row.title, row.description) == ("Morning breath", "")
    creation.refresh_from_db()
    assert flow.state(creation)["copy"] == {"status": "failed", "run": first}
    assert "covers" not in (creation.runs or {})

    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)
    url = f"/api/v1/admin/focus/{creation.id}/copy/"
    body = client.post(url).json()
    retry = body["copy"]["run"]
    assert retry != first and body["copy"]["status"] == "building"
    assert client.post(url).json()["copy"]["run"] == retry  # never while it is being written
    with _model():
        jobs.execute(SCHEMA, retry)
    assert _row(creation).title == TITLE

    course = flow.start(owner, "course", value="A course on desk yoga")  # the course has no copy job
    assert client.post(f"/api/v1/admin/focus/{course.id}/copy/").status_code == 404
    other = User.objects.create_user(
        email="other@x.com",
        name="O",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    client.force_authenticate(user=other)
    assert client.post(url).status_code == 404


def test_the_copy_endpoint_is_off_with_focus_mode(owner, settings):
    creation = _at_review(owner)
    settings.FOCUS_MODE_ENABLED = False
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)
    assert client.post(f"/api/v1/admin/focus/{creation.id}/copy/").status_code == 404


def test_a_record_deleted_meanwhile_ends_the_copy_quietly(owner):
    creation = _at_review(owner)
    pk = _row(creation).pk

    def deleted(**kwargs):
        LiveClass.objects.filter(pk=pk).delete()
        return (_copy(), Decimal("0"), "x")

    with _model(side_effect=deleted):
        jobs.execute(SCHEMA, creation.runs["copy"])
    run = CopilotRun.objects.get(pk=creation.runs["copy"])
    assert run.status == "done" and _fields(run.id) == []
    creation.refresh_from_db()
    assert "covers" not in (creation.runs or {}) and "copy" not in (creation.drafted or {})
    # Gone before the run started: no model call at all.
    again = copywriter.start(creation)
    with _model() as model:
        jobs.execute(SCHEMA, again.id)
    model.assert_not_called()
    assert CopilotRun.objects.get(pk=again.id).status == "done"


def test_copy_never_invents_numbers():
    system = copywriter.system_for("event")
    assert copywriter.F13 == "Never invent a claim, a result or a number."
    assert copywriter.F13 in copywriter.SHARED and copywriter.F13 in system
    assert system == copywriter.SHARED.replace("{noun}", "class") + "\n" + event.COPY_RULES
    assert event.COPY_RULES.splitlines()[:2] == [
        "Write a class title under 60 characters and a 2–4 sentence description for students: what happens "
        "and who it is for, from what she said.",
        "- What to bring, or any other concrete detail (a level, a result, a benefit), only when she said it.",
    ]
    assert "{" not in system
    assert event.COPY_FIELDS == ("title", "description")


# ── What the model is given ─────────────────────────────────────────────────


def test_the_model_is_never_given_her_address_or_zoom_link(owner):
    creation = flow.answer(flow.start(owner, "event", value="A class on morning breath"), "where", value="zoom")
    creation = flow.answer(creation, "when", value=_once(3))
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = flow.answer(creation, "place", text="https://zoom.us/j/123?pwd=AbC")
    assert flow.current_field(creation) == "review"
    with _model() as model:
        jobs.execute(SCHEMA, creation.runs["copy"])
    user = model.call_args.kwargs["user"]
    assert "zoom.us/j/123" not in user and json.loads(user)["where"] == "On Zoom"
    assert model.call_args.kwargs["system"] == copywriter.system_for("event")
