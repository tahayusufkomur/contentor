"""Edits of her photos in the photo studio (apps.media.photo_edits): the colours a photo is made of, and
the jobs that remove its background or have the image model extend, clean up or change it."""

import base64
import io
from unittest import mock

import pytest
from django.core.cache import cache
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.media import photo_edits
from apps.media.models import Photo

SHARED_DOMAIN = "shared-test.localhost"
pytestmark = pytest.mark.django_db(transaction=True)


def png(size=(40, 20), colour=(200, 30, 30, 255), left=None) -> bytes:
    """A picture of one colour, the left half another when `left` is given."""
    im = Image.new("RGBA", size, colour)
    if left is not None:
        for x in range(size[0] // 2):
            for y in range(size[1]):
                im.putpixel((x, y), left)
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@edits.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def photo(tenant_ctx):
    return Photo.objects.create(s3_key="tenants/t/photo/a.png", title="Porch", width=40, height=20)


@pytest.fixture()
def client(owner):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=owner)
    return client


@pytest.fixture(autouse=True)
def queued(monkeypatch):
    """No job reaches the dev worker: what would be queued is recorded."""
    from apps.core import tasks

    delay = mock.Mock(name="edit_photo.delay")
    monkeypatch.setattr(tasks.edit_photo, "delay", delay)
    return delay


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.clear()


def test_colours_most_of_the_picture_first_and_never_what_is_see_through():
    two = photo_edits.colours_of(png(colour=(20, 40, 200, 255), left=(240, 200, 20, 255)))
    assert sorted(two) == ["#1428c8", "#f0c814"]
    # a cutout: its see-through half is no colour of the photo
    assert photo_edits.colours_of(png(colour=(20, 40, 200, 255), left=(240, 200, 20, 0))) == ["#1428c8"]
    assert photo_edits.colours_of(png(colour=(0, 0, 0, 0))) == []


def test_colours_are_read_once_and_an_unreadable_photo_has_none(photo, monkeypatch):
    read = mock.Mock(return_value=png())
    monkeypatch.setattr(photo_edits, "_read", read)
    assert photo_edits.colours(photo) == ["#c81e1e"]
    assert photo_edits.colours(photo) == ["#c81e1e"]
    assert read.call_count == 1
    other = Photo.objects.create(s3_key="tenants/t/photo/b.png")
    monkeypatch.setattr(photo_edits, "_read", mock.Mock(side_effect=OSError("storage away")))
    assert photo_edits.colours(other) == []


def test_the_colours_endpoint(client, photo, monkeypatch):
    monkeypatch.setattr(photo_edits, "_read", lambda _photo: png())
    assert client.get(f"/api/v1/photos/{photo.pk}/colours/").json() == {"colours": ["#c81e1e"]}
    assert client.get("/api/v1/photos/00000000-0000-0000-0000-000000000000/colours/").status_code == 404


@pytest.mark.parametrize(
    ("ratio", "shape"), [(3, "21:9"), (16 / 9, "16:9"), (9 / 16, "9:16"), (0.8, "4:5"), (1, "1:1"), (0.75, "3:4")]
)
def test_the_model_draws_in_its_nearest_shape(ratio, shape):
    assert photo_edits.nearest_aspect(ratio) == shape


def test_a_cutout_is_off_without_its_service(client, photo, settings, queued):
    settings.CUTOUT_URL = ""
    assert client.post(f"/api/v1/photos/{photo.pk}/cutout/").status_code == 503
    queued.assert_not_called()


def test_a_cutout_is_queued_and_followed_to_her_new_photo(client, photo, settings, queued, monkeypatch, photo_jobs):
    settings.CUTOUT_URL = "http://cutout:7000"
    res = client.post(f"/api/v1/photos/{photo.pk}/cutout/")
    assert res.status_code == 202
    job_id = res.json()["job_id"]
    assert res.json() == {"job_id": job_id, "status": "running", "done": False, "photo": None}
    queued.assert_called_once()
    _tenant, queued_job, photo_id, kind, aspect, words = queued.call_args.args
    assert (queued_job, photo_id, kind, aspect, words) == (job_id, str(photo.pk), "cutout", None, "")

    # the worker: the service answers with a PNG see-through on its left half
    monkeypatch.setattr(photo_edits, "_read", lambda _photo: png())
    answer = mock.Mock(content=png(colour=(9, 9, 9, 255), left=(0, 0, 0, 0)), raise_for_status=mock.Mock())
    with mock.patch.object(photo_edits.requests, "post", return_value=answer) as post:
        photo_edits.run(job_id, photo, kind, aspect, words)
    assert post.call_args.args[0] == "http://cutout:7000/remove"
    # her photo, as a JPEG no larger than the cutout is kept at
    sent = Image.open(io.BytesIO(post.call_args.kwargs["data"]))
    assert (sent.format, sent.size) == ("JPEG", (40, 20))

    done = client.get(f"/api/v1/photos/jobs/{job_id}/").json()
    assert done["done"] is True and done["status"] == "done"
    new = Photo.objects.get(pk=done["photo"]["id"])
    assert new.pk != photo.pk
    assert new.title == "Porch (no background)"
    # trimmed to its subject, with its margin: the see-through half is gone
    assert (new.width, new.height) == (21, 20)
    assert "/photo/" in new.s3_key and new.s3_key.endswith(".png")
    # one of her own photos: made light and indexed like an upload
    assert new.index_status == "pending"
    # and the photo it came from is as it was
    assert Photo.objects.get(pk=photo.pk).s3_key == "tenants/t/photo/a.png"


