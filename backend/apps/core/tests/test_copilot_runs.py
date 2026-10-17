"""Runs: the team's work stored per tenant and carried out by the agents
worker. The model call is patched; what is under test is the lifecycle:
start, events in order, Stop, failure, the stale sweep and pruning."""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.tenant_config.models import CopilotRun, CopilotRunEvent

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="runs-coach@x.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


def _run(actor, **fields):
    request = {"message": "hi", "transcript": [], "selections": [], "attachments": [], "context": None}
    return CopilotRun.objects.create(actor=actor, specialist="finance", request=request, **fields)


def _start(actor, **overrides):
    args = {
        "message": "hi",
        "transcript": [],
        "selections": [],
        "attachments": [],
        "context": None,
        "specialist": "finance",
        "chat_id": None,
    }
    args.update(overrides)
    return runs.start(actor, **args)


def _types(run):
    return list(run.events.values_list("type", flat=True))


def _turn(payload, cost="0"):
    return mock.patch("apps.core.copilot.runs.engine.run_turn", return_value=(payload, Decimal(cost)))


def test_start_creates_a_queued_run_and_enqueues_it_on_commit(coach):
    with mock.patch.object(tasks.run_copilot, "delay") as delay:
        run = _start(coach)
    run.refresh_from_db()
    assert run.status == "queued"
    assert run.request["message"] == "hi"
    delay.assert_called_once_with(SCHEMA, run.id)


def test_execute_records_thinking_reply_done_in_order(coach):
    run = _run(coach)
    payload = {"kind": "answer", "text": "Up 12%", "specialist": "finance"}
    with _turn(payload, "0.02"), mock.patch("apps.core.copilot.runs.ai_compose.record_spend") as spend:
        runs.execute(SCHEMA, run.id)
    run.refresh_from_db()
    assert _types(run) == ["thinking", "reply", "done"]
    assert run.events.get(type="reply").data["payload"]["text"] == "Up 12%"
    assert run.status == "done"
    assert run.result["text"] == "Up 12%"
    assert run.finished_at is not None
    spend.assert_called_once_with(SCHEMA, Decimal("0.02"))


def test_execute_passes_the_cleaned_page_context(coach):
    run = _run(coach)
    run.request = {**run.request, "context": {"path": "/admin/courses"}}
    run.save(update_fields=["request"])
    with _turn({"kind": "answer", "text": "ok"}) as turn, mock.patch("apps.core.copilot.runs.ai_compose.record_spend"):
        runs.execute(SCHEMA, run.id)
    assert turn.call_args.args[5]["path"] == "/admin/courses"
    assert turn.call_args.kwargs["specialist"] == "finance"


def test_execute_skips_a_run_already_stopped(coach):
    run = _run(coach)
    runs.stop(run.id)
    with _turn({"kind": "answer", "text": "late"}) as turn:
        runs.execute(SCHEMA, run.id)
    turn.assert_not_called()
    assert _types(run) == ["stopped"]


def test_stop_during_the_model_call_drops_the_result(coach):
    run = _run(coach)

    def stop_then_answer(*args, **kwargs):
        runs.stop(run.id)
        return {"kind": "answer", "text": "too late"}, Decimal("0")

    with (
        mock.patch("apps.core.copilot.runs.engine.run_turn", side_effect=stop_then_answer),
        mock.patch("apps.core.copilot.runs.ai_compose.record_spend"),
    ):
        runs.execute(SCHEMA, run.id)
    run.refresh_from_db()
    assert run.status == "stopped"
    assert run.result == {}
    assert _types(run) == ["thinking", "stopped"]


def test_execute_marks_failure_and_records_the_spend_on_ai_error(coach):
    run = _run(coach)
    with (
        mock.patch(
            "apps.core.copilot.runs.engine.run_turn",
            side_effect=core_ai.AiError("provider exploded", cost_usd=Decimal("0.01")),
        ),
        mock.patch("apps.core.copilot.runs.ai_compose.record_spend") as spend,
    ):
        runs.execute(SCHEMA, run.id)
    run.refresh_from_db()
    assert run.status == "failed"
    assert _types(run) == ["thinking", "failed"]
    spend.assert_called_once_with(SCHEMA, Decimal("0.01"))


