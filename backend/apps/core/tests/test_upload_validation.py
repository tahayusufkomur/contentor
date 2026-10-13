"""Upload safety validation (audit P1-D).

- The 'complete' endpoints must reject a client-supplied s3_key that isn't
  under the current tenant's storage prefix (else a coach can attach, and get a
  presigned URL for, any object in the bucket).
- Presign must reject dangerous active-content MIME types.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.storage import build_s3_path

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@upload.test",
        name="Owner",
        password="secret123",
        role="owner",  # noqa: S106  # pragma: allowlist secret
    )


def _client(user):
    c = APIClient(HTTP_HOST=SHARED_DOMAIN)
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db(transaction=True)
class TestUploadValidation:
    def test_complete_rejects_foreign_s3_key(self, tenant_ctx, owner):
        resp = _client(owner).post(
            "/api/v1/upload/complete/",
            {"s3_key": "tenants/some-other-tenant/photo/evil.png", "category": "photo"},
            format="json",
        )
        assert resp.status_code == 400
        assert "s3_key" in resp.json()

    def test_complete_rejects_path_traversal_key(self, tenant_ctx, owner):
        resp = _client(owner).post(
            "/api/v1/upload/complete/",
            {"s3_key": build_s3_path("photo", "..", "..", "escape.png"), "category": "photo"},
            format="json",
        )
        assert resp.status_code == 400

    def test_complete_accepts_own_tenant_key(self, tenant_ctx, owner):
        # A key under this tenant's prefix passes s3_key validation (the photo
        # record is then created normally).
        resp = _client(owner).post(
            "/api/v1/upload/complete/",
            {"s3_key": build_s3_path("photo", "mine.png"), "category": "photo"},
            format="json",
        )
        assert resp.status_code == 200, resp.content

    def test_presign_rejects_html_content_type(self, tenant_ctx, owner):
        resp = _client(owner).post(
            "/api/v1/upload/presign/",
            {"filename": "x.html", "content_type": "text/html", "category": "download"},
            format="json",
        )
        assert resp.status_code == 400
        assert "content_type" in resp.json()


# The create endpoints take a storage key too (the batch uploader posts to
# them straight after the PUT), so they hold the same line as 'complete'.
CREATE_ENDPOINTS = [
    ("/api/v1/photos/", "s3_key", "photo"),
    ("/api/v1/courses/videos/", "s3_key", "video"),
    ("/api/v1/downloads/", "file_url", "download"),
]


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(("url", "field", "category"), CREATE_ENDPOINTS)
class TestCreateEndpointsKeepToTheTenant:
    def test_rejects_another_tenants_key(self, tenant_ctx, owner, url, field, category):
        body = {"title": "Evil", field: f"tenants/some-other-tenant/{category}/evil.bin"}
        resp = _client(owner).post(url, body, format="json")
        assert resp.status_code == 400, resp.content
        assert field in resp.json()

    def test_rejects_a_path_traversal_key(self, tenant_ctx, owner, url, field, category):
        body = {"title": "Evil", field: build_s3_path(category, "..", "..", "escape.bin")}
        assert _client(owner).post(url, body, format="json").status_code == 400

    def test_accepts_its_own_key(self, tenant_ctx, owner, url, field, category):
        body = {"title": "Mine", field: build_s3_path(category, "mine.bin")}
        assert _client(owner).post(url, body, format="json").status_code == 201


@pytest.mark.django_db(transaction=True)
def test_an_edit_that_sends_the_stored_key_back_still_saves(tenant_ctx, owner):
    # Rows made on the server (a stock photo copied in, seeded content) may
    # carry a key from before this rule; saving one unchanged must not fail.
    from apps.media.models import Photo

    photo = Photo.objects.create(title="Old", s3_key="photos/legacy.jpg")
    resp = _client(owner).put(
        f"/api/v1/photos/{photo.pk}/", {"title": "Renamed", "s3_key": "photos/legacy.jpg"}, format="json"
    )
    assert resp.status_code == 200, resp.content
    moved = _client(owner).put(
        f"/api/v1/photos/{photo.pk}/", {"s3_key": "tenants/some-other-tenant/photo/x.jpg"}, format="json"
    )
    assert moved.status_code == 400