def test_a_cutout_of_nothing_is_an_error_and_a_faint_speck_is_no_subject():
    with pytest.raises(photo_edits.EditError):
        photo_edits.trimmed(png(colour=(0, 0, 0, 0)))
    # a speck at the far left is too faint to hold the margin open
    im = Image.new("RGBA", (100, 50), (0, 0, 0, 0))
    im.putpixel((1, 1), (200, 200, 200, 40))
    for x in range(60, 80):
        for y in range(10, 40):
            im.putpixel((x, y), (9, 9, 9, 255))
    out = io.BytesIO()
    im.save(out, "PNG")
    assert Image.open(io.BytesIO(photo_edits.trimmed(out.getvalue()))).size == (24, 34)


def test_a_failed_edit_is_said_and_another_sites_job_is_not_hers(client, photo, settings, monkeypatch):
    settings.CUTOUT_URL = "http://cutout:7000"
    job_id = client.post(f"/api/v1/photos/{photo.pk}/cutout/").json()["job_id"]
    monkeypatch.setattr(photo_edits, "_read", mock.Mock(side_effect=OSError("gone")))
    photo_edits.run(job_id, photo, "cutout", None, "")
    assert client.get(f"/api/v1/photos/jobs/{job_id}/").json() == {
        "job_id": job_id,
        "status": "failed",
        "done": True,
        "photo": None,
    }
    cache.set(photo_edits._job_key("theirs"), {"schema": "another_site", "status": "running"})
    assert client.get("/api/v1/photos/jobs/theirs/").status_code == 404
    assert client.get("/api/v1/photos/jobs/nothing/").status_code == 404


def test_an_edit_needs_the_key_a_kind_and_what_to_do(client, photo, settings, queued):
    settings.GEMINI_API_KEY = ""
    assert client.post(f"/api/v1/photos/{photo.pk}/edit/", {"mode": "erase", "instruction": "x"}).status_code == 503
    settings.GEMINI_API_KEY = "key"  # pragma: allowlist secret
    url = f"/api/v1/photos/{photo.pk}/edit/"
    for body in (
        {"mode": "paint"},
        {"mode": "erase"},
        {"mode": "change", "instruction": "   "},
        {"mode": "expand"},
        {"mode": "expand", "aspect": 40},
    ):
        assert client.post(url, body, format="json").status_code == 400, body
    queued.assert_not_called()


def test_each_edit_is_one_of_the_months_new_photos(client, photo, settings, queued):
    from apps.core.curated_images.views import generation_allowance

    settings.GEMINI_API_KEY = "key"  # pragma: allowlist secret
    settings.CURATED_IMAGE_GENERATE_MONTHLY_LIMIT = 2
    url = f"/api/v1/photos/{photo.pk}/edit/"
    assert client.post(url, {"mode": "expand", "aspect": 3}, format="json").status_code == 202
    assert client.post(url, {"mode": "change", "instruction": "evening light"}, format="json").status_code == 202
    assert generation_allowance()["left"] == 0
    assert client.post(url, {"mode": "erase", "instruction": "the cup"}, format="json").status_code == 429
    assert queued.call_count == 2
    kinds = [(call.args[3], call.args[4], call.args[5]) for call in queued.call_args_list]
    assert kinds == [("expand", 3.0, ""), ("change", None, "evening light")]


def test_the_model_is_sent_her_photo_and_the_shape_and_answers_with_a_new_one(photo, settings, monkeypatch):
    settings.GEMINI_API_KEY = "key"  # pragma: allowlist secret
    made = png(size=(60, 20), colour=(10, 120, 60, 255))
    payload = {"candidates": [{"content": {"parts": [{"inlineData": {"data": base64.b64encode(made).decode()}}]}}]}
    answer = mock.Mock(json=mock.Mock(return_value=payload), raise_for_status=mock.Mock())
    with mock.patch.object(photo_edits.requests, "post", return_value=answer) as post:
        assert photo_edits._model_edit(png(), photo, "expand", 3, "") == made
    body = post.call_args.kwargs["json"]
    image, text = body["contents"][0]["parts"]
    assert image["inlineData"]["mimeType"] == "image/jpeg"
    assert Image.open(io.BytesIO(base64.b64decode(image["inlineData"]["data"]))).size == (40, 20)
    assert "Extend this photograph" in text["text"] and "No text" in text["text"]
    assert body["generationConfig"]["imageConfig"] == {"aspectRatio": "21:9", "imageSize": settings.PHOTO_EDIT_SIZE}

    # a change keeps the photo's own shape, here 16:9
    with mock.patch.object(photo_edits.requests, "post", return_value=answer) as post:
        photo_edits._model_edit(png(size=(32, 18)), photo, "change", None, "make it snow")
    assert post.call_args.kwargs["json"]["generationConfig"]["imageConfig"]["aspectRatio"] == "16:9"
    assert "make it snow" in post.call_args.kwargs["json"]["contents"][0]["parts"][1]["text"]

    refused = mock.Mock(json=mock.Mock(return_value={"candidates": [{"finishReason": "SAFETY"}]}))
    with (
        mock.patch.object(photo_edits.requests, "post", return_value=refused),
        pytest.raises(photo_edits.EditError),
    ):
        photo_edits._model_edit(png(), photo, "erase", None, "the cup")


def test_targets_say_which_photo_tools_are_on(client, settings):
    settings.CUTOUT_URL, settings.GEMINI_API_KEY = "http://cutout:7000", ""
    body = client.get("/api/v1/designs/targets/").json()
    assert (body["cutout"], body["photo_ai"]) == (True, False)
