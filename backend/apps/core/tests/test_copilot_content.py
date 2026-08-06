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
    assert result["url"] == f"/admin/live?tab=classes&event={event.id}&kind=live"


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
    assert result["url"] == f"/admin/live?tab=onsite&event={event.id}&kind=onsite"


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


def test_create_announcement_draft_lands_as_draft_and_sanitized(coach):
    from apps.notifications.models import Announcement

    result = content.create_announcement_draft(
        coach,
        {
            "title": "New timetable",
            "body_html": "<p>From Monday…</p><script>x</script>",
            "link": "/courses",
        },
    )
    row = Announcement.objects.get(pk=result["id"])
    assert row.status == "draft"
    assert "<script>" not in row.body
    assert result["url"] == "/admin/announcements"
    assert result["kind"] == "draft_announcement"


def test_create_announcement_draft_requires_title(coach):
    with pytest.raises(content.ContentOpError):
        content.create_announcement_draft(coach, {"body_html": "<p>no title</p>"})


def test_edit_course_updates_fields(coach):
    from apps.courses.models import Course

    course = Course.objects.create(title="Old", instructor=coach, price=0, pricing_type="free", is_published=False)
    result = content.edit_course(course.pk, {"title": "New title", "price": 49})
    course.refresh_from_db()
    assert course.title == "New title"
    assert str(course.price) == "49.00"
    assert course.pricing_type == "paid"
    assert {"field": "title", "old": "Old", "new": "New title"} in result["changes"]
    assert result["kind"] == "edit_course"
    assert result["id"] == course.id
    assert result["url"] == f"/admin/courses/{course.slug}"


def test_edit_course_unknown_id_raises(coach):
    with pytest.raises(content.ContentOpError):
        content.edit_course(99999, {"title": "X"})


def test_edit_course_no_changes_raises(coach):
    from apps.courses.models import Course

    course = Course.objects.create(title="Same", instructor=coach, price=0, pricing_type="free")
    with pytest.raises(content.ContentOpError):
        content.edit_course(course.pk, {"title": "Same"})


def test_edit_event_reschedules_live_class(coach):
    from apps.live.models import LiveClass

    event = LiveClass.objects.create(
        title="Yoga",
        instructor=coach,
        price=0,
        pricing_type="free",
        scheduled_at=timezone.now() + timedelta(days=2),
    )
    new_when = (timezone.now() + timedelta(days=5)).isoformat()
    result = content.edit_event(event.pk, "live", {"scheduled_at": new_when})
    event.refresh_from_db()
    assert event.scheduled_at.isoformat() == new_when
    assert result["changes"][0]["field"] == "scheduled_at"
    assert result["kind"] == "edit_event"
    assert result["url"] == f"/admin/live?tab=classes&event={event.id}&kind=live"


def test_edit_event_rejects_past_date(coach):
    from apps.live.models import LiveClass

    event = LiveClass.objects.create(
        title="Yoga",
        instructor=coach,
        price=0,
        pricing_type="free",
        scheduled_at=timezone.now() + timedelta(days=2),
    )
    past = (timezone.now() - timedelta(days=1)).isoformat()
    with pytest.raises(content.ContentOpError):
        content.edit_event(event.pk, "live", {"scheduled_at": past})


def test_edit_event_onsite_location(coach):
    from apps.live.models import OnsiteEvent

    event = OnsiteEvent.objects.create(
        title="Retreat",
        instructor=coach,
        price=0,
        pricing_type="free",
        location="Berlin",
        scheduled_at=timezone.now() + timedelta(days=9),
    )
    result = content.edit_event(event.pk, "onsite", {"location": "Hamburg"})
    event.refresh_from_db()
    assert event.location == "Hamburg"
    assert result["url"] == f"/admin/live?tab=onsite&event={event.id}&kind=onsite"


def test_edit_event_unknown_id_raises(coach):
    with pytest.raises(content.ContentOpError):
        content.edit_event(99999, "live", {"title": "X"})


def test_edit_event_no_changes_raises(coach):
    from apps.live.models import LiveClass

    event = LiveClass.objects.create(
        title="Yoga",
        instructor=coach,
        price=0,
        pricing_type="free",
        scheduled_at=timezone.now() + timedelta(days=2),
    )
    with pytest.raises(content.ContentOpError):
        content.edit_event(event.pk, "live", {"title": "Yoga"})


