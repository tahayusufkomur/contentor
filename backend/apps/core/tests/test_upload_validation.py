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
