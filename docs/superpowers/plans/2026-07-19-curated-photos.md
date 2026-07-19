# Curated Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A platform-curated, searchable library of AI-generated visual assets (hero covers, stock images, spot illustrations, …) that coaches and the blog AI writer place into blog posts, materialized on use into tenant `media.Photo` rows.

**Architecture:** New public-schema `core.CuratedPhoto` model (sibling of `CuratedLogo`) + seed pipeline; coach-facing search/materialize API; the blog AI writer's `<available_photos>` block is topped up with namespaced curated candidates; covers and inline placements — stored today but rendered nowhere — get surfaced end-to-end (serializers, editor UI, public pages). Copy-on-use: picking a curated photo creates a tenant `media.Photo` pointing at the shared platform object, so the whole existing photo pipeline is reused.

**Tech Stack:** Django 5.1 + DRF + django-tenants (public/tenant schemas), Next.js 14 App Router (frontend-customer), pytest, vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-curated-photos-design.md`

## Global Constraints

- All backend commands run inside the django container: `docker compose exec -T django <cmd>`. Tests: `make test-app APP=<app>` or `docker compose exec -T django pytest <path> -v`.
- `TenantJWTAuthentication` is the DRF default — the new endpoints are coach-auth (`IsCoachOrOwner`), NOT public; do not add `@authentication_classes([])` to them.
- `CuratedPhoto` is a SHARED_APPS model: its table exists only in the public schema, but endpoints are called from tenant hosts — every read hops via `schema_context("public")` (same pattern as `apps/core/curated_logos/views.py`).
- Never sign an `image_key` outside the `platform/` prefix (guard copied from curated logos).
- Curated storage objects are never deleted; rows are disabled (`enabled=False`) instead.
- After any serializer change: `cd frontend-customer && npm run gen:api` and review the `src/types/api-generated.ts` diff.
- Pre-commit must pass with zero issues. `make lint` before finishing.
- `photo_meta.json` IS committed to git (unlike `logo_meta.json`, which is untracked single-copy and was destructively wiped once — we do not repeat that design).
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: CuratedPhoto model + migration + superadmin panel

**Files:**
- Modify: `backend/apps/core/models.py` (append after `CuratedLogo`, ~line 627)
- Modify: `backend/apps/core/admin_panels.py` (import + register after `CuratedLogoAdmin`, ~line 373)
- Create: `backend/apps/core/migrations/0029_curatedphoto.py` (generated — accept whatever number `makemigrations` picks)
- Test: `backend/apps/core/tests/test_curated_photos.py` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `apps.core.models.CuratedPhoto` with fields `title, prompt, tags, alt_text, kind, image_key, width, height, position, enabled, created_at, updated_at`; class constants `CuratedPhoto.KINDS` (list of 6 kind strings) and `CuratedPhoto.AI_KINDS == ("hero", "stock", "spot")`. Auto-append `position` on create (same as CuratedLogo).

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_curated_photos.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v`
Expected: FAIL with `ImportError: cannot import name 'CuratedPhoto'`

- [ ] **Step 3: Add the model**

In `backend/apps/core/models.py`, directly after the `CuratedLogo` class (after its `__str__`, ~line 627):

```python
class CuratedPhoto(models.Model):
    """Superadmin-curated stock/illustration library for tenant content
    (blogs first). Public schema; objects live in storage under
    platform/curated-photos/ and are NEVER deleted — rows are disabled
    instead, so tenant media.Photo rows materialized from them never break.
    Spec: docs/superpowers/specs/2026-07-19-curated-photos-design.md."""

    KINDS = ["hero", "stock", "spot", "texture", "divider", "icon"]
    AI_KINDS = ("hero", "stock", "spot")  # the only kinds offered to the blog AI writer

    title = models.CharField(max_length=120)
    prompt = models.TextField(blank=True, default="")
    tags = models.CharField(max_length=500, blank=True, default="")  # comma-separated
    alt_text = models.CharField(max_length=300, blank=True, default="")
    kind = models.CharField(max_length=10, choices=[(k, k) for k in KINDS], default="stock")
    image_key = models.CharField(max_length=300)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    position = models.IntegerField(default=0, help_text="Sort order; 0 = append at the end on create.")
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        ordering = ["position", "id"]

    def save(self, *args, **kwargs):
        if self._state.adding and not self.position:
            last = CuratedPhoto.objects.aggregate(m=models.Max("position"))["m"] or 0
            self.position = last + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
```

- [ ] **Step 4: Generate the migration**

Run: `docker compose exec -T django python manage.py makemigrations core`
Expected: one new migration `0029_curatedphoto.py` (or next free number) creating `CuratedPhoto`.

Run: `make migrate-shared`
Expected: migration applies cleanly.

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v`
Expected: 3 PASS

- [ ] **Step 6: Register the superadmin panel**

In `backend/apps/core/admin_panels.py`:
1. Add `CuratedPhoto` to the existing `from .models import (...)` block (~line 14, alphabetical next to `CuratedLogo`).
2. Directly after the `CuratedLogoAdmin` class (~line 373), add:

```python
@platform_site.register(CuratedPhoto)
class CuratedPhotoAdmin(ModelAdmin):
    key = "curated-photos"
    icon = "image"
    description = "Curated stock/illustration library coaches can drop into their blog posts."
    list_display = ("image_key", "title", "kind", "tags", "enabled", "position", "updated_at")
    search_fields = ("title", "tags", "prompt")
    list_filters = ("enabled", "kind")
    ordering = ("position", "id")
    fields = ("title", "prompt", "tags", "alt_text", "kind", "position", "enabled", "image_key")
    image_fields = ("image_key",)
    image_upload_prefix = "curated-photos"
    list_mode = "gallery"
    gallery_image_field = "image_key"
```

Note: `platform_upload` (`apps/core/platform/uploads.py`) only white-strips the `curated-logos` prefix; `curated-photos` uploads store as-is — correct for photographic kinds. Spot illustrations arriving via the seed command are cleaned there (Task 4).

- [ ] **Step 7: Run the core + adminkit suites**

Run: `make test-app APP=core && make test-app APP=adminkit`
Expected: PASS (no regressions; adminkit autodiscovers the new panel).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/apps/core/admin_panels.py backend/apps/core/tests/test_curated_photos.py
git commit -m "feat(curated-photos): CuratedPhoto model + superadmin panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Materialize helper (copy-on-use)

**Files:**
- Create: `backend/apps/core/curated_photos/__init__.py` (empty)
- Create: `backend/apps/core/curated_photos/materialize.py`
- Test: `backend/apps/core/tests/test_curated_photos.py` (extend)

**Interfaces:**
- Consumes: `CuratedPhoto` (Task 1), `apps.media.models.Photo` (existing: `s3_key, title, alt_text, content_type, width, height`).
- Produces: `apps.core.curated_photos.materialize.materialize_curated_photo(row: CuratedPhoto) -> Photo` — creates or reuses (dedup by `s3_key`) a Photo **in the currently active tenant schema**. Callers must already be inside the tenant context.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_curated_photos.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v -k materialize`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.core.curated_photos.materialize'`

- [ ] **Step 3: Implement**

Create `backend/apps/core/curated_photos/__init__.py` (empty file) and `backend/apps/core/curated_photos/materialize.py`:

```python
"""Copy-on-use: turn a public-schema CuratedPhoto into a tenant media.Photo.

The Photo row points at the SHARED platform object (no storage duplication).
Deleting the tenant Photo later never touches storage (media has no S3 delete
hook), and catalog rows are only ever disabled — so the reference cannot break.
"""


def materialize_curated_photo(row):
    """Create (or reuse, dedup by s3_key) a Photo in the CURRENT tenant
    schema. Callers must already be inside the tenant context. Function-local
    import: core is SHARED_APPS, media is TENANT_APPS."""
    from apps.media.models import Photo

    existing = Photo.objects.filter(s3_key=row.image_key).first()
    if existing is not None:
        return existing
    return Photo.objects.create(
        s3_key=row.image_key,
        title=row.title,
        alt_text=row.alt_text,
        content_type="image/png",
        width=row.width,
        height=row.height,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/curated_photos/ backend/apps/core/tests/test_curated_photos.py
git commit -m "feat(curated-photos): copy-on-use materialize helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Coach search + use endpoints

**Files:**
- Create: `backend/apps/core/curated_photos/views.py`
- Create: `backend/apps/core/curated_photos/urls.py`
- Modify: `backend/config/urls.py` (after the `api/v1/logos/` line, ~line 61)
- Test: `backend/apps/core/tests/test_curated_photos.py` (extend)

**Interfaces:**
- Consumes: `CuratedPhoto`, `materialize_curated_photo` (Tasks 1-2), `apps.core.permissions.IsCoachOrOwner`, `apps.core.storage.generate_presigned_download_url`, `apps.media.serializers.PhotoSerializer`.
- Produces:
  - `GET /api/v1/curated-photos/?kind=<kind>&q=<query>` → `[{id, title, kind, tags, width, height, image_url}]` (enabled rows only, max 60, `platform/`-prefix guard).
  - `POST /api/v1/curated-photos/<int:pk>/use/` → 201 with a standard `PhotoSerializer` payload (idempotent per tenant); 404 for missing/disabled rows.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_curated_photos.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v -k "search or use_"`
