"""One batch of generated logo candidates, start to stored rows.

start_batch() is called from the interview (milestones) and the "three
more" endpoint; run_batch() runs inside the Celery task, in tenant
context. Every failure path ends in wizard_state["logo_batch"]["state"]
being "ready" (>= 1 candidate) or "failed"; nothing raises past here."""

import io
import logging
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.core import ai as core_ai
from apps.tenant_config import logo_vector

from . import brief as lb
from . import gates

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=15)
_PNG = "image/png"


def _batch_of(wizard_state):
    batch = dict((wizard_state or {}).get("logo_batch") or {})
    if batch.get("state") == "building":
        started = parse_datetime(str(batch.get("started_at") or "")) if batch.get("started_at") else None
        if started is None or timezone.now() - started > STALE_AFTER:
            batch["state"] = "failed"
    return batch


def batch_state(tenant):
    return _batch_of(tenant.wizard_state)


def _write_batch(tenant, **fields):
    tenant.refresh_from_db(fields=["wizard_state"])
    state = dict(tenant.wizard_state or {})
    state["logo_batch"] = {**(state.get("logo_batch") or {}), **fields}
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])


def start_batch(tenant, *, more=False):
    """Begin a batch -> its id, or None when generation is off or one is
    already building. The check and the write share one row lock."""
    if not settings.LOGO_GEN_ENABLED:
        return None
    from apps.core.models import Tenant

    with transaction.atomic():
        row = Tenant.objects.select_for_update().get(pk=tenant.pk)
        current = _batch_of(row.wizard_state)
        if current.get("state") == "building":
            return None
        batch_id = secrets.token_hex(6)
        state = dict(row.wizard_state or {})
        state["logo_batch"] = {
            "id": batch_id,
            "state": "building",
            "started_at": timezone.now().isoformat(),
            "more": more,
            "prev": current.get("id") or "",
            "defects": current.get("defects") or [],
        }
        row.wizard_state = state
        row.save(update_fields=["wizard_state"])
        tenant.wizard_state = state
        from apps.core import tasks

        tenant_id = tenant.id
        transaction.on_commit(lambda: tasks.generate_logo_candidates.delay(tenant_id, batch_id))
    return batch_id


def _store_png(tenant, batch_id, name, data):
    from apps.core.platform.uploads import _store_object
    from apps.core.storage import build_s3_path
    from apps.media.models import Photo

    key = build_s3_path("logo-candidates", batch_id, name)
    _store_object(key, io.BytesIO(data), _PNG)
    return Photo.objects.create(s3_key=key, title="Logo candidate", content_type=_PNG, file_size=len(data))


def _generate_hub(tenant, batch_id, position, prompt):
    """-> (png bytes | None, reason, hub_path, cost). Never raises."""
    path = f"logo-candidates/{tenant.schema_name}/{batch_id}/cand_{position}.png"
    try:
        run_id = core_ai.agentc_image_run(prompt, path, label="contentor:logo-gen")
    except core_ai.AiError as exc:
        logger.warning("logo gen %s/%s: hub run failed: %s", batch_id, position, exc)
        return None, "hub", path, 0
    try:
        return core_ai.agentc_run_file(run_id, path), "", path, 0
    except core_ai.AiError as exc:
        logger.warning("logo gen %s/%s: file fetch failed: %s", batch_id, position, exc)
        return None, "fetch", path, 0


def _generate_api(prompt):
    """-> (png bytes | None, reason, "", cost). Never raises. The cost is
    recorded by the caller: this runs in a worker thread, the ORM does not."""
    from apps.tenant_config import logo_image

    png, cost = logo_image._generate_one(prompt)
    return png, ("" if png else "api"), "", cost


