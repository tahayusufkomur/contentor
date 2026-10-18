"""Focus mode's endpoints: start, answer, finish, leave, the overview, and the
plain form's timing stamp. The outline job is stubbed (test_focus_outline.py)."""

from unittest import mock

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import tasks
from apps.courses.models import Course
from apps.tenant_config.models import CopilotRun, FocusCreation

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
URL = "/api/v1/admin/focus/"
on = override_settings(FOCUS_MODE_ENABLED=True)
off = override_settings(FOCUS_MODE_ENABLED=False)


def _user(email, role="owner"):
    return User.objects.create_user(
        email=email,
        name="U",
        password="x",  # noqa: S106
        role=role,
        is_staff=role == "owner",
    )


def _client(user):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def owner(tenant_ctx):
    return _user("focus-api@x.com")


@pytest.fixture()
def client(owner):
    return _client(owner)


@pytest.fixture(autouse=True)
def no_celery():
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


@pytest.fixture(autouse=True)
def outline_start():
    def fake(creation, instruction=""):
        run = CopilotRun.objects.create(actor=creation.actor, chat=creation.chat, specialist="content")
        creation.outline_run = run
        creation.save(update_fields=["outline_run"])
        return run

    with mock.patch("apps.core.focus.outline.start", side_effect=fake) as stub:
        yield stub


def _start(client, text="A course on desk yoga"):
    return client.post(URL, {"kind": "course", "text": text}, format="json")


def _answer(client, creation_id, **body):
    return client.post(f"{URL}{creation_id}/answer/", body, format="json")


@off
def test_overview_says_off_when_the_switch_is_off(client):
    body = client.get(URL).json()
    assert body == {"enabled": False, "first": {}, "open": []}
    assert _start(client).status_code == 404


@on
def test_overview_gives_the_first_question(client):
    body = client.get(URL).json()
    assert body["enabled"] is True
    assert body["first"]["course"]["field"] == "topic"
    assert body["first"]["course"]["question"] == "What will your students learn?"
    assert body["first"]["course"]["starter"] == "A course on "
    assert body["open"] == []


@on
def test_start_answer_finish_round_trip(client):
    res = _start(client)
    assert res.status_code == 201
    state = res.json()
    assert state["question"]["field"] == "level"
    assert state["record"]["slug"]
    cid = state["id"]
    _answer(client, cid, field="level", value="beginners")
    state = _answer(client, cid, field="size", value="short").json()
    assert state["question"]["field"] == "outline_review"
    assert state["outline"]["status"] == "building"
    state = _answer(client, cid, field="outline_review", value="ok").json()
    assert state["question"]["field"] == "cover"
    FocusCreation.objects.filter(pk=cid).update(answers={**FocusCreation.objects.get(pk=cid).answers, "cover": "later"})
    state = client.get(f"{URL}{cid}/").json()
    assert state["question"]["field"] == "finish"
    state = client.post(f"{URL}{cid}/finish/", {"publish": False}, format="json").json()
    assert state["status"] == "done"
    assert state["question"] is None
    assert client.get(URL).json()["open"] == []


@on
def test_open_lists_her_active_creation_with_its_record(client):
    state = _start(client).json()
    assert client.get(URL).json()["open"] == [{"id": state["id"], "kind": "course", "record": state["record"]}]
    assert client.get(f"{URL}{state['id']}/").json() == state


@on
def test_a_stale_or_double_answer_returns_the_same_state(client, outline_start):
    cid = _start(client).json()["id"]
    _answer(client, cid, field="level", value="beginners")
    first = _answer(client, cid, field="size", value="short")
    second = _answer(client, cid, field="size", value="short")
    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()
    assert outline_start.call_count == 1


@on
def test_retry_after_a_failed_outline_starts_one_new_run(client, outline_start):
    cid = _start(client).json()["id"]
    state = _answer(client, cid, field="level", rest=True).json()
    CopilotRun.objects.filter(pk=state["outline"]["run"]).update(status="failed")
    assert client.get(f"{URL}{cid}/").json()["outline"]["status"] == "failed"
    state = _answer(client, cid, field="outline_review", value="retry").json()
    assert outline_start.call_count == 2
    assert state["outline"]["status"] == "building"
    _answer(client, cid, field="outline_review", value="retry")  # a double tap
    assert outline_start.call_count == 2


