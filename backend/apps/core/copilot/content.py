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


def _fail(errors):
    field, messages = next(iter(errors.items()))
    first = messages[0] if isinstance(messages, list) and messages else messages
    raise ContentOpError(f"{field}: {first}")


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
    )
    return {"kind": "create_blog_post", "id": post.id, "title": post.title, "url": f"/admin/blog/{post.id}"}
