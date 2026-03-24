"""
Plan Access API tests.

Tests for:
  - GET /api/v1/billing/plans/{id}/access/  (IsOwner)
  - PUT /api/v1/billing/plans/{id}/access/  (IsOwner)

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
from apps.courses.models import Course

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
        currency="TRY",
        is_active=True,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestPlanAccess:
    def test_get_empty_access(self, plan, owner_client):
        """GET returns empty list when no access items exist."""
        response = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/")
        assert response.status_code == 200, response.content
        assert response.json() == []

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
        data = response.json()
        assert len(data) == 1
        assert data[0]["object_id"] == course.pk
        assert "course" in data[0]["content_type_name"]

    def test_put_replaces_access(self, plan, course, owner_client):
        """PUT replaces existing access items — old ones are deleted."""
        from django.contrib.contenttypes.models import ContentType

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
        assert len(resp1.json()) == 1

        # Second PUT: replace with second course only
        payload_second = {"items": [{"content_type": "course", "object_id": second_course.pk}]}
        resp2 = owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data=payload_second,
            format="json",
        )
        assert resp2.status_code == 200, resp2.content
        data = resp2.json()
        assert len(data) == 1
        assert data[0]["object_id"] == second_course.pk

        # Verify the first course's access item is gone
        ct = ContentType.objects.get_for_model(Course)
        assert not SubscriptionPlanAccess.objects.filter(plan=plan, content_type=ct, object_id=course.pk).exists()

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