Expected: FAIL with 404s (routes not mounted yet)

- [ ] **Step 3: Implement views + urls + mount**

Create `backend/apps/core/curated_photos/views.py`:

```python
"""Coach-facing curated photo library: search + materialize ("use").

CuratedPhoto is public-schema; these endpoints are called from tenant hosts,
so reads hop to the public schema explicitly (same pattern as curated logos).
Coach-auth (IsCoachOrOwner) — unlike the curated LOGO catalog this is not an
anonymous endpoint; only the coach's editor and the AI writer consume it."""

from django.db.models import Q
from django_tenants.utils import schema_context
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.models import CuratedPhoto
from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url

from .materialize import materialize_curated_photo

MAX_RESULTS = 60


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def curated_photo_search(request):
    kind = request.query_params.get("kind", "").strip()
    query = request.query_params.get("q", "").strip()
    with schema_context("public"):
        qs = CuratedPhoto.objects.filter(enabled=True)
        if kind:
            qs = qs.filter(kind=kind)
        if query:
            qs = qs.filter(Q(title__icontains=query) | Q(tags__icontains=query))
        rows = list(qs.order_by("position", "id")[:MAX_RESULTS])
    out = []
    for row in rows:
        # Never sign anything outside the platform prefix (a bad key must not
        # become a presigned URL into tenant storage).
        if not row.image_key.startswith("platform/"):
            continue
        out.append(
            {
                "id": row.id,
                "title": row.title,
                "kind": row.kind,
                "tags": row.tags,
                "width": row.width,
                "height": row.height,
                "image_url": generate_presigned_download_url(row.image_key, expiry=86400),
            }
        )
    return Response(out)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def curated_photo_use(request, pk):
    with schema_context("public"):
        row = CuratedPhoto.objects.filter(pk=pk, enabled=True).first()
    if row is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    photo = materialize_curated_photo(row)
    from apps.media.serializers import PhotoSerializer

    return Response(PhotoSerializer(photo).data, status=status.HTTP_201_CREATED)
```

Create `backend/apps/core/curated_photos/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.curated_photo_search, name="curated-photo-search"),
    path("<int:pk>/use/", views.curated_photo_use, name="curated-photo-use"),
]
```

In `backend/config/urls.py`, directly after `path("api/v1/logos/", include("apps.core.curated_logos.urls")),` (~line 61):

```python
    path("api/v1/curated-photos/", include("apps.core.curated_photos.urls")),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/curated_photos/ backend/config/urls.py backend/apps/core/tests/test_curated_photos.py
git commit -m "feat(curated-photos): coach search + materialize endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: seed_curated_photos command + catalog plumbing

**Files:**
- Create: `backend/apps/core/management/commands/seed_curated_photos.py`
- Modify: `backend/config/settings/base.py` (next to `CURATED_LOGO_SYNC_DIR`, ~line 372)
- Modify: `docker-compose.yml` (django service: env + volume, next to the logo_sync pair at ~lines 93-96)
- Create: `frontend-customer/public/curated-photos/photo_meta.json` (empty array `[]` — bootstrap; committed)
- Test: `backend/apps/core/tests/test_curated_photos.py` (extend)

**Interfaces:**
- Consumes: `CuratedPhoto`, `apps.core.platform.uploads._store_object`, `apps.core.curated_logos.clean.clean_curated_png` (existing, spot kind only).
- Produces: `python manage.py seed_curated_photos [--dir DIR]` — idempotent upsert by `image_key` from `photo_meta.json` entries `{title, filename, prompt?, tags?, kind?, alt_text?}`; derives `width`/`height` via PIL; settings key `CURATED_PHOTO_SYNC_DIR`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_curated_photos.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v -k seed`
Expected: FAIL with `CommandError: Unknown command: 'seed_curated_photos'`

- [ ] **Step 3: Implement the command + settings + compose + catalog dir**

Create `backend/apps/core/management/commands/seed_curated_photos.py`:

```python
"""Idempotent seeding of the curated photo catalog (photo_meta.json + images)
into CuratedPhoto rows + platform object storage. Mirrors seed_curated_logos —
but unlike logo_meta.json, photo_meta.json IS committed to git.

Dev: run against the bind-mounted repo catalog (CURATED_PHOTO_SYNC_DIR). Prod
(no mount): pass an explicit --dir via a one-off bind mount, e.g.
  docker compose -f docker-compose.prod.yml run --rm \\
    -v $(pwd)/frontend-customer/public/curated-photos:/seed django \\
    python manage.py seed_curated_photos --dir /seed
"""

import io
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context

from apps.core.curated_logos.clean import clean_curated_png
from apps.core.models import CuratedPhoto
from apps.core.platform.uploads import _store_object


class Command(BaseCommand):
    help = "Seed CuratedPhoto rows from a static catalog directory (photo_meta.json + images)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default=None, help="Catalog directory (default: CURATED_PHOTO_SYNC_DIR)")

    def handle(self, *args, **options):
        from PIL import Image

        directory = options["dir"] or settings.CURATED_PHOTO_SYNC_DIR
        if not directory:
            raise CommandError("Pass --dir or set CURATED_PHOTO_SYNC_DIR.")
        meta_path = Path(directory) / "photo_meta.json"
        if not meta_path.exists():
            raise CommandError(f"{meta_path} not found.")
        entries = json.loads(meta_path.read_text())
        with schema_context("public"):
            for index, entry in enumerate(entries):
                filename = entry["filename"]
                path = Path(directory) / filename
                if not path.exists():
                    self.stderr.write(f"skip {filename}: file missing")
                    continue
                kind = entry.get("kind", "stock")
                if kind not in CuratedPhoto.KINDS:
                    self.stderr.write(f"skip {filename}: unknown kind {kind!r}")
                    continue
                body = path.read_bytes()
                if kind == "spot":
                    # Spot illustrations follow the logo pipeline: strip the
                    # white canvas so they blend with tenant blog themes.
                    body = clean_curated_png(body)
                with Image.open(io.BytesIO(body)) as img:
                    width, height = img.size
                key = f"platform/curated-photos/{filename}"
                _store_object(key, io.BytesIO(body), "image/png")
                _, created = CuratedPhoto.objects.update_or_create(
                    image_key=key,
                    defaults={
                        "title": entry["title"],
                        "prompt": entry.get("prompt", ""),
                        "tags": entry.get("tags", ""),
                        "alt_text": entry.get("alt_text", ""),
                        "kind": kind,
                        "width": width,
                        "height": height,
                        "position": index + 1,
                        "enabled": True,
                    },
                )
                self.stdout.write(f"{'created' if created else 'updated'} {key}")
```

In `backend/config/settings/base.py`, directly after the `CURATED_LOGO_SYNC_DIR` line (~line 372):

```python
# Same idea for the curated PHOTO catalog (photo_meta.json + images) —
# seed_curated_photos reads this directory when --dir is not passed.
CURATED_PHOTO_SYNC_DIR = os.environ.get("CURATED_PHOTO_SYNC_DIR", "")
```

In `docker-compose.yml`, in the django service next to the existing logo pair (env ~line 93, volume ~line 96):

```yaml
      CURATED_PHOTO_SYNC_DIR: /app/photo_sync
```
```yaml
      - ./frontend-customer/public/curated-photos:/app/photo_sync
```

Create `frontend-customer/public/curated-photos/photo_meta.json` containing exactly:

