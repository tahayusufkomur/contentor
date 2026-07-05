import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, Lesson, Module
from apps.downloads.models import DownloadFile
from apps.media.models import Photo
from apps.tenant_config.models import SeededObject, TenantConfig
from apps.tenant_config.seeding import register_seeded

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach-demo@x.com", name="Coach", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def seeded(coach):
    TenantConfig.objects.get_or_create(brand_name="T")
    photo = Photo.objects.create(s3_key="demo/photos/yoga_1.jpg", title="p")
    untouched = Course.objects.create(
        title="Demo Course", slug="demo-c-erasetest", instructor=coach, thumbnail=photo
    )
    edited = Course.objects.create(title="Edited Course", slug="demo-e-erasetest", instructor=coach)
    m = Module.objects.create(course=edited, title="M", order=1)
    Lesson.objects.create(module=m, title="L", order=1)
    dl = DownloadFile.objects.create(title="Demo DL")
    register_seeded([photo, untouched, edited, dl], niche="general")
    # Coach edits one course AFTER seeding:
    edited.title = "My Real Course Now"
    edited.save()
    yield {"photo": photo, "untouched": untouched, "edited": edited, "dl": dl}
    SeededObject.objects.all().delete()
    Course.objects.filter(slug__endswith="erasetest").delete()
    DownloadFile.objects.filter(title__in=["Demo DL"]).delete()
    Photo.objects.filter(pk=photo.pk).delete()


def test_demo_content_ids_and_counts(client, seeded):
    body = client.get("/api/v1/admin/demo-content/").json()
    assert body["present"] is True
    assert body["counts"]["courses"] == 2
    assert body["counts"]["downloads"] == 1
    assert body["counts"]["photos"] == 1
    assert str(seeded["untouched"].pk) in body["ids"]["courses"]


def test_erase_deletes_untouched_keeps_edited(client, seeded):
    body = client.post("/api/v1/admin/demo-content/erase/").json()
    assert body["deleted"]["courses"] == 1
    assert body["kept"]["courses"] == 1
    assert body["deleted"]["downloads"] == 1
    assert not Course.objects.filter(pk=seeded["untouched"].pk).exists()
    assert Course.objects.filter(pk=seeded["edited"].pk).exists()
    assert SeededObject.objects.count() == 0  # registry fully drained
    # Idempotent rerun:
    body2 = client.post("/api/v1/admin/demo-content/erase/").json()
    assert body2["deleted"] == {}


def test_erase_keeps_photo_referenced_by_kept_course(client, coach, seeded):
    # Point the EDITED (kept) course at the demo photo, then erase.
    seeded["edited"].thumbnail = seeded["photo"]
    seeded["edited"].save()
    client.post("/api/v1/admin/demo-content/erase/")
    assert Photo.objects.filter(pk=seeded["photo"].pk).exists()
