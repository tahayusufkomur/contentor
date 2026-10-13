"""The signer hands out links to this tenant's storage and to the shared
prefixes, and to nothing else in the bucket.

Many fields take a free-text key or URL from the coach (thumbnail_url,
video_url, logo_url, a block's url) and are signed when read. Before the
guard, `tenants/<another-tenant>/...` in any of them came back as a working
download link. The first half pins the rule; the second half writes one key
into every such field and reads it back through each endpoint that signs.
"""

from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.utils import timezone
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import storage

HOST = "shared-test.localhost"
SIGNED = "X-Amz-Signature"

OWN = "tenants/shared-test/photo/mine.png"
SHARED = "demo/photos/yoga-hero.jpg"
FOREIGN = "tenants/other-studio/video/secret.mp4"

pytestmark = pytest.mark.django_db(transaction=True)


# ---------------------------------------------------------------------------
# The rule
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "key",
    [
        OWN,
        SHARED,
        "demo/videos/intro.mp4",
        "demo/downloads/lesson-1-worksheet.pdf",
        "platform/curated-logos/lotus.png",
        "platform/curated-photos/texture.png",
        # Two dots inside a file name are not a parent folder.
        "tenants/shared-test/mailbox/abc123/notes..final.pdf",
    ],
)
def test_signs_the_tenants_own_keys_and_the_shared_prefixes(tenant_ctx, key):
    assert storage.is_signable_key(key)
    assert SIGNED in storage.generate_presigned_download_url(key)
    assert SIGNED in storage.sign_if_s3_key(key)


@pytest.mark.parametrize(
    "key",
    [
        FOREIGN,
        "tenants/shared-test-2/photo/x.png",  # a slug that merely starts like ours
        "tenants/shared-test/../other-studio/photo/x.png",
        "tenants/unknown/mailbox/abc123/invoice.pdf",  # the platform inbox
        "logs/archive/2026/10/12.ndjson.gz",
        "activity/archive/2026/10/12.ndjson.gz",
        "wizard/other_studio/logo.png",
        "/tenants/shared-test/photo/x.png",
        "photos/legacy.jpg",
    ],
)
def test_refuses_every_other_key(tenant_ctx, key):
    assert not storage.is_signable_key(key)
    assert storage.generate_presigned_download_url(key) == ""
    assert storage.sign_if_s3_key(key) == ""


@pytest.mark.parametrize("value", [None, 5, ["tenants/shared-test/x.png"]])
def test_a_value_that_is_not_a_string_is_not_a_key(tenant_ctx, value):
    assert not storage.is_signable_key(value)
    assert storage.generate_presigned_download_url(value) == ""


@pytest.mark.parametrize("value", ["", None, "https://cdn.example.com/a.png", "http://example.com/a.png"])
def test_sign_if_s3_key_still_passes_urls_and_blanks_through(tenant_ctx, value):
    assert storage.sign_if_s3_key(value) == value


def test_the_platform_inbox_is_readable_from_the_public_schema_only(tenant_ctx):
    # Inbound platform mail is filed inside schema_context("public"), where
    # django-tenants has no tenant row and build_s3_path says "unknown".
    key = "tenants/unknown/mailbox/abc123/invoice.pdf"
    assert not storage.is_signable_key(key)
    with schema_context("public"):
        assert storage.build_s3_path("mailbox", "abc123", "invoice.pdf") == key
        assert storage.is_signable_key(key)
        assert storage.is_signable_key(SHARED)
        assert not storage.is_signable_key(OWN)  # a tenant's storage is not the platform's


def test_no_tenant_may_take_the_fallback_slug():
    from django.core.exceptions import ValidationError

    from apps.core.validators import validate_tenant_slug

    with pytest.raises(ValidationError):
        validate_tenant_slug("unknown")


# ---------------------------------------------------------------------------
# Every field a coach can point at a key, read back through the API
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@signer.test", name="Owner", password="secret123", role="owner")  # noqa: S106


@pytest.fixture()
def client(owner):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=owner)
    return c