```json
[]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/core/tests/test_curated_photos.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/management/commands/seed_curated_photos.py backend/config/settings/base.py docker-compose.yml frontend-customer/public/curated-photos/photo_meta.json backend/apps/core/tests/test_curated_photos.py
git commit -m "feat(curated-photos): seed command + catalog plumbing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Blog AI curated candidates + id resolution

**Files:**
- Create: `backend/apps/blog/curated.py`
- Test: `backend/apps/blog/tests/test_curated.py` (new)

**Interfaces:**
- Consumes: `CuratedPhoto` (incl. `AI_KINDS`), `materialize_curated_photo`.
- Produces (all in `apps.blog.curated`):
  - `CURATED_PREFIX = "curated:"`, `MAX_CURATED_CANDIDATES = 8`
  - `curated_candidates(topic: str, limit: int = 8) -> list[CuratedCandidate]` — objects duck-typing what `ai.available_photos_block` needs: `.id` (string `"curated:<pk>"`), `.title`, `.alt_text`. Tag/title token-overlap scoring; falls back to up to 3 `hero` rows when nothing matches (language-mismatch safety net).
  - `resolve_curated_photo_ids(fields: dict) -> None` — mutates a `DraftResult.fields` dict in place: every chosen `curated:<pk>` id is materialized to a tenant Photo and replaced with the Photo's UUID string; unknown/disabled ids fail open (`""` cover / dropped placement). Must run inside the tenant context.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/blog/tests/test_curated.py`:

```python
"""Curated-candidate selection + id resolution for the blog AI writer.
No LLM calls anywhere here — selection is plain token overlap."""

import pytest
from django_tenants.utils import schema_context

from apps.blog import curated
from apps.core.models import CuratedPhoto

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def catalog(tenant_ctx):
    with schema_context("public"):
        rows = {
            "run": CuratedPhoto.objects.create(
                title="Sunrise run", tags="fitness, running, morning", kind="hero",
                alt_text="runner at sunrise", image_key="platform/curated-photos/run.png",
            ),
            "meal": CuratedPhoto.objects.create(
                title="Meal prep", tags="cooking, nutrition", kind="stock",
                image_key="platform/curated-photos/meal.png",
            ),
            "texture": CuratedPhoto.objects.create(
                title="Fitness texture", tags="fitness", kind="texture",
                image_key="platform/curated-photos/tex.png",
            ),
            "disabled": CuratedPhoto.objects.create(
                title="Old fitness", tags="fitness", kind="hero", enabled=False,
                image_key="platform/curated-photos/old.png",
            ),
        }
    return rows


def test_candidates_match_topic_tokens_and_exclude_non_ai_kinds(catalog):
    cands = curated.curated_candidates("5 fitness running mistakes")
    ids = [c.id for c in cands]
    assert f"curated:{catalog['run'].pk}" in ids
    assert f"curated:{catalog['texture'].pk}" not in ids  # texture never offered to AI
    assert f"curated:{catalog['disabled'].pk}" not in ids
    assert all(c.id.startswith(curated.CURATED_PREFIX) for c in cands)


def test_candidates_fall_back_to_heroes_when_nothing_matches(catalog):
    cands = curated.curated_candidates("tamamen türkçe bir başlık")
    assert cands  # language mismatch still yields generic hero covers
    assert all(c.id == f"curated:{catalog['run'].pk}" for c in cands)


def test_candidates_respect_limit(catalog):
    assert curated.curated_candidates("fitness", limit=1)
    assert len(curated.curated_candidates("fitness", limit=1)) == 1
    assert curated.curated_candidates("fitness", limit=0) == []


def test_resolve_materializes_and_replaces_ids(catalog):
    from apps.media.models import Photo

    fields = {
        "cover_photo_id": f"curated:{catalog['run'].pk}",
        "image_placements": [
            {"heading": "Fuel", "photo_id": f"curated:{catalog['meal'].pk}"},
            {"heading": "Bogus", "photo_id": "curated:999999"},
        ],
    }
    curated.resolve_curated_photo_ids(fields)
    photo = Photo.objects.get(s3_key="platform/curated-photos/run.png")
    assert fields["cover_photo_id"] == str(photo.id)
    assert len(fields["image_placements"]) == 1
    assert fields["image_placements"][0]["heading"] == "Fuel"
    meal = Photo.objects.get(s3_key="platform/curated-photos/meal.png")
    assert fields["image_placements"][0]["photo_id"] == str(meal.id)


def test_resolve_leaves_tenant_photo_ids_alone(catalog):
    fields = {"cover_photo_id": "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a", "image_placements": []}
    curated.resolve_curated_photo_ids(fields)
    assert fields["cover_photo_id"] == "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/blog/tests/test_curated.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.blog.curated'`

- [ ] **Step 3: Implement**

Create `backend/apps/blog/curated.py`:

```python
"""Curated-photo candidates for the blog AI writer.

Selection is deliberately non-LLM: lowercase token overlap between the topic
and each catalog row's tags/title, scored in python over the (small) enabled
catalog. Candidate ids are namespaced "curated:<pk>" so they can never collide
with tenant Photo UUIDs; resolve_curated_photo_ids() swaps chosen ones for
real materialized Photo UUIDs after generation.
Spec: docs/superpowers/specs/2026-07-19-curated-photos-design.md."""

import re

from django_tenants.utils import schema_context

from apps.core.curated_photos.materialize import materialize_curated_photo
from apps.core.models import CuratedPhoto

CURATED_PREFIX = "curated:"
MAX_CURATED_CANDIDATES = 8
_FALLBACK_HEROES = 3


class CuratedCandidate:
    """Duck-types the .id/.title/.alt_text trio available_photos_block reads."""

    def __init__(self, row):
        self.id = f"{CURATED_PREFIX}{row.pk}"
        self.title = row.title
        self.alt_text = row.alt_text


def _tokens(text):
    return {w for w in re.split(r"[^\w]+", (text or "").lower()) if len(w) >= 3}


def curated_candidates(topic, limit=MAX_CURATED_CANDIDATES):
    if limit <= 0:
        return []
    topic_tokens = _tokens(topic)
    with schema_context("public"):
        rows = list(
            CuratedPhoto.objects.filter(enabled=True, kind__in=CuratedPhoto.AI_KINDS).order_by("position", "id")
        )
    scored = []
    for row in rows:
        row_tokens = _tokens(row.tags.replace(",", " ")) | _tokens(row.title)
        score = len(topic_tokens & row_tokens)
        if score:
            scored.append((score, row))
    scored.sort(key=lambda pair: (-pair[0], pair[1].position, pair[1].pk))
    picked = [row for _, row in scored[:limit]]
    if not picked:
        # Language mismatch or thin tagging: still offer a few generic covers
        # so photo-less tenants get a cover rather than nothing.
        picked = [row for row in rows if row.kind == "hero"][: min(limit, _FALLBACK_HEROES)]
    return [CuratedCandidate(row) for row in picked]


def _materialize_id(curated_id):
    """"curated:<pk>" -> materialized tenant Photo UUID string, or ""."""
    pk = curated_id[len(CURATED_PREFIX) :]
    row = None
    if pk.isdigit():
        with schema_context("public"):
            row = CuratedPhoto.objects.filter(pk=pk, enabled=True).first()
    if row is None:
        return ""
    return str(materialize_curated_photo(row).id)


def resolve_curated_photo_ids(fields):
    """Mutate a DraftResult.fields dict in place: materialize chosen curated
    ids into tenant Photos. Unknown ids fail open — "" cover, dropped
    placement — mirroring generate_post's never-invent-an-id contract.
    Must run inside the tenant context (it creates media.Photo rows)."""
    cover = fields.get("cover_photo_id", "")
    if cover.startswith(CURATED_PREFIX):
        fields["cover_photo_id"] = _materialize_id(cover)
    placements = []
    for placement in fields.get("image_placements", []):
        photo_id = placement.get("photo_id", "")
        if photo_id.startswith(CURATED_PREFIX):
            photo_id = _materialize_id(photo_id)
            if not photo_id:
                continue
        placements.append({**placement, "photo_id": photo_id})
    fields["image_placements"] = placements
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/blog/tests/test_curated.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/curated.py backend/apps/blog/tests/test_curated.py
git commit -m "feat(curated-photos): AI candidate selection + id resolution

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire candidates into blog_generate + autopilot

**Files:**
- Modify: `backend/apps/blog/views.py` (`blog_generate`, ~lines 119-146)
- Modify: `backend/apps/blog/tasks.py` (`_generate_for_current_tenant`, the `generate_post` call ~line 106 and the `BlogPost.objects.create` block ~lines 118-126)
- Test: `backend/apps/blog/tests/test_admin_api.py`, `backend/apps/blog/tests/test_autopilot.py` (extend)

**Interfaces:**
- Consumes: `apps.blog.curated` (Task 5), existing `ai.generate_post(brief, topic, instructions="", photos=())` — its `valid_ids = {str(p.id) for p in photos}` check accepts the namespaced candidate ids without any change to `ai.py`.
- Produces: generation paths (coach + autopilot) that top up tenant photos with curated candidates and persist materialized covers/placements. No signature changes.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/blog/tests/test_admin_api.py`:

