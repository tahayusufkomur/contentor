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
        currency="TRY",
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
            "currency": "TRY",
            "is_active": True,
            "items": [{"content_type": "course", "object_id": course.pk}],
        }
        response = client.post("/api/v1/billing/bundles/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["name"] == "New Bundle"
        assert len(data["items"]) == 1
        assert data["items"][0]["object_id"] == course.pk

    def test_student_cannot_create_bundle(self, student, course):
        client = make_client(student)
        payload = {"name": "Student Bundle", "price": "50.00", "currency": "TRY"}
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
