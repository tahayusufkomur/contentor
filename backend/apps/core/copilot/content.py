"""Content-creation executors behind the copilot's create_* actions.

Each function validates through the same DRF serializer the admin surface
uses, calling it outside its viewset and injecting the server-side fields
(the wizard-content convention — see apps/core/onboarding/content.py).
Courses and blog posts land as drafts; events land as 'scheduled' because
nothing in the live app promotes a draft event after creation — the
copilot's confirmation card is the review step and states the date.
Callers wrap these in tenant_context; imports are function-local to match
apps/core's cycle-dodging convention."""

from decimal import Decimal

from django.conf import settings
from django.db import transaction


class ContentOpError(Exception):
    """User-safe message describing why a create was refused."""


_GENERIC_INVALID_MESSAGE = "Some details were invalid — could you rephrase?"


def _fail(errors):
    path = []
    current = errors
    # Nested DRF errors (e.g. a course's `modules` list) are dicts/lists of
    # dicts all the way down; walk into the first leaf so the raised message
    # is a real sentence, never a Python dict/list repr shown to a coach.
    for _ in range(5):
        if not isinstance(current, dict) or not current:
            break
        field, messages = next(iter(current.items()))
        path.append(str(field))
        current = messages[0] if isinstance(messages, list) and messages else messages
    if not isinstance(current, str):
        raise ContentOpError(_GENERIC_INVALID_MESSAGE)
    raise ContentOpError(f"{'.'.join(path)}: {current}" if path else current)


def _give_cover(item, field="thumbnail"):
    """A course, event or blog post the copilot creates arrives with a fitting
    stock photo (Pix4Less) instead of an empty cover; the coach can swap it
    like any other cover."""
    from django.db import connection

    from apps.core.curated_images.cache import auto_cover
    from apps.core.onboarding.ai_curate import CoachBrief, allowed_disciplines, off_topic, photo_query

    if getattr(item, f"{field}_id") or getattr(item, f"{field}_url", ""):
        return
    # Niche + title, then the niche alone: the catalog matches short visual
    # queries far better than a bare title. Never another discipline's photo.
    brief = CoachBrief.from_tenant(connection.tenant)
    allowed = allowed_disciplines(brief.subject, brief.description, item.title)
    photo = auto_cover(
        photo_query(brief, item.title), photo_query(brief), keep=lambda image: not off_topic(image, allowed)
    )
    if photo is not None:
        setattr(item, field, photo)
        item.save(update_fields=[field])


def _set_access(item, access, user):
    """The ways a create card carried, written once the item exists (a refusal rolls the create back)."""
    if not access:
        return
    from apps.billing import ways

    try:
        ways.set_ways(item, access, actor=user)
    except ways.WaysError as error:
        raise ContentOpError(str(error)) from error


def _set_price(item, price, user):
    """A price edit changes only the sell-once way; subscriptions and the rest stay."""
    from apps.billing import ways

    # Selling something free for everyone is a switch to paid; a price beside a windowed free way, or beside
    # plans, only adds the sell-once way.
    free = ways.ways_of(item)["free"]
    pricing_type = "paid" if free and not free["window"] and Decimal(price) > 0 else None
    try:
        ways.apply_shorthand(item, pricing_type=pricing_type, price=price, actor=user)
    except ways.WaysError as error:
        raise ContentOpError(str(error)) from error


