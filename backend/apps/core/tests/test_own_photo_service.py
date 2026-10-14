"""The coach's own photos on the wire (the image service's private collection,
one space per tenant) and the background jobs that carry them there."""

from unittest import mock

import pytest
from django.core.cache import cache

from apps.core import tasks
from apps.core.curated_images import client
from apps.media import own_photos
from apps.media.models import Photo

pytestmark = pytest.mark.django_db
UPLOAD = "5b0d3c1e-8a55-4f0c-9d0f-3d2a5c6f7a10"
SPACE = "contentor.app.demo_yoga"


class _Response:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code, self._payload, self.text = status_code, payload, text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


@pytest.fixture()
def wire(settings, monkeypatch):
    """The real HTTP paths with requests stubbed: ``wire.answer`` is what the
    service says next, ``wire.calls`` what it was asked."""
    settings.CURATED_IMAGE_API_FAKE = False
    settings.CURATED_IMAGE_API_URL = "https://catalog.test"
    settings.CURATED_IMAGE_API_KEY = "test-key"
    state = mock.Mock(calls=[], answer=_Response(200, {"data": {}}))

    def request(method, url, **kwargs):
        state.calls.append((method, url, kwargs))
        return state.answer

    monkeypatch.setattr(client.requests, "request", request)
    return state


def test_an_upload_goes_as_multipart_into_the_tenants_space(wire):
    wire.answer = _Response(201, {"data": {"id": UPLOAD, "status": "indexing", "space": SPACE}, "duplicate": False})
    upload = client.private_upload(b"avif-bytes", "warrior pose.avif", "image/avif", space=SPACE, tags=["yoga", "x"])
    assert (upload.upload_id, upload.status, upload.description) == (UPLOAD, "indexing", "")
    method, url, sent = wire.calls[0]
    assert (method, url) == ("POST", "https://catalog.test/v1/private/images")
    assert sent["files"] == {"file": ("warrior pose.avif", b"avif-bytes", "image/avif")}
    assert sent["data"] == {"space": SPACE, "tags": "yoga"}  # a one-letter tag is no tag
    # No JSON content type: requests writes the multipart boundary itself.
    assert sent["headers"] == {"X-API-Key": "test-key"}
    assert sent["timeout"][1] == client.OWN_UPLOAD_TIMEOUT


def test_status_reads_what_the_service_wrote_once_ready(wire):
    image = {"title": "Warrior pose", "description": "A woman in warrior pose on a mat.", "tags": ["yoga"]}
    wire.answer = _Response(200, {"data": {"id": UPLOAD, "status": "ready", "image": image}})
    upload = client.private_status(UPLOAD)
    assert (upload.status, upload.title, upload.description) == (
        "ready",
        "Warrior pose",
        "A woman in warrior pose on a mat.",
    )
    assert wire.calls[0][:2] == ("GET", f"https://catalog.test/v1/private/images/{UPLOAD}")
    failed = {"id": UPLOAD, "status": "failed", "failure": "model_timeout", "image": None}
    wire.answer = _Response(200, {"data": failed})
    assert client.private_status(UPLOAD).failure == "model_timeout"


def test_an_upload_the_service_no_longer_has_reads_as_none_and_deletes_quietly(wire):
    wire.answer = _Response(404, {"error": {"code": "not_found"}})
    assert client.private_status(UPLOAD) is None
    assert client.private_delete(UPLOAD) is None
    assert wire.calls[-1][:2] == ("DELETE", f"https://catalog.test/v1/private/images/{UPLOAD}")


def test_a_service_without_the_endpoint_is_an_error_the_caller_can_wait_out(wire):
    # An older service answers 404 to the upload: the photo stays queued and is sent again later.
    wire.answer = _Response(404, {"error": {"code": "not_found"}}, text="not found")
    with pytest.raises(client.CuratedImageError):
        client.private_upload(b"x", "a.avif", "image/avif", space=SPACE)
    wire.answer = _Response(200, {"data": {"status": "indexing"}})  # an answer without an id
    with pytest.raises(client.CuratedImageError):
        client.private_upload(b"x", "a.avif", "image/avif", space=SPACE)


def test_a_search_names_the_space_and_maps_results_to_their_uploads(wire):
    hit = {
        "id": "7f6f4d7e-3d2b-4a39-8f0b-1c1b2a3d4e5f",
        "upload_id": UPLOAD,
        "private": True,
        "title": "Warrior pose",
        "description": "A woman in warrior pose on a mat.",
        "tags": ["yoga"],
        "subject_placement": "left_third",
        "url": "https://s3.test/web.webp?sig=1",
        "renditions": {"web": {"url": "https://s3.test/web.webp?sig=1", "width": 1600, "height": 900}},
    }
    stray = {**hit, "upload_id": None}  # a result that names no upload cannot be placed
    wire.answer = _Response(200, {"data": [hit, stray]})
    found = client.private_search("  warrior   pose ", space=SPACE, orientation="landscape", per_page=99)
    assert [(upload_id, image.subject_placement) for upload_id, image in found] == [(UPLOAD, "left_third")]
    assert wire.calls[0][2]["json"] == {
        "scope": "private",
        "space": SPACE,
        "query": "warrior pose",
        "filters": {"orientation": "landscape"},
        "per_page": 12,
    }
    client.private_search("", space=SPACE)
    assert wire.calls[1][2]["json"] == {"scope": "private", "space": SPACE, "per_page": 12}


