"""The remote curated photo catalog client, its offline fixture mode, the
copy-on-use cache, and the coach endpoints.

Spec: docs/superpowers/specs/2026-08-09-curated-images-offload-design.md
"""

import io

import pytest
import requests

from apps.core.curated_images import cache as curated_cache
from apps.core.curated_images import client, fake

pytestmark = pytest.mark.django_db


class _Response:
    """Minimal stand-in for requests.Response covering what the client reads."""

    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def _image_payload(asset_id="4df17ec1-10ef-4c88-99cf-37ce84ced788", **overrides):
    payload = {
        "id": asset_id,
        "title": "Sunrise trail run",
        "description": "runner on a forest trail at sunrise",
        "tags": ["fitness", "running"],
        "width": 2400,
        "height": 1350,
        "url": "https://contentor-prod-private.fsn1.your-objectstorage.com/web.webp?sig=1",
        "renditions": {
            "web": {
                "url": "https://contentor-prod-private.fsn1.your-objectstorage.com/web.webp?sig=1",
                "width": 1600,
                "height": 900,
            },
            "thumbnail": {
                "url": "https://contentor-prod-private.fsn1.your-objectstorage.com/thumb.webp?sig=1",
                "width": 480,
                "height": 270,
            },
        },
    }
    payload.update(overrides)
    return payload


@pytest.fixture()
def live_client(settings):
    """Turn off fixture mode so the HTTP paths are exercised (with requests
    stubbed) rather than the offline catalog."""
    settings.CURATED_IMAGE_API_FAKE = False
    settings.CURATED_IMAGE_API_URL = "https://catalog.test"
    settings.CURATED_IMAGE_API_KEY = "test-key"
    from django.core.cache import cache as django_cache

    django_cache.clear()
    return settings


# ── client ───────────────────────────────────────────────────────────────────


def test_search_normalizes_payload_and_prefers_the_thumbnail_for_previews(live_client, monkeypatch):
    calls = []

    def _request(method, url, json=None, headers=None, timeout=None):
        calls.append((method, url, json, headers))
        return _Response(payload={"data": [_image_payload()], "pagination": {"has_next": True}})

    monkeypatch.setattr(requests, "request", _request)
    page = client.search("sunrise run", orientation=client.WIDE, page=2, per_page=12)

    assert page.has_next is True and page.page == 2
    image = page.results[0]
    assert image.title == "Sunrise trail run"
    assert image.tags == ["fitness", "running"]
    # width/height describe the rendition that gets cached, not the master.
    assert (image.width, image.height) == (1600, 900)
    assert "thumb.webp" in image.preview_url and "web.webp" in image.web_url

    method, url, body, headers = calls[0]
    assert (method, url) == ("POST", "https://catalog.test/v1/images/search")
    assert body == {"query": "sunrise run", "filters": {"orientation": "landscape"}, "page": 2, "per_page": 12}
    assert headers["X-API-Key"] == "test-key"


def test_search_shaped_asks_for_the_exact_ratio_then_the_orientation(live_client, monkeypatch):
    filters = []

    def _request(method, url, json=None, headers=None, timeout=None):
        filters.append(json.get("filters"))
        exact = json["filters"] == {"aspect_ratio": "4:5"}
        data = [_image_payload("a")] if exact else [_image_payload("a"), _image_payload("b")]
        return _Response(payload={"data": data, "pagination": {}})

    monkeypatch.setattr(requests, "request", _request)
    # One 4:5 match, then other portraits after it (no repeats).
    assert [i.asset_id for i in client.search_shaped("yoga pose", "4:5").results] == ["a", "b"]
    assert filters == [{"aspect_ratio": "4:5"}, {"orientation": "portrait"}]
    filters.clear()
    client.search_shaped("pilates reformer", "3:4")  # a shape the catalog has no filter for
    assert filters == [{"orientation": "portrait"}]


def test_search_omits_an_empty_query_so_the_catalog_browses(live_client, monkeypatch):
    bodies = []

    def _request(method, url, json=None, headers=None, timeout=None):
        bodies.append(json)
        return _Response(payload={"data": [], "pagination": {}})

    monkeypatch.setattr(requests, "request", _request)
    client.search("   ")
    assert "query" not in bodies[0]