def test_stop_on_a_finished_run_changes_nothing(coach):
    run = _run(coach, status="done", result={"kind": "answer", "text": "kept"})
    assert runs.stop(run.id) == "done"
    run.refresh_from_db()
    assert run.status == "done"
    assert run.result["text"] == "kept"
    assert _types(run) == []


def test_emit_numbers_events_per_run(coach):
    first, second = _run(coach), _run(coach)
    runs.emit(first.id, "a")
    runs.emit(second.id, "a")
    runs.emit(first.id, "b")
    runs.emit(second.id, "b")
    assert list(first.events.values_list("seq", flat=True)) == [1, 2]
    assert list(second.events.values_list("seq", flat=True)) == [1, 2]


def test_sweep_fails_runs_stuck_queued_or_thinking(coach):
    now = timezone.now()
    stuck_queue = _run(coach)
    stuck_thought = _run(coach, status="thinking", updated_at=now - timedelta(minutes=11))
    busy = _run(coach, status="thinking", updated_at=now - timedelta(minutes=1))
    fresh = _run(coach)
    CopilotRun.objects.filter(pk=stuck_queue.pk).update(created_at=now - timedelta(minutes=4))
    CopilotRun.objects.filter(pk=fresh.pk).update(created_at=now - timedelta(minutes=1))

    runs.sweep(CopilotRun.objects.all())

    statuses = dict(CopilotRun.objects.values_list("pk", "status"))
    assert statuses[stuck_queue.pk] == "failed"
    assert statuses[stuck_thought.pk] == "failed"
    assert statuses[busy.pk] == "thinking"
    assert statuses[fresh.pk] == "queued"
    for run in (stuck_queue, stuck_thought):
        event = run.events.get()
        assert event.type == "failed"
        assert event.data["reason"] == "stale"


def test_start_prunes_runs_older_than_two_weeks(coach):
    old = _run(coach)
    runs.emit(old.id, "thinking")
    CopilotRun.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=15))
    with mock.patch.object(tasks.run_copilot, "delay"):
        _start(coach)
    assert not CopilotRun.objects.filter(pk=old.pk).exists()
    assert not CopilotRunEvent.objects.filter(run_id=old.pk).exists()


def test_run_copilot_goes_to_the_agents_queue():
    assert tasks.run_copilot.queue == "agents"


def test_run_copilot_runs_the_run():
    with mock.patch("apps.core.copilot.runs.execute") as execute:
        tasks.run_copilot("s1", 7)
    execute.assert_called_once_with("s1", 7)


def test_open_for_lists_her_active_and_unseen_finished_runs(coach):
    now = timezone.now()
    other = User.objects.create_user(email="runs-other@x.com", name="Other", password="x", role="owner")  # noqa: S106
    active = _run(coach, status="thinking")
    unseen = _run(coach, status="done", result={"kind": "answer", "text": "Sales are up"}, finished_at=now)
    _run(coach, status="done", finished_at=now, seen_at=now)
    _run(coach, status="done", finished_at=now - timedelta(days=2))
    _run(other, status="thinking")

    rows = runs.open_for(coach)

    assert {row["id"] for row in rows} == {active.id, unseen.id}
    assert next(row for row in rows if row["id"] == unseen.id)["summary"] == "Sales are up"


def test_agents_worker_logs_are_app_logs(settings):
    from apps.logbook import parsing

    assert "celery-agents" in parsing._APP_SERVICES
    assert settings.LOGBOOK_LEVEL_FLOORS["celery-agents"] == "INFO"


# ── endpoints ────────────────────────────────────────────────────────────────

RUNS = "/api/v1/admin/copilot/runs/"


@pytest.fixture()
def client(coach):
    from rest_framework.test import APIClient

    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=coach)
    return c


def _ai_on():
    return mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True)


def _someone_else():
    return User.objects.create_user(email="runs-else@x.com", name="Else", password="x", role="owner")  # noqa: S106