```python
def test_generate_materializes_curated_cover(coach_client, paid_tenant, settings):
    from django_tenants.utils import schema_context as _sc

    from apps.core.models import CuratedPhoto
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    with _sc("public"):
        row = CuratedPhoto.objects.create(
            title="Sunrise run", tags="habits", kind="hero",
            alt_text="runner", image_key="platform/curated-photos/run.png",
        )
    with mock.patch.object(ai, "generate_post", return_value=_draft_result(cover_photo_id=f"curated:{row.pk}")) as gen:
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert res.status_code == 200 and res.data["source"] == "ai"
    photo = Photo.objects.get(s3_key="platform/curated-photos/run.png")
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.cover_photo_id == photo.id
    # curated candidates were offered alongside tenant photos
    offered_ids = [str(p.id) for p in gen.call_args.kwargs["photos"]]
    assert f"curated:{row.pk}" in offered_ids
    with _sc("public"):
        CuratedPhoto.objects.all().delete()
```

Append to `backend/apps/blog/tests/test_autopilot.py` (reuse that file's existing fixtures/mocking conventions — it already has `paid_tenant` and mocks `ai.generate_post`; mirror the nearest existing generation test):

```python
def test_autopilot_offers_and_materializes_curated_photos(paid_tenant, settings):
    from decimal import Decimal as _Decimal
    from unittest import mock as _mock

    from django_tenants.utils import schema_context as _sc

    from apps.blog import ai as blog_ai
    from apps.blog import tasks
    from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea
    from apps.core.models import CuratedPhoto
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    BlogAutopilot.load()
    BlogTopicIdea.objects.create(title="Morning habits", angle="beginner")
    with _sc("public"):
        row = CuratedPhoto.objects.create(
            title="Morning light", tags="morning, habits", kind="hero",
            image_key="platform/curated-photos/morning.png",
        )
    draft = blog_ai.DraftResult(
        {
            "title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m",
            "tags": ["t"], "ai_model": "x",
            "cover_photo_id": f"curated:{row.pk}", "image_placements": [],
        },
        _Decimal("0.03"),
    )
    with _mock.patch.object(blog_ai, "generate_post", return_value=draft):
        tasks._generate_for_current_tenant(paid_tenant)
    post = BlogPost.objects.latest("created_at")
    photo = Photo.objects.get(s3_key="platform/curated-photos/morning.png")
    assert post.cover_photo_id == photo.id
    with _sc("public"):
        CuratedPhoto.objects.all().delete()
```

Adjust imports/fixture names to match what `test_autopilot.py` actually defines (read the file first; its `paid_tenant` is at line ~25). If the existing tests call a different entry point than `tasks._generate_for_current_tenant(tenant)`, mirror them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/blog/tests/test_admin_api.py::test_generate_materializes_curated_cover apps/blog/tests/test_autopilot.py::test_autopilot_offers_and_materializes_curated_photos -v`
Expected: FAIL (cover stays null / no Photo materialized)

- [ ] **Step 3: Wire the coach path**

In `backend/apps/blog/views.py`:

1. Add to imports: `from . import curated` (next to `from . import ai`).
2. Replace line 119 `photos = Photo.objects.order_by("-created_at")[: ai.MAX_AVAILABLE_PHOTOS]` with:

```python
    photos = list(Photo.objects.order_by("-created_at")[: ai.MAX_AVAILABLE_PHOTOS])
    photos += curated.curated_candidates(topic, limit=ai.MAX_AVAILABLE_PHOTOS - len(photos))
```

3. After `fields = dict(result.fields)` (~line 134), insert:

```python
    curated.resolve_curated_photo_ids(fields)
```

(The existing `cover_photo_id = fields.pop(...)` / `Photo.objects.filter(pk=...)` lines then work unchanged, because resolution already swapped curated ids for real tenant Photo UUIDs.)

- [ ] **Step 4: Wire the autopilot path**

In `backend/apps/blog/tasks.py`, inside `_generate_for_current_tenant`:

1. Add `from . import curated` to the function-local import block at the top of the function (next to `from . import ai`), and add `from apps.media.models import Photo` there too.
2. Replace the call `result = ai.generate_post(_brief_for_current_tenant(), topic.title, topic.angle)` with:

```python
    photos = list(Photo.objects.order_by("-created_at")[: ai.MAX_AVAILABLE_PHOTOS])
    photos += curated.curated_candidates(topic.title, limit=ai.MAX_AVAILABLE_PHOTOS - len(photos))
    try:
        result = ai.generate_post(_brief_for_current_tenant(), topic.title, topic.angle, photos=photos)
```

(keeping the existing `except` clauses unchanged).
3. Replace the create block

```python
    post = BlogPost.objects.create(
        slug=unique_slug(result.fields["title"]),
        status="published" if publish else "draft",
        published_at=timezone.now() if publish else None,
        source="autopilot",
        **result.fields,
    )
```

with:

```python
    fields = dict(result.fields)
    curated.resolve_curated_photo_ids(fields)
    cover_photo_id = fields.pop("cover_photo_id", "")
    cover_photo = Photo.objects.filter(pk=cover_photo_id).first() if cover_photo_id else None
    post = BlogPost.objects.create(
        slug=unique_slug(fields["title"]),
        status="published" if publish else "draft",
        published_at=timezone.now() if publish else None,
        source="autopilot",
        cover_photo=cover_photo,
        **fields,
    )
```

- [ ] **Step 5: Run the blog suite**

Run: `make test-app APP=blog`
Expected: all PASS (new tests + no regressions)

- [ ] **Step 6: Commit**

```bash
git add backend/apps/blog/views.py backend/apps/blog/tasks.py backend/apps/blog/tests/
git commit -m "feat(curated-photos): offer curated candidates in blog generate + autopilot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Surface covers + placements in serializers (admin write, public read)

**Files:**
- Create: `backend/apps/blog/placements.py`
- Modify: `backend/apps/blog/serializers.py` (all three BlogPost serializers)
- Modify: `backend/apps/blog/views.py` (`PublicPostList.get_queryset` / `PublicPostDetail.get_queryset`: add `.select_related("cover_photo")`)
- Test: `backend/apps/blog/tests/test_placements.py` (new), `backend/apps/blog/tests/test_public_api.py` + `test_admin_api.py` (extend)

**Interfaces:**
- Consumes: `apps.core.storage.generate_presigned_download_url`, `apps.media.models.Photo`.
- Produces:
  - `apps.blog.placements.resolve_placements(post) -> list[{heading, photo_id, url, alt}]` (drops placements whose Photo is gone; tolerates malformed photo_id strings).
  - `apps.blog.placements.inject_placement_images(body_html, resolved) -> str` (inserts `<figure class="blog-inline-image"><img .../></figure>` after the first `<h2>` whose escaped text matches; unmatched headings are skipped).
  - `BlogPostAdminSerializer`: writable `cover_photo` (Photo pk, nullable) + `image_placements` (validated list, max 6, each `{heading, photo_id}` with an existing Photo); read-only `cover_photo_url`, `image_placements_resolved`.
  - `BlogPostListSerializer`: adds read-only `cover_photo_url`.
  - `BlogPostDetailSerializer`: adds read-only `cover_photo_url`; `body_html` becomes a SerializerMethodField returning the placement-injected HTML.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/blog/tests/test_placements.py`:

```python
"""Serve-time placement rendering: photo-id resolution + <figure> injection.
body_html never stores image URLs (presigned URLs expire) — images attach at
serialization time only."""

import pytest

from apps.blog.placements import inject_placement_images, resolve_placements

pytestmark = pytest.mark.django_db(transaction=True)


def test_inject_after_matching_h2():
    html = "<p>intro</p><h2>Stretch first</h2><p>body</p>"
    out = inject_placement_images(html, [{"heading": "Stretch first", "url": "https://x/img.png", "alt": "a"}])
    assert '<h2>Stretch first</h2><figure class="blog-inline-image">' in out
    assert '<img src="https://x/img.png" alt="a" loading="lazy" />' in out
    assert out.endswith("<p>body</p>")


def test_inject_skips_unmatched_heading_and_escapes():
    html = "<h2>A &amp; B</h2><p>x</p>"
    out = inject_placement_images(html, [{"heading": "A & B", "url": "u", "alt": ""}])
    assert "<figure" in out  # heading matched via HTML-escaped comparison
    out2 = inject_placement_images(html, [{"heading": "Nope", "url": "u", "alt": ""}])
    assert "<figure" not in out2


def test_resolve_drops_missing_and_malformed_photos(tenant_ctx):
    from apps.blog.models import BlogPost
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="platform/curated-photos/x.png", title="X", alt_text="alt x")
    post = BlogPost.objects.create(
        title="t", slug="t",
        image_placements=[
            {"heading": "Good", "photo_id": str(photo.id)},
            {"heading": "Gone", "photo_id": "0b6beec4-8e42-4f47-a94c-9d1e9a1e2f3a"},
            {"heading": "Bad", "photo_id": "not-a-uuid"},
        ],
    )
    resolved = resolve_placements(post)
    assert len(resolved) == 1
    assert resolved[0]["heading"] == "Good"
    assert resolved[0]["alt"] == "alt x"
    assert resolved[0]["photo_id"] == str(photo.id)
    assert resolved[0]["url"]
