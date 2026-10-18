"""The focus-job runner: one worker task for every job. Each run is recorded
under its job on the creation, and a failing handler fails its run and calls
its own ``on_failure``. Handlers are stubbed; their work is tested elsewhere."""

import sys
import types
from unittest import mock

import pytest
from django.db import transaction

from apps.accounts.models import User
from apps.core import tasks
from apps.core.focus import flow, jobs
from apps.tenant_config.models import CopilotRun

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="jobs-owner@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def enqueue():
    with mock.patch.object(tasks.run_focus_job, "delay") as delay:
        yield delay


def test_queue_records_the_run_under_its_job(owner, enqueue):
    creation = flow.start(owner, "course", value="Desk yoga")  # a tap: no analysis
    run = jobs.queue(creation, "descriptions", specialist="content")
    creation.refresh_from_db()
    assert creation.runs == {"descriptions": run.id}
    assert run.request == {"focus": creation.id, "job": "descriptions"}
    assert jobs.status(creation, "descriptions") == "building"
    enqueue.assert_called_once_with(SCHEMA, run.id)


def test_the_outline_keeps_its_own_field(owner):
    creation = flow.start(owner, "course", value="Desk yoga")
    run = jobs.queue(creation, "outline", specialist="content", instruction="")
    creation.refresh_from_db()
    assert creation.outline_run_id == run.id and "outline" not in creation.runs
    assert jobs.run_id(creation, "outline") == run.id


def test_a_failing_handler_calls_its_on_failure_and_fails_the_run(owner, monkeypatch):
    called = []

    def boom(tenant, run_id):
        raise RuntimeError("model down")

    stub = types.ModuleType("boom_handler")
    stub.carry_out = boom
    stub.on_failure = lambda tenant, run_id: called.append(run_id)
    monkeypatch.setitem(sys.modules, "boom_handler", stub)
    monkeypatch.setitem(jobs.HANDLERS, "boom", "boom_handler")
    creation = flow.start(owner, "course", value="Desk yoga")
    run = jobs.queue(creation, "boom", specialist="content")
    jobs.execute(SCHEMA, run.id)
    assert CopilotRun.objects.get(pk=run.id).status == "failed"
    assert called == [run.id]


def test_a_stopped_run_is_not_carried_out(owner, monkeypatch):
    stub = types.ModuleType("quiet_handler")
    stub.carry_out = mock.Mock()
    monkeypatch.setitem(sys.modules, "quiet_handler", stub)
    monkeypatch.setitem(jobs.HANDLERS, "quiet", "quiet_handler")
    creation = flow.start(owner, "course", value="Desk yoga")
    run = jobs.queue(creation, "quiet", specialist="content")
    CopilotRun.objects.filter(pk=run.id).update(status="stopped")
    jobs.execute(SCHEMA, run.id)
    stub.carry_out.assert_not_called()


def test_status_of_a_job_never_queued_is_idle(owner):
    assert jobs.status(flow.start(owner, "course", value="x"), "covers") == "idle"


def test_active_is_true_only_while_the_run_is_in_flight(owner):
    creation = flow.start(owner, "course", value="Desk yoga")
    run = jobs.queue(creation, "descriptions", specialist="content")
    with transaction.atomic():
        assert jobs.active(run.id) is True
    CopilotRun.objects.filter(pk=run.id).update(status="stopped")
    with transaction.atomic():
        assert jobs.active(run.id) is False


def test_run_focus_job_goes_to_the_agents_queue():
    assert tasks.run_focus_job.queue == "agents"