def _seed(owner, ref):
    """One of everything, each with `ref` in its free-text key field. Returns
    the URLs whose response would carry the signed link."""
    from apps.billing.models import Bundle, SubscriptionPlan, SubscriptionPlanAccess
    from apps.community.models import CommunityMember, CommunitySettings, Post
    from apps.courses.models import Course, Lesson, Module
    from apps.downloads.models import DownloadFile
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
    from apps.tenant_config.models import TenantConfig

    soon = timezone.now() + timezone.timedelta(days=1)

    course = Course.objects.create(
        title="Course",
        slug="signer-course",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("10.00"),
        is_published=True,
        thumbnail_url=ref,
    )
    module = Module.objects.create(course=course, title="Module", order=1)
    Lesson.objects.create(module=module, title="Lesson", order=1, video_url=ref)

    live = LiveClass.objects.create(
        title="Class", instructor=owner, scheduled_at=soon, thumbnail_url=ref, recording_url=ref
    )
    stream = LiveStream.objects.create(
        title="Stream", instructor=owner, scheduled_at=soon, thumbnail_url=ref, recording_url=ref
    )
    zoom = ZoomClass.objects.create(title="Zoom", instructor=owner, scheduled_at=soon, thumbnail_url=ref)
    onsite = OnsiteEvent.objects.create(title="Retreat", instructor=owner, scheduled_at=soon, thumbnail_url=ref)

    Bundle.objects.create(name="Bundle", price=Decimal("30.00"), currency="USD", is_active=True, thumbnail_url=ref)
    plan = SubscriptionPlan.objects.create(name="Plan", price=Decimal("9.00"), currency="USD", is_active=True)
    SubscriptionPlanAccess.objects.create(
        plan=plan, content_type=ContentType.objects.get_for_model(Course), object_id=course.pk
    )
    download = DownloadFile.objects.create(title="Worksheet", file_url=ref)

    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(
        brand_name="Studio",
        logo_url=ref,
        icon_url=ref,
        landing_sections={"hero": {"bg_image_url": ref}, "about": {"image_url": ref}},
        pages={
            "home": {
                "blocks": [
                    {"id": "b1", "type": "hero", "image": {"photo_id": None, "url": ref}},
                    {"id": "b2", "type": "video", "video": {"video_id": None, "url": ref}},
                ]
            }
        },
        page_templates=[
            {"name": "Saved", "blocks": [{"id": "t1", "type": "hero", "image": {"photo_id": "", "url": ref}}]}
        ],
    )
    cache.delete("tenant:shared_test:config")

    settings = CommunitySettings.load()
    settings.is_enabled = True
    settings.save()
    member = CommunityMember.objects.create(user=owner, display_name="Owner", avatar_key=ref)
    Post.objects.create(author=member, body="hello", image_keys=[ref])

    return {
        "course list": "/api/v1/courses/",
        "course detail (thumbnail + lesson video)": "/api/v1/courses/signer-course/",
        "live classes": "/api/v1/live/",
        "live class (thumbnail + recording)": f"/api/v1/live/{live.pk}/",
        "live streams": "/api/v1/live-streams/",
        "live stream (thumbnail + recording)": f"/api/v1/live-streams/{stream.pk}/",
        # Zoom classes and in-person events show their thumbnail in the calendar only.
        "calendar": "/api/v1/calendar/",
        "calendar: zoom class": f"/api/v1/calendar/zoom_class/{zoom.pk}/",
        "calendar: onsite event": f"/api/v1/calendar/onsite_event/{onsite.pk}/",
        "store": "/api/v1/billing/store/",
        "products": "/api/v1/billing/products/",
        "plan detail (access items)": f"/api/v1/billing/plans/{plan.pk}/",
        "download link": f"/api/v1/downloads/{download.pk}/url/",
        "site config (logo, icon, sections, blocks, templates)": "/api/v1/admin/config/",
        "community profile (avatar)": "/api/v1/community/me/",
        "community feed (post images)": "/api/v1/community/posts/",
    }


def _read_all(client, urls):
    bodies = {}
    for name, url in urls.items():
        resp = client.get(url)
        assert resp.status_code == 200, f"{name}: {resp.status_code} {resp.content[:200]}"
        bodies[name] = resp.content.decode()
    return bodies


def test_another_tenants_key_is_never_signed_wherever_it_was_written(owner, client):
    bodies = _read_all(client, _seed(owner, FOREIGN))
    leaked = [name for name, body in bodies.items() if SIGNED in body]
    assert leaked == []


@pytest.mark.parametrize("key", [SHARED, OWN])
def test_shared_and_own_keys_still_resolve_on_every_one_of_those_paths(owner, client, key):
    # The same sweep with a legitimate key: every endpoint must sign it, which
    # also proves the sweep above really reaches a signer on each path.
    bodies = _read_all(client, _seed(owner, key))
    unsigned = [name for name, body in bodies.items() if SIGNED not in body]
    assert unsigned == []


def test_a_foreign_key_written_through_the_api_is_not_signed_back(owner, client):
    """End to end on the fields the serializers still accept as free text."""
    created = client.post(
        "/api/v1/courses/",
        {
            "title": "Borrowed",
            "thumbnail_url": FOREIGN,
            "modules": [{"title": "M", "lessons": [{"title": "L", "video_url": FOREIGN}]}],
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    from apps.courses.models import Course

    course = Course.objects.get(title="Borrowed")
    detail = client.get(f"/api/v1/courses/{course.slug}/").json()
    assert detail["thumbnail_signed_url"] == ""
    assert not detail["modules"][0]["lessons"][0]["video_signed_url"]

    live = client.post("/api/v1/live/", {"title": "Borrowed class", "thumbnail_url": FOREIGN}, format="json")
    assert live.status_code == 201, live.content
    assert SIGNED not in client.get("/api/v1/live/").content.decode()
