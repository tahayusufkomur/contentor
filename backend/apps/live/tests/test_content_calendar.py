"""Coach content calendar: GET /api/v1/admin/content-calendar/ aggregates
scheduled/published items across Live events, Blog posts and Email broadcasts
into one flat, coach-only feed. Distinct from the public /api/v1/calendar/
(student-facing, live-only)."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog.models import BlogPost, unique_slug
from apps.email_campaigns.models import CampaignStatus, EmailCampaign
from apps.live.models import LiveClass

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@calfeed.com",
        name="Cal Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@calfeed.com",
        name="Cal Student",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="student",
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def content(tenant_ctx, owner):
    """One item per category, all dated ~now so a ±1 day window catches them."""
    now = timezone.now()
    live = LiveClass.objects.create(
        title="Live Pilates",
        instructor=owner,
        pricing_type="free",
        duration_minutes=60,
        scheduled_at=now + timedelta(hours=3),
    )
    post = BlogPost.objects.create(
        title="Posture Tips",
        slug=unique_slug("Posture Tips"),
        status="published",
        published_at=now - timedelta(hours=3),
        created_by=owner,
    )
    email = EmailCampaign.objects.create(
        subject="Weekly Newsletter",
        template_id="tpl_1",
        sender=owner,
        recipient_filter={"type": "all"},
        recipient_count=42,
        status=CampaignStatus.SENT,
        sent_at=now - timedelta(hours=1),
        recipient_summary="All students",
    )
    return {"live": live, "post": post, "email": email, "now": now}


def _window(now, days=1):
    return {
        "from": (now - timedelta(days=days)).isoformat(),
        "to": (now + timedelta(days=days)).isoformat(),
    }


class TestContentCalendarFeed:
    def test_returns_one_item_per_category(self, tenant_ctx, owner, content):
        resp = make_client(owner).get("/api/v1/admin/content-calendar/", _window(content["now"]))
        assert resp.status_code == 200, resp.content
        items = resp.json()
        by_cat = {i["category"]: i for i in items}
        assert set(by_cat) == {"live", "blog", "email"}
        assert by_cat["live"]["title"] == "Live Pilates"
        assert by_cat["blog"]["title"] == "Posture Tips"
        assert by_cat["email"]["title"] == "Weekly Newsletter"

    def test_ids_are_unique_across_categories(self, tenant_ctx, owner, content):
        resp = make_client(owner).get("/api/v1/admin/content-calendar/", _window(content["now"]))
        ids = [i["id"] for i in resp.json()]
        assert len(ids) == len(set(ids))
        # id is namespaced by source so a LiveClass pk can't collide with a BlogPost pk.
        assert any(i["id"].startswith("live_class-") for i in resp.json())

    def test_items_carry_date_status_and_href(self, tenant_ctx, owner, content):
        resp = make_client(owner).get("/api/v1/admin/content-calendar/", _window(content["now"]))
        by_cat = {i["category"]: i for i in resp.json()}
        assert by_cat["email"]["status"] == "completed"  # SENT → completed
        assert by_cat["email"]["href"] == f"/admin/email/campaigns/{content['email'].id}"
        assert by_cat["live"]["href"] == "/admin/live"
        assert by_cat["blog"]["status"] == "published"
        for item in by_cat.values():
            assert item["scheduled_at"]  # every item is placed on a date

    def test_types_filter_narrows_to_one_category(self, tenant_ctx, owner, content):
        params = {**_window(content["now"]), "types": "blog"}
        resp = make_client(owner).get("/api/v1/admin/content-calendar/", params)
        cats = {i["category"] for i in resp.json()}
        assert cats == {"blog"}

    def test_date_range_excludes_out_of_window_items(self, tenant_ctx, owner, content):
        # A tight window well after everything: expect nothing.
        far = content["now"] + timedelta(days=400)
        params = {"from": far.isoformat(), "to": (far + timedelta(days=1)).isoformat()}
        resp = make_client(owner).get("/api/v1/admin/content-calendar/", params)
        assert resp.json() == []

    def test_scheduled_email_appears_at_scheduled_time(self, tenant_ctx, owner):
        now = timezone.now()
        EmailCampaign.objects.create(
            subject="Future Blast",
            template_id="tpl_2",
            sender=owner,
            recipient_filter={"type": "all"},
            recipient_count=10,
            status=CampaignStatus.SCHEDULED,
            scheduled_at=now + timedelta(days=3),
        )
        params = {
            "from": (now + timedelta(days=2)).isoformat(),
            "to": (now + timedelta(days=4)).isoformat(),
        }
        resp = make_client(owner).get("/api/v1/admin/content-calendar/", params)
        items = resp.json()
        assert len(items) == 1
        assert items[0]["category"] == "email"
        assert items[0]["status"] == "scheduled"

    def test_requires_coach(self, tenant_ctx, student, content):
        resp = make_client(student).get("/api/v1/admin/content-calendar/", _window(content["now"]))
        assert resp.status_code == 403, resp.content

    def test_anonymous_denied(self, tenant_ctx, content):
        resp = make_client().get("/api/v1/admin/content-calendar/", _window(content["now"]))
        assert resp.status_code in (401, 403), resp.content
