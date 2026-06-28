"""Tests for the custom filter taxonomy: models, CRUD endpoints, and the
adminkit M2M list-filter descriptor. Uses shared tenant fixtures from conftest."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.filters.models import FilterGroup, FilterOption

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@filtertest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@filtertest.com", name="Student", password="secret123", role="student"
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
class TestModels:
    def test_group_slug(self, tenant_ctx):
        g = FilterGroup.objects.create(name="Skill Level")
        assert g.slug == "skill-level"

    def test_option_slug_unique_per_group(self, tenant_ctx):
        g1 = FilterGroup.objects.create(name="Level")
        g2 = FilterGroup.objects.create(name="Style")
        a = FilterOption.objects.create(group=g1, name="Beginner")
        # same name under same group -> suffixed slug
        b = FilterOption.objects.create(group=g1, name="Beginner")
        # same slug allowed under a different group
        c = FilterOption.objects.create(group=g2, name="Beginner")
        assert a.slug == "beginner"
        assert b.slug == "beginner-1"
        assert c.slug == "beginner"


@pytest.mark.django_db(transaction=True)
class TestEndpoints:
    def test_coach_creates_group(self, tenant_ctx, owner):
        resp = make_client(owner).post(
            "/api/v1/filters/groups/", {"name": "Difficulty", "applies_to": "course"}, format="json"
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["slug"].startswith("difficulty")
        assert resp.json()["applies_to"] == "course"

    def test_student_cannot_create_group(self, tenant_ctx, student):
        resp = make_client(student).post("/api/v1/filters/groups/", {"name": "Nope"}, format="json")
        assert resp.status_code == 403, resp.content
        assert not FilterGroup.objects.filter(name="Nope").exists()

    def test_create_option_under_group(self, tenant_ctx, owner):
        g = FilterGroup.objects.create(name="Level")
        resp = make_client(owner).post("/api/v1/filters/options/", {"group": g.pk, "name": "Beginner"}, format="json")
        assert resp.status_code == 201, resp.content
        assert resp.json()["group_name"] == "Level"
        assert g.options.filter(name="Beginner").exists()

    def test_groups_list_applies_to_filter(self, tenant_ctx, owner):
        FilterGroup.objects.create(name="CourseOnly", applies_to="course")
        FilterGroup.objects.create(name="EventOnly", applies_to="event")
        FilterGroup.objects.create(name="Shared", applies_to="both")
        names = {g["name"] for g in make_client(owner).get("/api/v1/filters/groups/?applies_to=course").json()}
        assert "CourseOnly" in names and "Shared" in names and "EventOnly" not in names


@pytest.mark.django_db(transaction=True)
class TestAdminkitFilter:
    def test_course_admin_filter_schema_lists_options(self, tenant_ctx):
        from apps.adminkit.introspection import filter_schema
        from apps.adminkit.sites import studio_site
        from apps.courses.models import Course

        g = FilterGroup.objects.create(name="Level")
        opt = FilterOption.objects.create(group=g, name="Beginner")
        admin = next(a for a in studio_site._registry.values() if a.model is Course)
        schema = filter_schema(admin)
        entry = next((f for f in schema if f["name"] == "filter_options"), None)
        assert entry is not None, schema
        assert entry["type"] == "choice"
        assert any(c["value"] == opt.pk for c in entry["choices"])