```

Append to `backend/apps/blog/tests/test_public_api.py` (mirror its existing client/fixture conventions — read the file first):

```python
def test_public_detail_has_cover_url_and_injected_images(tenant_ctx):
    from rest_framework.test import APIClient

    from apps.blog.models import BlogPost
    from apps.media.models import Photo

    cover = Photo.objects.create(s3_key="platform/curated-photos/c.png", title="Cover")
    inline = Photo.objects.create(s3_key="platform/curated-photos/i.png", title="Inline", alt_text="inline alt")
    BlogPost.objects.create(
        title="Post", slug="post", status="published",
        body_html="<p>a</p><h2>Sec</h2><p>b</p>",
        cover_photo=cover,
        image_placements=[{"heading": "Sec", "photo_id": str(inline.id)}],
    )
    client = APIClient(HTTP_HOST="shared-test.localhost")
    res = client.get("/api/v1/blog/posts/post/")
    assert res.status_code == 200
    assert res.data["cover_photo_url"]
    assert '<figure class="blog-inline-image">' in res.data["body_html"]

    listing = client.get("/api/v1/blog/posts/")
    assert listing.data["results"][0]["cover_photo_url"]
```

Append to `backend/apps/blog/tests/test_admin_api.py`:

```python
def test_admin_can_set_and_clear_cover(coach_client, paid_tenant):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="platform/curated-photos/c.png", title="Cover")
    created = coach_client.post("/api/v1/admin/blog/posts/", {"title": "P", "body_html": ""}, format="json")
    post_id = created.data["id"]
    res = coach_client.patch(f"/api/v1/admin/blog/posts/{post_id}/", {"cover_photo": str(photo.id)}, format="json")
    assert res.status_code == 200
    assert res.data["cover_photo"] == photo.id
    assert res.data["cover_photo_url"]
    res = coach_client.patch(f"/api/v1/admin/blog/posts/{post_id}/", {"cover_photo": None}, format="json")
    assert res.data["cover_photo"] is None and res.data["cover_photo_url"] is None


def test_admin_placements_validated(coach_client, paid_tenant):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="platform/curated-photos/i.png", title="I")
    created = coach_client.post(
        "/api/v1/admin/blog/posts/", {"title": "P2", "body_html": "<h2>Sec</h2>"}, format="json"
    )
    post_id = created.data["id"]
    good = coach_client.patch(
        f"/api/v1/admin/blog/posts/{post_id}/",
        {"image_placements": [{"heading": "Sec", "photo_id": str(photo.id)}]},
        format="json",
    )
    assert good.status_code == 200
    assert good.data["image_placements_resolved"][0]["url"]
    bad = coach_client.patch(
        f"/api/v1/admin/blog/posts/{post_id}/",
        {"image_placements": [{"heading": "Sec", "photo_id": "not-a-photo"}]},
        format="json",
    )
    assert bad.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T django pytest apps/blog/tests/test_placements.py apps/blog/tests/test_public_api.py apps/blog/tests/test_admin_api.py -v -k "placement or cover"`
Expected: FAIL (module missing, fields missing)

- [ ] **Step 3: Implement placements module**

Create `backend/apps/blog/placements.py`:

```python
"""Serve-time rendering of BlogPost.image_placements.

body_html itself NEVER stores image URLs — presigned URLs expire — so inline
images are resolved to fresh signed URLs and injected into the HTML at
serialization time only."""

import html as html_lib
import uuid

from apps.core.storage import generate_presigned_download_url


def resolve_placements(post):
    """[{heading, photo_id, url, alt}] for placements whose Photo still
    exists. Malformed ids and deleted photos drop out (fail open)."""
    from apps.media.models import Photo

    placements = post.image_placements or []
    valid_ids = []
    for placement in placements:
        try:
            valid_ids.append(uuid.UUID(str(placement.get("photo_id", ""))))
        except ValueError:
            continue
    photos = {str(photo.id): photo for photo in Photo.objects.filter(id__in=valid_ids)}
    out = []
    for placement in placements:
        photo = photos.get(str(placement.get("photo_id", "")))
        if photo is None or not photo.s3_key:
            continue
        out.append(
            {
                "heading": placement.get("heading", ""),
                "photo_id": str(photo.id),
                "url": generate_presigned_download_url(photo.s3_key),
                "alt": photo.alt_text or photo.title,
            }
        )
    return out


def inject_placement_images(body_html, resolved):
    """Insert a <figure><img/></figure> after the first <h2> whose text equals
    the placement heading (HTML-escaped comparison — markdown rendering
    escaped the stored headings the same way). Unmatched headings skip."""
    result = body_html or ""
    for item in resolved:
        heading = item.get("heading", "")
        if not heading:
            continue
        marker = f"<h2>{html_lib.escape(heading)}</h2>"
        idx = result.find(marker)
        if idx < 0:
            continue
        insert_at = idx + len(marker)
        figure = (
            f'<figure class="blog-inline-image"><img src="{html_lib.escape(item["url"])}" '
            f'alt="{html_lib.escape(item["alt"])}" loading="lazy" /></figure>'
        )
        result = result[:insert_at] + figure + result[insert_at:]
    return result
```

- [ ] **Step 4: Extend the serializers**

In `backend/apps/blog/serializers.py`:

1. Add imports:

```python
from apps.core.storage import generate_presigned_download_url
from apps.media.models import Photo

from .placements import inject_placement_images, resolve_placements
```

2. Add a shared helper at module level (after imports):

```python
def _cover_url(post):
    cover = post.cover_photo
    if cover is None or not cover.s3_key:
        return None
    return generate_presigned_download_url(cover.s3_key)
```

3. `BlogPostListSerializer` — add `cover_photo_url = serializers.SerializerMethodField()`, add `"cover_photo_url"` to `fields`, and:

```python
    def get_cover_photo_url(self, obj):
        return _cover_url(obj)
```

4. `BlogPostDetailSerializer` — add:

```python
    body_html = serializers.SerializerMethodField()
    cover_photo_url = serializers.SerializerMethodField()

    def get_body_html(self, obj):
        return inject_placement_images(obj.body_html, resolve_placements(obj))

    def get_cover_photo_url(self, obj):
        return _cover_url(obj)
```

and add `"cover_photo_url"` to its `fields`.

5. `BlogPostAdminSerializer` — add fields:

```python
    cover_photo = serializers.PrimaryKeyRelatedField(queryset=Photo.objects.all(), allow_null=True, required=False)
    cover_photo_url = serializers.SerializerMethodField()
    image_placements = serializers.JSONField(required=False)
    image_placements_resolved = serializers.SerializerMethodField()

    def get_cover_photo_url(self, obj):
        return _cover_url(obj)

    def get_image_placements_resolved(self, obj):
        return resolve_placements(obj)

    def validate_image_placements(self, value):
        if not isinstance(value, list) or len(value) > 6:
            raise serializers.ValidationError("Expected a list of at most 6 placements.")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each placement must be an object.")
            photo_id = str(item.get("photo_id", ""))
            try:
                exists = Photo.objects.filter(pk=photo_id).exists()
            except (ValueError, ValidationError):
                exists = False
            if not exists:
                raise serializers.ValidationError(f"Unknown photo_id: {photo_id}")
            cleaned.append({"heading": str(item.get("heading", ""))[:200], "photo_id": photo_id})
        return cleaned
