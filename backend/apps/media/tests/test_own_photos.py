"""A coach's own photos: optimized in place, indexed in her own space of the
image service, and found by the composer before any catalog photo."""

import io
import uuid

import pytest
from django.core.cache import cache
from django.db import connection
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.curated_images import client as catalog
from apps.core.storage import build_s3_path
from apps.media import own_photos
from apps.media.models import Photo

SHARED_DOMAIN = "shared-test.localhost"


class FakeS3:
    """The four calls own_photos makes, kept in a dict."""

    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType="", Metadata=None):  # noqa: N803 - boto3's names
        self.objects[Key] = {"Body": Body, "ContentType": ContentType, "Metadata": Metadata or {}}

    def get_object(self, Bucket, Key):  # noqa: N803
        stored = self.objects[Key]
        return {"Body": io.BytesIO(stored["Body"]), "Metadata": stored["Metadata"]}

    def head_object(self, Bucket, Key):  # noqa: N803
        return {"ContentLength": len(self.objects[Key]["Body"])}


def image_bytes(width, height, fmt="JPEG", mode="RGB", seed="", **save):
    """A flat image; ``seed`` tints it, so two photos are never the same file."""
    tint = sum(seed.encode()) % 200
    out = io.BytesIO()
    Image.new(mode, (width, height), (180, tint, 40, 128)[: len(mode)]).save(out, fmt, **save)
    return out.getvalue()


@pytest.fixture()
def s3(monkeypatch):
    fake = FakeS3()
    monkeypatch.setattr(own_photos, "get_s3_client", lambda: fake)
    return fake


@pytest.fixture()
def upload(tenant_ctx, s3):
    """A photo as the upload screen leaves it: the file in storage, and a
    pending row that knows its size. The offline index starts empty."""
    cache.delete(f"curated-images:fake-private:{own_photos.space_of(connection.tenant)}")

    def make(name="yoga_1.jpg", width=3000, height=2000, status=own_photos.PENDING, **fields):
        key = build_s3_path("photo", f"{uuid.uuid4().hex}.jpg")
        s3.put_object(Bucket="b", Key=key, Body=image_bytes(width, height, seed=name), ContentType="image/jpeg")
        return Photo.objects.create(
            s3_key=key,
            title=name.rsplit(".", 1)[0].replace("_", " "),
            content_type="image/jpeg",
            index_status=status,
            width=width,
            height=height,
            **fields,
        )

    return make


def opened(body):
    return Image.open(io.BytesIO(body))


# ── optimize ─────────────────────────────────────────────────────────────────


def test_optimize_makes_a_small_upright_avif():
    # A phone photo: stored sideways, turned by its EXIF orientation tag.
    exif = Image.Exif()
    exif[0x0112] = 6
    body, width, height = own_photos.optimize(image_bytes(4000, 3000, exif=exif.tobytes()))
    with opened(body) as im:
        assert im.format == "AVIF"
        assert (im.width, im.height) == (width, height) == (1800, 2400)
        assert not im.getexif().get(0x0112)  # nothing left to turn it a second time


def test_optimize_never_enlarges_and_keeps_transparency():
    body, width, height = own_photos.optimize(image_bytes(600, 400, "PNG", "RGBA"))
    with opened(body) as im:
        assert (width, height) == (600, 400)
        assert im.mode == "RGBA"


def test_optimize_refuses_what_is_not_a_still_image():
    frames = [Image.new("RGB", (40, 40), c) for c in ("red", "blue")]
    out = io.BytesIO()
    frames[0].save(out, "GIF", save_all=True, append_images=frames[1:])
    with pytest.raises(ValueError, match="animated"):
        own_photos.optimize(out.getvalue())
    with pytest.raises(Exception):  # noqa: B017 - whatever Pillow raises for bytes that are no image
        own_photos.optimize(b"<svg xmlns='http://www.w3.org/2000/svg'/>")


# ── process: optimize in place, then index ───────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_process_optimizes_in_place_and_indexes(upload, s3):
    photo = upload("yoga_1.jpg", 3000, 2000)
    before = len(s3.objects[photo.s3_key]["Body"])

    own_photos.process(photo)

    stored = s3.objects[photo.s3_key]  # the same key: nothing that points at the photo breaks
    assert stored["ContentType"] == "image/avif"
    assert len(stored["Body"]) < before
    photo.refresh_from_db()
    assert (photo.content_type, photo.width, photo.height) == ("image/avif", 2400, 1600)
    assert photo.file_size == len(stored["Body"])
    # The offline service describes at once: the photo is ready and has its alt text.
    assert photo.index_status == own_photos.READY
    assert photo.catalog_id
    assert photo.alt_text == "A photo: yoga 1."


