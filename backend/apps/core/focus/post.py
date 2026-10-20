"""The post job (G2 of docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md):
the review step's drafting for a blog post. The blog generator writes the post
in one call (apps.blog.ai: its prompt, its model, her blog quota, the photos
blog_generate offers); each field is written only while it is blank or still
holds what this job (or her topic's working title) put there, checked under
the record's lock right before the write, so her edit is never overwritten.
Each field written is emitted as a ``field`` event the page types in; inline
images follow the generator's own placement, with the text they belong to.
A failure leaves the post as it was, and the guide offers Try again, as for
the copy job. A copilot run on the agents worker."""

from django.db import transaction

from apps.blog import ai as blog_ai
from apps.blog import curated
from apps.blog.models import BlogPost
from apps.core.copilot import runs
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs

FIELDS = ("title", "excerpt", "body_html", "meta_description", "tags")
# Her length answer in the generator's words; "standard" is its own 800-1200.
LENGTHS = {"short": "Keep it short: about 500 words in 3-4 sections.", "long": "Make it long: about 1,400 words."}
KEPT = "You changed the text, so I left it; the title and summary are new."


def start(creation, instruction: str = "") -> CopilotRun:
    """A queued post run, a building one stopped first (it would write over
    this one). Call on the locked creation, inside the writing transaction."""
    pk = jobs.run_id(creation, "post")
    if pk is not None:
        runs.stop(pk)  # a finished one is left as it is
    return jobs.queue(creation, "post", specialist="marketing", instruction=instruction)


def _gone(creation, record) -> bool:
    """Nothing to write on: the post deleted, focus mode over, or it went live."""
    return record is None or creation.status != "active" or record.status != "draft"


def carry_out(tenant, run_id) -> None:
    from apps.blog.views import _brief_for_current_tenant, _photos_for

    from .flow import DELEGATE, _chat_append, draft_title

    run = CopilotRun.objects.get(pk=run_id)
    request = run.request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    instruction = str(request.get("instruction") or "")
    record = BlogPost.objects.filter(pk=creation.record_id).first()
    if _gone(creation, record):
        runs.finish(run_id, True, {"fields": []})
        return
    if reason := blog_ai.availability(tenant)["reason"]:  # the Generate button's gate
        runs.finish(run_id, False, {"reason": reason})
        return
    step = {"specialist": run.specialist, "label": "Writing your post"}
    runs.emit(run_id, "step", {**step, "state": "start"})
    answers, brief = creation.answers or {}, creation.brief or {}
    topic = str(answers.get("topic") or "")
    subject = topic if topic and topic != DELEGATE else record.title
    notes = str(brief.get("notes") or "")
    words = [instruction, LENGTHS.get(answers.get("length"), ""), notes and f"Her notes: {notes}"]
    draft = blog_ai.generate_counted(
        tenant,
        _brief_for_current_tenant(),
        subject,
        "\n".join(w for w in words if w),
        photos=_photos_for(subject),
        label="contentor:copilot",  # she waits at the review
    ).fields
    draft["cover_photo_id"] = ""  # the cover is her pick at the cover step
    curated.resolve_curated_photo_ids(draft)  # a catalog photo it placed, copied into her storage
    with transaction.atomic():
        # The creation first, then the run, then the record: the order her requests lock them in.
        locked = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        if not jobs.active(run_id):  # Stop won while the model wrote: drop it
            return
        record = BlogPost.objects.select_for_update().filter(pk=record.pk).first()
        if _gone(locked, record):  # while the model wrote
            runs.finish(run_id, True, {"fields": []})
            return
        drafted = locked.drafted or {}
        wrote = dict(drafted.get("post") or {})
        working = draft_title(locked) if "title" not in wrote else None
        fields, hers = {}, False
        for name in FIELDS:
            current = getattr(record, name)
            blank = not str(current or "").strip()
            ours = blank or current == wrote.get(name) or (name == "title" and current == working)
            if name == "body_html" and not ours and draft[name] != current:
                hers = True
            if draft[name] and draft[name] != current and ours:
                fields[name] = draft[name]
        placements = {"image_placements": draft["image_placements"]} if "body_html" in fields else {}
        if fields:
            BlogPost.objects.filter(pk=record.pk).update(**fields, **placements)
        locked.drafted = {**drafted, "post": {**wrote, **fields}}
        locked.save(update_fields=["drafted", "updated_at"])
        for name, value in fields.items():
            runs.emit(run_id, "field", {"record": f"{locked.kind}:{record.pk}", "name": name, "value": value})
        said = KEPT if hers and fields else ""
        if said:
            _chat_append(locked, [{"role": "assistant", "text": said}])
    runs.emit(run_id, "step", {**step, "state": "done"})
    runs.finish(run_id, True, {"fields": list(fields), **({"text": said} if said else {})})
