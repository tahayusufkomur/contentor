"""Content-creation executors behind the copilot's create_* actions.

Each function validates through the same DRF serializer the admin surface
uses, calling it outside its viewset and injecting the server-side fields
(the wizard-content convention — see apps/core/onboarding/content.py).
Courses and blog posts land as drafts; events land as 'scheduled' because
nothing in the live app promotes a draft event after creation — the
copilot's confirmation card is the review step and states the date.
Callers wrap these in tenant_context; imports are function-local to match
apps/core's cycle-dodging convention."""

from django.conf import settings


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


def create_course(user, params):
    from apps.courses.serializers import CourseCreateUpdateSerializer

    serializer = CourseCreateUpdateSerializer(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    course = serializer.save(instructor=user, is_published=False)
    return {
        "kind": "create_course",
        "id": course.id,
        "title": course.title,
        "url": f"/admin/courses/{course.slug}",
    }


def create_event(user, event_kind, params):
    from apps.live.serializers import LiveClassCreateSerializer, OnsiteEventCreateSerializer

    serializer_class = OnsiteEventCreateSerializer if event_kind == "onsite" else LiveClassCreateSerializer
    serializer = serializer_class(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    event = serializer.save(instructor=user)
    return {"kind": "create_event", "id": event.id, "title": event.title, "url": "/admin/live"}


_COURSE_EDIT_FIELDS = ("title", "description", "price")


def edit_course(course_id, params):
    from apps.courses.models import Course
    from apps.courses.serializers import CourseCreateUpdateSerializer

    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        raise ContentOpError(f"no course with id {course_id}")
    data = {k: v for k, v in params.items() if k in _COURSE_EDIT_FIELDS and v is not None}
    if "price" in data:
        price = max(float(data["price"]), 0)
        data["price"] = f"{price:.2f}"
        data["pricing_type"] = "paid" if price > 0 else "free"
    if not data:
        raise ContentOpError("nothing to change on the course")
    old = {k: str(getattr(course, k)) for k in data}
    serializer = CourseCreateUpdateSerializer(instance=course, data=data, partial=True)
    if not serializer.is_valid():
        _fail(serializer.errors)
    course = serializer.save()
    changes = [
        {"field": k, "old": old[k][:200], "new": str(getattr(course, k))[:200]}
        for k in data
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


def edit_event(event_id, event_kind, params):
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime

    from apps.live.models import LiveClass, OnsiteEvent

    model = OnsiteEvent if event_kind == "onsite" else LiveClass
    event = model.objects.filter(pk=event_id).first()
    if event is None:
        raise ContentOpError(f"no {event_kind} event with id {event_id}")
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
    if params.get("price") is not None:
        price = max(float(params["price"]), 0)
        _set("price", f"{price:.2f}")
        _set("pricing_type", "paid" if price > 0 else "free")
    if event_kind == "onsite" and params.get("location"):
        _set("location", str(params["location"])[:500])
    if not changes:
        raise ContentOpError("nothing to change on the event")
    event.save(update_fields=[c["field"] for c in changes])
    return {
        "kind": "edit_event",
        "id": event.id,
        "title": event.title,
        "url": "/admin/live",
        "changes": changes,
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
    return {"kind": "create_blog_post", "id": post.id, "title": post.title, "url": f"/admin/blog/{post.id}"}