@pytest.mark.django_db(transaction=True)
def test_process_does_not_encode_a_file_twice(upload, s3, monkeypatch):
    photo = upload()
    own_photos.process(photo)
    first = s3.objects[photo.s3_key]["Body"]
    monkeypatch.setattr(own_photos, "optimize", lambda body: pytest.fail("encoded again"))
    photo.refresh_from_db()
    own_photos.process(photo)
    assert s3.objects[photo.s3_key]["Body"] == first


@pytest.mark.django_db(transaction=True)
def test_process_leaves_an_unreadable_file_as_uploaded(tenant_ctx, s3):
    key = build_s3_path("photo", "clip.gif")
    s3.put_object(Bucket="b", Key=key, Body=b"GIF89a not really", ContentType="image/gif")
    photo = Photo.objects.create(s3_key=key, title="clip", content_type="image/gif", index_status=own_photos.PENDING)

    own_photos.process(photo)

    assert s3.objects[key]["Body"] == b"GIF89a not really"
    photo.refresh_from_db()
    assert (photo.index_status, photo.content_type, photo.catalog_id) == (own_photos.FAILED, "image/gif", "")


@pytest.mark.django_db(transaction=True)
def test_a_photo_waits_when_the_service_cannot_take_it(upload, s3, settings):
    settings.CURATED_IMAGE_API_FAKE, settings.CURATED_IMAGE_API_URL = False, ""
    photo = upload()
    own_photos.process(photo)
    photo.refresh_from_db()
    # Optimized and usable on the site; only the index has to wait.
    assert (photo.content_type, photo.index_status) == ("image/avif", own_photos.QUEUED)

    settings.CURATED_IMAGE_API_FAKE = True
    assert own_photos.sync() == 0
    photo.refresh_from_db()
    assert photo.index_status == own_photos.READY


@pytest.mark.django_db(transaction=True)
def test_a_service_error_keeps_the_photo_pending(upload, s3, monkeypatch):
    def down(*args, **kwargs):
        raise catalog.CuratedImageError(catalog.UNAVAILABLE)

    monkeypatch.setattr(catalog, "private_upload", down)
    photo = upload()
    own_photos.process(photo)
    photo.refresh_from_db()
    assert photo.index_status == own_photos.QUEUED


@pytest.mark.django_db(transaction=True)
def test_sync_optimizes_a_photo_whose_job_was_lost(upload, s3):
    photo = upload()  # uploaded, and the worker never ran its job
    assert own_photos.sync() == 0
    photo.refresh_from_db()
    assert (photo.content_type, photo.index_status) == ("image/avif", own_photos.READY)
    assert s3.objects[photo.s3_key]["ContentType"] == "image/avif"


# ── sync ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_sync_follows_the_service(upload, monkeypatch):
    described = upload("a.jpg", status=own_photos.INDEXING, catalog_id="up-1")
    captioned = upload("b.jpg", status=own_photos.INDEXING, catalog_id="up-2", alt_text="Her own words")
    refused = upload("c.jpg", status=own_photos.INDEXING, catalog_id="up-3")
    working = upload("d.jpg", status=own_photos.INDEXING, catalog_id="up-4")
    answers = {
        "up-1": catalog.OwnUpload(
            "up-1", "ready", description="A woman in warrior pose on a mat.", subject_placement="left_third"
        ),
        "up-2": catalog.OwnUpload("up-2", "ready", description="Something else."),
        "up-3": catalog.OwnUpload("up-3", "failed", failure="model_timeout"),
        "up-4": catalog.OwnUpload("up-4", "indexing"),
    }
    monkeypatch.setattr(catalog, "private_status", answers.get)

    assert own_photos.sync() == 1  # only the one still being described

    for photo in (described, captioned, refused, working):
        photo.refresh_from_db()
    assert (described.index_status, described.alt_text) == (own_photos.READY, "A woman in warrior pose on a mat.")
    assert described.subject_placement == "left_third"  # a page crops toward it
    assert (captioned.index_status, captioned.alt_text) == (own_photos.READY, "Her own words")  # hers is kept
    assert captioned.subject_placement == ""
    assert refused.index_status == own_photos.FAILED
    assert working.index_status == own_photos.INDEXING


@pytest.mark.django_db(transaction=True)
def test_sync_resends_a_photo_the_service_lost(upload, s3, monkeypatch):
    photo = upload(status=own_photos.INDEXING, catalog_id="gone")
    monkeypatch.setattr(catalog, "private_status", lambda upload_id: None)
    assert own_photos.sync() == 1
    photo.refresh_from_db()
    assert (photo.index_status, photo.catalog_id) == (own_photos.QUEUED, "")
    monkeypatch.undo()
    monkeypatch.setattr(own_photos, "get_s3_client", lambda: s3)
    assert own_photos.sync() == 0  # the next pass sends it again


