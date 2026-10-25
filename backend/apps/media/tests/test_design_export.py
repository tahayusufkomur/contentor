"""The studio's Download (apps.media.design_export): a design drawn by the browser sidecar from a signed,
short-lived token, as a PNG or JPEG file."""

import base64
from datetime import timedelta
from unittest import mock

import pytest
from django.core import signing
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.live.models import LiveClass
from apps.media import design_export, designs
from apps.media.models import Photo

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="export-coach@x.com", name="Coach", password="x", role="owner")


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def design(coach):
    picture = Photo.objects.create(s3_key="demo/flow.jpg", title="flow")
    course = Course.objects.create(title="Morning Flow", instructor=coach, thumbnail=picture)
    return designs.open_draft("course", str(course.pk), recipe={"photo": {"id": str(picture.pk)}})


def test_a_token_names_one_design_and_size_for_two_minutes_on_this_site(design, tenant_ctx):
    token = design_export.token_for(design, "story")
    assert design_export.read_token(token) == (str(design.pk), "story")
    assert design_export.read_token(token + "x") is None
    # another site's token is not this one's
    other = signing.dumps({"d": str(design.pk), "s": "story", "t": "another_site"}, salt=design_export._SALT)
    assert design_export.read_token(other) is None
    # an old one is gone
    with mock.patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 600):
        assert design_export.read_token(token) is None


def test_the_render_page_reads_the_design_without_signing_in(design, tenant_ctx):
    anyone = APIClient(HTTP_HOST=HOST)
    token = design_export.token_for(design, "post")
    body = anyone.get(f"/api/v1/designs/render/{token}/").json()
    assert body["size"] == "post"
    assert body["design"]["id"] == str(design.pk)
    assert body["design"]["recipe"] == design.recipe
    assert body["item"]["title"] == "Morning Flow"
    assert body["item"]["createdAt"] and body["item"]["startsAt"] is None
    assert anyone.get("/api/v1/designs/render/forged/").status_code == 404


def test_an_event_cover_reads_its_next_session(coach, tenant_ctx):
    soon = timezone.now() + timedelta(days=2)
    LiveClass.objects.create(title="Breathwork", instructor=coach, scheduled_at=soon)
    LiveClass.objects.create(title="Breathwork", instructor=coach, scheduled_at=soon + timedelta(days=7))
    draft = designs.open_draft("live", "Breathwork", recipe={})
    item = design_export.item_of(draft)
    assert item["title"] == "Breathwork"
    assert item["startsAt"] == soon.isoformat()


def test_export_draws_the_design_through_the_sidecar(client, design, settings):
    settings.SITE_QA_BROWSER_URL = "http://browser:3000"
    png = b"\x89PNG fake"
    answer = mock.Mock(json=mock.Mock(return_value={"image": base64.b64encode(png).decode()}))
    with mock.patch.object(design_export.requests, "post", return_value=answer) as post:
        res = client.post(f"/api/v1/designs/{design.pk}/export/", {"size": "story"}, format="json")
    assert res.status_code == 200
    assert res.content == png
    assert res["Content-Type"] == "image/png"
    assert res["Content-Disposition"] == 'attachment; filename="morning-flow-story.png"'
    sent = post.call_args.kwargs["json"]
    assert post.call_args.args[0] == "http://browser:3000/render"
    assert sent["width"] == 1080 and sent["format"] == "png" and sent["selector"] == "[data-render-cover]"
    token = sent["url"].rsplit("/", 1)[-1]
    assert sent["url"].startswith("http://") and "/render/cover/" in sent["url"]
    assert design_export.read_token(token) == (str(design.pk), "story")

    with mock.patch.object(design_export.requests, "post", return_value=answer):
        jpeg = client.post(f"/api/v1/designs/{design.pk}/export/", {"size": "wide", "format": "jpeg"}, format="json")
    assert jpeg["Content-Disposition"].endswith('-wide.jpg"')


def test_export_says_what_it_cannot_do(client, design, settings):
    settings.SITE_QA_BROWSER_URL = ""
    url = f"/api/v1/designs/{design.pk}/export/"
    assert client.post(url, {"size": "story"}, format="json").status_code == 503
    settings.SITE_QA_BROWSER_URL = "http://browser:3000"
    assert client.post(url, {"size": "poster"}, format="json").status_code == 400
    assert client.post(url, {"size": "story", "format": "gif"}, format="json").status_code == 400
    import requests

    with mock.patch.object(design_export.requests, "post", side_effect=requests.ConnectionError("down")):
        res = client.post(url, {"size": "story"}, format="json")
    assert res.status_code == 503
    assert APIClient(HTTP_HOST=HOST).post(url, {"size": "story"}, format="json").status_code in (401, 403)
