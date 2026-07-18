"""Curated logo library (Phase 2): model, admin registration, catalog endpoint,
platform upload, dev mirror sync, seed command."""

import io
import json as jsonlib

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import CuratedLogo

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(autouse=True)
def _no_curated_s3(monkeypatch):
    def _fail():
        raise RuntimeError("no s3 in tests")

    monkeypatch.setattr("apps.core.signals.get_s3_client", _fail)


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


def _white_bg_png(size=(120, 120)):
    """A parseable mark-on-white PNG: cleaning should strip the background."""
    from PIL import Image

    img = Image.new("RGB", size, "white")
    for x in range(40, 80):
        for y in range(40, 80):
            img.putpixel((x, y), (0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _corner_alpha(data):
    from PIL import Image

    return Image.open(io.BytesIO(data)).convert("RGBA").getpixel((0, 0))[3]


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

    def test_curated_prefix_cleans_white_background(self, superuser):
        resp = make_client(superuser).post(
            "/api/v1/platform/upload/",
            {"file": _png_file(body=_white_bg_png()), "prefix": "curated-logos"},
            format="multipart",
        )
        assert resp.status_code == 201, resp.content
        assert _corner_alpha(self.stored[resp.json()["key"]]) == 0

    def test_other_prefixes_stay_untouched(self, superuser):
        body = _white_bg_png()
        resp = make_client(superuser).post(
            "/api/v1/platform/upload/",
            {"file": _png_file(body=body), "prefix": "images"},
            format="multipart",
        )
        assert resp.status_code == 201, resp.content
        assert self.stored[resp.json()["key"]] == body

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
        CuratedLogo.objects.create(title="Second", tags="chef", image_key="platform/curated-logos/chef.png", position=2)
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
        assert "mark_paths" in first  # present (null for these untraced rows)


class TestCuratedTraceOnSave:
    def _real_png(self):
        from PIL import Image

        img = Image.new("RGB", (80, 80), "white")
        for x in range(24, 56):
            for y in range(24, 56):
                img.putpixel((x, y), (0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return buf.getvalue()

    def _fake_s3(self, monkeypatch, body):
        class FakeS3:
            def get_object(self, Bucket, Key):  # noqa: N803
                return {"Body": io.BytesIO(body)}

        monkeypatch.setattr("apps.core.signals.get_s3_client", lambda: FakeS3())

    def test_populates_mark_paths_from_traceable_png(self, restore_public, monkeypatch, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        self._fake_s3(monkeypatch, self._real_png())
        row = CuratedLogo.objects.create(title="Sq", image_key="platform/curated-logos/sq.png")
        row.refresh_from_db()
        assert row.mark_paths and isinstance(row.mark_paths, list)
        assert all("d" in p for p in row.mark_paths)

    def test_null_mark_paths_for_unreadable_png(self, restore_public, monkeypatch, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        self._fake_s3(monkeypatch, b"not a png")
        row = CuratedLogo.objects.create(title="Bad", image_key="platform/curated-logos/bad.png")
        row.refresh_from_db()
        assert row.mark_paths is None

    def test_save_survives_s3_failure(self, restore_public, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        # get_s3_client is the _no_curated_s3 fast-fail stub here.
        row = CuratedLogo.objects.create(title="Y", image_key="platform/curated-logos/y.png")
        assert row.pk
        row.refresh_from_db()
        assert row.mark_paths is None


class TestCuratedMirrorSync:
    @pytest.fixture(autouse=True)
    def _sync_dir(self, tmp_path, settings, monkeypatch):
        settings.CURATED_LOGO_SYNC_DIR = str(tmp_path)
        self.dir = tmp_path

        class FakeS3:
            def get_object(self, Bucket, Key):  # noqa: N803 (matches boto3's real param names)
                return {"Body": io.BytesIO(_PNG_BYTES)}

        monkeypatch.setattr("apps.core.signals.get_s3_client", lambda: FakeS3())

    def test_save_writes_meta_and_png(self, restore_public):
        CuratedLogo.objects.create(title="Yoga", prompt="p", tags="yoga", image_key="platform/curated-logos/yoga.png")
        meta = jsonlib.loads((self.dir / "logo_meta.json").read_text())
        assert meta == [{"title": "Yoga", "filename": "yoga.png", "prompt": "p", "tags": "yoga"}]
        assert (self.dir / "yoga.png").read_bytes() == _PNG_BYTES

    def test_disabled_row_leaves_meta_but_keeps_png(self, restore_public):
        row = CuratedLogo.objects.create(title="Yoga", image_key="platform/curated-logos/yoga.png")
        row.enabled = False
        row.save()
        meta = jsonlib.loads((self.dir / "logo_meta.json").read_text())
        assert meta == []
        assert (self.dir / "yoga.png").exists()  # mirror never deletes files

    def test_deleting_last_row_never_clobbers_meta(self, restore_public):
        # logo_meta.json is gitignored and doubles as seed_curated_logos'
        # input: once the table is empty, the mirror must not overwrite the
        # only local copy of the catalog with [].
        row = CuratedLogo.objects.create(
            title="Yoga", prompt="p", tags="yoga", image_key="platform/curated-logos/yoga.png"
        )
        row.delete()
        meta = jsonlib.loads((self.dir / "logo_meta.json").read_text())
        assert meta == [{"title": "Yoga", "filename": "yoga.png", "prompt": "p", "tags": "yoga"}]

    def test_sync_off_when_setting_unset(self, restore_public, settings):
        settings.CURATED_LOGO_SYNC_DIR = ""
        CuratedLogo.objects.create(title="X", image_key="platform/curated-logos/x.png")
        assert not (self.dir / "logo_meta.json").exists()

    def test_s3_failure_does_not_break_save(self, restore_public, monkeypatch):
        def boom():
            raise RuntimeError("s3 down")

        monkeypatch.setattr("apps.core.signals.get_s3_client", boom)
        row = CuratedLogo.objects.create(title="Y", image_key="platform/curated-logos/y.png")
        assert row.pk  # save succeeded despite mirror failure


class TestSeedCommand:
    @pytest.fixture()
    def catalog_dir(self, tmp_path, settings, monkeypatch):
        settings.CURATED_LOGO_SYNC_DIR = ""  # keep the mirror signal quiet
        meta = [
            {"title": "Yoga", "filename": "yoga.png", "prompt": "p1", "tags": "yoga"},
            {"title": "Chef", "filename": "chef.png", "prompt": "p2", "tags": "chef"},
            {"title": "Ghost", "filename": "missing.png", "prompt": "", "tags": ""},
        ]
        (tmp_path / "logo_meta.json").write_text(jsonlib.dumps(meta))
        (tmp_path / "yoga.png").write_bytes(_PNG_BYTES)
        (tmp_path / "chef.png").write_bytes(_PNG_BYTES)
        self.stored = {}
        monkeypatch.setattr(
            "apps.core.management.commands.seed_curated_logos._store_object",
            lambda key, fileobj, content_type: self.stored.update({key: fileobj.read()}),
        )
        return tmp_path

    def test_seeds_rows_in_order_and_skips_missing(self, restore_public, catalog_dir):
        from django.core.management import call_command

        call_command("seed_curated_logos", dir=str(catalog_dir))
        rows = list(CuratedLogo.objects.order_by("position"))
        assert [(r.title, r.position) for r in rows] == [("Yoga", 1), ("Chef", 2)]
        assert rows[0].image_key == "platform/curated-logos/yoga.png"
        assert "platform/curated-logos/yoga.png" in self.stored

    def test_idempotent_rerun(self, restore_public, catalog_dir):
        from django.core.management import call_command

        call_command("seed_curated_logos", dir=str(catalog_dir))
        call_command("seed_curated_logos", dir=str(catalog_dir))
        assert CuratedLogo.objects.count() == 2

    def test_uploads_cleaned_pngs(self, restore_public, catalog_dir):
        from django.core.management import call_command

        (catalog_dir / "yoga.png").write_bytes(_white_bg_png())
        call_command("seed_curated_logos", dir=str(catalog_dir))
        assert _corner_alpha(self.stored["platform/curated-logos/yoga.png"]) == 0
