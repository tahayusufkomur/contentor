"""Copilot content executors: each create_* runs the same DRF serializer the
admin surface uses, injects the server-side fields, and returns a result-card
payload. Course and blog land as drafts; events land as 'scheduled' (a draft
event can never be published later — see the phase-2 plan)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.core.copilot import content

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="copilot-content@x.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


def test_create_course_lands_as_draft_with_outline(coach):
    from apps.courses.models import Course

    result = content.create_course(
        coach,
        {
            "title": "Yoga Foundations",
            "description": "Start here.",
            "price": "49.00",
            "pricing_type": "paid",
            "modules": [
                {"title": "Basics", "lessons": [{"title": "Breathing"}, {"title": "Posture"}]},
                {"title": "Flow", "lessons": [{"title": "Sun salutation"}]},
            ],
        },
    )
    course = Course.objects.get(id=result["id"])
    assert course.is_published is False
    assert course.instructor == coach
    assert course.slug  # derived server-side in Course.save()
    modules = list(course.modules.order_by("order"))
    assert [m.title for m in modules] == ["Basics", "Flow"]
    assert modules[0].lessons.count() == 2
    assert result["kind"] == "create_course"
    assert result["url"] == f"/admin/courses/{course.slug}"


def test_create_course_invalid_input_raises_user_safe_error(coach):
    with pytest.raises(content.ContentOpError):
        content.create_course(coach, {"title": ""})


def test_create_course_nested_module_error_is_clean_not_repr(coach):
    """Regression: a nested `modules` validation error must not leak a raw
    Python dict/list repr into the coach-facing ContentOpError message."""
    with pytest.raises(content.ContentOpError) as exc_info:
        content.create_course(
            coach,
            {
                "title": "Yoga",
                "modules": [{"title": "", "lessons": []}],
            },
        )
    message = str(exc_info.value)
    assert "{'" not in message
    assert "['" not in message


def test_create_event_live_lands_scheduled(coach):
    from apps.live.models import LiveClass

    when = timezone.now() + timedelta(days=7)
    result = content.create_event(coach, "live", {"title": "Morning flow", "scheduled_at": when.isoformat()})
    event = LiveClass.objects.get(id=result["id"])
    assert event.status == "scheduled"  # _ScheduledOnCreateMixin, same as the admin path
    assert event.instructor == coach
    assert result["url"] == "/admin/live"


def test_create_event_onsite_carries_location(coach):
    from apps.live.models import OnsiteEvent

    when = timezone.now() + timedelta(days=14)
    result = content.create_event(
        coach,
        "onsite",
        {"title": "Berlin retreat", "location": "Studio Mitte", "scheduled_at": when.isoformat()},
    )
    event = OnsiteEvent.objects.get(id=result["id"])
    assert event.status == "scheduled"
    assert event.location == "Studio Mitte"


def test_create_blog_post_draft_sanitized_and_stamped_ai(coach):
    from django.conf import settings

    from apps.blog.models import BlogPost

    result = content.create_blog_post(
        coach,
        {
            "title": "5 stretches before breakfast",
            "excerpt": "A five-minute routine.",
            "body_html": "<h2>Why</h2><p>It works.</p><script>evil()</script>",
        },
    )
    post = BlogPost.objects.get(id=result["id"])
    assert post.status == "draft"
    assert post.published_at is None
    assert post.source == "ai"
    assert post.ai_model == settings.COPILOT_MODEL
    assert post.created_by == coach
    assert post.slug  # unique_slug() must be called manually off-viewset
    assert "<script>" not in post.body_html  # clean_rich_html ran
    assert result["url"] == f"/admin/blog/{post.id}"


def test_create_blog_post_requires_title(coach):
    with pytest.raises(content.ContentOpError):
        content.create_blog_post(coach, {"excerpt": "no title"})


def test_create_blog_post_forces_draft_regardless_of_caller_params(coach):
    """Regression: server must always win over caller-supplied status/noindex."""
    from apps.blog.models import BlogPost

    result = content.create_blog_post(
        coach,
        {
            "title": "Caller tried to publish",
            "excerpt": "Sneaky attempt.",
            "status": "published",
            "noindex": True,
        },
    )
    post = BlogPost.objects.get(id=result["id"])
    assert post.status == "draft"  # Server forced draft
    assert post.noindex is False  # Server forced noindex=False
