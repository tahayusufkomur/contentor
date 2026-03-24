"""
Integration tests for courses API views.

Tests all course endpoints via APIClient with tenant context:
  - Course CRUD (list, create, detail, update, delete)
  - Enrollment (free, paid, duplicate)
  - Progress tracking
  - Module / Lesson / Video CRUD

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, Enrollment, Lesson, Module, Video

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@courseviewtest.com",
        name="Owner",
        password="secret123",
        role="owner",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@courseviewtest.com",
        name="Student",
        password="secret123",
        role="student",
    )


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@courseviewtest.com",
        name="Coach",
        password="secret123",
        role="coach",
    )


# ---------------------------------------------------------------------------
# Content fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def published_course(tenant_ctx, owner):
    return Course.objects.create(
        title="Published Course",
        slug="published-course",
        instructor=owner,
        pricing_type="free",
        price=Decimal("0.00"),
        is_published=True,
    )


@pytest.fixture()
def unpublished_course(tenant_ctx, owner):
    return Course.objects.create(
        title="Unpublished Course",
        slug="unpublished-course",
        instructor=owner,
        pricing_type="free",
        price=Decimal("0.00"),
        is_published=False,
    )


@pytest.fixture()
def module(tenant_ctx, published_course):
    return Module.objects.create(course=published_course, title="Module 1", order=1)


@pytest.fixture()
def lesson(tenant_ctx, module):
    return Lesson.objects.create(module=module, title="Lesson 1", order=1, duration_seconds=120)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Tests: course_list_create  GET/POST /api/v1/courses/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCourseListCreate:
    def test_student_sees_only_published(self, published_course, unpublished_course, student):
        """Students should only see published courses."""
        client = make_client(student)
        resp = client.get("/api/v1/courses/")
        assert resp.status_code == 200, resp.content
        slugs = [c["slug"] for c in resp.json()]
        assert "published-course" in slugs
        assert "unpublished-course" not in slugs

    def test_owner_sees_all(self, published_course, unpublished_course, owner):
        """Owner sees both published and unpublished courses."""
        client = make_client(owner)
        resp = client.get("/api/v1/courses/")
        assert resp.status_code == 200, resp.content
        slugs = [c["slug"] for c in resp.json()]
        assert "published-course" in slugs
        assert "unpublished-course" in slugs

    def test_search_filter(self, published_course, unpublished_course, owner):
        """Search parameter filters courses by title."""
        client = make_client(owner)
        resp = client.get("/api/v1/courses/?search=Published")
        assert resp.status_code == 200, resp.content
        data = resp.json()
        assert len(data) >= 1
        for item in data:
            assert "published" in item["title"].lower()

    def test_pricing_type_filter(self, published_course, owner):
        """pricing_type filter returns matching courses."""
        client = make_client(owner)
        resp = client.get("/api/v1/courses/?pricing_type=free")
        assert resp.status_code == 200, resp.content
        data = resp.json()
        assert len(data) >= 1
        for item in data:
            assert item["pricing_type"] == "free"

    def test_owner_can_request_paginated_course_list(self, published_course, unpublished_course, owner):
        """If limit/offset are provided, list response is paginated."""
        client = make_client(owner)
        resp = client.get("/api/v1/courses/?limit=1&offset=0&ordering=title")
        assert resp.status_code == 200, resp.content
        data = resp.json()
        assert isinstance(data, dict)
        assert {"count", "next", "results"}.issubset(data.keys())
        assert data["count"] >= 2
        assert len(data["results"]) == 1

    def test_owner_creates_course(self, owner):
        """Owner can create a course via POST."""
        client = make_client(owner)
        payload = {"title": "New Course", "pricing_type": "free"}
        resp = client.post("/api/v1/courses/", payload, format="json")
        assert resp.status_code == 201, resp.content
        assert resp.json()["title"] == "New Course"

    def test_student_cannot_create_course(self, student):
        """Students get 403 when trying to create a course."""
        client = make_client(student)
        payload = {"title": "Forbidden Course", "pricing_type": "free"}
        resp = client.post("/api/v1/courses/", payload, format="json")
        assert resp.status_code == 403, resp.content


# ---------------------------------------------------------------------------
# Tests: course_detail  GET/PUT/DELETE /api/v1/courses/<slug>/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCourseDetail:
    def test_published_course_visible_to_all(self, published_course, student):
        """Any authenticated user can view a published course."""
        client = make_client(student)
        resp = client.get(f"/api/v1/courses/{published_course.slug}/")
        assert resp.status_code == 200, resp.content

    def test_unpublished_returns_404_for_student(self, unpublished_course, student):
        """Students get 404 for unpublished courses."""
        client = make_client(student)
        resp = client.get(f"/api/v1/courses/{unpublished_course.slug}/")
        assert resp.status_code == 404, resp.content

    def test_unpublished_visible_to_owner(self, unpublished_course, owner):
        """Owner can view unpublished courses."""
        client = make_client(owner)
        resp = client.get(f"/api/v1/courses/{unpublished_course.slug}/")
        assert resp.status_code == 200, resp.content

    def test_owner_updates_course(self, published_course, owner):
        """Owner can update a course via PUT."""
        client = make_client(owner)
        resp = client.put(
            f"/api/v1/courses/{published_course.slug}/",
            {"title": "Updated Title"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["title"] == "Updated Title"

    def test_student_cannot_update_course(self, published_course, student):
        """Students get 403 on PUT."""
        client = make_client(student)
        resp = client.put(
            f"/api/v1/courses/{published_course.slug}/",
            {"title": "Hacked"},
            format="json",
        )
        assert resp.status_code == 403, resp.content

    def test_owner_deletes_course(self, published_course, owner):
        """Owner can delete a course."""
        client = make_client(owner)
        resp = client.delete(f"/api/v1/courses/{published_course.slug}/")
        assert resp.status_code == 204, resp.content

    def test_student_cannot_delete_course(self, published_course, student):
        """Students get 403 on DELETE."""
        client = make_client(student)
        resp = client.delete(f"/api/v1/courses/{published_course.slug}/")
        assert resp.status_code == 403, resp.content

    def test_coach_cannot_delete_course(self, published_course, coach):
        """Coaches get 403 on DELETE (only owner can delete)."""
        client = make_client(coach)
        resp = client.delete(f"/api/v1/courses/{published_course.slug}/")
        assert resp.status_code == 403, resp.content


# ---------------------------------------------------------------------------
# Tests: enroll  POST /api/v1/courses/<slug>/enroll/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestEnroll:
    def test_free_course_enrollment(self, published_course, student):
        """Student can enroll in a free course."""
        client = make_client(student)
        resp = client.post(f"/api/v1/courses/{published_course.slug}/enroll/")
        assert resp.status_code == 201, resp.content

    def test_already_enrolled_returns_409(self, published_course, student):
        """Duplicate enrollment returns 409."""
        Enrollment.objects.create(user=student, course=published_course)
        client = make_client(student)
        resp = client.post(f"/api/v1/courses/{published_course.slug}/enroll/")
        assert resp.status_code == 409, resp.content

    def test_paid_course_without_payment_returns_400(self, owner, student):
        """Paid course enrollment without purchase returns 400."""
        paid = Course.objects.create(
            title="Paid Course",
            slug="paid-course-enroll",
            instructor=owner,
            pricing_type="paid",
            price=Decimal("49.00"),
            is_published=True,
        )
        client = make_client(student)
        resp = client.post(f"/api/v1/courses/{paid.slug}/enroll/")
        assert resp.status_code == 400, resp.content

    def test_unauthenticated_returns_401(self, published_course):
        """Unauthenticated users get 401."""
        client = make_client()
        resp = client.post(f"/api/v1/courses/{published_course.slug}/enroll/")
        assert resp.status_code in (401, 403), resp.content


# ---------------------------------------------------------------------------
# Tests: enrolled_courses  GET /api/v1/courses/enrolled/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestEnrolledCourses:
    def test_returns_enrolled_courses_with_progress(self, published_course, module, lesson, student):
        """Enrolled courses include progress_percent."""
        Enrollment.objects.create(user=student, course=published_course)
        client = make_client(student)
        resp = client.get("/api/v1/courses/enrolled/")
        assert resp.status_code == 200, resp.content
        data = resp.json()
        assert len(data) == 1
        assert "progress_percent" in data[0]
        assert data[0]["slug"] == "published-course"


# ---------------------------------------------------------------------------
# Tests: course_progress  GET/POST /api/v1/courses/<slug>/progress/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCourseProgress:
    def test_enrolled_student_sees_progress(self, published_course, module, lesson, student):
        """Enrolled student can GET progress."""
        Enrollment.objects.create(user=student, course=published_course)
        client = make_client(student)
        resp = client.get(f"/api/v1/courses/{published_course.slug}/progress/")
        assert resp.status_code == 200, resp.content

    def test_not_enrolled_student_gets_403(self, published_course, student):
        """Non-enrolled student gets 403."""
        client = make_client(student)
        resp = client.get(f"/api/v1/courses/{published_course.slug}/progress/")
        assert resp.status_code == 403, resp.content

    def test_post_creates_progress(self, published_course, module, lesson, student):
        """POST creates or updates progress for a lesson."""
        Enrollment.objects.create(user=student, course=published_course)
        client = make_client(student)
        resp = client.post(
            f"/api/v1/courses/{published_course.slug}/progress/",
            {"lesson": lesson.pk, "completed": True},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["completed"] is True


# ---------------------------------------------------------------------------
# Tests: module_create  POST /api/v1/courses/<slug>/modules/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestModuleCreate:
    def test_owner_creates_module(self, published_course, owner):
        """Owner can create a module."""
        client = make_client(owner)
        resp = client.post(
            f"/api/v1/courses/{published_course.slug}/modules/",
            {"title": "New Module", "order": 1},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["title"] == "New Module"

    def test_student_cannot_create_module(self, published_course, student):
        """Students get 403."""
        client = make_client(student)
        resp = client.post(
            f"/api/v1/courses/{published_course.slug}/modules/",
            {"title": "Forbidden Module", "order": 1},
            format="json",
        )
        assert resp.status_code == 403, resp.content


# ---------------------------------------------------------------------------
# Tests: module_detail  PUT/DELETE /api/v1/courses/<slug>/modules/<id>/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestModuleDetail:
    def test_owner_updates_module(self, published_course, module, owner):
        """Owner can update a module via PUT."""
        client = make_client(owner)
        resp = client.put(
            f"/api/v1/courses/{published_course.slug}/modules/{module.pk}/",
            {"title": "Updated Module"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["title"] == "Updated Module"

    def test_owner_deletes_module(self, published_course, module, owner):
        """Owner can delete a module."""
        client = make_client(owner)
        resp = client.delete(f"/api/v1/courses/{published_course.slug}/modules/{module.pk}/")
        assert resp.status_code == 204, resp.content


# ---------------------------------------------------------------------------
# Tests: lesson_create  POST /api/v1/courses/<slug>/modules/<id>/lessons/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestLessonCreate:
    def test_owner_creates_lesson(self, published_course, module, owner):
        """Owner can create a lesson."""
        client = make_client(owner)
        resp = client.post(
            f"/api/v1/courses/{published_course.slug}/modules/{module.pk}/lessons/",
            {"title": "New Lesson", "order": 1},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["title"] == "New Lesson"


# ---------------------------------------------------------------------------
# Tests: lesson_detail  PUT/DELETE /api/v1/courses/<slug>/lessons/<id>/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestLessonDetail:
    def test_owner_updates_lesson(self, published_course, lesson, owner):
        """Owner can update a lesson via PUT."""
        client = make_client(owner)
        resp = client.put(
            f"/api/v1/courses/{published_course.slug}/lessons/{lesson.pk}/",
            {"title": "Updated Lesson"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["title"] == "Updated Lesson"

    def test_owner_deletes_lesson(self, published_course, lesson, owner):
        """Owner can delete a lesson."""
        client = make_client(owner)
        resp = client.delete(f"/api/v1/courses/{published_course.slug}/lessons/{lesson.pk}/")
        assert resp.status_code == 204, resp.content


# ---------------------------------------------------------------------------
# Tests: video_list_create  GET/POST /api/v1/courses/videos/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestVideoListCreate:
    def test_owner_lists_videos(self, owner):
        """Owner can list videos."""
        Video.objects.create(title="Test Video", s3_key="videos/test.mp4")
        client = make_client(owner)
        resp = client.get("/api/v1/courses/videos/")
        assert resp.status_code == 200, resp.content
        data = resp.json()
        assert data["count"] >= 1

    def test_owner_creates_video(self, owner):
        """Owner can create a video."""
        client = make_client(owner)
        resp = client.post(
            "/api/v1/courses/videos/",
            {"title": "New Video", "s3_key": "videos/new.mp4"},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["title"] == "New Video"

    def test_student_cannot_list_videos(self, student):
        """Students get 403."""
        client = make_client(student)
        resp = client.get("/api/v1/courses/videos/")
        assert resp.status_code == 403, resp.content


# ---------------------------------------------------------------------------
# Tests: video_detail  GET/PUT/DELETE /api/v1/courses/videos/<id>/
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestVideoDetail:
    def test_owner_gets_video(self, owner):
        """Owner can retrieve a video by id."""
        video = Video.objects.create(title="Detail Video", s3_key="videos/detail.mp4")
        client = make_client(owner)
        resp = client.get(f"/api/v1/courses/videos/{video.pk}/")
        assert resp.status_code == 200, resp.content
        assert resp.json()["title"] == "Detail Video"

    def test_owner_updates_video(self, owner):
        """Owner can update a video via PUT."""
        video = Video.objects.create(title="Old Title", s3_key="videos/old.mp4")
        client = make_client(owner)
        resp = client.put(
            f"/api/v1/courses/videos/{video.pk}/",
            {"title": "New Title"},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["title"] == "New Title"

    def test_owner_deletes_video(self, owner):
        """Owner can delete a video."""
        video = Video.objects.create(title="Delete Me", s3_key="videos/delete.mp4")
        client = make_client(owner)
        resp = client.delete(f"/api/v1/courses/videos/{video.pk}/")
        assert resp.status_code == 204, resp.content

    def test_student_cannot_access_video(self, student):
        """Students get 403 on video detail."""
        video = Video.objects.create(title="Forbidden", s3_key="videos/forbidden.mp4")
        client = make_client(student)
        resp = client.get(f"/api/v1/courses/videos/{video.pk}/")
        assert resp.status_code == 403, resp.content