```

Add `from django.core.exceptions import ValidationError` to imports. Extend `Meta.fields` with `"cover_photo", "cover_photo_url", "image_placements", "image_placements_resolved"` and `read_only_fields` with `"cover_photo_url", "image_placements_resolved"`.

6. In `backend/apps/blog/views.py`, add `.select_related("cover_photo")` to both public `get_queryset` methods:

```python
        return BlogPost.objects.filter(status="published").select_related("cover_photo").order_by("-published_at")
```
```python
        return BlogPost.objects.filter(status="published").select_related("cover_photo")
```

- [ ] **Step 5: Run the blog suite**

Run: `make test-app APP=blog`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/blog/placements.py backend/apps/blog/serializers.py backend/apps/blog/views.py backend/apps/blog/tests/
git commit -m "feat(blog): surface covers + inline placements in serializers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend API layer + heading parser

**Files:**
- Modify: `frontend-customer/src/lib/blog-api.ts` (extend `BlogPostAdmin`)
- Create: `frontend-customer/src/lib/curated-photos-api.ts`
- Create: `frontend-customer/src/lib/html-headings.ts`
- Test: `frontend-customer/src/lib/__tests__/html-headings.test.ts` (new)
- Regenerate: `frontend-customer/src/types/api-generated.ts` (`npm run gen:api`)

**Interfaces:**
- Consumes: `clientFetch<T>(path, options?)` from `lib/api-client.ts`; backend endpoints from Tasks 3 & 7.
- Produces:
  - `BlogPostAdmin` gains `cover_photo: string | null`, `cover_photo_url: string | null`, `image_placements: {heading: string; photo_id: string}[]`, `image_placements_resolved: {heading: string; photo_id: string; url: string; alt: string}[]`.
  - `curated-photos-api.ts`: `CuratedPhoto` type `{id, title, kind, tags, width, height, image_url}`; `CuratedKind` union; `searchCuratedPhotos({kind?, q?})`; `materializeCuratedPhoto(id) -> MaterializedPhoto {id, signed_url, title, alt_text}` (NOT `use*` — a `use` prefix would trip the react-hooks lint rule).
  - `parseH2Headings(html: string): string[]`.

- [ ] **Step 1: Write the failing vitest**

Create `frontend-customer/src/lib/__tests__/html-headings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseH2Headings } from "@/lib/html-headings";

