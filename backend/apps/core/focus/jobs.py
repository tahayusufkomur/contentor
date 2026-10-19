"""One worker task for every focus job (outline, analysis, descriptions, ...).
``queue`` records a job's run on the creation and hands it to the agents
worker; ``execute`` claims it and calls its handler module's ``carry_out``.
A handler module may define ``on_failure(tenant, run_id)``, called when its
``carry_out`` raises, before the run is failed. Call inside her tenant's context."""

import logging
from importlib import import_module

from django.db import connection, transaction
from django_tenants.utils import tenant_context

from apps.core.copilot import runs
from apps.tenant_config.models import CopilotRun

logger = logging.getLogger(__name__)

# Job name to the module whose ``carry_out(tenant, run_id)`` does it.
HANDLERS = {
    "outline": "apps.core.focus.outline",
    "analysis": "apps.core.focus.analysis",
    "descriptions": "apps.core.focus.descriptions",
    "covers": "apps.core.focus.covers",
    "announce": "apps.core.focus.announce",
    "followup": "apps.core.focus.followup",
}
STATUS = {
    "queued": "building",
    "thinking": "building",
    "working": "building",
    "done": "ready",
    "stopped": "failed",
    "failed": "failed",
}


def queue(creation, job: str, *, specialist: str, **request) -> CopilotRun:
    """A queued run of ``job`` for the creation, handed to the agents worker
    once the row is committed. The outline keeps its own field; every other
    job's latest run id goes in ``creation.runs``."""
    from apps.core import tasks

    run = CopilotRun.objects.create(
        actor=creation.actor,
        chat=creation.chat,
        specialist=specialist,
        request={"focus": creation.id, "job": job, **request},
    )
    if job == "outline":
        creation.outline_run = run
        creation.save(update_fields=["outline_run", "updated_at"])
    else:
        creation.runs = {**(creation.runs or {}), job: run.id}
        creation.save(update_fields=["runs", "updated_at"])
    schema = connection.schema_name
    transaction.on_commit(lambda: tasks.run_focus_job.delay(schema, run.id))
    return run


def run_id(creation, job: str) -> int | None:
    if job == "outline":
        return creation.outline_run_id
    return (creation.runs or {}).get(job)


def status(creation, job: str) -> str:
    """idle | building | ready | failed, from the job's run. A run nobody is
    advancing is failed here, so the guide never waits forever."""
    pk = run_id(creation, job)
    if pk is None:
        return "idle"
    runs.sweep(CopilotRun.objects.filter(pk=pk))
    current = CopilotRun.objects.filter(pk=pk).values_list("status", flat=True).first()
    return STATUS.get(current, "idle")


def active(run_id: int) -> bool:
    """Whether the run is still in flight (Stop has not won). Locks the run, so
    call it inside the transaction that writes."""
    current = CopilotRun.objects.select_for_update().filter(pk=run_id).values_list("status", flat=True).first()
    return current in runs.ACTIVE


def execute(schema_name, run_id) -> None:
    from apps.core.models import Tenant

    tenant = Tenant.objects.filter(schema_name=schema_name).first()
    if tenant is None:
        return
    with tenant_context(tenant):
        if not runs.claim(run_id):  # stopped, swept, or a second delivery of the task
            return
        handler = None
        try:
            job = (CopilotRun.objects.get(pk=run_id).request or {}).get("job")
            handler = import_module(HANDLERS[job])
            handler.carry_out(tenant, run_id)
        except Exception:
            logger.exception("focus job failed schema=%s run=%s", schema_name, run_id)
            try:
                if hasattr(handler, "on_failure"):
                    handler.on_failure(tenant, run_id)
            except Exception:
                logger.exception("focus job on_failure failed schema=%s run=%s", schema_name, run_id)
            runs.finish(run_id, False)
