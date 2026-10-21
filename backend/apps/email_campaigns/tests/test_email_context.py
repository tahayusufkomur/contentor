"""What the email builder's AI is told about a coach (apps.email_campaigns.context).

MailCraft shows its model the ids, titles, prices and dates, and keeps the links
and pictures to itself, so every link in an AI email is one of these pages.
"""

from datetime import UTC, datetime, timedelta
from unittest import mock

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan
from apps.blog.models import BlogPost
from apps.courses.models import Course
from apps.email_campaigns import views
from apps.email_campaigns.context import email_context
from apps.live.models import LiveClass
from apps.media.models import Photo
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

SITE = "https://shared-test.localhost"
KEY = "tenants/shared-test/photo/"


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.brand_name, cfg.style, cfg.palette = "Glow", "journal", ""
    cfg.default_locale, cfg.timezone = "tr", "Europe/Berlin"
    cfg.social_links = {"instagram": "https://instagram.com/glow", "tiktok": ""}
    cfg.navbar_config = {"links": [{"href": "/about", "label": "About me"}, {"href": "https://elsewhere.test/x"}]}
    cfg.emailcraft_api_key = "mc_test_key"  # noqa: S105  # pragma: allowlist secret
    cfg.save()
    tenant_ctx.wizard_state = {"answers": {"teaches": "face yoga", "tone": "Warm, Calm", "pitch": "Ten minutes a day"}}
    tenant_ctx.save(update_fields=["wizard_state"])
    return cfg


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@glow.test",
        name="Glow Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


@pytest.fixture()
def signed():
    with mock.patch(
        "apps.email_campaigns.context.generate_presigned_download_url",
        side_effect=lambda key, expiry: f"https://s3.test/{key}?ttl={expiry}",
    ):
        yield


def test_the_brand_comes_from_her_look_language_and_interview(tenant_ctx, config):
    assert email_context(tenant_ctx)["brand"] == {
        "name": "Glow",
        "site_url": SITE,
        "language": "tr",
        "custom_palette": {
            "primary": "#2c2520",
            "secondary": "#96372f",
            "textDark": "#241e1a",
            "textLight": "#645c55",
            "background": "#f9f6f1",
            "surface": "#f1ece4",
        },
        "fonts": {"heading": "'Newsreader', Georgia, serif", "body": "'Hanken Grotesk', Helvetica, Arial, sans-serif"},
        "voice": {
            "teaches": "face yoga",
            "tone": "Warm, Calm",
            "pitch": "Ten minutes a day",
            "mood": "A calm editorial magazine — light serif headlines, paper tones, quiet confidence.",
        },
        "photo_style": "soft natural window light, muted neutral tones, calm editorial, negative space",
    }


def test_a_sans_serif_heading_falls_back_to_a_sans_serif(tenant_ctx, config):
    config.style = "darkroom"  # Syne
    config.save(update_fields=["style"])
    assert email_context(tenant_ctx)["brand"]["fonts"]["heading"] == "'Syne', Helvetica, Arial, sans-serif"