@pytest.mark.django_db(transaction=True)
def test_sync_stops_asking_a_service_that_is_down(upload, monkeypatch):
    for n in range(3):
        upload(f"{n}.jpg", status=own_photos.INDEXING, catalog_id=f"up-{n}")
    asked = []

    def down(upload_id):
        asked.append(upload_id)
        raise catalog.CuratedImageError(catalog.UNAVAILABLE)

    monkeypatch.setattr(catalog, "private_status", down)
    assert own_photos.sync() == 3
    assert len(asked) == 1


# ── search ───────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_search_ranks_what_the_service_knows_then_the_rest_by_name(upload, s3):
    for name in ("warrior pose studio.jpg", "portrait smiling.jpg"):
        own_photos.process(upload(name))  # indexed: the service ranks these
    fresh = upload("warrior sunrise beach.jpg", width=3000, height=2000)  # not described yet
    tall = upload("warrior tall.jpg", width=2000, height=3000)

    found = own_photos.search("warrior pose", aspect="16:9")

    assert [i.title for i in found] == ["warrior pose studio", "warrior sunrise beach", "portrait smiling"]
    assert all(i.asset_id.startswith("own:") and i.web_url for i in found)
    assert own_photos.photo_of(found[1].asset_id) == fresh
    # An upright photo never goes into a wide slot, nor a wide one into an upright slot.
    assert [i.title for i in own_photos.search("warrior", aspect="4:5")] == ["warrior tall"]
    assert tall.pk
    # A photo that is not described yet has no description: never a guess at what it shows.
    assert found[1].description == ""


@pytest.mark.django_db(transaction=True)
def test_search_leaves_out_what_is_placed_and_what_cannot_be_shown(upload, tenant_ctx):
    first, second = upload("one.jpg"), upload("two.jpg")
    Photo.objects.create(s3_key="tenants/x/photo/broken.heic", title="broken", index_status=own_photos.FAILED)
    Photo.objects.create(s3_key="tenants/x/curated/abc.webp", title="catalog copy", width=1600, height=900)

    found = own_photos.search("", exclude=[f"own:{first.pk}"])

    assert [own_photos.photo_of(i.asset_id) for i in found] == [second]
    assert own_photos.search("", exclude=[f"own:{first.pk}", f"own:{second.pk}"]) == []
    assert own_photos.photo_of("not-ours") is None
    assert own_photos.photo_of("own:not-a-uuid") is None


@pytest.mark.django_db(transaction=True)
def test_a_photo_that_covers_a_download_is_not_offered_as_a_cover_again(upload, tenant_ctx, monkeypatch):
    from apps.downloads.models import DownloadFile

    monkeypatch.setattr(own_photos, "preferred", lambda: True)
    used, free = upload("one.jpg"), upload("two.jpg")
    DownloadFile.objects.create(title="Guide", thumbnail=used)

    assert own_photos.cover("") == free


@pytest.mark.django_db(transaction=True)
def test_a_slot_takes_a_photo_it_crops_a_little_after_the_ones_of_its_own_shape(upload, tenant_ctx):
    upload("square.jpg", width=2000, height=2000)
    upload("nearly square.jpg", width=2400, height=1920)  # 5:4
    upload("wide.jpg", width=3000, height=2000)  # 3:2
    upload("tall.jpg", width=2000, height=3000)
    Photo.objects.create(s3_key="tenants/x/photo/new.jpg", title="just uploaded", index_status=own_photos.PENDING)

    def titles(aspect):
        return [i.title for i in own_photos.search("", aspect=aspect)]

    # An upright slot: the upright photo, then what loses little when cropped to it.
    # The 3:2 photo would lose half its width, so it stays out.
    assert titles("4:5") == ["tall", "just uploaded", "square", "nearly square"]
    # A square slot takes any of them; a 16:9 banner only the wide ones.
    assert titles("1:1") == ["square", "just uploaded", "nearly square", "wide", "tall"]
    assert titles("16:9") == ["nearly square", "wide", "just uploaded"]
    assert set(titles(None)) == {"square", "nearly square", "wide", "tall", "just uploaded"}


@pytest.mark.django_db(transaction=True)
def test_a_small_photo_is_offered_only_after_the_sharp_ones(upload, s3):
    own_photos.process(upload("face yoga tiny.jpg", 600, 400))  # matched by the service, but small
    upload("class wide.jpg", 3000, 2000)
    assert [i.title for i in own_photos.search("face yoga", aspect="16:9")] == ["class wide", "face yoga tiny"]


