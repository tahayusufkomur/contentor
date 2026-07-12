"""Curated logo library (Phase 2): model, admin registration, catalog endpoint,
platform upload, dev mirror sync, seed command."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import CuratedLogo

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def _png_file(name="logo.png", content_type="image/png", body=_PNG_BYTES):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, body, content_type=content_type)


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root@curated.test", region="global", role="owner", is_staff=True, is_superuser=True
    )


def make_client(user=None, host=SHARED_DOMAIN):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


class TestCuratedLogoModel:
    def test_position_defaults_to_max_plus_one(self, restore_public):
        a = CuratedLogo.objects.create(title="A", image_key="platform/curated-logos/a.png")
        b = CuratedLogo.objects.create(title="B", image_key="platform/curated-logos/b.png")
        assert (a.position, b.position) == (1, 2)

    def test_explicit_position_kept(self, restore_public):
        row = CuratedLogo.objects.create(title="C", image_key="platform/curated-logos/c.png", position=7)
        assert row.position == 7


class TestCuratedLogoAdmin:
    def test_registered_and_crud(self, superuser):
        client = make_client(superuser)
        meta = client.get("/api/v1/platform-admin/meta/").json()
        assert "curated-logos" in {m["key"] for m in meta["models"]}

        resp = client.post(
            "/api/v1/platform-admin/curated-logos/",
            {
                "title": "Zen",
                "prompt": "a zen logo",
                "tags": "zen, yoga",
                "image_key": "platform/curated-logos/zen.png",
                "enabled": True,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        pk = resp.json()["id"]

        resp = client.patch(f"/api/v1/platform-admin/curated-logos/{pk}/", {"enabled": False}, format="json")
        assert resp.status_code == 200
        assert CuratedLogo.objects.get(pk=pk).enabled is False

    def test_requires_superuser(self, restore_public):
        anon = APIClient(HTTP_HOST=SHARED_DOMAIN)
        assert anon.get("/api/v1/platform-admin/curated-logos/").status_code in (401, 403)


class TestPlatformUpload:
    @pytest.fixture(autouse=True)
    def _no_s3(self, monkeypatch):
        self.stored = {}
        monkeypatch.setattr(
            "apps.core.platform.uploads._store_object",
            lambda key, fileobj, content_type: self.stored.update({key: fileobj.read()}),
        )

    def test_uploads_png_and_returns_key_and_url(self, superuser):
        client = make_client(superuser)
        resp = client.post(
            "/api/v1/platform/upload/",
            {"file": _png_file(), "prefix": "curated-logos"},
            format="multipart",
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert body["key"].startswith("platform/curated-logos/") and body["key"].endswith(".png")
        assert body["url"]
        assert body["key"] in self.stored

    def test_rejects_non_superuser(self, restore_public):
        anon = APIClient(HTTP_HOST=SHARED_DOMAIN)
        resp = anon.post("/api/v1/platform/upload/", {"file": _png_file()}, format="multipart")
        assert resp.status_code in (401, 403)

    def test_rejects_non_png(self, superuser):
        resp = make_client(superuser).post(
            "/api/v1/platform/upload/",
            {"file": _png_file(body=b"GIF89a" + b"0" * 64, content_type="image/png")},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_rejects_bad_prefix(self, superuser):
        resp = make_client(superuser).post(
            "/api/v1/platform/upload/",
            {"file": _png_file(), "prefix": "../tenants/x"},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_rejects_oversize(self, superuser):
        big = b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024)
        resp = make_client(superuser).post(
            "/api/v1/platform/upload/", {"file": _png_file(body=big)}, format="multipart"
        )
        assert resp.status_code == 400


class TestCuratedCatalogEndpoint:
    @pytest.fixture()
    def rows(self, restore_public):
        CuratedLogo.objects.create(
            title="Second", tags="chef", image_key="platform/curated-logos/chef.png", position=2
        )
        CuratedLogo.objects.create(
            title="First",
            prompt="a yoga logo",
            tags="yoga, zen",
            image_key="platform/curated-logos/yoga.png",
            position=1,
        )
        CuratedLogo.objects.create(title="Hidden", image_key="platform/curated-logos/hidden.png", enabled=False)
        CuratedLogo.objects.create(title="BadKey", image_key="tenants/x/photo/evil.png")

    def test_unauthenticated_ordered_enabled_only(self, rows):
        resp = APIClient(HTTP_HOST=SHARED_DOMAIN).get("/api/v1/logos/curated/")
        assert resp.status_code == 200
        body = resp.json()
        assert [e["title"] for e in body] == ["First", "Second"]
        first = body[0]
        assert first["filename"] == "yoga.png"
        assert first["prompt"] == "a yoga logo"
        assert first["tags"] == "yoga, zen"
        assert first["image_url"]  # presigned URL, non-empty
