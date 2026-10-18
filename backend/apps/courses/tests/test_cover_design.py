"""A course carries its kept cover design: `cover_design` on the list, the detail and the student's own courses."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, Enrollment
from apps.media import designs
from apps.media.models import Photo

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
COURSES = "/api/v1/courses/"
COVER_KEYS = {"id", "recipe", "photos", "logo_url", "look"}


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="course-cover-coach@x.com", name="Coach", password="x", role="owner", is_staff=True
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="course-cover-student@x.com", name="Student", password="x", role="student")


def client(user=None):
    c = APIClient(HTTP_HOST=HOST)
    if user is not None:
        c.force_authenticate(user=user)
    return c


def photo(name):
    # "demo/" is a shared prefix every tenant may be handed a link to.
    return Photo.objects.create(s3_key=f"demo/{name}.jpg", title=name)


def course(coach, title="Yoga Basics"):
    return Course.objects.create(title=title, instructor=coach, is_published=True)


def kept(item, picture):
    draft = designs.open_draft("course", str(item.pk), recipe={"photo": {"id": str(picture.pk)}})
    designs.keep(draft)
    return draft


def design_reads(captured):
    """How often a request read the kept designs."""
    return sum('"media_design"' in query["sql"] for query in captured.captured_queries)


def test_course_payload_has_cover_design_after_keep(coach):
    item = course(coach)
    visitor = client()

    def payloads():
        listed = next(row for row in visitor.get(COURSES).json() if row["id"] == item.pk)
        return [listed, visitor.get(f"{COURSES}{item.slug}/").json()]

    assert [payload["cover_design"] for payload in payloads()] == [None, None]  # the plain photo

    picture = photo("chosen")
    design = kept(item, picture)

    for payload in payloads():
        cover = payload["cover_design"]
        assert set(cover) == COVER_KEYS
        assert cover["id"] == str(design.pk)
        assert cover["recipe"]["photo"]["id"] == str(picture.pk)
        assert list(cover["photos"]) == [str(picture.pk)]


def test_a_draft_is_not_the_cover(coach):
    item = course(coach)
    designs.open_draft("course", str(item.pk), recipe={"photo": {"id": str(photo("chosen").pk)}})

    assert client().get(f"{COURSES}{item.slug}/").json()["cover_design"] is None


def test_enrolled_courses_carry_the_cover_design(coach, student):
    item = course(coach)
    Enrollment.objects.create(user=student, course=item)
    design = kept(item, photo("chosen"))

    [row] = client(student).get(f"{COURSES}enrolled/").json()

    assert row["cover_design"]["id"] == str(design.pk)


def test_cover_reads_do_not_grow_with_courses(coach, student):
    def add(count, start):
        for number in range(start, start + count):
            item = course(coach, title=f"Course {number}")
            Enrollment.objects.create(user=student, course=item)
            kept(item, photo(f"p{number}"))

    def reads(path, user=None):
        with CaptureQueriesContext(connection) as captured:
            assert client(user).get(path).status_code == 200
        return design_reads(captured)

    def both():
        return reads(COURSES), reads(f"{COURSES}enrolled/", student)

    add(2, 0)
    few = both()
    add(3, 2)

    assert all(few)  # the designs are read at all,
    assert both() == few  # and once per request, however many courses it lists
