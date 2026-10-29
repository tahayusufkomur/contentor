"""The post job (G2 of docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md):
the review step's drafting for a blog post. The blog generator writes the post
in one call (apps.blog.ai: its prompt, its model, her blog quota, the photos
blog_generate offers); each field is written only while it is blank or still
holds what this job (or her topic's working title) put there, checked under
the record's lock right before the write, so her edit is never overwritten.
Each field written is emitted as a ``field`` event the page types in; inline
images follow the generator's own placement, with the text they belong to.
A failure leaves the post as it was, and the guide offers Try again, as for
the copy job; a refusal by the blog gate (her plan, her quota) fails the run
with its ``reason`` at once, before any model call, which the guide says in
place of Try again. A copilot run on the agents worker."""

from django.db import connection, transaction
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy

from apps.blog import ai as blog_ai
from apps.blog import curated
from apps.blog.models import BlogPost, unique_slug
from apps.core import languages
from apps.core.copilot import runs
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs, kinds

FIELDS = ("title", "excerpt", "body_html", "meta_description", "tags")
# Her length answer in the generator's words; "standard" is its own 800-1200.
LENGTHS = {"short": "Keep it short: about 500 words in 3-4 sections.", "long": "Make it long: about 1,400 words."}
KEPT = gettext_lazy("You changed the text, so I left it; the title and summary are new.")
ALL_KEPT = gettext_lazy("You changed all of it, so I left it as it is.")
SOME_KEPT = gettext_lazy("You changed some of it, so I left those parts as you wrote them.")
# The blog gate's no, in the dock (the guide's focus.kinds.post.refused.* say the same).
REFUSED = {
    "upgrade_required": gettext_lazy("Writing posts for you is on a paid plan. Write it yourself, or upgrade."),
    "quota_exhausted": gettext_lazy("You're out of AI posts for this month. Write it yourself, or upgrade for more."),
}
UNAVAILABLE = gettext_lazy("AI writing is unavailable right now. Write it yourself.")
# "You decide" on the topic with no topic idea left (kinds/post.py ``sync``): never a post on "New post".
ANY_TOPIC = "a topic her students would want to read, from what her site is about"


def start(creation, instruction: str = "") -> CopilotRun:
    """A queued post run, a building one stopped first (it would write over
    this one). The blog gate is asked first: refused, the run fails at once
    with its reason (the worker's claim then finds nothing to do), so no run
    starts that can only fail, and the dock says why, so what she typed has
    its answer. Call on the locked creation, inside the writing transaction."""
    from .flow import _chat_append

    pk = jobs.run_id(creation, "post")
    if pk is not None:
        runs.stop(pk)  # a finished one is left as it is
    run = jobs.queue(creation, "post", specialist="marketing", instruction=instruction)
    if reason := blog_ai.availability(connection.tenant)["reason"]:
        runs.finish(run.id, False, {"reason": reason})
        _chat_append(creation, [{"role": "assistant", "text": str(REFUSED.get(reason, UNAVAILABLE))}])
    return run


def _gone(creation, record) -> bool:
    """Nothing to write on: the post deleted, focus mode over, or it went live."""
    return record is None or creation.status != "active" or record.status != "draft"


def carry_out(tenant, run_id) -> None:
    from .flow import DELEGATE, _chat_append, decided, draft_title

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
    step = {"specialist": run.specialist, "label": _("Writing your post")}
    runs.emit(run_id, "step", {**step, "state": "start"})
    answers, brief = creation.answers or {}, creation.brief or {}
    topic = str(answers.get("topic") or "")
    adapter = kinds.get(creation.kind)
    subject = topic if topic and topic != DELEGATE else record.title
    subject = ANY_TOPIC if subject in kinds.new_titles(creation.kind) else subject
    notes = str(brief.get("notes") or "")
    # Her follow-up answers too (the flow asks one before the drafting when it is needed).
    answered = [f"{f['question']} {f['answer']}" for f in brief.get("followups") or [] if not decided(f)]
    words = [instruction, LENGTHS.get(answers.get("length"), ""), notes and f"Her notes: {notes}", *answered]
    draft = blog_ai.generate_counted(
        tenant,
        blog_ai.brief_for_current_tenant(),
        subject,
        "\n".join(w for w in words if w),
        photos=blog_ai.photos_for(subject),
        label="contentor:copilot",  # she waits at the review
        language=languages.site_language(),
    ).fields
    draft["cover_photo_id"] = ""  # the cover is her pick at the cover step
    # Its catalog photos are copied into her storage before the locks, so a slow catalog never holds her
    # autosave, Stop or taps: only while the text is still the job's to write (decided again below).
    shown = BlogPost.objects.filter(pk=record.pk).values_list("body_html", flat=True).first()
    wrote = ((FocusCreation.objects.get(pk=creation.pk).drafted or {}).get("post") or {}).get("body_html")
    early = (
        bool(draft["body_html"])
        and shown is not None
        and draft["body_html"] != shown
        and (not shown.strip() or shown == wrote)
    )
    if early:
        curated.resolve_curated_photo_ids(draft)
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
        fields, kept = {}, []
        for name in FIELDS:
            current = getattr(record, name)
            blank = not str(current or "").strip()
            ours = blank or current == wrote.get(name) or (name == "title" and current == working)
            if not draft[name] or draft[name] == current:
                continue
            if ours:
                fields[name] = draft[name]
            else:
                kept.append(name)  # hers: left as she wrote it
        extra = {}
        if "body_html" in fields:  # its inline images and model go with the text, never onto hers
            if not early:  # hers became the job's to write while it wrote (she emptied it): copied here
                curated.resolve_curated_photo_ids(draft)
            extra = {"image_placements": draft["image_placements"], "ai_model": draft["ai_model"]}
        if "title" in fields and adapter.placeholder().fullmatch(record.slug):
            # Its own address before any publish (the page's, the assistant's): never /blog/new-post-N.
            extra["slug"] = unique_slug(fields["title"], exclude_pk=record.pk)
        if fields:
            BlogPost.objects.filter(pk=record.pk).update(**fields, **extra)
        locked.drafted = {**drafted, "post": {**wrote, **fields}}
        locked.save(update_fields=["drafted", "updated_at"])
        shown = adapter.payload(record)  # the page's key for it, as the copy job's: "post:<id>"
        key = f"{shown.get('kind', locked.kind)}:{shown['id']}"
        for name, value in fields.items():
            runs.emit(run_id, "field", {"record": key, "name": name, "value": value})
        # What she sees of her own edits: KEPT is only true while the title and summary are the job's.
        if not kept:
            said = ""
        elif not fields:
            said = str(ALL_KEPT)
        elif "body_html" in kept and {"title", "excerpt"} <= set(fields):
            said = str(KEPT)
        else:
            said = str(SOME_KEPT)
        if said:
            _chat_append(locked, [{"role": "assistant", "text": said}])
    runs.emit(run_id, "step", {**step, "state": "done"})
    runs.finish(run_id, True, {"fields": list(fields), **({"text": said} if said else {})})