describe("parseH2Headings", () => {
  it("extracts h2 text in document order", () => {
    expect(
      parseH2Headings("<p>i</p><h2>First</h2><p>x</p><h2>Second</h2>"),
    ).toEqual(["First", "Second"]);
  });

  it("decodes entities and strips inner tags", () => {
    expect(parseH2Headings("<h2>A &amp; <em>B</em></h2>")).toEqual(["A & B"]);
  });

  it("returns empty for no headings or empty input", () => {
    expect(parseH2Headings("<p>none</p>")).toEqual([]);
    expect(parseH2Headings("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `make test-frontend`
Expected: FAIL — cannot resolve `@/lib/html-headings`

- [ ] **Step 3: Implement the three lib files**

Create `frontend-customer/src/lib/html-headings.ts`:

```ts
// Pull the coach-visible <h2> texts out of sanitized body_html so the inline
// image manager can offer heading anchors. Regex is fine here: body_html is
// server-sanitized (nh3) and h2s never nest.
export function parseH2Headings(html: string): string[] {
  if (!html) return [];
  const decode = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]*>/g, "")).trim())
    .filter(Boolean);
}
```

Create `frontend-customer/src/lib/curated-photos-api.ts`:

```ts
// Thin client for the curated photo library (backend/apps/core/curated_photos).
import { clientFetch } from "@/lib/api-client";

export type CuratedKind =
  | "hero"
  | "stock"
  | "spot"
  | "texture"
  | "divider"
  | "icon";

export interface CuratedPhoto {
  id: number;
  title: string;
  kind: CuratedKind;
  tags: string;
  width: number | null;
  height: number | null;
  image_url: string;
}

export interface MaterializedPhoto {
  id: string;
  signed_url: string | null;
  title: string;
  alt_text: string;
}

export function searchCuratedPhotos(params: {
  kind?: string;
  q?: string;
}): Promise<CuratedPhoto[]> {
  const search = new URLSearchParams();
  if (params.kind) search.set("kind", params.kind);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return clientFetch<CuratedPhoto[]>(`/api/v1/curated-photos/${qs ? `?${qs}` : ""}`);
}

// Named materialize*, not use* — ESLint treats use-prefixed functions as
// React hooks and would reject calls from event handlers.
export function materializeCuratedPhoto(id: number): Promise<MaterializedPhoto> {
  return clientFetch<MaterializedPhoto>(`/api/v1/curated-photos/${id}/use/`, {
    method: "POST",
  });
}
```

In `frontend-customer/src/lib/blog-api.ts`, extend `BlogPostAdmin`:

```ts
export interface ImagePlacement {
  heading: string;
  photo_id: string;
}

export interface ImagePlacementResolved extends ImagePlacement {
  url: string;
  alt: string;
}
```

and add to the `BlogPostAdmin` interface:

```ts
  cover_photo: string | null;
  cover_photo_url: string | null;
  image_placements: ImagePlacement[];
  image_placements_resolved: ImagePlacementResolved[];
```

- [ ] **Step 4: Run tests + regenerate API types**

Run: `make test-frontend`
Expected: PASS

Run: `cd frontend-customer && npm run gen:api`
Expected: `src/types/api-generated.ts` diff shows the new blog serializer fields and nothing surprising. Review the diff.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/ frontend-customer/src/types/api-generated.ts
git commit -m "feat(curated-photos): frontend api layer + heading parser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Image library dialog + cover picker in the editor

**Files:**
- Create: `frontend-customer/src/components/admin/blog/image-library-dialog.tsx`
- Create: `frontend-customer/src/components/admin/blog/cover-picker.tsx`
- Modify: `frontend-customer/src/app/admin/blog/[id]/page.tsx`
- Modify: `frontend-customer/messages/en/admin.json` + `frontend-customer/messages/tr/admin.json` (blog section)

**Interfaces:**
- Consumes: `searchCuratedPhotos`, `materializeCuratedPhoto` (Task 8); `clientFetch` for `/api/v1/photos/?search=` (existing media list; paginated `{results}`); `PhotoSerializer` payload has `id`, `signed_url`, `title`; existing ui components `components/ui/dialog`, `components/ui/button`, `components/ui/input` (verify import names against another admin component such as `generate-dialog.tsx` before writing).
- Produces:
  - `<ImageLibraryDialog open onOpenChange defaultKind onSelect(photo: {id: string; url: string | null; title: string})>` — two source toggles ("Library" = curated w/ kind chips + search; "My photos" = tenant media w/ search). Selecting a curated item POSTs `use` first, then calls `onSelect` with the materialized tenant photo.
  - `<CoverPicker post onPatched(fields)>` — thumbnail/empty-state + change/remove; persists via PATCH `updatePost(post.id, {cover_photo})`.

- [ ] **Step 1: Add i18n keys**

In `frontend-customer/messages/en/admin.json`, inside the `"blog"` object add:

```json
    "coverLabel": "Cover image",
    "coverChange": "Change cover",
    "coverChoose": "Choose cover",
    "coverRemove": "Remove",
    "libraryTab": "Library",
    "myPhotosTab": "My photos",
    "librarySearch": "Search images…",
    "libraryEmpty": "No images found.",
    "kindHero": "Covers",
    "kindStock": "Stock",
    "kindSpot": "Illustrations",
    "kindTexture": "Textures",
    "kindDivider": "Dividers",
    "kindIcon": "Icons"
```

In `frontend-customer/messages/tr/admin.json`, same keys:

```json
    "coverLabel": "Kapak görseli",
    "coverChange": "Kapağı değiştir",
    "coverChoose": "Kapak seç",
    "coverRemove": "Kaldır",
    "libraryTab": "Kütüphane",
    "myPhotosTab": "Fotoğraflarım",
    "librarySearch": "Görsel ara…",
    "libraryEmpty": "Görsel bulunamadı.",
    "kindHero": "Kapaklar",
    "kindStock": "Stok",
    "kindSpot": "İllüstrasyonlar",
    "kindTexture": "Dokular",
    "kindDivider": "Ayraçlar",
    "kindIcon": "Simgeler"
```

- [ ] **Step 2: Build the dialog**

Create `frontend-customer/src/components/admin/blog/image-library-dialog.tsx`:

```tsx
"use client";

// Shared picker: curated platform library ("Library") or the tenant's own
// media ("My photos"). Curated picks are materialized into a tenant Photo via
// POST /curated-photos/<id>/use/ before onSelect fires, so callers only ever
// see tenant photo ids.

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clientFetch } from "@/lib/api-client";
import {
  materializeCuratedPhoto,
  searchCuratedPhotos,
  type CuratedKind,
  type CuratedPhoto,
} from "@/lib/curated-photos-api";

export interface PickedPhoto {
  id: string;
  url: string | null;
  title: string;
}

interface TenantPhoto {
  id: string;
  signed_url: string | null;
  title: string;
}

const KINDS: { kind: CuratedKind; labelKey: string }[] = [
  { kind: "hero", labelKey: "blog.kindHero" },
  { kind: "stock", labelKey: "blog.kindStock" },
  { kind: "spot", labelKey: "blog.kindSpot" },
  { kind: "texture", labelKey: "blog.kindTexture" },
  { kind: "divider", labelKey: "blog.kindDivider" },
  { kind: "icon", labelKey: "blog.kindIcon" },
];

export function ImageLibraryDialog({
  open,
  onOpenChange,
  defaultKind = "hero",
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: CuratedKind;
  onSelect: (photo: PickedPhoto) => void;
}) {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<"library" | "mine">("library");
  const [kind, setKind] = useState<CuratedKind>(defaultKind);
  const [query, setQuery] = useState("");
  const [curatedItems, setCuratedItems] = useState<CuratedPhoto[]>([]);
  const [myPhotos, setMyPhotos] = useState<TenantPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (tab === "library") {
      searchCuratedPhotos({ kind, q: query })
        .then(setCuratedItems)
        .catch(() => setCuratedItems([]));
    } else {
      clientFetch<{ results: TenantPhoto[] }>(
        `/api/v1/photos/?search=${encodeURIComponent(query)}`,
      )
        .then((data) => setMyPhotos(data.results ?? []))
        .catch(() => setMyPhotos([]));
    }
  }, [open, tab, kind, query]);

  const pickCurated = async (item: CuratedPhoto) => {
    setBusy(true);
    try {
      const photo = await materializeCuratedPhoto(item.id);
      onSelect({ id: photo.id, url: photo.signed_url, title: photo.title });
      onOpenChange(false);
    } catch {
      toast.error(t("blog.errGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("blog.coverChoose")}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant={tab === "library" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("library")}
          >
            {t("blog.libraryTab")}
          </Button>
          <Button
            variant={tab === "mine" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("mine")}
          >
            {t("blog.myPhotosTab")}
          </Button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("blog.librarySearch")}
            className="ml-auto w-48 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        {tab === "library" && (
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map(({ kind: k, labelKey }) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  kind === k
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        )}
        <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {tab === "library" &&
            curatedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => pickCurated(item)}
                className="group overflow-hidden rounded-md border bg-muted/30 hover:ring-2 hover:ring-ring"
                title={item.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt={item.title}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
              </button>
            ))}
          {tab === "mine" &&
            myPhotos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => {
                  onSelect({ id: photo.id, url: photo.signed_url, title: photo.title });
                  onOpenChange(false);
                }}
                className="group overflow-hidden rounded-md border bg-muted/30 hover:ring-2 hover:ring-ring"
                title={photo.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.signed_url ?? ""}
                  alt={photo.title}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
              </button>
            ))}
          {((tab === "library" && curatedItems.length === 0) ||
            (tab === "mine" && myPhotos.length === 0)) && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              {t("blog.libraryEmpty")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Before writing, open `frontend-customer/src/components/admin/blog/generate-dialog.tsx` and mirror its exact `Dialog` import path/subcomponents; adjust if they differ.

- [ ] **Step 3: Build the cover picker + integrate**

Create `frontend-customer/src/components/admin/blog/cover-picker.tsx`:

```tsx
"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ImageLibraryDialog,
  type PickedPhoto,
} from "@/components/admin/blog/image-library-dialog";
import { updatePost, type BlogPostAdmin } from "@/lib/blog-api";

export function CoverPicker({
  post,
  onPatched,
}: {
  post: BlogPostAdmin;
  onPatched: (fields: Partial<BlogPostAdmin>) => void;
}) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);

  const setCover = async (photo: PickedPhoto | null) => {
    const updated = await updatePost(post.id, {
      cover_photo: photo ? photo.id : null,
    } as Partial<BlogPostAdmin>);
    onPatched(updated);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("blog.coverLabel")}
      </p>
      {post.cover_photo_url ? (
        <div className="relative overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover_photo_url}
            alt=""
            className="aspect-[3/1] w-full object-cover"
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              {t("blog.coverChange")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCover(null)}>
              {t("blog.coverRemove")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm text-muted-foreground hover:text-foreground"
        >
          <ImageIcon className="h-4 w-4" />
          {t("blog.coverChoose")}
        </button>
      )}
      <ImageLibraryDialog
        open={open}
        onOpenChange={setOpen}
        defaultKind="hero"
        onSelect={(photo) => void setCover(photo)}
      />
    </div>
  );
}
```

In `frontend-customer/src/app/admin/blog/[id]/page.tsx`:
1. Import: `import { CoverPicker } from "@/components/admin/blog/cover-picker";`
2. Render it directly above the title `<input>` (first child of the page container):

```tsx
      <CoverPicker post={post} onPatched={patch} />
```

Note `updatePost`'s payload type may need `cover_photo` added — check `updatePost` in `lib/blog-api.ts` and widen its parameter type to `Partial<BlogPostAdmin>` if it is narrower.

- [ ] **Step 4: Verify in the running app**

Run: `make dev` (if not already up). Open a tenant admin → Blog → a post.
Expected: cover section shows; "Choose cover" opens the dialog; Library tab lists seeded curated photos (seed at least one first: drop a PNG + entry into `frontend-customer/public/curated-photos/` and run `docker compose exec -T django python manage.py seed_curated_photos`); picking one sets the cover and it survives reload.

Run: `make typecheck`
Expected: PASS for frontend-customer.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/admin/blog/ "frontend-customer/src/app/admin/blog/[id]/page.tsx" frontend-customer/messages/ frontend-customer/src/lib/blog-api.ts
git commit -m "feat(curated-photos): editor cover picker + image library dialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Inline images manager in the editor

**Files:**
- Create: `frontend-customer/src/components/admin/blog/inline-images.tsx`
- Modify: `frontend-customer/src/app/admin/blog/[id]/page.tsx`
- Modify: `frontend-customer/messages/en/admin.json` + `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: `ImageLibraryDialog` (Task 9), `parseH2Headings` (Task 8), `updatePost`, `BlogPostAdmin.image_placements(_resolved)` (Tasks 7-8).
- Produces: `<InlineImages post onPatched>` — lists current placements (thumb + heading + remove), "Add image" flow = pick heading (from `parseH2Headings(post.body_html)`) → pick image (defaultKind `stock`) → PATCH `image_placements`.

- [ ] **Step 1: Add i18n keys**

`en/admin.json` blog section:

```json
    "inlineImages": "Inline images",
    "inlineAdd": "Add image",
    "inlineHeadingPrompt": "Insert under which section?",
    "inlineNoHeadings": "Add some section headings (H2) to place inline images."
```

`tr/admin.json`:

```json
    "inlineImages": "Metin içi görseller",
    "inlineAdd": "Görsel ekle",
    "inlineHeadingPrompt": "Hangi bölümün altına eklensin?",
    "inlineNoHeadings": "Metin içi görsel eklemek için önce bölüm başlıkları (H2) ekleyin."
```

- [ ] **Step 2: Build the component**

Create `frontend-customer/src/components/admin/blog/inline-images.tsx`:

```tsx
"use client";

// Manages BlogPost.image_placements: each entry anchors one image under one
// H2 heading; the public page injects them at serve time (placements.py).

import { useState } from "react";

import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ImageLibraryDialog,
  type PickedPhoto,
} from "@/components/admin/blog/image-library-dialog";
import { updatePost, type BlogPostAdmin } from "@/lib/blog-api";
import { parseH2Headings } from "@/lib/html-headings";

export function InlineImages({
  post,
  onPatched,
}: {
  post: BlogPostAdmin;
  onPatched: (fields: Partial<BlogPostAdmin>) => void;
}) {
  const t = useTranslations("admin");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [heading, setHeading] = useState<string | null>(null);
  const headings = parseH2Headings(post.body_html);

  const persist = async (placements: { heading: string; photo_id: string }[]) => {
    const updated = await updatePost(post.id, {
      image_placements: placements,
    } as Partial<BlogPostAdmin>);
    onPatched(updated);
  };

  const add = (photo: PickedPhoto) => {
    if (!heading) return;
    void persist([...(post.image_placements ?? []), { heading, photo_id: photo.id }]);
    setHeading(null);
  };

  const remove = (index: number) =>
    void persist((post.image_placements ?? []).filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("blog.inlineImages")}
      </p>
      <ul className="space-y-1.5">
        {(post.image_placements_resolved ?? []).map((item, index) => (
          <li
            key={`${item.photo_id}-${index}`}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.alt}
              className="h-8 w-12 rounded object-cover"
            />
            <span className="truncate text-sm">{item.heading}</span>
            <button
              type="button"
              aria-label={t("blog.coverRemove")}
              onClick={() => remove(index)}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {headings.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("blog.inlineNoHeadings")}</p>
      ) : heading === null ? (
        <Button variant="outline" size="sm" onClick={() => setHeading(headings[0])}>
          <Plus className="h-3.5 w-3.5" />
          {t("blog.inlineAdd")}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">
            {t("blog.inlineHeadingPrompt")}
          </label>
          <select
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            {headings.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {t("blog.inlineAdd")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHeading(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <ImageLibraryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultKind="stock"
        onSelect={add}
      />
    </div>
  );
}
```

In `frontend-customer/src/app/admin/blog/[id]/page.tsx`, render it directly below `<PostEditor …/>`:

```tsx
      <InlineImages post={post} onPatched={patch} />
```

with import `import { InlineImages } from "@/components/admin/blog/inline-images";`

- [ ] **Step 3: Verify in the running app**

In the editor: add an H2 in the body, save, add an inline image under it from the Library, reload — the placement persists and the public post page (Task 11 pending — check the API response `body_html` contains `<figure class="blog-inline-image">` via devtools/network for now).

Run: `make typecheck && make test-frontend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/admin/blog/inline-images.tsx "frontend-customer/src/app/admin/blog/[id]/page.tsx" frontend-customer/messages/
git commit -m "feat(curated-photos): inline image placements manager in editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Render covers on the public blog pages

**Files:**
- Modify: `frontend-customer/src/lib/blog-public.ts` (`BlogPostPublic` type)
- Modify: `frontend-customer/src/app/(public)/blog/page.tsx`
- Modify: `frontend-customer/src/app/(public)/blog/[slug]/page.tsx`

**Interfaces:**
- Consumes: `cover_photo_url` from the public serializers (Task 7); inline `<figure>` images arrive already injected inside `body_html` — the existing `dangerouslySetInnerHTML` renders them with no page change beyond styling.
- Produces: cover image on the list cards and above the detail article; `blog-inline-image` figures styled inside prose.

- [ ] **Step 1: Extend the type**

In `frontend-customer/src/lib/blog-public.ts` add to `BlogPostPublic`:

```ts
  cover_photo_url?: string | null;
```

- [ ] **Step 2: List page**

In `frontend-customer/src/app/(public)/blog/page.tsx`, inside the `<Link>` before the `<h2>`:

```tsx
              {post.cover_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.cover_photo_url}
                  alt=""
                  className="mb-3 aspect-[2/1] w-full rounded-lg object-cover"
                />
              )}
```

- [ ] **Step 3: Detail page**

In `frontend-customer/src/app/(public)/blog/[slug]/page.tsx`:

1. After the `<time>` element, before the body `<div>`:

```tsx
      {post.cover_photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover_photo_url}
          alt=""
          className="mt-6 aspect-[2/1] w-full rounded-xl object-cover"
        />
      )}