def test_items_have_absolute_links_and_pictures_readable_for_the_session(tenant_ctx, config, owner, signed):
    cover = Photo.objects.create(s3_key=f"{KEY}cover.jpg")
    course = Course.objects.create(
        title="Face Yoga Foundations",
        slug="foundations",
        description="Ten minutes a day.",
        instructor=owner,
        price=49,
        pricing_type="paid",
        is_published=True,
        thumbnail=cover,
    )
    draft = Course.objects.create(title="Neck Care", slug="neck-care", instructor=owner, is_published=False)
    soon = LiveClass.objects.create(
        title="Morning Glow", instructor=owner, scheduled_at=datetime(2030, 11, 5, 17, 0, tzinfo=UTC)
    )
    past = LiveClass.objects.create(
        title="Old class", instructor=owner, scheduled_at=timezone.now() - timedelta(days=2)
    )
    plan = SubscriptionPlan.objects.create(name="Glow Club", price=19, billing_interval_months=1)
    post = BlogPost.objects.create(title="Why face yoga", slug="why-face-yoga", status="published")
    BlogPost.objects.create(title="Unfinished", slug="unfinished", status="draft")

    items = {i["id"]: i for i in email_context(tenant_ctx)["items"]}

    live_course = items[f"course:{course.id}"]
    assert (live_course["url"], live_course["image_url"]) == (
        f"{SITE}/courses/foundations",
        f"https://s3.test/{KEY}cover.jpg?ttl=14400",
    )
    assert (live_course["summary"], live_course["status"]) == ("Ten minutes a day.", "published")
    assert live_course["price"].startswith(("$49", "€49"))
    assert (items[f"course:{draft.id}"]["status"], items[f"course:{draft.id}"]["url"]) == ("draft", "")
    assert items[f"live:{soon.id}"]["when"] == "Tuesday 5 November 2030, 18:00 (Europe/Berlin)"
    assert items[f"live:{soon.id}"]["url"] == f"{SITE}/calendar/live_class/{soon.id}"
    assert f"live:{past.id}" not in items
    assert (items[f"plan:{plan.id}"]["url"], items[f"plan:{plan.id}"]["price"][-7:]) == (
        f"{SITE}/plans/{plan.id}",
        "monthly",
    )
    assert items[f"post:{post.id}"]["url"] == f"{SITE}/blog/why-face-yoga"
    assert [i["title"] for i in items.values() if i["kind"] == "blog post"] == ["Why face yoga"]
    assert (items["page:home"]["url"], items["page:about"]["url"]) == (f"{SITE}/", f"{SITE}/about")
    assert items["social:instagram"]["url"] == "https://instagram.com/glow"
    assert "social:tiktok" not in items
    assert not [i for i in items.values() if "elsewhere.test" in i["url"]]


def test_photos_are_her_logo_then_her_own_described_photos(tenant_ctx, config, signed):
    config.logo = Photo.objects.create(s3_key=f"{KEY}logo.png", width=400, height=400)
    config.save(update_fields=["logo"])
    mine = Photo.objects.create(
        s3_key=f"{KEY}a.avif", alt_text="a cheek lift by a window", index_status="ready", width=1600, height=2000
    )
    Photo.objects.create(s3_key=f"{KEY}b.avif", title="IMG_2041", index_status="pending", width=10, height=10)
    Photo.objects.create(s3_key=f"{KEY}c.jpg", alt_text="a catalog copy")  # not one she uploaded

    assert email_context(tenant_ctx)["photos"] == [
        {
            "id": "logo",
            "description": "the Glow logo",
            "aspect": "square",
            "url": f"https://s3.test/{KEY}logo.png?ttl=14400",
        },
        {
            "id": f"photo:{mine.pk}",
            "description": "a cheek lift by a window",
            "aspect": "portrait",
            "url": f"https://s3.test/{KEY}a.avif?ttl=14400",
        },
    ]


def test_the_builder_session_carries_the_context(config, owner):
    with mock.patch.object(views.emailcraft_client, "create_session", return_value={"token": "t"}) as create:
        r = _client(owner).post("/api/v1/email/session/")
    assert r.status_code == 200
    assert create.call_args.kwargs["context"]["brand"]["name"] == "Glow"


def test_a_context_that_cannot_be_built_never_blocks_the_builder(config, owner):
    with (
        mock.patch.object(views, "email_context", side_effect=RuntimeError("boom")),
        mock.patch.object(views.emailcraft_client, "create_session", return_value={"token": "t"}) as create,
    ):
        r = _client(owner).post("/api/v1/email/session/")
    assert r.status_code == 200
    assert create.call_args.kwargs["context"] == {}


def test_provisioning_names_the_tenant_by_a_stable_id_not_its_brand(config):
    config.emailcraft_api_key = ""
    config.save(update_fields=["emailcraft_api_key"])
    with mock.patch.object(
        views.emailcraft_client, "provision_organization", return_value={"api_key": {"raw": "mc_live_k"}}
    ) as provision:
        assert views._get_api_key() == ("mc_live_k", None)
    assert provision.call_args.args == ("Glow",)
    assert provision.call_args.kwargs == {"external_id": f"{settings.CONTENTOR_DOMAIN}:shared_test"}


def _client(user):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    return client