@on
def test_a_deleted_course_closes_its_creation(client):
    state = _start(client).json()
    Course.objects.filter(pk=state["record"]["id"]).delete()
    body = client.get(f"{URL}{state['id']}/").json()
    assert body["record"] is None
    assert body["status"] == "left"
    assert client.get(URL).json()["open"] == []


def test_switching_off_hides_an_open_creation(client):
    with on:
        cid = _start(client).json()["id"]
    with off:
        assert client.get(f"{URL}{cid}/").status_code == 404
        assert _answer(client, cid, field="level", value="beginners").status_code == 404
        assert client.get(URL).json()["open"] == []


@on
def test_creations_are_private_to_their_coach(client, owner):
    cid = _start(client).json()["id"]
    other = _client(_user("focus-other@x.com"))
    assert other.get(f"{URL}{cid}/").status_code == 404
    assert _answer(other, cid, field="level", value="beginners").status_code == 404
    assert other.get(URL).json()["open"] == []


@on
def test_a_student_is_turned_away(tenant_ctx):
    student = _client(_user("focus-student@x.com", role="student"))
    assert student.get(URL).status_code == 403
    assert student.post(URL, {"kind": "course", "text": "x"}, format="json").status_code == 403


@on
def test_bad_kind_or_no_answer_is_a_400(client):
    res = client.post(URL, {"kind": "spaceship", "text": "x"}, format="json")
    assert res.status_code == 400
    assert res.json() == {"detail": "unknown_kind"}
    assert client.post(URL, {"kind": "course"}, format="json").json() == {"detail": "no_answer"}


@on
def test_leave_keeps_it_open_and_abandon_closes_it(client):
    cid = _start(client).json()["id"]
    state = client.post(f"{URL}{cid}/leave/", {"active_ms": 4000}, format="json").json()
    assert state["status"] == "active"
    assert FocusCreation.objects.get(pk=cid).active_ms == 4000
    state = client.post(f"{URL}{cid}/leave/", {"abandon": True}, format="json").json()
    assert state["status"] == "left"


@on
def test_form_timing_records_a_form_creation(client, owner):
    course = Course.objects.create(title="By hand", instructor=owner)
    res = client.post(f"{URL}form-timing/", {"course_id": course.id, "active_ms": 42000}, format="json")
    assert res.status_code == 201
    row = FocusCreation.objects.get(mode="form")
    assert (row.kind, row.record_id, row.status, row.active_ms) == ("course", course.id, "done", 42000)
    assert row.finished_at is not None
    client.post(f"{URL}form-timing/", {"course_id": course.id, "active_ms": 42000}, format="json")
    assert FocusCreation.objects.filter(mode="form").count() == 1  # a double post stamps once


@on
def test_form_timing_needs_a_course_of_hers(client):
    someone = _user("focus-someone@x.com")
    course = Course.objects.create(title="Not hers", instructor=someone)
    res = client.post(f"{URL}form-timing/", {"course_id": course.id, "active_ms": 1}, format="json")
    assert res.status_code == 404


@on
def test_just_draft_it_on_the_first_screen_is_one_request(client, outline_start):
    state = client.post(URL, {"kind": "course", "rest": True}, format="json").json()
    assert state["question"]["field"] == "outline_review"
    assert state["outline"]["status"] == "building"
    assert outline_start.call_count == 1


@on
def test_descriptions_try_again_starts_one_run_once_the_titles_are_confirmed(client):
    cid = _start(client).json()["id"]
    state = _answer(client, cid, field="level", rest=True).json()
    assert state["descriptions"] is None
    assert client.post(f"{URL}{cid}/descriptions/").json()["descriptions"] is None  # not confirmed yet
    _answer(client, cid, field="outline_review", value="ok")
    state = client.post(f"{URL}{cid}/descriptions/").json()
    assert state["descriptions"]["status"] == "building"
    run = state["descriptions"]["run"]
    assert client.post(f"{URL}{cid}/descriptions/").json()["descriptions"]["run"] == run  # a double tap


@on
def test_descriptions_are_hers_and_switched(client):
    cid = _start(client).json()["id"]
    other = _client(_user("focus-other-desc@x.com"))
    assert other.post(f"{URL}{cid}/descriptions/").status_code == 404
    with override_settings(FOCUS_MODE_ENABLED=False):
        assert client.post(f"{URL}{cid}/descriptions/").status_code == 404