```

2. Extend the body div's className so injected figures style well inside prose:

```tsx
        className="prose prose-neutral dark:prose-invert mt-8 max-w-none [&_figure.blog-inline-image]:my-6 [&_figure.blog-inline-image_img]:rounded-lg [&_figure.blog-inline-image_img]:w-full"
```

3. Add the cover to the JSON-LD object when present:

```tsx
    ...(post.cover_photo_url ? { image: post.cover_photo_url } : {}),
```

- [ ] **Step 4: Verify end-to-end**

With the dev stack up and at least one seeded curated photo: publish a post with a curated cover + one inline placement, open the public `/blog` and `/blog/<slug>` pages.
Expected: cover on both pages, inline figure under its H2, no console errors.

Run: `make typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/blog-public.ts "frontend-customer/src/app/(public)/blog/"
git commit -m "feat(blog): render covers + inline figures on public pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: collect-curated-photos skill

**Files:**
- Create: `.claude/skills/collect-curated-photos/SKILL.md`

**Interfaces:**
- Consumes: the proven browser-Gemini pipeline documented in `.claude/skills/collect-curated-logos/SKILL.md`; `seed_curated_photos` (Task 4).
- Produces: the collection playbook for future batches. (Creating this .md is explicitly authorized by the approved spec.)

- [ ] **Step 1: Write the skill**

Create `.claude/skills/collect-curated-photos/SKILL.md`. Clone the structure of `collect-curated-logos/SKILL.md` (read it first — its browser mechanics, download-guard and quota sections carry over verbatim) with these deltas:

```markdown
---
name: collect-curated-photos
description: Use when adding new curated photos (hero covers, stock images, spot illustrations, textures, dividers, icons) to Contentor's blog design-element library — generating with Gemini and seeding photo_meta.json / seed_curated_photos. Also when curated-photo coverage is missing a niche or kind.
---

# Collect Curated Photos

## Overview

Catalog source: `frontend-customer/public/curated-photos/` — image files + **committed** `photo_meta.json`
(array of `{title, filename, prompt, tags, kind, alt_text}`; array order = gallery position, so **append only**).
Unlike logo_meta.json this file IS in git — commit it with every batch. `seed_curated_photos` is idempotent
(`update_or_create` on `image_key`), derives width/height, white-strips ONLY kind=spot, uploads to object
storage, creates public-schema `CuratedPhoto` rows.

Kinds: `hero` (16:9 covers), `stock` (photographic inline), `spot` (transparent flat illustration),
`texture` (seamless tiles), `divider` (thin separators), `icon` (small glyphs).
Only hero/stock/spot are offered to the blog AI writer — tag those three especially well.

## Prompt recipes (per kind)

- hero: `Generate a photorealistic 16:9 editorial stock photo: <niche scene>, natural light,
  premium magazine look, no text, no watermark, no logos.`
- stock: same as hero, but vary aspect and composition per subject.
- spot: reuse the logo recipe — `flat vector style, 1-2 colors on a plain white background,
  no text, no watermark. Square image.` (the seeder strips the white canvas)
- texture: `seamless tileable background pattern, <style>, subtle, no text`.

Tags: niche keywords first (fitness, cooking, business, mindset, yoga, music, art, language,
photography…), then mood/style words. Write alt_text for every entry — it is the accessibility
text on tenant blogs AND what the AI writer reads when choosing.

## Generation

Same two paths and browser mechanics as collect-curated-logos (backend API preferred when
GEMINI_API_KEY is valid; otherwise browser Gemini with the two-account daily-quota rotation —
see that skill for the send/download/quota gotchas, they apply unchanged).

## Ingest (per batch)

```bash
cp <new>.png frontend-customer/public/curated-photos/
# append entries to photo_meta.json (python, append-only)
docker compose exec -T django python manage.py seed_curated_photos
```

Verify: `CuratedPhoto.objects.count()` in public schema matches meta length; superadmin gallery
at `localhost/admin/m/curated-photos`; coach search at `/api/v1/curated-photos/?kind=hero`.
Commit images + photo_meta.json together.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/collect-curated-photos/
git commit -m "feat(curated-photos): collection skill

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Full verification

**Files:** none new.

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: all PASS.

- [ ] **Step 2: Frontend checks**

Run: `make test-frontend && make typecheck`
Expected: PASS.

- [ ] **Step 3: Lint (includes the e2e selector self-test)**

Run: `make lint`
Expected: zero errors/warnings. (No new e2e spec files were added, so `e2e/impact-map.json` needs no new entries; changes under unmapped backend areas fail closed and run the full suite — that is intended.)

- [ ] **Step 4: Live smoke**

`make dev` up; then walk the whole flow once: seed a small catalog (2-3 images across hero/stock/spot) → superadmin gallery shows them → coach editor picks a cover + inline image → public pages render both → `blog_generate` on a paid test tenant with an on-topic curated row produces a post with a cover (AI candidates path).

- [ ] **Step 5: Final commit (if any stragglers)**

```bash
git status  # should be clean; commit any remaining fixups with a fix(curated-photos) message
```