def test_search_caches_pages(live_client, monkeypatch):
    calls = []

    def _request(method, url, json=None, headers=None, timeout=None):
        calls.append(url)
        return _Response(payload={"data": [_image_payload()], "pagination": {}})

    monkeypatch.setattr(requests, "request", _request)
    client.search("sunrise run")
    client.search("sunrise run")
    assert len(calls) == 1  # second call served from Redis
    client.search("something else")
    assert len(calls) == 2


def test_transport_failure_retries_once_then_reports_unavailable(live_client, monkeypatch):
    attempts = []

    def _request(method, url, json=None, headers=None, timeout=None):
        attempts.append(url)
        raise requests.ConnectTimeout("upstream down")

    monkeypatch.setattr(requests, "request", _request)
    with pytest.raises(client.CuratedImageError) as exc:
        client.search("sunrise run")
    assert len(attempts) == 2
    assert "unavailable" in str(exc.value)


def test_a_read_timeout_is_not_retried(live_client, monkeypatch):
    """A read timeout means the service took the request and is being slow.
    Asking again just doubles what the coach waits before the same failure —
    and adds load to a service already struggling. Only connect failures and
    5xx (where the work may never have started) are worth a second attempt."""
    attempts = []

    def _request(method, url, json=None, headers=None, timeout=None):
        attempts.append(url)
        raise requests.ReadTimeout("upstream slow")

    monkeypatch.setattr(requests, "request", _request)
    with pytest.raises(client.CuratedImageError):
        client.search("sunrise run")
    assert len(attempts) == 1


def test_a_bad_request_is_not_retried(live_client, monkeypatch):
    attempts = []

    def _request(method, url, json=None, headers=None, timeout=None):
        attempts.append(url)
        return _Response(status_code=401, text="bad key")

    monkeypatch.setattr(requests, "request", _request)
    with pytest.raises(client.CuratedImageError):
        client.search("sunrise run")
    assert len(attempts) == 1  # a wrong key cannot be fixed by asking again


def test_get_returns_none_for_a_retired_asset(live_client, monkeypatch):
    monkeypatch.setattr(
        requests, "request", lambda *a, **k: _Response(status_code=404, payload={"error": {"code": "image_not_found"}})
    )
    assert client.get("4df17ec1-10ef-4c88-99cf-37ce84ced788") is None
    assert client.get("") is None


def test_unconfigured_catalog_is_reported_not_crashed(settings):
    settings.CURATED_IMAGE_API_FAKE = False
    settings.CURATED_IMAGE_API_URL = ""
    settings.CURATED_IMAGE_API_KEY = ""
    assert client.available() is False
    with pytest.raises(client.CuratedImageError):
        client.search("anything")


# ── search_or_browse: never leave a caller with nothing ──────────────────────


def test_search_or_browse_returns_the_ranked_page_when_the_query_matches():
    page = client.search_or_browse("yoga studio", orientation=client.WIDE)
    assert "yoga" in page.results[0].title.lower()


def test_search_or_browse_browses_when_the_query_matches_nothing():
    """The catalog's lexical search FILTERS as well as ranks, so a coach whose
    vocabulary it has no words for (pole dance, a query in another language)
    gets an empty page. Surfaces that must show something browse instead."""
    assert client.search("pole dance aerial hoop", orientation=client.WIDE).results == []
    page = client.search_or_browse("pole dance aerial hoop", orientation=client.WIDE)
    assert page.results
    assert all(image.asset_id for image in page.results)


def test_search_or_browse_keeps_the_collection_filter_in_the_fallback():
    heroes = {image.asset_id for image in client.search(orientation=client.WIDE, per_page=50).results}
    page = client.search_or_browse("pole dance aerial hoop", orientation=client.WIDE)
    assert {image.asset_id for image in page.results} <= heroes


def test_search_or_browse_reports_a_genuinely_empty_catalog_as_empty(monkeypatch):
    monkeypatch.setattr(client, "search", lambda *a, **k: client.SearchPage(results=[], page=1, has_next=False))
    assert client.search_or_browse("yoga").results == []


