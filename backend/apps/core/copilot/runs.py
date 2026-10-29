"""Runs: one piece of the team's work (spec §6.2 of
docs/superpowers/specs/2026-10-17-agent-team-studio-design.md).

Her message starts a run; the agents worker carries it out (``execute``) and
appends events the studio polls. Stop marks the run stopped: a model call
already under way finishes and its result is dropped. A run nobody finishes
(a worker that died mid-deploy, no worker at all) is failed the next time
someone reads it (``sweep``), so the studio never spins forever."""

import json
import logging
from datetime import timedelta
from decimal import Decimal

from django.db import connection, transaction
from django.db.models import Max, Q
from django.utils import timezone, translation
from django_tenants.utils import tenant_context
from rest_framework.utils.encoders import JSONEncoder

from apps.core import ai as core_ai
from apps.core import languages, tasks
from apps.core.copilot import context as page_context
from apps.core.copilot import engine, tokens
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotChat, CopilotRun, CopilotRunEvent

logger = logging.getLogger(__name__)

ACTIVE = ("queued", "thinking", "working")
TERMINAL = ("done", "stopped", "failed")
KEEP = timedelta(days=14)
QUEUED_STALE = timedelta(minutes=3)
WORKING_STALE = timedelta(minutes=10)
OPEN_WINDOW = timedelta(hours=24)
SUMMARY_MAX = 160


def start(user, *, message, transcript, selections, attachments, context, specialist, chat_id):
    """A queued run for her message, handed to the agents worker once the row
    is committed. Call inside her tenant's context."""
    now = timezone.now()
    CopilotRun.objects.filter(created_at__lt=now - KEEP).delete()
    chat = CopilotChat.objects.filter(pk=chat_id).first() if isinstance(chat_id, int) else None
    run = CopilotRun.objects.create(
        actor=user if getattr(user, "pk", None) else None,
        chat=chat,
        specialist=specialist,
        request={
            "message": message,
            "transcript": transcript,
            "selections": selections,
            "attachments": attachments,
            "context": context,
        },
    )
    schema = connection.schema_name
    transaction.on_commit(lambda: tasks.run_copilot.delay(schema, run.id))
    return run


def emit(run_id, kind, data=None):
    """Append one event to a run; returns its number."""
    with transaction.atomic():
        run = CopilotRun.objects.select_for_update().get(pk=run_id)
        return _append(run, kind, data)


def stop(run_id):
    """Stop a run that is still going; a finished one is left as it is.
    Returns the run's status afterwards (None for an unknown run)."""
    with transaction.atomic():
        run = CopilotRun.objects.select_for_update().filter(pk=run_id).first()
        if run is None:
            return None
        if run.status in ACTIVE:
            _finish(run, "stopped")
            _append(run, "stopped")
        return run.status


def execute(schema_name, run_id):
    """The agents worker's job: one copilot turn, recorded as events."""
    from apps.core.models import Tenant

    tenant = Tenant.objects.filter(schema_name=schema_name).first()
    if tenant is None:
        return
    with tenant_context(tenant):
        claimed = CopilotRun.objects.filter(pk=run_id, status="queued").update(
            status="thinking", updated_at=timezone.now()
        )
        if not claimed:  # stopped, swept, or a second delivery of the task
            return
        run = CopilotRun.objects.get(pk=run_id)
        emit(run_id, "thinking", {"specialist": run.specialist})
        req = run.request or {}
        payload, cost = None, Decimal("0")
        # The cards and refusals she reads are in her language (the lazy ones resolve in _settle).
        with translation.override(languages.creator_language(run.actor)):
            try:
                # Its cards stay usable as long as the reply can be opened.
                with tokens.lasting(int((OPEN_WINDOW + timedelta(hours=1)).total_seconds())):
                    payload, cost = engine.run_turn(
                        tenant,
                        req.get("transcript") or [],
                        req.get("selections") or [],
                        req.get("message") or "",
                        req.get("attachments") or [],
                        page_context.clean(tenant, req.get("context")),
                        specialist=run.specialist,
                        actor=run.actor,
                    )
            except core_ai.AiError as exc:
                cost = getattr(exc, "cost_usd", None) or Decimal("0")
                logger.exception("copilot run failed schema=%s run=%s", schema_name, run_id)
            except Exception:
                logger.exception("copilot run failed schema=%s run=%s", schema_name, run_id)
            finally:
                ai_compose.record_spend(schema_name, cost)
            _settle(run_id, payload)


