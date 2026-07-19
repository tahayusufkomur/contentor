"""Curated photo library: model, seed command, coach search + materialize
endpoints. Spec: docs/superpowers/specs/2026-07-19-curated-photos-design.md."""

import pytest
from django_tenants.utils import schema_context

from apps.core.models import CuratedPhoto

pytestmark = pytest.mark.django_db


def _photo_row(**overrides):
    defaults = {
        "title": "Sunrise run",
        "tags": "fitness, running, morning",
        "alt_text": "runner at sunrise",
        "kind": "hero",
        "image_key": "platform/curated-photos/sunrise_run.png",
        "width": 1600,
        "height": 900,
    }
    defaults.update(overrides)
    return CuratedPhoto.objects.create(**defaults)


def test_kinds_constants():
    assert CuratedPhoto.KINDS == ["hero", "stock", "spot", "texture", "divider", "icon"]
    assert CuratedPhoto.AI_KINDS == ("hero", "stock", "spot")


def test_position_auto_appends(restore_public):
    with schema_context("public"):
        first = _photo_row(image_key="platform/curated-photos/a.png")
        second = _photo_row(image_key="platform/curated-photos/b.png")
        assert first.position == 1
        assert second.position == 2


def test_defaults(restore_public):
    with schema_context("public"):
        row = CuratedPhoto.objects.create(title="x", image_key="platform/curated-photos/x.png")
        assert row.kind == "stock"
        assert row.enabled is True
        assert row.width is None and row.height is None


# ── materialize ──────────────────────────────────────────────────────────────


@pytest.fixture()
def curated_row(tenant_ctx):
    with schema_context("public"):
        row = CuratedPhoto.objects.create(
            title="Sunrise run",
            tags="fitness, running",
            alt_text="runner at sunrise",
            kind="hero",
            image_key="platform/curated-photos/sunrise_run.png",
            width=1600,
            height=900,
        )
    return row


def test_materialize_creates_tenant_photo(tenant_ctx, curated_row):
    from apps.core.curated_photos.materialize import materialize_curated_photo
    from apps.media.models import Photo

    photo = materialize_curated_photo(curated_row)
    assert Photo.objects.filter(pk=photo.pk).exists()
    assert photo.s3_key == "platform/curated-photos/sunrise_run.png"
    assert photo.title == "Sunrise run"
    assert photo.alt_text == "runner at sunrise"
    assert photo.width == 1600 and photo.height == 900


def test_materialize_is_idempotent_per_tenant(tenant_ctx, curated_row):
    from apps.core.curated_photos.materialize import materialize_curated_photo
    from apps.media.models import Photo

    first = materialize_curated_photo(curated_row)
    second = materialize_curated_photo(curated_row)
    assert first.pk == second.pk
    assert Photo.objects.filter(s3_key=curated_row.image_key).count() == 1


# ── coach API ────────────────────────────────────────────────────────────────

from rest_framework.test import APIClient  # noqa: E402

from apps.accounts.models import User  # noqa: E402

HOST = "shared-test.localhost"


@pytest.fixture()
def coach_client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@curatedphotos.test",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture()
def catalog(tenant_ctx):
    with schema_context("public"):
        rows = [
            CuratedPhoto.objects.create(
                title="Sunrise run", tags="fitness, running", kind="hero",
                image_key="platform/curated-photos/run.png",
            ),
            CuratedPhoto.objects.create(
                title="Meal prep", tags="cooking, nutrition", kind="stock",
                image_key="platform/curated-photos/meal.png",
            ),
            CuratedPhoto.objects.create(
                title="Disabled", tags="x", kind="hero",
                image_key="platform/curated-photos/off.png", enabled=False,
            ),
            CuratedPhoto.objects.create(
                title="Escapee", tags="x", kind="hero",
                image_key="tenant-secrets/oops.png",
            ),
        ]
    return rows


def test_search_requires_auth(tenant_ctx, catalog):
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/curated-photos/")
    assert res.status_code in (401, 403)


