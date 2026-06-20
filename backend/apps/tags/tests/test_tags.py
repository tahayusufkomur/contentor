"""Tests for the flat per-content-type tag system: model + CRUD endpoints.

Assignment + scope enforcement on the content-type serializers live in each
app's own tests. Uses shared tenant fixtures from conftest."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tags.models import Tag

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@tagtest.com", name="Owner", password="secret123", role="owner"
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@tagtest.com", name="Student", password="secret123", role="student"
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
class TestModels:
    def test_slug_derived(self, tenant_ctx):
        t = Tag.objects.create(scope="course", name="Summer 2026")
        assert t.slug == "summer-2026"

    def test_slug_unique_per_scope(self, tenant_ctx):
        a = Tag.objects.create(scope="course", name="Beginner")
        # same name+scope with empty slug -> suffixed
        b = Tag.objects.create(scope="course", name="Beginner")
        # same slug allowed in a different scope (separate pool)
        c = Tag.objects.create(scope="video", name="Beginner")
        assert a.slug == "beginner"
        assert b.slug == "beginner-1"
        assert c.slug == "beginner"


@pytest.mark.django_db(transaction=True)
class TestEndpoints:
    def test_coach_creates_tag(self, tenant_ctx, owner):
        resp = make_client(owner).post(
            "/api/v1/tags/", {"scope": "video", "name": "Tutorial"}, format="json"
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert body["scope"] == "video"
        assert body["slug"] == "tutorial"

    def test_create_is_get_or_create_within_scope(self, tenant_ctx, owner):
        first = make_client(owner).post(
            "/api/v1/tags/", {"scope": "course", "name": "Webinar"}, format="json"
        )
        assert first.status_code == 201, first.content
        again = make_client(owner).post(
            "/api/v1/tags/", {"scope": "course", "name": "  Webinar "}, format="json"
        )
        # Same name in the same scope returns the existing tag, no duplicate.
        assert again.status_code == 200, again.content
        assert again.json()["id"] == first.json()["id"]
        assert Tag.objects.filter(scope="course", slug="webinar").count() == 1

    def test_create_rejects_bad_scope(self, tenant_ctx, owner):
        resp = make_client(owner).post(
            "/api/v1/tags/", {"scope": "nope", "name": "X"}, format="json"
        )
        assert resp.status_code == 400, resp.content

    def test_list_filtered_by_scope(self, tenant_ctx, owner):
        Tag.objects.create(scope="course", name="Alpha")
        Tag.objects.create(scope="video", name="Beta")
        rows = make_client(owner).get("/api/v1/tags/?scope=course").json()
        scopes = {r["scope"] for r in rows}
        names = {r["name"] for r in rows}
        assert scopes == {"course"}
        assert "Alpha" in names and "Beta" not in names

    def test_rename_reslugs(self, tenant_ctx, owner):
        t = Tag.objects.create(scope="download", name="Old")
        resp = make_client(owner).patch(
            f"/api/v1/tags/{t.pk}/", {"name": "New Name"}, format="json"
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["slug"] == "new-name"

    def test_delete_tag(self, tenant_ctx, owner):
        t = Tag.objects.create(scope="event", name="Temp")
        resp = make_client(owner).delete(f"/api/v1/tags/{t.pk}/")
        assert resp.status_code == 204
        assert not Tag.objects.filter(pk=t.pk).exists()

    def test_student_cannot_create(self, tenant_ctx, student):
        resp = make_client(student).post(
            "/api/v1/tags/", {"scope": "course", "name": "Nope"}, format="json"
        )
        assert resp.status_code == 403, resp.content
        assert not Tag.objects.filter(name="Nope").exists()


@pytest.mark.django_db(transaction=True)
class TestScopedAssignment:
    """The content-type serializers only accept tags from their own pool."""

    def test_course_serializer_assigns_course_tag(self, tenant_ctx, owner):
        from apps.courses.models import Course
        from apps.courses.serializers import CourseCreateUpdateSerializer

        tag = Tag.objects.create(scope="course", name="Featured")
        ser = CourseCreateUpdateSerializer(data={"title": "Yoga", "tag_ids": [tag.pk]})
        assert ser.is_valid(), ser.errors
        course = ser.save(instructor=owner)
        assert list(course.tags.values_list("pk", flat=True)) == [tag.pk]
        assert isinstance(course, Course)

    def test_course_serializer_rejects_foreign_scope_tag(self, tenant_ctx, owner):
        from apps.courses.serializers import CourseCreateUpdateSerializer

        video_tag = Tag.objects.create(scope="video", name="Tutorial")
        ser = CourseCreateUpdateSerializer(data={"title": "Yoga", "tag_ids": [video_tag.pk]})
        # A video-pool tag is invisible to the course-scoped queryset.
        assert not ser.is_valid()
        assert "tag_ids" in ser.errors


@pytest.mark.django_db(transaction=True)
class TestTagListFilter:
    def test_course_list_filters_by_tag(self, tenant_ctx, owner):
        from apps.courses.models import Course

        tag = Tag.objects.create(scope="course", name="Featured")
        tagged = Course.objects.create(title="Tagged", slug="tagged-course", instructor=owner)
        tagged.tags.add(tag)
        Course.objects.create(title="Plain", slug="plain-course", instructor=owner)

        rows = make_client(owner).get(f"/api/v1/courses/?tags={tag.pk}").json()
        slugs = {c["slug"] for c in rows}
        assert "tagged-course" in slugs
        assert "plain-course" not in slugs

    def test_adminkit_course_filter_schema_lists_tags(self, tenant_ctx):
        from apps.adminkit.introspection import filter_schema
        from apps.adminkit.sites import studio_site
        from apps.courses.models import Course

        tag = Tag.objects.create(scope="course", name="Promoted")
        admin = next(a for a in studio_site._registry.values() if a.model is Course)
        entry = next((f for f in filter_schema(admin) if f["name"] == "tags"), None)
        assert entry is not None
        assert entry["type"] == "choice"
        assert any(c["value"] == tag.pk for c in entry["choices"])