@pytest.mark.django_db(transaction=True)
def test_a_search_that_fails_still_offers_her_photos(upload, s3, monkeypatch):
    own_photos.process(upload("warrior.jpg"))
    monkeypatch.setattr(catalog, "private_search", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    assert [i.title for i in own_photos.search("warrior")] == ["warrior"]


def test_each_tenant_has_a_space_of_its_own(settings):
    class Tenant:
        schema_name = "demo_yoga"

    settings.CONTENTOR_DOMAIN = "contentor.app"
    assert own_photos.space_of(Tenant) == "contentor.app.demo_yoga"
    settings.CONTENTOR_DOMAIN = "contentor.localhost"
    assert own_photos.space_of(Tenant) == "contentor.localhost.demo_yoga"  # dev never shares prod's space
    Tenant.schema_name = "x" * 63
    space = own_photos.space_of(Tenant)
    assert len(space) == 64 and space != own_photos.space_of(type("T", (), {"schema_name": "x" * 62}))


# ── the upload endpoints ─────────────────────────────────────────────────────


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@ownphotos.com", name="Owner", password="secret123", role="owner")


def client_for(user):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db(transaction=True)
def test_an_uploaded_photo_is_queued_for_optimizing_and_indexing(owner, photo_jobs):
    process, _later = photo_jobs
    response = client_for(owner).post(
        "/api/v1/photos/",
        data={"s3_key": build_s3_path("photo", "new.jpg"), "title": "New", "content_type": "image/jpeg"},
        format="json",
    )
    assert response.status_code == 201, response.content
    assert response.json()["index_status"] == own_photos.PENDING
    process.assert_called_once_with(connection.tenant.id, response.json()["id"])


@pytest.mark.django_db(transaction=True)
def test_the_complete_endpoint_queues_it_too(owner, photo_jobs):
    process, _later = photo_jobs
    response = client_for(owner).post(
        "/api/v1/upload/complete/",
        data={"s3_key": build_s3_path("photo", "picked.jpg"), "category": "photo", "title": "Picked"},
        format="json",
    )
    assert response.status_code == 200, response.content
    process.assert_called_once_with(connection.tenant.id, response.json()["photo_id"])


@pytest.mark.django_db(transaction=True)
def test_a_registered_file_that_is_not_a_library_photo_is_left_alone(owner, photo_jobs):
    process, _later = photo_jobs
    response = client_for(owner).post(
        "/api/v1/photos/", data={"s3_key": build_s3_path("branding", "logo.png"), "title": "Logo"}, format="json"
    )
    assert response.status_code == 201, response.content
    assert response.json()["index_status"] == ""
    process.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_the_library_finds_a_photo_by_what_it_shows_and_lists_her_own(owner, upload):
    upload("IMG 2231.jpg", status=own_photos.READY, alt_text="A woman in warrior pose on a mat.")
    Photo.objects.create(s3_key="tenants/x/curated/abc.webp", title="catalog copy")
    client = client_for(owner)
    assert [p["title"] for p in client.get("/api/v1/photos/?search=warrior").json()["results"]] == ["IMG 2231"]
    assert [p["title"] for p in client.get("/api/v1/photos/?own=1").json()["results"]] == ["IMG 2231"]
    assert [p["title"] for p in client.get("/api/v1/photos/?own=0").json()["results"]] == ["catalog copy"]


@pytest.mark.django_db(transaction=True)
def test_the_library_filters_by_shape_and_leaves_out_unknown_sizes(owner):
    for title, width, height in [
        ("wide", 1600, 900),
        ("tall", 800, 1000),
        ("square", 1000, 990),
        ("unknown", None, None),
    ]:
        Photo.objects.create(s3_key=f"tenants/x/curated/{title}.webp", title=title, width=width, height=height)
    client = client_for(owner)

    def titles(shape):
        return sorted(p["title"] for p in client.get(f"/api/v1/photos/?shape={shape}").json()["results"])

    assert titles("landscape") == ["wide"]
    assert titles("portrait") == ["tall"]
    assert titles("square") == ["square"]
    assert titles("") == ["square", "tall", "unknown", "wide"]


@pytest.mark.django_db(transaction=True)
def test_deleting_a_photo_takes_it_out_of_the_index(owner, upload, s3):
    photo = upload("warrior.jpg")
    own_photos.process(photo)
    photo.refresh_from_db()
    space = own_photos.space_of(connection.tenant)
    assert catalog.private_search("warrior", space=space)

    assert client_for(owner).delete(f"/api/v1/photos/{photo.pk}/").status_code == 204

    assert catalog.private_search("warrior", space=space) == []
    assert catalog.private_status(photo.catalog_id) is None