def test_a_session_search_sends_the_session_and_skips_the_cache(live_client, monkeypatch):
    """Two identical session searches must reach the service, not the page
    cache: the whole point is that the second one returns different images."""
    bodies = []

    def _request(method, url, json=None, headers=None, timeout=None):
        bodies.append(json)
        return _Response(
            payload={
                "data": [_image_payload()],
                "pagination": {},
                "session_id": "sess-1",
                "shuffle_cycle_restarted": True,
            }
        )

    monkeypatch.setattr(requests, "request", _request)
    page = client.search("sunrise run", session_id="sess-1", shuffle=True)
    assert page.session_id == "sess-1" and page.shuffle_cycle_restarted is True
    client.search("sunrise run", session_id="sess-1", shuffle=True)
    assert len(bodies) == 2  # never served from cache
    assert bodies[0]["session_id"] == "sess-1" and bodies[0]["shuffle"] is True


def test_a_plain_search_still_caches_and_sends_no_session(live_client, monkeypatch):
    bodies = []

    def _request(method, url, json=None, headers=None, timeout=None):
        bodies.append(json)
        return _Response(payload={"data": [_image_payload()], "pagination": {}})

    monkeypatch.setattr(requests, "request", _request)
    client.search("sunrise run")
    client.search("sunrise run")
    assert len(bodies) == 1
    assert "session_id" not in bodies[0] and "shuffle" not in bodies[0]


def test_fixture_session_never_repeats_until_the_cycle_restarts():
    """The offline catalog mirrors the service's session semantics, so the
    "another please" path is exercised in dev and e2e too."""
    from django.core.cache import cache

    cache.clear()
    pool = len(client.search(orientation=client.WIDE, per_page=50).results)
    seen, restarted = [], False
    session = ""
    for _ in range(pool):
        page = client.search(orientation=client.WIDE, per_page=1, session_id=session, shuffle=True)
        session = page.session_id
        assert page.session_id
        seen.append(page.results[0].asset_id)
        restarted = restarted or page.shuffle_cycle_restarted
    assert len(set(seen)) == pool and restarted is False
    exhausted = client.search(orientation=client.WIDE, per_page=1, session_id=session, shuffle=True)
    assert exhausted.shuffle_cycle_restarted is True
    assert exhausted.results[0].asset_id == seen[0]  # restarts at the top match


def test_search_follows_the_live_contract(live_client, monkeypatch):
    """The service returns preview URLs as paths on its own origin and holds at
    most 12 images per page; a browser on a tenant domain needs full URLs."""
    calls = []
    relative = _image_payload(
        url="/media/previews/abc/web.webp",
        renditions={
            "web": {"url": "/media/previews/abc/web.webp", "width": 1600, "height": 900},
            "thumbnail": {"url": "/media/previews/abc/thumbnail.webp", "width": 640, "height": 360},
        },
    )

    def _request(method, url, json=None, headers=None, timeout=None):
        calls.append(json)
        return _Response(payload={"data": [relative], "pagination": {"has_next": False}})

    monkeypatch.setattr(requests, "request", _request)
    image = client.search("yoga", per_page=50).results[0]

    assert calls[0]["per_page"] == 12 and "filters" not in calls[0]
    assert image.web_url == "https://catalog.test/media/previews/abc/web.webp"
    assert image.preview_url == "https://catalog.test/media/previews/abc/thumbnail.webp"
    # ...and the copy-on-use download accepts the service's own origin.
    assert curated_cache._host_allowed("catalog.test") is True
    assert curated_cache._host_allowed("evil-catalog.test") is False


# ── offline fixture catalog ──────────────────────────────────────────────────


def test_fixture_catalog_filters_by_orientation_and_ranks_by_query():
    assert client.is_fake() is True  # conftest keeps every test offline
    wide = client.search(orientation=client.WIDE).results
    tall = client.search(orientation="portrait").results
    assert wide and tall
    assert not {image.asset_id for image in wide} & {image.asset_id for image in tall}
    assert len(wide) + len(tall) == len(client.search().results)
    assert "yoga" in client.search("yoga studio").results[0].title.lower()


def test_fixture_ids_are_stable_and_resolvable():
    first = fake.entries()[0]
    assert client.get(first["asset_id"]).title == first["title"]
    assert client.get("11111111-2222-3333-4444-555555555555") is None


def test_fixture_search_paginates():
    page_one = client.search(per_page=5)
    assert len(page_one.results) == 5 and page_one.has_next is True
    page_two = client.search(page=2, per_page=5)
    assert page_two.results and page_two.has_next is False


