"""Curated DECORATIVE library: model, seed command, coach search + materialize
endpoints. Photography moved to the curated-image-api service — see
test_curated_images.py and
docs/superpowers/specs/2026-08-09-curated-images-offload-design.md.
Original spec: docs/superpowers/specs/2026-07-19-curated-photos-design.md."""

import pytest
from django_tenants.utils import schema_context

from apps.core.models import CuratedPhoto

pytestmark = pytest.mark.django_db


def _photo_row(**overrides):
    defaults = {
        "title": "Lotus mark",
        "tags": "wellness, calm, mark",
        "alt_text": "line-art lotus",
        "kind": "spot",
        "image_key": "platform/curated-photos/lotus.png",
        "width": 512,
        "height": 512,
    }
    defaults.update(overrides)
    return CuratedPhoto.objects.create(**defaults)


def test_kinds_are_decorative_only():
    assert CuratedPhoto.KINDS == ["spot", "texture", "divider", "icon"]
    # Photography left with the catalog; nothing here feeds the AI writer now.
    assert not hasattr(CuratedPhoto, "AI_KINDS")


def test_position_auto_appends(restore_public):
    with schema_context("public"):
        first = _photo_row(image_key="platform/curated-photos/a.png")
        second = _photo_row(image_key="platform/curated-photos/b.png")
        assert first.position == 1
        assert second.position == 2


def test_defaults(restore_public):
    with schema_context("public"):
        row = CuratedPhoto.objects.create(title="x", image_key="platform/curated-photos/x.png")
        assert row.kind == "spot"
        assert row.enabled is True
        assert row.width is None and row.height is None


# ── materialize ──────────────────────────────────────────────────────────────


@pytest.fixture()
def curated_row(tenant_ctx):
    with schema_context("public"):
        row = CuratedPhoto.objects.create(
            title="Lotus mark",
            tags="wellness, calm",
            alt_text="line-art lotus",
            kind="spot",
            image_key="platform/curated-photos/lotus.png",
            width=512,
            height=512,
        )
    return row


def test_materialize_creates_tenant_photo(tenant_ctx, curated_row):
    from apps.core.curated_photos.materialize import materialize_curated_photo
    from apps.media.models import Photo

    photo = materialize_curated_photo(curated_row)
    assert Photo.objects.filter(pk=photo.pk).exists()
    assert photo.s3_key == "platform/curated-photos/lotus.png"
    assert photo.title == "Lotus mark"
    assert photo.alt_text == "line-art lotus"
    assert photo.width == 512 and photo.height == 512


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
                title="Lotus mark",
                tags="wellness, calm",
                kind="spot",
                image_key="platform/curated-photos/lotus.png",
            ),
            CuratedPhoto.objects.create(
                title="Linen weave",
                tags="paper, grain, texture",
                kind="texture",
                image_key="platform/curated-photos/linen.png",
            ),
            CuratedPhoto.objects.create(
                title="Disabled",
                tags="x",
                kind="spot",
                image_key="platform/curated-photos/off.png",
                enabled=False,
            ),
            CuratedPhoto.objects.create(
                title="Escapee",
                tags="x",
                kind="spot",
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
    assert "Lotus mark" in titles and "Linen weave" in titles
    assert "Disabled" not in titles  # enabled=False hidden
    assert "Escapee" not in titles  # non-platform key never signed

    res = coach_client.get("/api/v1/curated-photos/?kind=spot")
    assert [r["title"] for r in res.data] == ["Lotus mark"]

    res = coach_client.get("/api/v1/curated-photos/?q=grain")
    assert [r["title"] for r in res.data] == ["Linen weave"]
    assert res.data[0]["image_url"]


def test_use_materializes_and_is_idempotent(coach_client, catalog):
    from apps.media.models import Photo

    row_id = catalog[0].id
    res = coach_client.post(f"/api/v1/curated-photos/{row_id}/use/")
    assert res.status_code == 201
    assert res.data["s3_key"] == "platform/curated-photos/lotus.png"
    again = coach_client.post(f"/api/v1/curated-photos/{row_id}/use/")
    assert again.status_code == 201
    assert again.data["id"] == res.data["id"]
    assert Photo.objects.filter(s3_key="platform/curated-photos/lotus.png").count() == 1


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


def _jpg_bytes(size=(160, 90), color=(30, 120, 200)):
    from PIL import Image

    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture()
def catalog_dir(tmp_path):
    (tmp_path / "weave.png").write_bytes(_png_bytes(size=(160, 90)))
    (tmp_path / "mark.png").write_bytes(_mark_on_white_png())
    (tmp_path / "rule.jpg").write_bytes(_jpg_bytes(size=(320, 180)))
    (tmp_path / "photo_meta.json").write_text(
        jsonlib.dumps(
            [
                {
                    "title": "Linen weave",
                    "filename": "weave.png",
                    "tags": "paper",
                    "kind": "texture",
                    "alt_text": "woven paper grain",
                },
                {"title": "Lotus mark", "filename": "mark.png", "kind": "spot"},
                {"title": "Thin rule", "filename": "rule.jpg", "kind": "divider"},
                {"title": "Ghost", "filename": "missing.png", "kind": "icon"},
                {"title": "Bad kind", "filename": "weave.png", "kind": "sticker"},
                # A stale local catalog still listing photography: the kind no
                # longer exists here, so it is skipped rather than reseeded.
                {"title": "Old hero", "filename": "weave.png", "kind": "hero"},
            ]
        )
    )
    return tmp_path


def test_seed_creates_rows_and_dimensions(restore_public, catalog_dir, monkeypatch):
    stored = {}
    monkeypatch.setattr(
        "apps.core.management.commands.seed_curated_photos._store_object",
        lambda key, fileobj, content_type: stored.__setitem__(key, content_type),
    )
    call_command("seed_curated_photos", dir=str(catalog_dir))
    with schema_context("public"):
        weave = CuratedPhoto.objects.get(image_key="platform/curated-photos/weave.png")
        assert weave.kind == "texture" and weave.alt_text == "woven paper grain"
        assert (weave.width, weave.height) == (160, 90)
        assert CuratedPhoto.objects.filter(image_key__endswith="mark.png").exists()
        rule = CuratedPhoto.objects.get(image_key="platform/curated-photos/rule.jpg")
        assert (rule.width, rule.height) == (320, 180)
        assert not CuratedPhoto.objects.filter(title="Ghost").exists()  # missing file skipped
        assert not CuratedPhoto.objects.filter(title="Old hero").exists()  # photography no longer seeds here
        assert CuratedPhoto.objects.count() == 3  # bad kind skipped too
    assert stored["platform/curated-photos/weave.png"] == "image/png"
    assert stored["platform/curated-photos/rule.jpg"] == "image/jpeg"


def test_seed_is_idempotent(restore_public, catalog_dir, monkeypatch):
    monkeypatch.setattr(
        "apps.core.management.commands.seed_curated_photos._store_object",
        lambda key, fileobj, content_type: None,
    )
    call_command("seed_curated_photos", dir=str(catalog_dir))
    call_command("seed_curated_photos", dir=str(catalog_dir))
    with schema_context("public"):
        assert CuratedPhoto.objects.count() == 3
