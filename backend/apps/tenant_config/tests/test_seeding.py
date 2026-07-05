import pytest

from apps.accounts.models import User
from apps.courses.models import Course, Lesson, Module
from apps.tenant_config.models import SeededObject
from apps.tenant_config.seeding import fingerprint_for, register_seeded

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="own@x.com", name="Own", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def course(owner):
    c = Course.objects.create(title="Demo A", slug="demo-a-seedtest", instructor=owner)
    m = Module.objects.create(course=c, title="M1", order=1)
    Lesson.objects.create(module=m, title="L1", order=1, content_html="<p>hi</p>")
    yield c
    SeededObject.objects.all().delete()
    c.delete()


def test_fingerprint_stable_and_lesson_sensitive(course):
    fp1 = fingerprint_for(course)
    assert fp1 == fingerprint_for(course)  # stable across recomputes
    lesson = Lesson.objects.get(module__course=course)
    lesson.content_html = "<p>coach edited this</p>"
    lesson.save()
    assert fingerprint_for(course) != fp1  # lesson edits protect the course


def test_register_seeded_idempotent(course):
    register_seeded([course], niche="general")
    register_seeded([course], niche="general")  # re-run must not raise
    rows = SeededObject.objects.all()
    assert rows.count() == 1
    row = rows.get()
    assert row.object_id == str(course.pk)
    assert row.niche == "general"
    assert row.fingerprint == fingerprint_for(course)