# ── copy-on-use cache ────────────────────────────────────────────────────────


def test_cache_copies_into_the_tenant_namespace_once(tenant_ctx, curated_image_uploads):
    from apps.media.models import Photo

    image = client.get(fake.entries()[0]["asset_id"])
    photo = curated_cache.cache_remote_image(image)

    assert photo.s3_key == f"tenants/shared-test/curated/{image.asset_id}.webp"
    assert photo.content_type == "image/webp"
    assert photo.title == image.title and photo.alt_text == image.description
    assert (photo.width, photo.height) == (image.width, image.height)
    assert photo.file_size == len(curated_image_uploads[photo.s3_key])

    again = curated_cache.cache_remote_image(image)
    assert again.pk == photo.pk
    assert Photo.objects.filter(s3_key=photo.s3_key).count() == 1


def test_asset_id_round_trips_through_the_tenant_key(tenant_ctx):
    asset_id = "4df17ec1-10ef-4c88-99cf-37ce84ced788"
    key = curated_cache.tenant_key_for(asset_id)
    assert curated_cache.asset_id_from_key(key) == asset_id
    # Coach uploads and legacy platform objects are not catalog assets.
    assert curated_cache.asset_id_from_key("tenants/shared-test/photos/selfie.jpg") == ""
    assert curated_cache.asset_id_from_key("platform/curated-photos/lotus.png") == ""
    assert curated_cache.asset_id_from_key(None) == ""


def test_allowlist_covers_bucket_subdomains_but_not_lookalikes(settings):
    """The provider signs virtual-host style, so the live host is
    <bucket>.fsn1.your-objectstorage.com — an exact-match allowlist would refuse
    every real rendition. The dot boundary still rejects lookalike domains."""
    settings.CURATED_IMAGE_MEDIA_HOSTS = ["fsn1.your-objectstorage.com"]
    assert curated_cache._host_allowed("fsn1.your-objectstorage.com") is True
    assert curated_cache._host_allowed("contentor-prod-private.fsn1.your-objectstorage.com") is True
    assert curated_cache._host_allowed("evil-fsn1.your-objectstorage.com") is False
    assert curated_cache._host_allowed("fsn1.your-objectstorage.com.evil.test") is False
    assert curated_cache._host_allowed("your-objectstorage.com") is False
    assert curated_cache._host_allowed(None) is False


@pytest.mark.parametrize(
    ("url", "content_type", "body"),
    [
        ("https://evil.test/web.webp", "image/webp", b"x" * 10),  # host not allowlisted
        ("https://evil-fsn1.your-objectstorage.com/web.webp", "image/webp", b"x" * 10),  # lookalike host
        ("http://bucket.fsn1.your-objectstorage.com/web.webp", "image/webp", b"x" * 10),  # not https
        ("https://bucket.fsn1.your-objectstorage.com/web.webp", "text/html", b"<html>"),  # wrong type
        ("https://bucket.fsn1.your-objectstorage.com/web.webp", "image/webp", b"x" * 5_000),  # over the cap
    ],
)
def test_cache_refuses_untrustworthy_bytes(tenant_ctx, settings, monkeypatch, url, content_type, body):
    """A URL chosen by another service is not trusted: only an allowlisted https
    host, only the expected content type, and never more than the byte cap."""
    from apps.media.models import Photo

    settings.CURATED_IMAGE_MAX_BYTES = 1_000

    class _Streamed:
        status_code = 200
        headers = {"Content-Type": content_type}

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def iter_content(self, size):
            yield body

    monkeypatch.setattr(requests, "get", lambda *a, **k: _Streamed())
    image = client.RemoteImage(
        asset_id="4df17ec1-10ef-4c88-99cf-37ce84ced788",
        title="x",
        description="",
        tags=[],
        width=10,
        height=10,
        preview_url=url,
        web_url=url,
    )
    with pytest.raises(client.CuratedImageError):
        curated_cache.cache_remote_image(image)
    assert not Photo.objects.filter(s3_key__contains="/curated/").exists()


