"""Course ↔ filter_options round-trip + list serializer exposure."""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.filters.models import FilterGroup, FilterOption

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@coursefilter.com", name="Owner", password="secret123", role="owner"
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def options(tenant_ctx):
    g = FilterGroup.objects.create(name="Level", applies_to="course")
    return (
        FilterOption.objects.create(group=g, name="Beginner"),
        FilterOption.objects.create(group=g, name="Advanced"),
    )


@pytest.mark.django_db(transaction=True)
class TestCourseFilterOptions:
    def test_create_with_filter_option_ids(self, tenant_ctx, owner, options):
        a, b = options
        resp = make_client(owner).post(
            "/api/v1/courses/",
            {"title": "Tagged", "pricing_type": "free", "price": "0", "filter_option_ids": [a.pk, b.pk]},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert {o["id"] for o in resp.json()["filter_options"]} == {a.pk, b.pk}

    def test_update_filter_option_ids(self, tenant_ctx, owner, options):
        a, b = options
        course = Course.objects.create(
            title="C", slug="c", instructor=owner, pricing_type="free", price=Decimal("0")
        )
        course.filter_options.add(a)
        resp = make_client(owner).put(
            f"/api/v1/courses/{course.slug}/",
            {"title": "C", "pricing_type": "free", "price": "0", "filter_option_ids": [b.pk]},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert list(course.filter_options.values_list("pk", flat=True)) == [b.pk]

    def test_list_includes_filter_options(self, tenant_ctx, owner, options):
        a, _ = options
        course = Course.objects.create(
            title="Pub", slug="pub", instructor=owner, pricing_type="free", price=Decimal("0"), is_published=True
        )
        course.filter_options.add(a)
        resp = make_client(owner).get("/api/v1/courses/")
        pub = next(c for c in resp.json() if c["slug"] == "pub")
        assert [o["name"] for o in pub["filter_options"]] == ["Beginner"]
        assert pub["filter_options"][0]["group_name"] == "Level"