def claim(run_id):
    """Take a queued run for the worker; False when it was already taken,
    stopped or swept (a second delivery of the task does nothing)."""
    return bool(
        CopilotRun.objects.filter(pk=run_id, status="queued").update(status="working", updated_at=timezone.now())
    )


def finish(run_id, ok, data=None):
    """End a run another job carried out (not a copilot turn): done with
    ``data`` as its result, or failed. A stopped or swept run stays as it is."""
    with transaction.atomic():
        run = CopilotRun.objects.select_for_update().get(pk=run_id)
        if run.status not in ACTIVE:
            return
        run.result = data or {}
        _finish(run, "done" if ok else "failed")
        _append(run, "done" if ok else "failed", data)


def sweep(qs):
    """Fail the runs in ``qs`` that nobody is advancing any more."""
    now = timezone.now()
    stale = qs.filter(
        Q(status="queued", created_at__lt=now - QUEUED_STALE)
        | Q(status__in=("thinking", "working"), updated_at__lt=now - WORKING_STALE)
    )
    for run_id in stale.values_list("pk", flat=True):
        with transaction.atomic():
            run = CopilotRun.objects.select_for_update().get(pk=run_id)
            if run.status in ACTIVE:
                _finish(run, "failed")
                _append(run, "failed", {"reason": "stale"})


def as_dict(run, since=0):
    return {
        "id": run.id,
        "status": run.status,
        "specialist": run.specialist,
        "chat": run.chat_id,
        "created_at": run.created_at,
        "finished_at": run.finished_at,
        "seen": run.seen_at is not None,
        "events": [
            {"seq": e.seq, "type": e.type, "data": e.data, "at": e.created_at} for e in run.events.filter(seq__gt=since)
        ],
    }


def open_for(user):
    """Her runs still going, and the ones finished in the last day that she
    has not looked at yet."""
    since = timezone.now() - OPEN_WINDOW
    qs = CopilotRun.objects.filter(actor=user).filter(
        Q(status__in=ACTIVE) | Q(status__in=TERMINAL, finished_at__gte=since, seen_at__isnull=True)
    )
    return [
        {
            "id": run.id,
            "status": run.status,
            "specialist": run.specialist,
            "chat": run.chat_id,
            "summary": str((run.result or {}).get("text") or "")[:SUMMARY_MAX],
            "finished_at": run.finished_at,
        }
        for run in qs
    ]


def _append(run, kind, data=None):
    """Next event of a run whose row the caller holds locked."""
    seq = (run.events.aggregate(top=Max("seq"))["top"] or 0) + 1
    # (a step's label is a lazy translation: stored in the language of the run)
    CopilotRunEvent.objects.create(
        run=run, seq=seq, type=kind, data=json.loads(json.dumps(data or {}, cls=JSONEncoder))
    )
    CopilotRun.objects.filter(pk=run.pk).update(updated_at=timezone.now())
    return seq


def _finish(run, status):
    run.status = status
    run.finished_at = run.updated_at = timezone.now()
    run.save(update_fields=["status", "result", "finished_at", "updated_at"])


def _settle(run_id, payload):
    """The turn's outcome, written in one go so a poll sees all of it or none."""
    with transaction.atomic():
        run = CopilotRun.objects.select_for_update().get(pk=run_id)
        if run.status not in ACTIVE:  # Stop (or the sweep) won: drop the result
            return
        if payload is None:
            _finish(run, "failed")
            _append(run, "failed")
            return
        # The same JSON the converse stream sends (UUIDs, Decimals, datetimes).
        run.result = json.loads(json.dumps(payload, cls=JSONEncoder))
        _finish(run, "done")
        _append(run, "reply", {"payload": run.result})
        _append(run, "done")