def test_cache_stores_downloaded_bytes_from_an_allowlisted_host(tenant_ctx, monkeypatch, curated_image_uploads):
    webp = fake.entries()[0]
    body = (fake.FIXTURE_DIR / webp["file"]).read_bytes()

    class _Streamed:
        status_code = 200
        headers = {"Content-Type": "image/webp"}

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def iter_content(self, size):
            yield body

    monkeypatch.setattr(requests, "get", lambda *a, **k: _Streamed())
    image = client.RemoteImage(
        asset_id="4df17ec1-10ef-4c88-99cf-37ce84ced788",
        title="Remote",
        description="from the service",
        tags=[],
        width=640,
        height=357,
        preview_url="https://contentor-prod-private.fsn1.your-objectstorage.com/thumb.webp?sig=1",
        web_url="https://contentor-prod-private.fsn1.your-objectstorage.com/web.webp?sig=1",
    )
    photo = curated_cache.cache_remote_image(image)
    assert curated_image_uploads[photo.s3_key] == body


# ── coach endpoints ──────────────────────────────────────────────────────────

from rest_framework.test import APIClient  # noqa: E402

from apps.accounts.models import User  # noqa: E402

HOST = "shared-test.localhost"


@pytest.fixture()
def coach_client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@curatedimages.test",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    api = APIClient(HTTP_HOST=HOST)
    api.force_authenticate(user=coach)
    return api


def test_search_endpoint_requires_a_coach(tenant_ctx):
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/curated-images/")
    assert res.status_code in (401, 403)


def test_search_endpoint_returns_a_page(coach_client):
    res = coach_client.get("/api/v1/curated-images/?orientation=landscape")
    assert res.status_code == 200
    assert res.data["results"] and res.data["page"] == 1
    first = res.data["results"][0]
    assert set(first) == {"id", "title", "alt_text", "tags", "width", "height", "image_url"}


def test_search_endpoint_rejects_an_unknown_orientation(coach_client):
    assert coach_client.get("/api/v1/curated-images/?orientation=diagonal").status_code == 400


def test_search_endpoint_reports_an_outage_instead_of_failing(coach_client, monkeypatch):
    def _down(*args, **kwargs):
        raise client.CuratedImageError("the photo library is unavailable right now")

    monkeypatch.setattr(client, "search", _down)
    res = coach_client.get("/api/v1/curated-images/")
    assert res.status_code == 503
    assert "unavailable" in res.data["detail"]


def test_use_endpoint_caches_and_is_idempotent(coach_client, curated_image_uploads):
    asset_id = fake.entries()[0]["asset_id"]
    res = coach_client.post(f"/api/v1/curated-images/{asset_id}/use/")
    assert res.status_code == 201
    assert res.data["s3_key"] == f"tenants/shared-test/curated/{asset_id}.webp"
    again = coach_client.post(f"/api/v1/curated-images/{asset_id}/use/")
    assert again.data["id"] == res.data["id"]


def test_use_endpoint_404s_for_an_unknown_asset(coach_client):
    res = coach_client.post("/api/v1/curated-images/11111111-2222-3333-4444-555555555555/use/")
    assert res.status_code == 404


def test_fixture_preview_is_served_offline_and_gone_in_real_mode(coach_client, settings):
    asset_id = fake.entries()[0]["asset_id"]
    res = APIClient(HTTP_HOST=HOST).get(f"/api/v1/curated-images/{asset_id}/preview/")
    # Unauthenticated on purpose: an <img> tag cannot carry the JWT.
    assert res.status_code == 200 and res["Content-Type"] == "image/webp"
    assert b"".join(res.streaming_content)[:4] == b"RIFF"

    settings.CURATED_IMAGE_API_FAKE = False
    assert APIClient(HTTP_HOST=HOST).get(f"/api/v1/curated-images/{asset_id}/preview/").status_code == 404


def test_upstream_storage_keys_never_reach_the_coach(coach_client, live_client, monkeypatch):
    """Normalization is a boundary, not a passthrough: whatever extra fields the
    service sends — object keys above all — stay out of the coach's payload. The
    only handle contentor hands out is an asset id, and it derives its own storage
    key from that."""
    upstream = _image_payload()
    upstream["renditions"]["web"]["object_key"] = "curated-images/run-2026-08/asset/web.webp"
    upstream["object_key"] = "curated-images/run-2026-08/asset/original.png"
    monkeypatch.setattr(requests, "request", lambda *a, **k: _Response(payload={"data": [upstream], "pagination": {}}))
    res = coach_client.get("/api/v1/curated-images/")
    assert res.status_code == 200
    payload = str(res.data)
    assert "object_key" not in payload
    assert "run-2026-08" not in payload