def test_private_searches_are_never_cached(wire):
    wire.answer = _Response(200, {"data": []})
    client.private_search("warrior", space=SPACE)
    client.private_search("warrior", space=SPACE)
    assert len(wire.calls) == 2  # a photo that just became ready is found by the next search


# ── the jobs ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def tenant(tenant_ctx):
    cache.delete(f"own-photos:sync:{tenant_ctx.schema_name}")
    yield tenant_ctx
    cache.delete(f"own-photos:sync:{tenant_ctx.schema_name}")


def test_processing_a_photo_runs_in_its_tenant_and_queues_the_first_look(tenant, photo_jobs, monkeypatch):
    _process, later = photo_jobs
    seen = []
    monkeypatch.setattr(own_photos, "process", lambda photo: seen.append(photo.pk))
    photo = Photo.objects.create(s3_key="tenants/shared-test/photo/a.jpg", index_status="pending")

    tasks.process_own_photo(tenant.id, str(photo.pk))

    assert seen == [photo.pk]
    later.assert_called_once_with((tenant.id, 0), countdown=tasks.OWN_PHOTO_SYNC_DELAYS[0])


def test_a_photo_deleted_before_its_job_ran_is_skipped(tenant, photo_jobs, monkeypatch):
    monkeypatch.setattr(own_photos, "process", lambda photo: pytest.fail("processed a deleted photo"))
    tasks.process_own_photo(tenant.id, "0b0d3c1e-8a55-4f0c-9d0f-3d2a5c6f7a10")
    tasks.process_own_photo(987654321, "0b0d3c1e-8a55-4f0c-9d0f-3d2a5c6f7a10")  # nor a tenant that is gone


def test_a_batch_of_uploads_starts_one_chain_not_one_per_photo(tenant, photo_jobs, monkeypatch):
    _process, later = photo_jobs
    monkeypatch.setattr(own_photos, "process", lambda photo: None)
    for n in range(3):
        photo = Photo.objects.create(s3_key=f"tenants/shared-test/photo/{n}.jpg", index_status="pending")
        tasks.process_own_photo(tenant.id, str(photo.pk))
    assert later.call_count == 1


def test_the_sync_looks_again_later_while_a_photo_is_on_its_way_and_then_stops(tenant, photo_jobs, monkeypatch):
    _process, later = photo_jobs
    waiting = iter([2, 1, 0])
    monkeypatch.setattr(own_photos, "sync", lambda: next(waiting))

    tasks.sync_own_photos(tenant.id, 0)
    later.assert_called_once_with((tenant.id, 1), countdown=tasks.OWN_PHOTO_SYNC_DELAYS[1])
    tasks.sync_own_photos(tenant.id, 1)
    assert later.call_args == mock.call((tenant.id, 2), countdown=tasks.OWN_PHOTO_SYNC_DELAYS[2])
    tasks.sync_own_photos(tenant.id, 2)
    assert later.call_count == 2  # nothing left: the chain ends


def test_the_wait_between_looks_grows_to_ten_minutes_and_stays_there(tenant, photo_jobs, monkeypatch):
    _process, later = photo_jobs
    monkeypatch.setattr(own_photos, "sync", lambda: 1)
    tasks.sync_own_photos(tenant.id, 50)
    later.assert_called_once_with((tenant.id, 51), countdown=600)
    assert list(tasks.OWN_PHOTO_SYNC_DELAYS) == sorted(tasks.OWN_PHOTO_SYNC_DELAYS)


def test_the_sweep_restarts_the_chain_only_where_photos_are_waiting(tenant, photo_jobs):
    _process, later = photo_jobs
    tasks.sweep_own_photos()
    later.assert_not_called()
    Photo.objects.create(s3_key="tenants/shared-test/photo/a.jpg", index_status="indexing", catalog_id="up-1")
    Photo.objects.create(s3_key="tenants/shared-test/photo/b.jpg", index_status="ready", catalog_id="up-2")
    tasks.sweep_own_photos()
    assert [c.args[0][0] for c in later.call_args_list] == [tenant.id]
    assert later.call_args.kwargs == {"countdown": 600}


def test_the_sweep_is_scheduled():
    from config.celery import app

    assert app.conf.beat_schedule["sweep-own-photos"]["task"] == "apps.core.tasks.sweep_own_photos"
