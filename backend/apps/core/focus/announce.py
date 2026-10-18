"""Marketing's announcement (spec §5 step 6, team spec T12): once she publishes
with "Tell my students", the Marketing Specialist drafts a short announcement
from her own words. It lands as a draft in Messages with a proposed send time;
it is only ever scheduled by her tap (flow.decide_announcement), never sent here.
A copilot run on the agents worker, which she waits on."""

import html
import json
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape, strip_tags
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs

STEP = {"specialist": "marketing", "label": "Writing your announcement"}
MAX_TOKENS = 2000
SEND_HOUR = 10
SYSTEM = (
    "Write the announcement that tells a coach's students her new course is live: a short title and "
    "2–4 plain sentences on what the course is and who it is for. Use only the course title, its "
    "description and the coach's own words. Never invent a claim, a result or a number. Plain text, "
    "no markdown."
)


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
    """Call on the locked creation, inside the writing transaction."""
    return jobs.queue(creation, "announce", specialist="marketing")


def carry_out(tenant, run_id) -> None:
    from apps.core.copilot import content
    from apps.core.copilot.engine import _tenant_zone
    from apps.courses.models import Course

    request = CopilotRun.objects.get(pk=run_id).request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    course = Course.objects.get(pk=creation.record_id)
    runs.emit(run_id, "step", {**STEP, "state": "start"})
    brief = creation.brief or {}
    turn = {
        "course": course.title,
        "description": course.description,
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
    }
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM,
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
        if not jobs.active(run_id):  # Stop won while the model wrote: no draft
            return
        made = content.create_announcement_draft(
            creation.actor,
            {
                "title": parsed.title,
                "body_html": f"<p>{escape(parsed.body.strip())}</p>",
                "link": f"/courses/{course.slug}",
            },
        )
        runs.emit(run_id, "step", {**STEP, "state": "done"})
        runs.finish(run_id, True, {"announcement": made["id"], "send_at": send_at.isoformat()})


def draft(creation):
    """The announcement the run drafted and its send time, or (None, None)
    while there is none (still writing, failed, or deleted from Messages)."""
    from apps.notifications.models import Announcement

    pk = jobs.run_id(creation, "announce")
    if pk is None or jobs.status(creation, "announce") != "ready":
        return None, None
    result = CopilotRun.objects.filter(pk=pk).values_list("result", flat=True).first() or {}
    row = Announcement.objects.filter(pk=result.get("announcement"), status="draft").first()
    return (row, result.get("send_at")) if row else (None, None)


def payload(creation) -> dict | None:
    """The guide's announce step: "failed" too when its draft is gone, so she
    can try again or skip it. None before it was queued."""
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
    }
