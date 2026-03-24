"""
Store and Products API tests.

Tests for:
  - GET /api/v1/billing/store/  (AllowAny)
  - GET /api/v1/billing/products/  (IsCoachOrOwner)

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
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
    return User.objects.create_user(email="owner@storetest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@storetest.com", name="Student", password="secret123", role="student")


# ---------------------------------------------------------------------------
# Content fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def paid_course(tenant_ctx, owner):
    return Course.objects.create(
        title="Paid Course",
        slug="paid-course-store",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("99.00"),
        is_published=True,
    )


@pytest.fixture()
def free_course(tenant_ctx, owner):
    return Course.objects.create(
        title="Free Course",
        slug="free-course-store",
        instructor=owner,
        pricing_type="free",
        price=Decimal("0.00"),
        is_published=True,
    )


@pytest.fixture()
def paid_bundle(tenant_ctx, paid_course):
    from django.contrib.contenttypes.models import ContentType

    b = Bundle.objects.create(
        name="Paid Bundle",
        description="A bundle for store testing",
        price=Decimal("149.00"),
        currency="TRY",
        is_active=True,
    )
    ct = ContentType.objects.get_for_model(Course)
    BundleItem.objects.create(bundle=b, content_type=ct, object_id=paid_course.pk)
    return b


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Tests: Store endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestStoreList:
    def test_lists_paid_content_and_bundles(self, paid_course, paid_bundle, student):
        """Paid courses and active bundles both appear in the store."""
        client = make_client(student)
        response = client.get("/api/v1/billing/store/")
        assert response.status_code == 200, response.content
        data = response.json()
        types = [item["type"] for item in data]
        titles = [item["title"] for item in data]
        assert "course" in types
        assert "bundle" in types
        assert "Paid Course" in titles
        assert "Paid Bundle" in titles

    def test_excludes_free_content(self, free_course, paid_course, student):
        """Free courses do not appear in the store; paid ones do."""
        client = make_client(student)
        response = client.get("/api/v1/billing/store/")
        assert response.status_code == 200, response.content
        data = response.json()
        titles = [item["title"] for item in data]
        assert "Paid Course" in titles
        assert "Free Course" not in titles

    def test_filter_by_type(self, paid_course, paid_bundle, student):
        """?type=bundle returns only bundles."""
        client = make_client(student)
        response = client.get("/api/v1/billing/store/?type=bundle")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) >= 1
        for item in data:
            assert item["type"] == "bundle"

    def test_search(self, paid_course, paid_bundle, student):
        """?search=Paid filters results to items whose title contains 'Paid'."""
        client = make_client(student)
        response = client.get("/api/v1/billing/store/?search=Paid")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) >= 1
        for item in data:
            assert "paid" in item["title"].lower()

    def test_unauthenticated_sees_items(self, paid_course):
        """Unauthenticated client gets items with has_access=False."""
        client = APIClient(HTTP_HOST=SHARED_DOMAIN)
        response = client.get("/api/v1/billing/store/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) >= 1
        for item in data:
            assert "access_info" in item
            assert item["access_info"]["has_access"] is False


# ---------------------------------------------------------------------------
# Tests: Products endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestProductsList:
    def test_owner_sees_products(self, paid_course, owner):
        """Owner can access /products/ and response includes sales_count."""
        client = make_client(owner)
        response = client.get("/api/v1/billing/products/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) >= 1
        for item in data:
            assert "sales_count" in item

    def test_student_forbidden_products(self, paid_course, student):
        """Student receives 403 on /products/."""
        client = make_client(student)
        response = client.get("/api/v1/billing/products/")
        assert response.status_code == 403, response.content