def test_cache_bypasses_http_for_fixture_bytes(tenant_ctx, monkeypatch, curated_image_uploads):
    """Fixture mode must not reach the network at all — the local path is the
    byte source, so e2e stays offline."""

    def _forbidden(*args, **kwargs):
        raise AssertionError("fixture mode must not make HTTP requests")

    monkeypatch.setattr(requests, "get", _forbidden)
    image = client.get(fake.entries()[0]["asset_id"])
    photo = curated_cache.cache_remote_image(image)
    assert curated_image_uploads[photo.s3_key][:4] == b"RIFF"
    assert io.BytesIO(curated_image_uploads[photo.s3_key]).read(4) == b"RIFF"


# ── generation ───────────────────────────────────────────────────────────────


def test_generate_sends_an_idempotency_key_and_reads_the_job(live_client, monkeypatch):
    calls = []

    def _request(method, url, json=None, headers=None, timeout=None):
        calls.append((method, url, json, headers, timeout))
        if method == "POST":
            return _Response(status_code=202, payload={"data": {"id": "job-1", "status": "pending", "image": None}})
        return _Response(payload={"data": {"id": "job-1", "status": "fulfilled", "image": _image_payload()}})

    monkeypatch.setattr(requests, "request", _request)
    queued = client.generate("  a red   canoe at sunrise ", idempotency_key="key-1")
    assert (queued.job_id, queued.status, queued.done, queued.image) == ("job-1", "pending", False, None)
    method, url, body, headers, _ = calls[0]
    assert (method, url) == ("POST", "https://catalog.test/v1/images/generate")
    assert body == {"query": "a red canoe at sunrise", "aspect_ratio": "16:9"}
    assert headers["Idempotency-Key"] == "key-1" and headers["X-API-Key"] == "test-key"

    finished = client.generation("job-1", wait=8)
    assert finished.done and finished.image.title == "Sunrise trail run"
    assert calls[1][1] == "https://catalog.test/v1/generation-requests/job-1?wait=8"
    assert calls[1][4][1] == 18  # read timeout outlasts the long-poll


def test_out_of_credits_reads_as_such(live_client, monkeypatch):
    monkeypatch.setattr(requests, "request", lambda *a, **k: _Response(status_code=402, text="payment_required"))
    with pytest.raises(client.CuratedImageError, match="credits"):
        client.generate("a red canoe", idempotency_key="key-2")


def test_generate_endpoint_returns_a_tenant_photo_and_counts_against_the_cap(coach_client, settings):
    settings.CURATED_IMAGE_GENERATE_MONTHLY_LIMIT = 1
    res = coach_client.post("/api/v1/curated-images/generate/", {"prompt": "yoga studio at dawn"}, format="json")
    assert res.status_code == 202, res.data
    assert res.data["done"] is True and res.data["photo"]["id"]

    polled = coach_client.get(f"/api/v1/curated-images/generate/{res.data['job_id']}/")
    assert polled.status_code == 200 and polled.data["photo"]["id"] == res.data["photo"]["id"]

    again = coach_client.post("/api/v1/curated-images/generate/", {"prompt": "another one"}, format="json")
    assert again.status_code == 429


def test_generate_endpoint_guards_its_inputs(coach_client):
    post = coach_client.post
    assert post("/api/v1/curated-images/generate/", {"prompt": "  "}, format="json").status_code == 400
    assert (
        post("/api/v1/curated-images/generate/", {"prompt": "x", "aspect_ratio": "7:3"}, format="json").status_code
        == 400
    )
    # A job this tenant never started is not pollable.
    assert coach_client.get("/api/v1/curated-images/generate/fake-job-someone-elses/").status_code == 404


# ── automatic covers ─────────────────────────────────────────────────────────


def test_auto_cover_prefers_photos_the_tenant_has_not_used(tenant_ctx, curated_image_uploads):
    """Subjects the library has no words for all fall back to the same page;
    each call must still hand back a different photo."""
    first = curated_cache.auto_cover("zzz unmatched subject one")
    second = curated_cache.auto_cover("zzz unmatched subject two")
    assert first and second and first.pk != second.pk
    assert first.width > first.height  # covers are wide shots
