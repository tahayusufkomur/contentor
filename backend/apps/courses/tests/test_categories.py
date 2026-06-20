"""
Tests for the course category taxonomy:
  - CourseCategory model slug generation + uniqueness
  - category_list_create / category_detail endpoints (coach-only writes)
  - URL routing guard (categories/ not captured by the <slug> course route)
  - Course create/update round-trips category_ids
  - CourseListSerializer exposes categories

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, CourseCategory

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@catviewtest.com", name="Owner", password="secret123", role="owner"
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@catviewtest.com", name="Student", password="secret123", role="student"
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
class TestCourseCategoryModel:
    def test_slug_generated_from_name(self, tenant_ctx):
        cat = CourseCategory.objects.create(name="Yoga Basics")
        assert cat.slug == "yoga-basics"

    def test_duplicate_names_get_unique_slugs(self, tenant_ctx):
        a = CourseCategory.objects.create(name="Strength")
        b = CourseCategory.objects.create(name="Strength")
        assert a.slug == "strength"
        assert b.slug == "strength-1"

    def test_course_count_property(self, tenant_ctx, owner):
        cat = CourseCategory.objects.create(name="Flow")
        course = Course.objects.create(
            title="Vinyasa", slug="vinyasa", instructor=owner, pricing_type="free", price=Decimal("0")
        )
        course.categories.add(cat)
        assert cat.course_count == 1


@pytest.mark.django_db(transaction=True)
class TestCategoryEndpoints:
    def test_list_ordered_by_order_then_name(self, tenant_ctx, owner):
        CourseCategory.objects.create(name="OrderBeta", order=2)
        CourseCategory.objects.create(name="OrderAlpha", order=1)
        resp = make_client(owner).get("/api/v1/courses/categories/")
        assert resp.status_code == 200, resp.content
        # Robust to any categories leaked from sibling tests (tenant schema isn't
        # rolled back): check the relative order of the two we created.
        names = [c["name"] for c in resp.json() if c["name"].startswith("Order")]
        assert names == ["OrderAlpha", "OrderBeta"]

    def test_categories_route_not_captured_by_slug(self, tenant_ctx, owner):
        """`categories/` must resolve to the category view, not course_detail
        (which would 404 on a course with slug 'categories')."""
        resp = make_client(owner).get("/api/v1/courses/categories/")
        assert resp.status_code == 200, resp.content
        assert isinstance(resp.json(), list)

    def test_coach_can_create_category(self, tenant_ctx, owner):
        resp = make_client(owner).post(
            "/api/v1/courses/categories/", {"name": "Mobility"}, format="json"
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["slug"] == "mobility"
        assert CourseCategory.objects.filter(name="Mobility").exists()

    def test_student_cannot_create_category(self, tenant_ctx, student):
        resp = make_client(student).post(
            "/api/v1/courses/categories/", {"name": "Sneaky"}, format="json"
        )
        assert resp.status_code == 403, resp.content
        assert not CourseCategory.objects.filter(name="Sneaky").exists()

    def test_delete_category(self, tenant_ctx, owner):
        cat = CourseCategory.objects.create(name="Temp")
        resp = make_client(owner).delete(f"/api/v1/courses/categories/{cat.pk}/")
        assert resp.status_code == 204, resp.content
        assert not CourseCategory.objects.filter(pk=cat.pk).exists()


@pytest.mark.django_db(transaction=True)
class TestCourseCategoryRoundTrip:
    def test_create_course_with_category_ids(self, tenant_ctx, owner):
        a = CourseCategory.objects.create(name="A")
        b = CourseCategory.objects.create(name="B")
        resp = make_client(owner).post(
            "/api/v1/courses/",
            {"title": "Tagged Course", "pricing_type": "free", "price": "0", "category_ids": [a.pk, b.pk]},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        returned_ids = {c["id"] for c in resp.json()["categories"]}
        assert returned_ids == {a.pk, b.pk}

    def test_update_course_category_ids(self, tenant_ctx, owner):
        a = CourseCategory.objects.create(name="A")
        b = CourseCategory.objects.create(name="B")
        course = Course.objects.create(
            title="C", slug="c", instructor=owner, pricing_type="free", price=Decimal("0")
        )
        course.categories.add(a)
        resp = make_client(owner).put(
            f"/api/v1/courses/{course.slug}/",
            {"title": "C", "pricing_type": "free", "price": "0", "category_ids": [b.pk]},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert list(course.categories.values_list("pk", flat=True)) == [b.pk]

    def test_list_serializer_includes_categories(self, tenant_ctx, owner):
        cat = CourseCategory.objects.create(name="Featured")
        course = Course.objects.create(
            title="Pub", slug="pub", instructor=owner, pricing_type="free", price=Decimal("0"), is_published=True
        )
        course.categories.add(cat)
        resp = make_client(owner).get("/api/v1/courses/")
        assert resp.status_code == 200, resp.content
        pub = next(c for c in resp.json() if c["slug"] == "pub")
        assert [c["name"] for c in pub["categories"]] == ["Featured"]
