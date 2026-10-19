"""
Plan Access API tests.

Tests for:
  - GET /api/v1/billing/plans/{id}/access/  (IsOwner)
  - PUT /api/v1/billing/plans/{id}/access/  (IsOwner)
  - GET /api/v1/billing/plans/ and /plans/{id}/ where they meet the above

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle, BundleItem, SubscriptionPlan, SubscriptionPlanAccess
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, OnsiteEvent, ZoomClass

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@planaccesstest.com",
        name="Owner",
        password="secret123",
        role="owner",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@planaccesstest.com",
        name="Student",
        password="secret123",
        role="student",
    )


@pytest.fixture()
def owner_client(owner):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=owner)
    return client


# ---------------------------------------------------------------------------
# Content and plan fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Plan Test Course",
        slug="plan-test-course",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("50.00"),
        is_published=True,
    )


@pytest.fixture()
def plan(tenant_ctx):
    return SubscriptionPlan.objects.create(
        name="Basic Plan",
        description="Basic subscription plan",
        price=Decimal("29.99"),
        currency="USD",
        is_active=True,
    )


@pytest.fixture()
def members_class(tenant_ctx, owner):
    return LiveClass.objects.create(
        title="Members Flow", instructor=owner, pricing_type="subscription", scheduled_at=timezone.now()
    )


@pytest.fixture()
def onsite_event(tenant_ctx, owner):
    return OnsiteEvent.objects.create(
        title="Studio Workshop",
        instructor=owner,
        pricing_type="subscription",
        scheduled_at=timezone.now(),
        status="scheduled",  # published: a held draft is not listed (G4)
    )


def _link(plan, obj):
    return SubscriptionPlanAccess.objects.create(
        plan=plan, content_type=ContentType.objects.get_for_model(type(obj)), object_id=obj.pk
    )


def _rows(plan):
    return sorted(SubscriptionPlanAccess.objects.filter(plan=plan).values_list("pk", "content_type_id", "object_id"))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestPlanAccess:
    def test_get_empty_access(self, plan, owner_client):
        """GET names the plan and returns no items when none exist."""
        response = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["plan"] == {"id": plan.pk, "name": "Basic Plan", "is_active": True}
        assert data["items"] == []

    def test_put_sets_access(self, plan, course, owner_client):
        """PUT with items creates access items for the plan."""
        payload = {
            "items": [
                {"content_type": "course", "object_id": course.pk},
            ]
        }
        response = owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data=payload,
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()["items"] == [
            {
                "content_type": "course",
                "object_id": course.pk,
                "title": "Plan Test Course",
                "price": "50.00",
                "pricing_type": "paid",
                "window_text": "Right away · never closes",
            }
        ]

    def test_put_replaces_access(self, plan, course, owner_client):
        """PUT replaces existing access items — old ones are deleted."""
        # Create a second course to replace with
        owner_user = User.objects.get(role="owner")
        second_course = Course.objects.create(
            title="Second Course",
            slug="second-course-plan",
            instructor=owner_user,
            pricing_type="paid",
            price=Decimal("75.00"),
            is_published=True,
        )

        # First PUT: set access to first course
        payload_first = {"items": [{"content_type": "course", "object_id": course.pk}]}
        resp1 = owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data=payload_first,
            format="json",
        )
        assert resp1.status_code == 200, resp1.content
        assert len(resp1.json()["items"]) == 1

        # Second PUT: replace with second course only
        payload_second = {"items": [{"content_type": "course", "object_id": second_course.pk}]}
        resp2 = owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data=payload_second,
            format="json",
        )
        assert resp2.status_code == 200, resp2.content
        assert [i["object_id"] for i in resp2.json()["items"]] == [second_course.pk]

        # Verify the first course's access item is gone
        ct = ContentType.objects.get_for_model(Course)
        assert not SubscriptionPlanAccess.objects.filter(plan=plan, content_type=ct, object_id=course.pk).exists()

    def test_get_then_put_changes_nothing(self, plan, course, members_class, onsite_event, owner, owner_client):
        """The page saves what it loaded: PUTting GET's items back keeps every
        row (the same rows, not copies), a link of a kind the page does not
        list included."""
        for obj in (course, members_class, onsite_event):
            _link(plan, obj)
        _link(plan, ZoomClass.objects.create(title="Zoom", instructor=owner))
        before = _rows(plan)
        url = f"/api/v1/billing/plans/{plan.pk}/access/"

        loaded = owner_client.get(url).json()
        assert sorted((i["content_type"], i["object_id"]) for i in loaded["items"]) == [
            ("course", course.pk),
            ("live_class", members_class.pk),
            ("onsite_event", onsite_event.pk),
        ]
        saved = owner_client.put(url, data={"items": loaded["items"]}, format="json")

        assert saved.status_code == 200, saved.content
        assert saved.json() == loaded
        assert _rows(plan) == before

    def test_put_keeps_links_it_does_not_list(self, plan, course, owner, owner_client):
        """Saving an empty selection drops the listed kinds only."""
        _link(plan, course)
        zoom = _link(plan, ZoomClass.objects.create(title="Zoom", instructor=owner))

        response = owner_client.put(f"/api/v1/billing/plans/{plan.pk}/access/", data={"items": []}, format="json")

        assert response.status_code == 200, response.content
        assert [row[0] for row in _rows(plan)] == [zoom.pk]

    def test_put_links_an_in_person_event(self, plan, onsite_event, owner_client):
        response = owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data={"items": [{"content_type": "onsite_event", "object_id": onsite_event.pk}]},
            format="json",
        )
        assert response.status_code == 200, response.content
        ct = ContentType.objects.get_for_model(OnsiteEvent)
        assert SubscriptionPlanAccess.objects.filter(plan=plan, content_type=ct, object_id=onsite_event.pk).exists()

    def test_available_is_everything_not_free_plus_what_is_included(
        self, plan, course, members_class, onsite_event, owner, owner_client
    ):
        """The picker's list: paid and members-only content of every kind, and
        a free row only while the plan still includes it."""
        free_in = LiveClass.objects.create(title="Free, included", instructor=owner)
        LiveClass.objects.create(title="Free, not included", instructor=owner)
        _link(plan, free_in)

        data = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/").json()

        assert sorted((i["content_type"], i["title"]) for i in data["available"]) == [
            ("course", "Plan Test Course"),
            ("live_class", "Free, included"),
            ("live_class", "Members Flow"),
            ("onsite_event", "Studio Workshop"),
        ]
        assert [i["title"] for i in data["items"]] == ["Free, included"]

    def test_owner_opens_an_inactive_plan(self, plan, course, owner_client):
        """A plan that is switched off (held by "sell later") still opens for
        its owner, and is on her list; the public still sees neither."""
        _link(plan, course)
        SubscriptionPlan.objects.filter(pk=plan.pk).update(is_active=False)

        data = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/").json()
        assert data["plan"]["is_active"] is False
        assert [i["object_id"] for i in data["items"]] == [course.pk]

        listed = owner_client.get("/api/v1/billing/plans/?all=1").json()
        assert [(p["id"], p["is_active"]) for p in listed] == [(plan.pk, False)]
        assert owner_client.get("/api/v1/billing/plans/").json() == []
        anonymous = APIClient(HTTP_HOST=SHARED_DOMAIN)
        assert anonymous.get("/api/v1/billing/plans/?all=1").json() == []
        assert anonymous.get(f"/api/v1/billing/plans/{plan.pk}/").status_code == 404

    def test_public_plan_lists_an_in_person_event(self, plan, onsite_event):
        _link(plan, onsite_event)
        response = APIClient(HTTP_HOST=SHARED_DOMAIN).get(f"/api/v1/billing/plans/{plan.pk}/")
        assert response.status_code == 200, response.content
        [item] = response.json()["items"]
        assert (item["type"], item["id"], item["title"]) == ("onsiteevent", onsite_event.pk, "Studio Workshop")
        # It can have a designed cover (none yet), whose badge reads the event's start.
        assert item["cover_design"] is None
        assert item["scheduled_at"]

    def test_a_draft_is_not_listed_in_a_plan_or_bundle_for_students(self, plan, course, owner, student, owner_client):
        """A focus draft (G4) a plan or bundle already holds stays out of its listings until she publishes it."""
        drafts = [
            Course.objects.create(title="Draft course", slug="draft-course", instructor=owner, is_published=False),
            DownloadFile.objects.create(title="Draft download", file_url="k", is_published=False),
            LiveClass.objects.create(title="Held class", instructor=owner, status="draft", scheduled_at=timezone.now()),
        ]
        bundle = Bundle.objects.create(name="Starter", price=Decimal("40"), currency="USD", is_active=True)
        for obj in [course, *drafts]:
            _link(plan, obj)
            BundleItem.objects.create(
                bundle=bundle, content_type=ContentType.objects.get_for_model(type(obj)), object_id=obj.pk
            )
        viewer = APIClient(HTTP_HOST=SHARED_DOMAIN)
        viewer.force_authenticate(user=student)
        for client in (viewer, APIClient(HTTP_HOST=SHARED_DOMAIN)):
            assert [i["title"] for i in client.get(f"/api/v1/billing/plans/{plan.pk}/").json()["items"]] == [
                "Plan Test Course"
            ]
            assert [i["object_id"] for i in client.get(f"/api/v1/billing/bundles/{bundle.pk}/").json()["items"]] == [
                course.pk
            ]
        # She sees what she put in them.
        assert len(owner_client.get(f"/api/v1/billing/plans/{plan.pk}/").json()["items"]) == 4
        assert len(owner_client.get(f"/api/v1/billing/bundles/{bundle.pk}/").json()["items"]) == 4

    def test_student_forbidden(self, plan, course, student):
        """Student cannot access the plan access endpoint (GET or PUT)."""
        client = APIClient(HTTP_HOST=SHARED_DOMAIN)
        client.force_authenticate(user=student)

        get_resp = client.get(f"/api/v1/billing/plans/{plan.pk}/access/")
        assert get_resp.status_code == 403, get_resp.content

        put_resp = client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data={"items": [{"content_type": "course", "object_id": course.pk}]},
            format="json",
        )
        assert put_resp.status_code == 403, put_resp.content

    def test_the_plan_page_shows_each_items_window(self, plan, course, members_class, owner_client):
        """Each included item says in plain words when it opens and closes for a member; one not linked says nothing."""
        SubscriptionPlanAccess.objects.filter(pk=_link(plan, course).pk).update(opens_after_days=30)
        SubscriptionPlanAccess.objects.filter(pk=_link(plan, members_class).pk).update(closes_after_days=90)

        data = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/").json()

        texts = {i["object_id"]: i["window_text"] for i in data["items"]}
        assert texts[course.pk] == "After 1 month of membership · never closes"
        assert texts[members_class.pk] == "Right away · closes after 3 months"
        assert all(i["window_text"] == "" for i in data["available"] if i not in data["items"])

    def test_an_item_with_no_window_opens_right_away_and_never_closes(self, plan, course, owner_client):
        _link(plan, course)
        item = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/").json()["items"][0]
        assert item["window_text"] == "Right away · never closes"

    def test_saving_the_plan_page_keeps_each_links_window(self, plan, course, members_class, owner_client):
        """The page PUTs its items back; a link it keeps is the same row, so its window survives."""
        link = _link(plan, course)
        SubscriptionPlanAccess.objects.filter(pk=link.pk).update(opens_after_days=30, closes_after_days=365)
        url = f"/api/v1/billing/plans/{plan.pk}/access/"
        items = owner_client.get(url).json()["items"] + [{"content_type": "live_class", "object_id": members_class.pk}]

        saved = owner_client.put(url, data={"items": items}, format="json")

        assert saved.status_code == 200, saved.content
        link.refresh_from_db()
        assert (link.opens_after_days, link.closes_after_days) == (30, 365)
        kept = next(i for i in saved.json()["items"] if i["object_id"] == course.pk)
        assert kept["window_text"] == "After 1 month of membership · closes after 1 year"
        added = SubscriptionPlanAccess.objects.get(plan=plan, object_id=members_class.pk)
        assert (added.opens_after_days, added.closes_after_days) == (None, None)