def test_search_filters_kind_and_query_and_guards_prefix(coach_client, catalog):
    res = coach_client.get("/api/v1/curated-photos/")
    assert res.status_code == 200
    titles = [r["title"] for r in res.data]
    assert "Sunrise run" in titles and "Meal prep" in titles
    assert "Disabled" not in titles  # enabled=False hidden
    assert "Escapee" not in titles  # non-platform key never signed

    res = coach_client.get("/api/v1/curated-photos/?kind=hero")
    assert [r["title"] for r in res.data] == ["Sunrise run"]

    res = coach_client.get("/api/v1/curated-photos/?q=nutri")
    assert [r["title"] for r in res.data] == ["Meal prep"]
    assert res.data[0]["image_url"]


def test_use_materializes_and_is_idempotent(coach_client, catalog):
    from apps.media.models import Photo

    row_id = catalog[0].id
    res = coach_client.post(f"/api/v1/curated-photos/{row_id}/use/")
    assert res.status_code == 201
    assert res.data["s3_key"] == "platform/curated-photos/run.png"
    again = coach_client.post(f"/api/v1/curated-photos/{row_id}/use/")
    assert again.status_code == 201
    assert again.data["id"] == res.data["id"]
    assert Photo.objects.filter(s3_key="platform/curated-photos/run.png").count() == 1


def test_use_404_for_disabled(coach_client, catalog):
    res = coach_client.post(f"/api/v1/curated-photos/{catalog[2].id}/use/")
    assert res.status_code == 404


# ── seed command ─────────────────────────────────────────────────────────────

import io  # noqa: E402
import json as jsonlib  # noqa: E402

from django.core.management import call_command  # noqa: E402


def _png_bytes(size=(64, 32), color=(200, 30, 30)):
    from PIL import Image

    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _mark_on_white_png(size=(64, 64)):
    """A parseable mark-on-white PNG so kind=spot cleaning has something to
    crop (mirrors test_curated_logos._white_bg_png)."""
    from PIL import Image

    img = Image.new("RGB", size, "white")
    for x in range(20, 44):
        for y in range(20, 44):
            img.putpixel((x, y), (0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture()
def catalog_dir(tmp_path):
    (tmp_path / "run.png").write_bytes(_png_bytes(size=(160, 90)))
    (tmp_path / "mark.png").write_bytes(_mark_on_white_png())
    (tmp_path / "photo_meta.json").write_text(
        jsonlib.dumps(
            [
                {"title": "Sunrise run", "filename": "run.png", "tags": "fitness", "kind": "hero",
                 "alt_text": "runner at sunrise"},
                {"title": "Lotus mark", "filename": "mark.png", "kind": "spot"},
                {"title": "Ghost", "filename": "missing.png", "kind": "hero"},
                {"title": "Bad kind", "filename": "run.png", "kind": "sticker"},
            ]
        )
    )
    return tmp_path


def test_seed_creates_rows_and_dimensions(restore_public, catalog_dir, monkeypatch):
    stored = {}
    monkeypatch.setattr(
        "apps.core.management.commands.seed_curated_photos._store_object",
        lambda key, fileobj, content_type: stored.__setitem__(key, fileobj.read()),
    )
    call_command("seed_curated_photos", dir=str(catalog_dir))
    with schema_context("public"):
        run = CuratedPhoto.objects.get(image_key="platform/curated-photos/run.png")
        assert run.kind == "hero" and run.alt_text == "runner at sunrise"
        assert (run.width, run.height) == (160, 90)
        assert CuratedPhoto.objects.filter(image_key__endswith="mark.png").exists()
        assert not CuratedPhoto.objects.filter(title="Ghost").exists()  # missing file skipped
        assert CuratedPhoto.objects.count() == 2  # bad kind skipped too
    assert "platform/curated-photos/run.png" in stored


def test_seed_is_idempotent(restore_public, catalog_dir, monkeypatch):
    monkeypatch.setattr(
        "apps.core.management.commands.seed_curated_photos._store_object",
        lambda key, fileobj, content_type: None,
    )
    call_command("seed_curated_photos", dir=str(catalog_dir))
    call_command("seed_curated_photos", dir=str(catalog_dir))
    with schema_context("public"):
        assert CuratedPhoto.objects.count() == 2
