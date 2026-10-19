"""Marketing's announcement (spec §5 step 6, team spec T12): once she publishes
with "Tell my students", the Marketing Specialist drafts a short announcement
from her own words. It lands as a draft in Messages with a proposed send time;
it is only ever scheduled by her tap (flow.decide_announcement), never sent here.
A copilot run on the agents worker, which she waits on."""

import html
import json
from datetime import datetime, timedelta
from functools import cache

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone
from django.utils.html import escape, strip_tags
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs, kinds

LABEL = "Writing your announcement"
MAX_TOKENS = 2000
SEND_HOUR = 10
# Static per kind, byte-identical across tenants (prompt caching); ``{noun}`` is the kind's word.
SYSTEM = (
    "Write the announcement that tells a coach's students her new {noun} is live: a short title and "
    "2–4 plain sentences on what the {noun} is and who it is for. Use only the {noun} title, its "
    "description and the coach's own words. Never invent a claim, a result or a number. Plain text, "
    "no markdown."
)


@cache
def system_for(kind: str) -> str:
    return SYSTEM.replace("{noun}", kinds.get(kind).NOUN)


class AnnouncementDraft(BaseModel):
    title: str
    body: str


def send_time(now: datetime, zone) -> datetime:
    """The next 10:00 on her wall clock that is at least an hour away."""
    at = now.astimezone(zone).replace(hour=SEND_HOUR, minute=0, second=0, microsecond=0)
    if at < now + timedelta(hours=1):  # compared as instants: the zones differ
        at += timedelta(days=1)
    return at


def start(creation) -> CopilotRun:
    """Its kind's ANNOUNCER drafts it. Call on the locked creation, inside the
    writing transaction."""
    return jobs.queue(creation, "announce", specialist=kinds.get(creation.kind).ANNOUNCER)


def carry_out(tenant, run_id) -> None:
    from apps.core.copilot import content
    from apps.core.copilot.engine import _tenant_zone

    run = CopilotRun.objects.get(pk=run_id)
    creation = FocusCreation.objects.get(pk=(run.request or {}).get("focus"))
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    adapter = kinds.get(creation.kind)
    record = adapter.record(creation.record_id)
    if record is None:  # deleted since it went live: the run fails, she can skip it
        raise LookupError("focus announce: the record is gone")
    facts = adapter.announce_facts(record)
    step = {"specialist": run.specialist, "label": LABEL}
    runs.emit(run_id, "step", {**step, "state": "start"})
    brief = creation.brief or {}
    turn = {
        facts["what"]: facts["title"],  # "course": its title, as the course's turn has always said it
        "description": facts["description"],
        **({"when": facts["when"]} if facts["when"] else {}),
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
    }
    try:
        parsed, cost, _model = core_ai.structured(
            system=system_for(creation.kind),
            user=json.dumps(turn, ensure_ascii=False),
            output_model=AnnouncementDraft,
            model=settings.COPILOT_MODEL,
            max_tokens=MAX_TOKENS,
            label="contentor:copilot",
            effort="low",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(tenant.schema_name, cost)
    send_at = send_time(timezone.now(), _tenant_zone(tenant))
    with transaction.atomic():
        # The creation first, then the run: the order her requests lock them in.
        FocusCreation.objects.select_for_update().filter(pk=creation.pk).first()
        if not jobs.active(run_id):  # Stop won while the model wrote: no draft
            return
        made = content.create_announcement_draft(
            creation.actor,
            {
                "title": parsed.title,
                "body_html": f"<p>{escape(parsed.body.strip())}</p>",
                "link": facts["link"],
            },
        )
        runs.emit(run_id, "step", {**step, "state": "done"})
        runs.finish(run_id, True, {"announcement": made["id"], "send_at": send_at.isoformat()})


def draft(creation):
    """The announcement the run drafted and its send time, or (None, None)
    while there is none (still writing, failed, or deleted from Messages).
    A send time under an hour away (she came back later) moves to the next
    one, so Schedule never sends at once and the screen shows what it schedules."""
    from apps.core.copilot.engine import _tenant_zone
    from apps.notifications.models import Announcement

    pk = jobs.run_id(creation, "announce")
    if pk is None or jobs.status(creation, "announce") != "ready":
        return None, None
    result = CopilotRun.objects.filter(pk=pk).values_list("result", flat=True).first() or {}
    row = Announcement.objects.filter(pk=result.get("announcement"), status="draft").first()
    if row is None:
        return None, None
    send_at, now = result.get("send_at"), timezone.now()
    if not send_at or datetime.fromisoformat(send_at) < now + timedelta(hours=1):
        send_at = send_time(now, _tenant_zone(connection.tenant)).isoformat()
    return row, send_at


def decided(creation):
    """Her draft, once she scheduled or sent it from Messages herself; None
    while it is still a draft, or there is none."""
    from apps.notifications.models import Announcement

    pk = jobs.run_id(creation, "announce")
    result = (CopilotRun.objects.filter(pk=pk).values_list("result", flat=True).first() or {}) if pk else {}
    if not result.get("announcement"):
        return None
    return Announcement.objects.filter(pk=result["announcement"]).exclude(status="draft").first()


def payload(creation) -> dict | None:
    """The guide's announce step: "failed" too when its draft is gone, so she
    can try again or skip it. None before it was queued. ``zone`` is her site's
    time zone, so the guide shows the send time as the closing line says it."""
    from apps.core.copilot.engine import _tenant_zone

    pk = jobs.run_id(creation, "announce")
    if pk is None:
        return None
    status = jobs.status(creation, "announce")
    row, send_at = draft(creation)
    if status == "ready" and row is None:
        status = "failed"
    return {
        "status": status,
        "run": pk,
        "id": row.id if row else None,
        "title": row.title if row else "",
        "body": html.unescape(strip_tags(row.body)).strip() if row else "",
        "send_at": send_at,
        "zone": _tenant_zone(connection.tenant).key if send_at else None,
    }