def test_run_start_returns_a_queued_run(client, coach):
    body = {
        "message": "How are sales?",
        "transcript": [{"role": "coach", "text": "hi", "junk": 1}],
        "selections": [],
        "specialist": "finance",
        "context": {"path": "/admin/payouts"},
    }
    with _ai_on(), mock.patch.object(tasks.run_copilot, "delay") as delay:
        resp = client.post(RUNS, body, format="json")
    assert resp.status_code == 201
    assert resp.json()["status"] == "queued"
    assert resp.json()["specialist"] == "finance"
    run = CopilotRun.objects.get(pk=resp.json()["id"])
    assert run.actor == coach
    assert run.request["message"] == "How are sales?"
    assert run.request["transcript"] == [{"role": "coach", "text": "hi"}]
    assert run.request["context"] == {"path": "/admin/payouts", "intent": ""}
    delay.assert_called_once_with(SCHEMA, run.id)


def test_run_start_says_unavailable_when_ai_is_off(client):
    with mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=False):
        resp = client.post(RUNS, {"message": "hi"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"kind": "unavailable"}
    assert not CopilotRun.objects.exists()


def test_run_start_keeps_the_chat_it_answers_in(client):
    from apps.tenant_config.models import CopilotChat

    chat = CopilotChat.objects.create(title="t", entries=[])
    with _ai_on(), mock.patch.object(tasks.run_copilot, "delay"):
        known = client.post(RUNS, {"message": "a", "chat": chat.id}, format="json").json()["id"]
        unknown = client.post(RUNS, {"message": "b", "chat": 999999}, format="json").json()["id"]
    assert CopilotRun.objects.get(pk=known).chat_id == chat.id
    assert CopilotRun.objects.get(pk=unknown).chat_id is None


def test_run_detail_returns_events_after_since(client, coach):
    run = _run(coach)
    for kind in ("thinking", "reply", "done"):
        runs.emit(run.id, kind)
    body = client.get(f"{RUNS}{run.id}/?since=1").json()
    assert [e["seq"] for e in body["events"]] == [2, 3]
    assert [e["type"] for e in body["events"]] == ["reply", "done"]
    assert body["specialist"] == "finance"


def test_run_detail_is_404_for_another_users_run(client):
    run = _run(_someone_else())
    assert client.get(f"{RUNS}{run.id}/").status_code == 404
    assert client.post(f"{RUNS}{run.id}/stop/").status_code == 404
    assert client.post(f"{RUNS}{run.id}/seen/").status_code == 404


def test_run_stop_stops_and_is_idempotent(client, coach):
    run = _run(coach, status="thinking")
    first = client.post(f"{RUNS}{run.id}/stop/")
    second = client.post(f"{RUNS}{run.id}/stop/")
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"status": "stopped"}
    assert _types(run) == ["stopped"]


def test_run_seen_marks_it_seen(client, coach):
    run = _run(coach, status="done", finished_at=timezone.now(), result={"kind": "answer", "text": "x"})
    assert client.post(f"{RUNS}{run.id}/seen/").status_code == 204
    run.refresh_from_db()
    assert run.seen_at is not None
    assert client.get(f"{RUNS}open/").json() == {"runs": []}


def test_runs_open_lists_her_unseen_finished_run(client, coach):
    run = _run(coach, status="done", finished_at=timezone.now(), result={"kind": "answer", "text": "Sales are up"})
    rows = client.get(f"{RUNS}open/").json()["runs"]
    assert [(r["id"], r["summary"], r["specialist"]) for r in rows] == [(run.id, "Sales are up", "finance")]


def test_run_endpoints_reject_anonymous_callers(tenant_ctx):
    from rest_framework.test import APIClient

    anon = APIClient(HTTP_HOST="shared-test.localhost")
    assert anon.post(RUNS, {"message": "hi"}, format="json").status_code in (401, 403)
    assert anon.get(f"{RUNS}open/").status_code in (401, 403)
    assert anon.get(f"{RUNS}1/").status_code in (401, 403)


def test_chat_entries_keep_the_run_id():
    from apps.core.copilot.views import _clean_chat_entries

    cleaned = _clean_chat_entries(
        [
            {"role": "assistant", "text": "", "kind": "pending", "run": 5, "specialist": "finance"},
            {"role": "assistant", "text": "x", "run": "x"},
            {"role": "assistant", "text": "y", "run": True},
            {"role": "coach", "text": "hi", "run": 6},
        ]
    )
    assert cleaned[0] == {"role": "assistant", "text": "", "kind": "pending", "specialist": "finance", "run": 5}
    assert all("run" not in entry for entry in cleaned[1:])