def create_course(user, params, *, cover=True):
    """``cover=False``: the caller gives the cover later (focus mode, once the
    outline has written the real title; its first tap never waits on a search)."""
    from apps.courses.serializers import CourseCreateUpdateSerializer

    params = dict(params)
    access = params.pop("access", None)
    serializer = CourseCreateUpdateSerializer(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    with transaction.atomic():
        course = serializer.save(instructor=user, is_published=False)
        _set_access(course, access, user)
    if cover:
        _give_cover(course)
    return {
        "kind": "create_course",
        "id": course.id,
        "title": course.title,
        "url": f"/admin/courses/{course.slug}",
    }


# The four kinds of class or event: the copilot's event_kind -> (model name,
# create serializer name, admin tab, public calendar type, plain name).
EVENT_KINDS = {
    "live": ("LiveClass", "LiveClassCreateSerializer", "classes", "live_class", "live class"),
    "stream": ("LiveStream", "LiveStreamCreateSerializer", "streams", "live_stream", "live stream"),
    "zoom": ("ZoomClass", "ZoomClassCreateSerializer", "zoom", "zoom_class", "Zoom class"),
    "onsite": ("OnsiteEvent", "OnsiteEventCreateSerializer", "onsite", "onsite_event", "onsite event"),
}


def event_kind(value):
    """A stashed or model-proposed kind -> one of EVENT_KINDS ("live" otherwise)."""
    return value if value in EVENT_KINDS else "live"


def event_model(kind):
    from apps.live import models

    return getattr(models, EVENT_KINDS[event_kind(kind)][0])


def event_admin_url(kind, event_id):
    """Deep link into Classes & events: opens the kind's tab and that event's
    edit panel (see useDeepLinkedItem on the frontend)."""
    kind = event_kind(kind)
    return f"/admin/live?tab={EVENT_KINDS[kind][2]}&event={event_id}&kind={kind}"


def create_event(user, kind, params, *, cover=True):
    """``cover=False``: the caller gives the cover later (focus mode's cover step)."""
    from apps.live import serializers

    kind = event_kind(kind)
    params = dict(params)
    access = params.pop("access", None)
    serializer = getattr(serializers, EVENT_KINDS[kind][1])(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    with transaction.atomic():
        event = serializer.save(instructor=user)
        _set_access(event, access, user)
    if cover:
        _give_cover(event)
    return {
        "kind": "create_event",
        "id": event.id,
        "title": event.title,
        "url": event_admin_url(kind, event.id),
    }


_COURSE_EDIT_FIELDS = ("title", "description", "price")


def edit_course(course_id, params, *, user=None):
    from apps.courses.models import Course
    from apps.courses.serializers import CourseCreateUpdateSerializer

    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        raise ContentOpError(f"no course with id {course_id}")
    data = {k: v for k, v in params.items() if k in _COURSE_EDIT_FIELDS and v is not None}
    price = data.pop("price", None)
    if price is not None:
        price = f"{max(float(price), 0):.2f}"
    fields = [*data, *(["price"] if price is not None else [])]
    if not fields:
        raise ContentOpError("nothing to change on the course")
    old = {k: str(getattr(course, k)) for k in fields}
    serializer = CourseCreateUpdateSerializer(instance=course, data=data, partial=True)
    if not serializer.is_valid():
        _fail(serializer.errors)
    with transaction.atomic():
        course = serializer.save()
        if price is not None:
            _set_price(course, price, user)
    course.refresh_from_db()
    changes = [
        {"field": k, "old": old[k][:200], "new": str(getattr(course, k))[:200]}
        for k in fields
        if old[k] != str(getattr(course, k))
    ]
    if not changes:
        raise ContentOpError("those fields already have those values")
    return {
        "kind": "edit_course",
        "id": course.id,
        "title": course.title,
        "url": f"/admin/courses/{course.slug}",
        "changes": changes,
    }


def edit_event(event_id, kind, params, *, user=None):
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime

    kind = event_kind(kind)
    event = event_model(kind).objects.filter(pk=event_id).first()
    if event is None:
        raise ContentOpError(f"no {kind} event with id {event_id}")
    was_dated = event.scheduled_at is not None
    changes = []

    def _set(field, new):
        old = getattr(event, field)
        if str(old) == str(new):
            return
        changes.append({"field": field, "old": str(old)[:200], "new": str(new)[:200]})
        setattr(event, field, new)

    if params.get("title"):
        _set("title", str(params["title"])[:200])
    if params.get("description"):
        _set("description", str(params["description"]))
    if params.get("scheduled_at"):
        when = parse_datetime(str(params["scheduled_at"]))
        if when is None:
            raise ContentOpError("could not read the new date")
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.get_current_timezone())
        if when <= timezone.now():
            raise ContentOpError("event date must be in the future")
        _set("scheduled_at", when)
    price = None
    if params.get("price") is not None:
        price = f"{max(float(params['price']), 0):.2f}"
        if Decimal(price) == event.price:
            price = None
    if kind == "onsite" and params.get("location"):
        _set("location", str(params["location"])[:500])
    if kind == "zoom" and params.get("zoom_link"):
        from django.core.exceptions import ValidationError
        from django.core.validators import URLValidator

        link = str(params["zoom_link"]).strip()[:500]
        try:
            URLValidator(schemes=["http", "https"])(link)
        except ValidationError as exc:
            raise ContentOpError("that Zoom link is not a full web address (https://…)") from exc
        _set("zoom_link", link)
    if not changes and price is None:
        raise ContentOpError("nothing to change on the event")
    # The event form's rule (_ScheduledOnCreateMixin): an undated draft that gets a
    # date goes on the schedule; a held draft (one that had a date) stays a draft.
    if event.status == "draft" and not was_dated and event.scheduled_at:
        _set("status", "scheduled")
    with transaction.atomic():
        event.save(update_fields=[c["field"] for c in changes])
        if price is not None:
            was = f"{event.price:.2f}"
            _set_price(event, price, user)
            changes.append({"field": "price", "old": was, "new": f"{event.price:.2f}"})
    return {
        "kind": "edit_event",
        "id": event.id,
        "title": event.title,
        "url": event_admin_url(kind, event.id),
        "changes": changes,
    }


MAX_CURRICULUM_OPS = 20
MAX_NEW_LESSONS = 20


def _title(op):
    title = " ".join(str(op.get("title") or "").split())[:200]
    if not title:
        raise ContentOpError("a module or lesson needs a title")
    return title


def _kept_work(lesson):
    """A lesson the assistant must not delete: it holds a video or a student
    has progress on it."""
    return bool(lesson.video_id or lesson.video_url or lesson.progress_records.exists())


def curriculum_steps(course_id, ops):
    """Check the ops against the course as it is now -> (course, [(op, label)]).
    ``op`` is the cleaned dict edit_curriculum applies; ``label`` says it in
    plain words for the card. Raises ContentOpError on anything it will not do."""
    from apps.courses.models import Course

    course = Course.objects.filter(pk=course_id).prefetch_related("modules__lessons").first()
    if course is None:
        raise ContentOpError(f"no course with id {course_id}")
    modules = {m.id: m for m in course.modules.all()}
    lessons = {lesson.id: lesson for m in modules.values() for lesson in m.lessons.all()}

    def module_of(op):
        module = modules.get(op.get("module_id"))
        if module is None:
            raise ContentOpError("that module is not in this course")
        return module

    def lesson_of(op):
        lesson = lessons.get(op.get("lesson_id"))
        if lesson is None:
            raise ContentOpError("that lesson is not in this course")
        return lesson

    ops = list(ops)
    if len(ops) > MAX_CURRICULUM_OPS:
        # Never apply a silent subset of what was asked.
        raise ContentOpError(f"that is more than {MAX_CURRICULUM_OPS} changes at once — split it into two requests")
    steps = []
    for op in ops:
        kind = op.get("op")
        if kind == "add_module":
            title = _title(op)
            new = [" ".join(str(t).split())[:200] for t in (op.get("lessons") or [])[:MAX_NEW_LESSONS]]
            new = [t for t in new if t]
            steps.append(
                ({"op": kind, "title": title, "lessons": new}, f"Add module '{title}' with {len(new)} lesson(s)")
            )
        elif kind == "add_lesson":
            module, title = module_of(op), _title(op)
            steps.append(
                ({"op": kind, "module_id": module.id, "title": title}, f"Add lesson '{title}' to '{module.title}'")
            )
        elif kind == "rename_module":
            module, title = module_of(op), _title(op)
            steps.append(
                ({"op": kind, "module_id": module.id, "title": title}, f"Rename module '{module.title}' to '{title}'")
            )
        elif kind == "rename_lesson":
            lesson, title = lesson_of(op), _title(op)
            steps.append(
                ({"op": kind, "lesson_id": lesson.id, "title": title}, f"Rename lesson '{lesson.title}' to '{title}'")
            )
        elif kind == "remove_lesson":
            lesson = lesson_of(op)
            if _kept_work(lesson):
                raise ContentOpError(
                    f"lesson '{lesson.title}' has a video or student progress — remove it from the course page"
                )
            # Gone for the ops after it: a later rename of it is refused here,
            # on the card, not halfway through applying.
            del lessons[lesson.id]
            steps.append(({"op": kind, "lesson_id": lesson.id}, f"Remove lesson '{lesson.title}'"))
        elif kind == "remove_module":
            module = module_of(op)
            inside = [lesson for lesson in module.lessons.all() if lesson.id in lessons]
            if any(_kept_work(lesson) for lesson in inside):
                raise ContentOpError(
                    f"module '{module.title}' has lessons with a video or student progress — "
                    "remove it from the course page"
                )
            del modules[module.id]
            for lesson in inside:
                del lessons[lesson.id]
            steps.append(
                (
                    {"op": kind, "module_id": module.id},
                    f"Remove module '{module.title}' and its {len(inside)} lesson(s)",
                )
            )
        else:
            raise ContentOpError("unknown curriculum change")
    if not steps:
        raise ContentOpError("nothing to change in the curriculum")
    return course, steps


def edit_curriculum(course_id, ops):
    """Apply the card's ops, re-checked against the course as it is now (she
    may have edited it since the card was drawn). All or nothing."""
    from django.db import transaction
    from django.db.models import Max

    from apps.courses.models import Lesson, Module
    from apps.courses.serializers import LessonCreateSerializer, ModuleCreateSerializer

    course, steps = curriculum_steps(course_id, ops)

    def save(serializer, **extra):
        if not serializer.is_valid():
            _fail(serializer.errors)
        return serializer.save(**extra)

    def next_order(queryset):
        return (queryset.aggregate(top=Max("order"))["top"] or 0) + 1

    with transaction.atomic():
        for op, _label in steps:
            kind = op["op"]
            if kind == "add_module":
                module = save(
                    ModuleCreateSerializer(data={"title": op["title"], "order": next_order(course.modules)}),
                    course=course,
                )
                for index, title in enumerate(op["lessons"], start=1):
                    save(LessonCreateSerializer(data={"title": title, "order": index}), module=module)
            elif kind == "add_lesson":
                module = Module.objects.get(pk=op["module_id"])
                save(
                    LessonCreateSerializer(data={"title": op["title"], "order": next_order(module.lessons)}),
                    module=module,
                )
            elif kind == "rename_module":
                module = Module.objects.get(pk=op["module_id"])
                save(ModuleCreateSerializer(instance=module, data={"title": op["title"]}, partial=True))
            elif kind == "rename_lesson":
                lesson = Lesson.objects.get(pk=op["lesson_id"])
                save(LessonCreateSerializer(instance=lesson, data={"title": op["title"]}, partial=True))
            elif kind == "remove_lesson":
                Lesson.objects.filter(pk=op["lesson_id"]).delete()
            else:
                Module.objects.filter(pk=op["module_id"]).delete()
    return {
        "kind": "edit_curriculum",
        "id": course.id,
        "title": course.title,
        "url": f"/admin/courses/{course.slug}",
        "changes_count": len(steps),
    }


_POST_EDIT_MAP = {"title": "title", "summary": "excerpt", "body_html": "body_html"}


def edit_blog_post(post_id, params):
    from apps.blog.models import BlogPost
    from apps.blog.serializers import BlogPostAdminSerializer

    post = BlogPost.objects.filter(pk=post_id).first()
    if post is None:
        raise ContentOpError(f"no blog post with id {post_id}")
    data = {}
    if params.get("title"):
        data["title"] = str(params["title"])[:200]
    if params.get("summary"):
        data["excerpt"] = str(params["summary"])[:300]
    if params.get("body_html"):
        data["body_html"] = str(params["body_html"])
    if params.get("cover_photo"):
        data["cover_photo"] = params["cover_photo"]
    if not data:
        raise ContentOpError("nothing to change on the post")
    old = {k: str(getattr(post, k)) for k in data}
    serializer = BlogPostAdminSerializer(instance=post, data=data, partial=True)
    if not serializer.is_valid():
        _fail(serializer.errors)
    post = serializer.save()
    changes = [
        {"field": k, "old": old[k][:200], "new": str(getattr(post, k))[:200]}
        for k in data
        if old[k] != str(getattr(post, k))
    ]
    if not changes:
        raise ContentOpError("those fields already have those values")
    return {
        "kind": "edit_blog_post",
        "id": post.id,
        "title": post.title,
        "url": f"/admin/blog/{post.id}",
        "changes": changes,
    }


def publish_course(course_id):
    from apps.courses.models import Course

    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        raise ContentOpError(f"no course with id {course_id}")
    if course.is_published:
        raise ContentOpError("that course is already published")
    if gap := course.not_ready():
        raise ContentOpError(gap)
    course.is_published = True
    course.save(update_fields=["is_published"])
    return {"kind": "publish_course", "id": course.id, "title": course.title, "url": f"/admin/courses/{course.slug}"}


def publish_blog_post(post_id):
    from django.utils import timezone

    from apps.blog.models import BlogPost

    post = BlogPost.objects.filter(pk=post_id).first()
    if post is None:
        raise ContentOpError(f"no blog post with id {post_id}")
    if post.status == "published":
        raise ContentOpError("that post is already published")
    if gap := post.not_ready():
        raise ContentOpError(gap)
    post.status = "published"
    post.published_at = timezone.now()
    post.save(update_fields=["status", "published_at"])
    return {"kind": "publish_blog_post", "id": post.id, "title": post.title, "url": f"/blog/{post.slug}"}


def create_announcement_draft(user, params):
    """Always lands as status='draft' — the send tasks in
    apps.notifications.tasks select on status='scheduled' only, so a draft
    can never be picked up and sent. The coach reviews and sends it
    themselves from Messages; the copilot never sends."""
    from apps.notifications.models import Announcement
    from apps.tenant_config.defaults import sanitize_rich_text

    title = str(params.get("title") or "").strip()[:200]
    if not title:
        raise ContentOpError("the announcement needs a title")
    row = Announcement.objects.create(
        title=title,
        body=sanitize_rich_text(str(params.get("body_html") or "")),
        link=str(params.get("link") or "")[:500],
        status="draft",
        created_by=user if getattr(user, "pk", None) else None,
    )
    return {
        "kind": "draft_announcement",
        "id": row.id,
        "title": row.title,
        # Opens the draft in the composer, ready to review and send.
        "url": f"/admin/messages/new?draft={row.id}",
    }


# ── undo of a draft the copilot created ─────────────────────────────────────

# The create kinds -> what they made. An event's model follows its event_kind.
_CREATED = {
    "create_course": "course",
    "create_event": "event",
    "create_blog_post": "post",
    "draft_announcement": "announcement",
}
UNDO_REFUSED = "it was changed, published or removed since, so nothing was deleted"


def _row_state(row):
    """Every stored field of the row and its tags/filters: any edit shows."""
    fields = {f.attname: str(getattr(row, f.attname)) for f in row._meta.concrete_fields}
    links = {f.name: sorted(getattr(row, f.name).values_list("pk", flat=True)) for f in row._meta.many_to_many}
    return fields, links


def _depended_on(row):
    """Somebody paid for it, or it sits in a bundle or a membership."""
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import BundleItem, PaymentItem, SubscriptionPlanAccess

    target = {"content_type": ContentType.objects.get_for_model(row), "object_id": row.pk}
    return any(model.objects.filter(**target).exists() for model in (PaymentItem, BundleItem, SubscriptionPlanAccess))


def _draft(what, pk, kind=None):
    """The row the copilot created, while it is still a draft nobody depends
    on -> (row, everything that says whether she touched it), else None."""
    if what == "course":
        from apps.courses.models import Course, Lesson, Module

        row = Course.objects.filter(pk=pk, is_published=False).first()
        if row is None or row.enrollments.exists() or _depended_on(row):
            return None
        modules = Module.objects.filter(course=row).order_by("id")
        lessons = Lesson.objects.filter(module__course=row).order_by("id")
        return row, (_row_state(row), [_row_state(m) for m in modules], [_row_state(lesson) for lesson in lessons])
    if what == "event":
        from django.utils import timezone

        # Its stored status only moves when she presses Start (and never for
        # a Zoom class or an in-person event): the clock says "not started".
        row = (
            event_model(kind)
            .objects.filter(pk=pk, status__in=("draft", "scheduled"), scheduled_at__gt=timezone.now())
            .first()
        )
        return (row, _row_state(row)) if row and not _depended_on(row) else None
    if what == "post":
        from apps.blog.models import BlogPost

        row = BlogPost.objects.filter(pk=pk, status="draft").first()
        return (row, _row_state(row)) if row else None
    if what == "announcement":
        from apps.notifications.models import Announcement

        row = Announcement.objects.filter(pk=pk, status="draft").first()
        return (row, _row_state(row)) if row else None
    return None


def _stamp(found):
    import hashlib

    return hashlib.sha256(repr(found[1]).encode()).hexdigest()[:16] if found else None


def created_inverse(action, result):
    """What undoing a create means: delete that draft, as long as it still
    looks exactly as the copilot left it. {} for anything that is not a create."""
    what = _CREATED.get(action.get("kind"))
    if what is None:
        return {}
    kind = event_kind(action.get("event_kind")) if what == "event" else None
    stamp = _stamp(_draft(what, result["id"], kind))
    if stamp is None:
        return {}
    return {"kind": "delete_created", "what": what, "event_kind": kind, "id": result["id"], "stamp": stamp}


def delete_created(inverse):
    found = _draft(inverse.get("what"), inverse.get("id"), inverse.get("event_kind"))
    if found is None or _stamp(found) != inverse.get("stamp"):
        raise ContentOpError(UNDO_REFUSED)
    found[0].delete()


def create_blog_post(user, params):
    from apps.blog.models import unique_slug
    from apps.blog.serializers import BlogPostAdminSerializer

    serializer = BlogPostAdminSerializer(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    post = serializer.save(
        created_by=user,
        slug=unique_slug(serializer.validated_data.get("title", "")),
        published_at=None,
        source="ai",
        ai_model=settings.COPILOT_MODEL,
        status="draft",
        noindex=False,
    )
    _give_cover(post, "cover_photo")
    return {"kind": "create_blog_post", "id": post.id, "title": post.title, "url": f"/admin/blog/{post.id}"}
