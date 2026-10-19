"""
Bundle CRUD API tests.

These tests exercise the bundle views via HTTP (APIClient).

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle, BundleItem
from apps.courses.models import Course

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@bundletest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@bundletest.com", name="Student", password="secret123", role="student"
    )


# ---------------------------------------------------------------------------
# Content fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Test Course",
        slug="test-course-bundle",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("99.00"),
        is_published=True,
    )


# ---------------------------------------------------------------------------
# Bundle fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def bundle(tenant_ctx, course):
    b = Bundle.objects.create(
        name="Test Bundle",
        description="A bundle for testing",
        price=Decimal("149.00"),
        currency="USD",
        is_active=True,
    )
    ct = ContentType.objects.get_for_model(Course)
    BundleItem.objects.create(bundle=b, content_type=ct, object_id=course.pk)
    return b


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestBundleList:
    def test_list_returns_active_bundles(self, bundle, student):
        client = make_client(student)
        response = client.get("/api/v1/billing/bundles/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) == 1
        item = data[0]
        assert item["id"] == bundle.pk
        assert item["name"] == "Test Bundle"
        assert "access_info" in item
        assert "item_count" in item

    def test_list_hides_inactive_bundles(self, bundle, student):
        bundle.is_active = False
        bundle.save()
        client = make_client(student)
        response = client.get("/api/v1/billing/bundles/")
        assert response.status_code == 200, response.content
        assert response.json() == []


@pytest.mark.django_db(transaction=True)
class TestBundleCreate:
    def test_owner_creates_bundle(self, owner, course):
        client = make_client(owner)
        payload = {
            "name": "New Bundle",
            "description": "Created by owner",
            "price": "199.00",
            "is_active": True,
            "items": [{"content_type": "course", "object_id": course.pk}],
        }
        response = client.post("/api/v1/billing/bundles/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["name"] == "New Bundle"
        assert len(data["items"]) == 1
        assert data["items"][0]["object_id"] == course.pk

    def test_bundle_can_include_an_in_person_class(self, owner):
        from apps.live.models import OnsiteEvent

        event = OnsiteEvent.objects.create(title="Pads", instructor=owner, pricing_type="paid", price=Decimal("20.00"))
        payload = {
            "name": "Studio Pack",
            "price": "50.00",
            "items": [{"content_type": "onsite_event", "object_id": event.pk}],
        }
        response = make_client(owner).post("/api/v1/billing/bundles/", data=payload, format="json")
        assert response.status_code == 201, response.content
        assert response.json()["items"][0]["content_type_name"] == "live.onsiteevent"

    def test_bundle_currency_is_the_tenants_not_the_clients(self, owner, course):
        """Students must never see a currency the coach did not charge in."""
        from apps.billing.models import Bundle
        from apps.core.currency import tenant_charge_currency

        client = make_client(owner)
        payload = {"name": "Cur Bundle", "price": "10.00", "currency": "TRY", "items": []}
        response = client.post("/api/v1/billing/bundles/", data=payload, format="json")
        assert response.status_code == 201, response.content
        assert Bundle.objects.get(name="Cur Bundle").currency == tenant_charge_currency()

    def test_student_cannot_create_bundle(self, student, course):
        client = make_client(student)
        payload = {"name": "Student Bundle", "price": "50.00"}
        response = client.post("/api/v1/billing/bundles/", data=payload, format="json")
        assert response.status_code == 403, response.content


@pytest.mark.django_db(transaction=True)
class TestBundleDetail:
    def test_get_detail_with_items(self, bundle, student):
        client = make_client(student)
        response = client.get(f"/api/v1/billing/bundles/{bundle.pk}/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["id"] == bundle.pk
        assert "items" in data
        assert len(data["items"]) == 1
        assert "original_price" in data

    def test_original_price_leaves_out_a_covered_price(self, bundle, owner, student):
        # Free with no window keeps its price on the item, covered: the bundle saves nothing on it.
        covered = Course.objects.create(
            title="Free", slug="free-covered", instructor=owner, pricing_type="free", price=Decimal("49.00")
        )
        BundleItem.objects.create(
            bundle=bundle, content_type=ContentType.objects.get_for_model(Course), object_id=covered.pk
        )
        data = make_client(student).get(f"/api/v1/billing/bundles/{bundle.pk}/").json()
        assert Decimal(str(data["original_price"])) == Decimal("99.00")
        from apps.billing.views.store import _bundle_original_price

        assert _bundle_original_price(bundle) == Decimal("99.00")

    def test_owner_updates_bundle(self, bundle, owner):
        client = make_client(owner)
        response = client.patch(
            f"/api/v1/billing/bundles/{bundle.pk}/",
            data={"name": "Updated Bundle Name"},
            format="json",
        )
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["name"] == "Updated Bundle Name"

    def test_delete_soft_deletes(self, bundle, owner):
        client = make_client(owner)
        response = client.delete(f"/api/v1/billing/bundles/{bundle.pk}/")
        assert response.status_code == 204, response.content
        bundle.refresh_from_db()
        assert bundle.is_active is False


# ---------------------------------------------------------------------------
# Tests: an unpublished (draft) bundle
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestUnpublishedBundle:
    def test_an_unpublished_bundle_is_not_in_the_store(self, bundle, owner, student):
        draft = Bundle.objects.create(name="Draft Bundle", price=Decimal("59.00"), currency="USD", is_published=False)
        for viewer in (None, student):
            client = make_client(viewer)
            assert [i["title"] for i in client.get("/api/v1/billing/store/?type=bundle").json()] == ["Test Bundle"]
            assert [b["name"] for b in client.get("/api/v1/billing/bundles/").json()] == ["Test Bundle"]
            assert client.get(f"/api/v1/billing/bundles/{draft.pk}/").status_code == 404
        # The coach still sees her draft: in her bundles list, its page and her products.
        coach = make_client(owner)
        listed = {b["name"]: b["is_published"] for b in coach.get("/api/v1/billing/bundles/").json()}
        assert listed == {"Test Bundle": True, "Draft Bundle": False}
        assert coach.get(f"/api/v1/billing/bundles/{draft.pk}/").status_code == 200
        products = {i["title"] for i in coach.get("/api/v1/billing/products/").json()}
        assert products == {"Test Course", "Test Bundle", "Draft Bundle"}
        # Publishing puts it on sale.
        resp = coach.patch(f"/api/v1/billing/bundles/{draft.pk}/", {"is_published": True}, format="json")
        assert resp.status_code == 200 and resp.json()["is_published"] is True, resp.content
        store = make_client(student).get("/api/v1/billing/store/?type=bundle").json()
        assert {i["title"] for i in store} == {"Test Bundle", "Draft Bundle"}

    def test_existing_bundles_stay_published(self, bundle):
        # The migration adds the flag as published: nothing she sells today goes dark.
        assert bundle.is_published is True
        assert Bundle._meta.get_field("is_published").default is True
        assert Bundle.objects.filter(is_published=False).count() == 0