def _round(tenant, batch_id, brief, concepts, use_api):
    """Generate, fetch, vectorize, gate one round -> list of candidate dicts."""
    from apps.tenant_config.models import LogoCandidate

    prompts = [lb.image_prompt(brief, c) for c in concepts]
    rows = [
        LogoCandidate(
            batch=batch_id,
            position=i + 1,
            concept=c.concept,
            archetype=c.archetype,
            prompt=p,
            source="api" if use_api else "hub",
        )
        for i, (c, p) in enumerate(zip(concepts, prompts, strict=False))
    ]
    gen = (
        (lambda r: _generate_api(r.prompt))
        if use_api
        else (lambda r: _generate_hub(tenant, batch_id, r.position, r.prompt))
    )
    with ThreadPoolExecutor(max_workers=len(rows)) as pool:
        results = list(pool.map(gen, rows))
    survivors = []
    if use_api:
        from apps.tenant_config import logo_ai

        logo_ai.record_attempt_cost(tenant.schema_name, sum(r[3] for r in results))
    for row, (png, reason, hub_path, _cost) in zip(rows, results, strict=False):
        if not png:
            row.state, row.reject_reason = "rejected", reason
            continue
        row.png = _store_png(tenant, batch_id, f"cand_{row.position}.png", png)
        row.vector = logo_vector.vectorize(png, brief.palette)
        if row.vector is None:
            row.state, row.reject_reason = "rejected", "vector"
            continue
        if not gates.margin_ok(png, brief.palette["background"]):
            row.state, row.reject_reason = "rejected", "margin"
            continue
        icon = logo_vector.icon_crop(png, brief.palette)
        if icon:
            row.icon = _store_png(tenant, batch_id, f"icon_{row.position}.png", icon)
        survivors.append((row, png, hub_path))
    # read-back: one vision run for the whole round (hub), or per-image API calls (fallback)
    if survivors:
        seen = {}
        if use_api:
            from apps.tenant_config import logo_image

            seen = {hub_path or f"api:{row.position}": logo_image.read_text(png) for row, png, hub_path in survivors}
        else:
            try:
                reply = core_ai.agentc_vision_run(
                    gates.read_back_prompt([p for _, _, p in survivors], brief.brand), label="contentor:logo-readback"
                )
                seen = gates.parse_read_back(reply)
            except core_ai.AiError as exc:
                logger.warning("logo gen %s: read-back failed: %s", batch_id, exc)
        kept = []
        for row, _png, hub_path in survivors:
            key = hub_path or f"api:{row.position}"
            if gates.text_ok(seen.get(key), brief.brand):
                kept.append((row, hub_path))
            else:
                row.state, row.reject_reason = "rejected", "read_back"
        survivors = kept
    for row in rows:
        row.save()
    return [row for row, _ in survivors], {row.pk: hub_path for row, hub_path in survivors}


def _judge(tenant, brief, survivors, paths, use_api):
    """Rank survivors in place (rank, judge_reason) -> defect list for the next round."""
    if len(survivors) < 2 or use_api:
        for i, row in enumerate(sorted(survivors, key=lambda r: r.position), 1):
            row.rank = i
            row.save(update_fields=["rank"])
        return []
    files = [paths[r.pk] for r in survivors]
    try:
        reply = core_ai.agentc_vision_run(
            gates.judge_prompt(files, brief.brand, brief.business, brief.mood), label="contentor:logo-judge"
        )
        verdict = gates.parse_judge(reply, len(survivors))
    except core_ai.AiError as exc:
        logger.warning("logo judge failed: %s", exc)
        verdict = gates.parse_judge("", len(survivors))
    for rank, n in enumerate(verdict["ranking"], 1):
        row = survivors[n - 1]
        row.rank, row.judge_reason = rank, verdict["reasons"].get(n, "")
        row.save(update_fields=["rank", "judge_reason"])
    return [d for n in verdict["defects"] for d in verdict["defects"][n]]


def run_batch(tenant, batch_id):
    from apps.tenant_config import interview_brief

    answers = interview_brief.answers_of(tenant)
    current = batch_state(tenant)
    brief = lb.logo_brief(tenant, answers)
    count = settings.LOGO_GEN_CANDIDATES
    avoid, defects = [], list(current.get("defects") or [])
    use_api = False
    try:
        for _attempt in range(2):
            concepts = lb.concepts_for(brief, count=count, avoid=avoid, defects=defects)
            survivors, paths = _round(tenant, batch_id, brief, concepts, use_api)
            if not survivors and not use_api and _hub_refused(tenant, batch_id) and settings.GEMINI_API_KEY:
                use_api = True
                survivors, paths = _round(tenant, batch_id, brief, concepts, use_api)
            if survivors:
                defects = _judge(tenant, brief, survivors, paths, use_api)
                _write_batch(tenant, state="ready", defects=defects[:6])
                return
            avoid += [c.concept for c in concepts]
    except Exception:  # the task must always leave a terminal state
        logger.exception("logo gen %s crashed", batch_id)
    _write_batch(tenant, state="failed")


def _hub_refused(tenant, batch_id):
    """Every row of this batch so far was rejected before a file existed."""
    from apps.tenant_config.models import LogoCandidate

    reasons = set(LogoCandidate.objects.filter(batch=batch_id).values_list("reject_reason", flat=True))
    return reasons and reasons <= {"hub"}