def test_edit_blog_post_updates_and_sanitizes(coach):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(title="Old", status="draft", created_by=coach, slug="old")
    result = content.edit_blog_post(post.pk, {"title": "Newer", "body_html": "<p>ok</p><script>x()</script>"})
    post.refresh_from_db()
    assert post.title == "Newer"
    assert "<script>" not in post.body_html
    assert any(c["field"] == "title" for c in result["changes"])
    assert result["kind"] == "edit_blog_post"
    assert result["id"] == post.id
    assert result["url"] == f"/admin/blog/{post.id}"


def test_edit_blog_post_maps_summary_to_excerpt(coach):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(title="Old", status="draft", created_by=coach, slug="old2")
    result = content.edit_blog_post(post.pk, {"summary": "A new one-liner."})
    post.refresh_from_db()
    assert post.excerpt == "A new one-liner."
    assert {"field": "excerpt", "old": "", "new": "A new one-liner."} in result["changes"]


def test_edit_blog_post_unknown_raises(coach):
    with pytest.raises(content.ContentOpError):
        content.edit_blog_post(4242, {"title": "X"})


def test_edit_blog_post_no_changes_raises(coach):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(title="Same", status="draft", created_by=coach, slug="same")
    with pytest.raises(content.ContentOpError):
        content.edit_blog_post(post.pk, {"title": "Same"})


def test_edit_blog_post_empty_params_raises(coach):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(title="Whatever", status="draft", created_by=coach, slug="whatever")
    with pytest.raises(content.ContentOpError):
        content.edit_blog_post(post.pk, {})


def test_edit_event_price_updates_pricing_type(coach):
    from apps.live.models import LiveClass

    event = LiveClass.objects.create(
        title="Yoga",
        instructor=coach,
        price=0,
        pricing_type="free",
        scheduled_at=timezone.now() + timedelta(days=2),
    )
    result = content.edit_event(event.pk, "live", {"price": 29})
    event.refresh_from_db()
    assert str(event.price) == "29.00"
    assert event.pricing_type == "paid"
    assert result["kind"] == "edit_event"


def test_publish_course_flips_flag(coach):
    from apps.courses.models import Course

    course = Course.objects.create(title="C", instructor=coach, price=0, pricing_type="free", is_published=False)
    result = content.publish_course(course.pk)
    course.refresh_from_db()
    assert course.is_published is True
    assert result["kind"] == "publish_course"
    assert result["id"] == course.id
    assert result["url"] == f"/admin/courses/{course.slug}"


def test_publish_course_already_published_raises(coach):
    from apps.courses.models import Course

    course = Course.objects.create(title="C", instructor=coach, price=0, pricing_type="free", is_published=True)
    with pytest.raises(content.ContentOpError):
        content.publish_course(course.pk)


def test_publish_course_unknown_id_raises(coach):
    with pytest.raises(content.ContentOpError):
        content.publish_course(999999)


def test_publish_blog_post_sets_status_and_date(coach):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(title="P", status="draft", created_by=coach, slug="p")
    result = content.publish_blog_post(post.pk)
    post.refresh_from_db()
    assert post.status == "published"
    assert post.published_at is not None
    assert result["kind"] == "publish_blog_post"
    assert result["id"] == post.id
    assert result["url"] == f"/blog/{post.slug}"


def test_publish_blog_post_already_published_raises(coach):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(
        title="P", status="published", created_by=coach, slug="p2", published_at=timezone.now()
    )
    with pytest.raises(content.ContentOpError):
        content.publish_blog_post(post.pk)


def test_publish_blog_post_unknown_id_raises(coach):
    with pytest.raises(content.ContentOpError):
        content.publish_blog_post(999999)


def test_create_blog_post_with_cover_photo(tenant_ctx, coach):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="uploads/cover.jpg", title="Cover")
    result = content.create_blog_post(
        coach, {"title": "With cover", "excerpt": "", "body_html": "<p>x</p>", "cover_photo": str(photo.pk)}
    )
    from apps.blog.models import BlogPost

    post = BlogPost.objects.get(pk=result["id"])
    assert post.cover_photo_id == photo.pk


def test_edit_blog_post_sets_cover_photo(tenant_ctx, coach):
    from apps.blog.models import BlogPost
    from apps.media.models import Photo

    post = BlogPost.objects.create(title="P", status="draft", created_by=coach, slug="p-cover")
    photo = Photo.objects.create(s3_key="uploads/newcover.jpg", title="New cover")
    result = content.edit_blog_post(post.pk, {"cover_photo": str(photo.pk)})
    post.refresh_from_db()
    assert post.cover_photo_id == photo.pk
    assert any(c["field"] == "cover_photo" for c in result["changes"])
