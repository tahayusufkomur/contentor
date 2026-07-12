# Logo Curated Library — Phase 2 (Superadmin management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmin manages the curated logo library (add/edit/enable/reorder, PNG upload from the browser) via adminkit; the coach-facing gallery reads from the new DB+S3 source instead of the static JSON.

**Architecture:** New public-schema `CuratedLogo` model registered with `platform_site` (adminkit). Adminkit gains a generic `image` field type (backend `field_schema` branch + frontend `ImageField` widget in the vendored admin-kit). A superadmin-only multipart upload endpoint stores PNGs under `platform/{prefix}/` in object storage. A public unauthenticated endpoint serves the enabled catalog with presigned image URLs; the Phase 1 loader swaps its fetch target — components unchanged. Dev-only: a bind mount + signal mirror the DB state back into `frontend-customer/public/logos/` (never deleting files).

**Tech Stack:** Django 5.1 + DRF (public schema, `apps.core`), adminkit (`apps.adminkit` + vendored `admin-kit` frontend), boto3/MinIO, Next.js 14, vitest, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-logo-curated-library-phase-2-design.md`.
- **The git-committed `frontend-customer/public/logos/` files are never deleted** — they stay as the migration seed and dev mirror target. The mirror only adds/overwrites files.
- `docker-compose.prod.yml` is **untouched**. Only the dev `docker-compose.yml` gains the sync mount.
- Coach-facing components (`CuratedGallery`, `StudioEntrance`, `rankByNiche`, `logo-studio.tsx`) are **unchanged** — Phase 2 only swaps `fetchCuratedCatalog`'s data source and response mapping.
- Curated library stays fully free for coaches; no gating changes.
- Object keys for platform uploads live under `platform/…` — never `tenants/…`. The public catalog endpoint only signs keys starting with `platform/`.
- Upload endpoint: superadmin only (`IsSuperUser`), PNG only (content-type + magic bytes), max 5 MB.
- Public endpoints MUST set `@authentication_classes([])` (repo convention — `AllowAny` alone is not enough).
- Frontend admin-kit is vendored: edit the canonical copy in `frontend-customer/src/{lib,components}/admin-kit/`, then run `scripts/sync-admin-kit.sh`. `--check` must pass.
- Repo test convention: backend pytest per feature; frontend vitest covers `src/lib` pure logic only (NO `.tsx` component tests — components are covered by `tsc`/`next build` + Playwright e2e).
- Pre-commit must pass with zero errors/warnings/security issues before each commit. Never commit unless the plan step says commit.
- Backend commands run inside docker: `docker compose exec django pytest apps/... -q`. Frontend commands run in the app dir (`frontend-customer/` or `frontend-main/`).
- **When a later task's test snippet shows `import` lines, hoist them to the test file's top import block** (ruff E402 forbids mid-file imports) — the snippets show them inline only to state what's needed.

### Two deliberate deviations from the spec's literal text (both flagged during planning)

1. **Upload URL** — spec §4 names `POST /api/v1/admin/platform-upload/`, but `/api/v1/admin/*` is this codebase's coach tenant-admin prefix (`apps.tenant_config.urls` et al.). The endpoint lives at **`POST /api/v1/platform/upload/`** instead, alongside the other `IsSuperUser` platform views (`apps/core/platform/urls.py`).
2. **Upload mechanics** — spec §4 sketches presign→PUT→complete but names a single endpoint returning `{key, url}`. Implemented as **one multipart POST** (server-side `upload_fileobj`): one round trip, returns exactly `{key, url}`, avoids browser-side presigned-PUT reachability/CORS concerns. Superadmin-only traffic, ≤5 MB PNGs — streaming through Django is fine.

### Serving decision (resolves spec §3's open question)

Presigned GET URLs (24 h expiry), generated per catalog request — the spec's sanctioned fallback. No bucket-policy work in either environment; existing browser↔presigned-URL flows (uploadPng) prove MinIO/Hetzner handle cross-origin.

---

### Task 1: `CuratedLogo` model + migration + adminkit registration

**Files:**
- Modify: `backend/apps/core/models.py` (append after `PlatformKbEntry`, ~line 552)
- Modify: `backend/apps/core/admin_panels.py` (import + registration after `PlatformKbEntryAdmin`, ~line 355)
- Modify: `backend/apps/adminkit/tests/test_adminkit.py` (key-set assertion, ~line 261)
- Create: `backend/apps/core/migrations/0026_curatedlogo.py` (generated, not hand-written)
- Test: `backend/apps/core/tests/test_curated_logos.py`

**Interfaces:**
- Produces: model `apps.core.models.CuratedLogo` with fields `title` (CharField 120), `prompt` (TextField, blank), `tags` (CharField 500, blank, comma-separated), `position` (IntegerField, default 0, auto max+1 on create), `enabled` (BooleanField, default True), `image_key` (CharField 300), `created_at`/`updated_at`. Admin key `curated-logos` on `platform_site`. Admin class attrs `image_fields = ("image_key",)` and `image_upload_prefix = "curated-logos"` (plain attributes now; Task 2 makes adminkit understand them).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_curated_logos.py
"""Curated logo library (Phase 2): model, admin registration, catalog endpoint,
platform upload, dev mirror sync, seed command."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import CuratedLogo

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


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
            {"title": "Zen", "prompt": "a zen logo", "tags": "zen, yoga",
             "image_key": "platform/curated-logos/zen.png", "enabled": True},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        pk = resp.json()["id"]

        resp = client.patch(
            f"/api/v1/platform-admin/curated-logos/{pk}/", {"enabled": False}, format="json"
        )
        assert resp.status_code == 200
        assert CuratedLogo.objects.get(pk=pk).enabled is False

    def test_requires_superuser(self, restore_public):
        anon = APIClient(HTTP_HOST=SHARED_DOMAIN)
        assert anon.get("/api/v1/platform-admin/curated-logos/").status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py -q`
Expected: FAIL — `ImportError: cannot import name 'CuratedLogo'`

- [ ] **Step 3: Add the model**

Append to `backend/apps/core/models.py` directly after the `PlatformKbEntry` class:

```python
class CuratedLogo(models.Model):
    """Superadmin-managed ready-made Logo Studio illustrations (Phase 2 of the
    curated library). Public schema; the PNG lives in object storage under
    platform/curated-logos/ and image_key points at it."""

    title = models.CharField(max_length=120)
    prompt = models.TextField(blank=True, default="")
    tags = models.CharField(max_length=500, blank=True, default="")  # comma-separated
    position = models.IntegerField(default=0, help_text="Sort order; 0 = append at the end on create.")
    enabled = models.BooleanField(default=True)
    image_key = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        ordering = ["position", "id"]

    def save(self, *args, **kwargs):
        if self._state.adding and not self.position:
            last = CuratedLogo.objects.aggregate(m=models.Max("position"))["m"] or 0
            self.position = last + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
```

- [ ] **Step 4: Generate the migration**

Run: `docker compose exec django python manage.py makemigrations core`
Expected: creates `backend/apps/core/migrations/0026_curatedlogo.py` (name may differ if another migration landed — accept the generated name).

- [ ] **Step 5: Register with adminkit**

In `backend/apps/core/admin_panels.py`: add `CuratedLogo` to the `.models` import block, then append after `PlatformKbEntryAdmin`:

```python
@platform_site.register(CuratedLogo)
class CuratedLogoAdmin(ModelAdmin):
    key = "curated-logos"
    icon = "images"
    description = "Ready-made Logo Studio illustrations coaches can use for free."
    list_display = ("title", "tags", "enabled", "position", "updated_at")
    search_fields = ("title", "tags", "prompt")
    list_filters = ("enabled",)
    ordering = ("position", "id")
    fields = ("title", "prompt", "tags", "position", "enabled", "image_key")
    image_fields = ("image_key",)
    image_upload_prefix = "curated-logos"
```

Also update `test_platform_site_requires_superuser` in `backend/apps/adminkit/tests/test_adminkit.py` (~line 261): add `"curated-logos"` to the expected key set.

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py apps/adminkit/tests/test_adminkit.py -q`
Expected: PASS (all).

- [ ] **Step 7: Apply the migration to the dev DB and commit**

```bash
docker compose exec django python manage.py migrate_schemas --shared
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/apps/core/admin_panels.py backend/apps/adminkit/tests/test_adminkit.py backend/apps/core/tests/test_curated_logos.py
git commit -m "feat(logo-library): CuratedLogo model + platform-admin registration"
```

---

### Task 2: adminkit generic `image` field type (backend)

**Files:**
- Modify: `backend/apps/adminkit/options.py` (ModelAdmin class attrs, ~line 68)
- Modify: `backend/apps/adminkit/introspection.py` (`field_schema()`, ~line 103)
- Test: `backend/apps/adminkit/tests/test_adminkit.py` (append)

**Interfaces:**
- Consumes: `CuratedLogoAdmin.image_fields` / `image_upload_prefix` (Task 1).
- Produces: `ModelAdmin` attrs `image_fields: tuple = ()`, `image_upload_url: str = "/api/v1/platform/upload/"`, `image_upload_prefix: str = "images"`. For any declared image field, `field_schema()` emits `"type": "image"`, `"upload_url": <admin.image_upload_url>`, `"upload_prefix": <admin.image_upload_prefix>`. Task 3 implements the endpoint; Task 8 renders the widget.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/adminkit/tests/test_adminkit.py` (platform-site section):

```python
def test_image_field_schema(superuser):
    meta = make_client(superuser).get("/api/v1/platform-admin/curated-logos/meta/").json()
    image_key = next(f for f in meta["form_fields"] if f["name"] == "image_key")
    assert image_key["type"] == "image"
    assert image_key["upload_url"] == "/api/v1/platform/upload/"
    assert image_key["upload_prefix"] == "curated-logos"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/adminkit/tests/test_adminkit.py::test_image_field_schema -q`
Expected: FAIL — `image_key["type"]` is `"string"`, no `upload_url` key.

- [ ] **Step 3: Implement**

In `backend/apps/adminkit/options.py`, add to the `ModelAdmin` class attribute block (after `permission_classes`):

```python
    # ---- image upload fields ----
    # Fields whose value is an object-storage key set by uploading an image
    # through `image_upload_url` (see field_schema's "image" type).
    image_fields: tuple = ()
    image_upload_url: str = "/api/v1/platform/upload/"
    image_upload_prefix: str = "images"
```

In `backend/apps/adminkit/introspection.py`, inside `field_schema()` right after the base `schema = {...}` dict is built:

```python
    if name in getattr(admin, "image_fields", ()):
        schema["type"] = "image"
        schema["upload_url"] = admin.image_upload_url
        schema["upload_prefix"] = admin.image_upload_prefix
```

Also update the module docstring's schema key list at the top of `introspection.py` to mention `"upload_url"?/"upload_prefix"?`.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/adminkit/tests/ -q`
Expected: PASS (all adminkit tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/adminkit/options.py backend/apps/adminkit/introspection.py backend/apps/adminkit/tests/test_adminkit.py
git commit -m "feat(adminkit): generic image field type (upload_url/prefix in field schema)"
```

---

### Task 3: platform upload endpoint (`POST /api/v1/platform/upload/`)

**Files:**
- Create: `backend/apps/core/platform/uploads.py`
- Modify: `backend/apps/core/platform/urls.py` (add route)
- Test: `backend/apps/core/tests/test_curated_logos.py` (append)

**Interfaces:**
- Consumes: `IsSuperUser` (`apps.core.permissions`), `get_s3_client` / `generate_presigned_download_url` (`apps.core.storage`).
- Produces: view `platform_upload(request)` — multipart `file` (PNG, ≤5 MB) + optional `prefix` (default `"images"`, regex `^[a-z0-9][a-z0-9-]{0,39}$`) → 201 `{"key": "platform/<prefix>/<uuid>.png", "url": "<presigned GET, 24h>"}`. Module helper `_store_object(key, fileobj, content_type)` (the single S3-write choke point — Task 6's seed command reuses it, tests monkeypatch it).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_curated_logos.py`:

```python
import io

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def _png_file(name="logo.png", content_type="image/png", body=_PNG_BYTES):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, body, content_type=content_type)


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py -q`
Expected: FAIL — `ModuleNotFoundError: apps.core.platform.uploads` (monkeypatch target missing) / 404s.

- [ ] **Step 3: Implement the endpoint**

```python
# backend/apps/core/platform/uploads.py
"""Superadmin platform-asset upload: one multipart POST -> object under
platform/<prefix>/, returns {key, url}. The generic adminkit image widget
posts here (ModelAdmin.image_upload_url)."""

import re
import uuid

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.permissions import IsSuperUser
from apps.core.storage import generate_presigned_download_url, get_s3_client

_PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _store_object(key, fileobj, content_type):
    get_s3_client().upload_fileobj(
        fileobj, settings.AWS_BUCKET_NAME, key, ExtraArgs={"ContentType": content_type}
    )


@api_view(["POST"])
@permission_classes([IsSuperUser])
@parser_classes([MultiPartParser, FormParser])
def platform_upload(request):
    file = request.FILES.get("file")
    if file is None:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    prefix = request.data.get("prefix") or "images"
    if not _PREFIX_RE.match(prefix):
        return Response({"detail": "Invalid prefix."}, status=status.HTTP_400_BAD_REQUEST)
    if file.size > MAX_UPLOAD_BYTES:
        return Response({"detail": "File too large (max 5 MB)."}, status=status.HTTP_400_BAD_REQUEST)
    head = file.read(8)
    file.seek(0)
    if head != _PNG_MAGIC:
        return Response({"detail": "Only PNG images are supported."}, status=status.HTTP_400_BAD_REQUEST)
    key = f"platform/{prefix}/{uuid.uuid4().hex}.png"
    _store_object(key, file, "image/png")
    return Response(
        {"key": key, "url": generate_presigned_download_url(key, expiry=86400)},
        status=status.HTTP_201_CREATED,
    )
```

In `backend/apps/core/platform/urls.py`, import and add the route:

```python
from . import uploads
```
```python
    path("upload/", uploads.platform_upload, name="platform-upload"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/platform/uploads.py backend/apps/core/platform/urls.py backend/apps/core/tests/test_curated_logos.py
git commit -m "feat(logo-library): superadmin platform upload endpoint (multipart PNG -> platform/ key)"
```

---

### Task 4: public curated-catalog endpoint (`GET /api/v1/logos/curated/`)

**Files:**
- Create: `backend/apps/core/curated_logos/__init__.py` (empty)
- Create: `backend/apps/core/curated_logos/views.py`
- Create: `backend/apps/core/curated_logos/urls.py`
- Modify: `backend/config/urls.py` (mount `api/v1/logos/`)
- Test: `backend/apps/core/tests/test_curated_logos.py` (append)

**Interfaces:**
- Consumes: `CuratedLogo` (Task 1), `generate_presigned_download_url` (`apps.core.storage`).
- Produces: unauthenticated `GET /api/v1/logos/curated/` → `[{title, filename, prompt, tags, image_url}]` — enabled rows only, ordered `position, id`, `filename` = basename of `image_key`, `image_url` = 24 h presigned GET. Rows whose `image_key` doesn't start with `platform/` are skipped. Task 7's loader consumes this shape.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_curated_logos.py`:

```python
class TestCuratedCatalogEndpoint:
    @pytest.fixture()
    def rows(self, restore_public):
        CuratedLogo.objects.create(
            title="Second", tags="chef", image_key="platform/curated-logos/chef.png", position=2
        )
        CuratedLogo.objects.create(
            title="First", prompt="a yoga logo", tags="yoga, zen",
            image_key="platform/curated-logos/yoga.png", position=1,
        )
        CuratedLogo.objects.create(
            title="Hidden", image_key="platform/curated-logos/hidden.png", enabled=False
        )
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py::TestCuratedCatalogEndpoint -q`
Expected: FAIL — 404 (route not mounted).

- [ ] **Step 3: Implement**

```python
# backend/apps/core/curated_logos/views.py
"""Public read side of the curated logo library: the Logo Studio's Browse
entrance fetches this from tenant subdomains. Unauthenticated by design —
the catalog is platform-global marketing-style content."""

from django_tenants.utils import schema_context
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import CuratedLogo
from apps.core.storage import generate_presigned_download_url


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def curated_catalog(request):
    # CuratedLogo is a SHARED_APPS model — its table exists only in the public
    # schema, but this endpoint is called from tenant hosts.
    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    out = []
    for row in rows:
        key = row.image_key or ""
        # Never sign anything outside the platform prefix (a bad key must not
        # become a presigned URL into tenant storage).
        if not key.startswith("platform/"):
            continue
        out.append(
            {
                "title": row.title,
                "filename": key.rsplit("/", 1)[-1],
                "prompt": row.prompt,
                "tags": row.tags,
                "image_url": generate_presigned_download_url(key, expiry=86400),
            }
        )
    return Response(out)
```

```python
# backend/apps/core/curated_logos/urls.py
from django.urls import path

from . import views

urlpatterns = [
    path("curated/", views.curated_catalog, name="curated-logo-catalog"),
]
```

In `backend/config/urls.py`, add after the `api/v1/platform/` includes:

```python
    path("api/v1/logos/", include("apps.core.curated_logos.urls")),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/curated_logos/ backend/config/urls.py backend/apps/core/tests/test_curated_logos.py
git commit -m "feat(logo-library): public curated catalog endpoint (enabled rows, presigned URLs)"
```

---

### Task 5: dev-only mirror sync (setting + signal + compose mount)

**Files:**
- Modify: `backend/config/settings/base.py` (new setting)
- Modify: `backend/apps/core/signals.py` (append receivers)
- Modify: `docker-compose.yml` (django service: env + volume)
- Modify: `backend/conftest.py` (autouse fixture forcing the mirror OFF in tests)
- Test: `backend/apps/core/tests/test_curated_logos.py` (append)

> **Why the conftest change is load-bearing:** the dev compose sets
> `CURATED_LOGO_SYNC_DIR=/app/logo_sync` in the django container — the same
> container `make test` runs pytest in. Without a global override, EVERY test
> that saves a `CuratedLogo` would write into the bind-mounted repo folder and
> hit real MinIO. The autouse fixture forces the setting to `""` for all tests;
> the mirror tests below re-enable it against `tmp_path` explicitly.

**Interfaces:**
- Consumes: `CuratedLogo` (Task 1), `get_s3_client` (`apps.core.storage`).
- Produces: setting `CURATED_LOGO_SYNC_DIR` (env var, default `""` = sync off — prod stays off). `post_save`/`post_delete` receivers on `CuratedLogo` that rewrite `<dir>/logo_meta.json` (enabled rows, position order, Phase 1 schema `{title, filename, prompt, tags}`) and write the saved row's PNG bytes fetched from object storage. **Never deletes any file.** Fail-soft: any exception is logged, never raised into the admin save.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_curated_logos.py`:

```python
import json as jsonlib


class TestCuratedMirrorSync:
    @pytest.fixture(autouse=True)
    def _sync_dir(self, tmp_path, settings, monkeypatch):
        settings.CURATED_LOGO_SYNC_DIR = str(tmp_path)
        self.dir = tmp_path

        class FakeS3:
            def get_object(self, Bucket, Key):
                return {"Body": io.BytesIO(_PNG_BYTES)}

        monkeypatch.setattr("apps.core.signals.get_s3_client", lambda: FakeS3())

    def test_save_writes_meta_and_png(self, restore_public):
        CuratedLogo.objects.create(
            title="Yoga", prompt="p", tags="yoga", image_key="platform/curated-logos/yoga.png"
        )
        meta = jsonlib.loads((self.dir / "logo_meta.json").read_text())
        assert meta == [{"title": "Yoga", "filename": "yoga.png", "prompt": "p", "tags": "yoga"}]
        assert (self.dir / "yoga.png").read_bytes() == _PNG_BYTES

    def test_disabled_row_leaves_meta_but_keeps_png(self, restore_public):
        row = CuratedLogo.objects.create(
            title="Yoga", image_key="platform/curated-logos/yoga.png"
        )
        row.enabled = False
        row.save()
        meta = jsonlib.loads((self.dir / "logo_meta.json").read_text())
        assert meta == []
        assert (self.dir / "yoga.png").exists()  # mirror never deletes files

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py::TestCuratedMirrorSync -q`
Expected: FAIL — `AttributeError: apps.core.signals has no attribute 'get_s3_client'` (monkeypatch target missing).

- [ ] **Step 3: Implement setting + signal**

In `backend/config/settings/base.py` (near `EMAIL_SINK_ENABLED`, ~line 331):

```python
# Dev-only: when set, CuratedLogo saves mirror the catalog back into this
# directory (bind-mounted to frontend-customer/public/logos in dev compose)
# so the git-committed snapshot tracks the DB. Unset in prod = sync off.
CURATED_LOGO_SYNC_DIR = os.environ.get("CURATED_LOGO_SYNC_DIR", "")
```

Append to `backend/apps/core/signals.py`:

```python
import json
import logging
from pathlib import Path

from django.conf import settings
from django_tenants.utils import schema_context

from apps.core.storage import get_s3_client

logger = logging.getLogger(__name__)


def _mirror_curated_logos(fetch_png_for=None):
    """Dev-only DB->repo mirror of the curated logo catalog. Rewrites
    logo_meta.json (enabled rows, Phase 1 schema) and writes the saved row's
    PNG. Never deletes files; never raises into the caller's save()."""
    sync_dir = settings.CURATED_LOGO_SYNC_DIR
    if not sync_dir:
        return
    try:
        from apps.core.models import CuratedLogo

        out = Path(sync_dir)
        out.mkdir(parents=True, exist_ok=True)
        with schema_context("public"):
            rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
        meta = [
            {
                "title": r.title,
                "filename": r.image_key.rsplit("/", 1)[-1],
                "prompt": r.prompt,
                "tags": r.tags,
            }
            for r in rows
            if (r.image_key or "").startswith("platform/")
        ]
        (out / "logo_meta.json").write_text(json.dumps(meta, indent=4, ensure_ascii=False) + "\n")
        if fetch_png_for is not None and (fetch_png_for.image_key or "").startswith("platform/"):
            body = (
                get_s3_client()
                .get_object(Bucket=settings.AWS_BUCKET_NAME, Key=fetch_png_for.image_key)["Body"]
                .read()
            )
            (out / fetch_png_for.image_key.rsplit("/", 1)[-1]).write_bytes(body)
    except Exception:
        logger.exception("curated-logo mirror sync failed")


@receiver(post_save, sender="core.CuratedLogo")
def curated_logo_mirror_on_save(sender, instance, **kwargs):
    _mirror_curated_logos(fetch_png_for=instance)


@receiver(post_delete, sender="core.CuratedLogo")
def curated_logo_mirror_on_delete(sender, instance, **kwargs):
    _mirror_curated_logos()
```

(Match the module's existing import style — it already imports `post_delete`, `post_save`, `receiver`; only add what's missing. `AWS_BUCKET_NAME` is read via `settings`.)

In `docker-compose.yml`, django service: add an `environment` key and extend `volumes`:

```yaml
    environment:
      CURATED_LOGO_SYNC_DIR: /app/logo_sync
    volumes:
      - ./backend:/app/backend
      - ./frontend-customer/public/logos:/app/logo_sync
```

Append to `backend/conftest.py` (top-level fixture, next to the other autouse fixtures):

```python
@pytest.fixture(autouse=True)
def _curated_mirror_off(settings):
    """The dev container exports CURATED_LOGO_SYNC_DIR (repo bind mount) — force
    the CuratedLogo mirror OFF for every test so suites never write into the
    repo or touch MinIO. Mirror tests re-enable it against tmp_path."""
    settings.CURATED_LOGO_SYNC_DIR = ""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py -q`
Expected: PASS.

- [ ] **Step 5: Restart django so compose changes apply, then commit**

```bash
docker compose up -d django
git add backend/config/settings/base.py backend/apps/core/signals.py docker-compose.yml backend/conftest.py backend/apps/core/tests/test_curated_logos.py
git commit -m "feat(logo-library): dev-only DB->repo mirror sync for the curated catalog"
```

---

### Task 6: seed command (git catalog → DB+S3) + `make seed`

**Files:**
- Create: `backend/apps/core/management/commands/seed_curated_logos.py`
- Modify: `Makefile` (`seed` target, ~line 78)
- Test: `backend/apps/core/tests/test_curated_logos.py` (append)

**Interfaces:**
- Consumes: `CuratedLogo` (Task 1), `_store_object` (Task 3), the Phase 1 catalog format (`logo_meta.json`: array of `{title, filename, prompt, tags}` + PNGs in the same dir).
- Produces: `python manage.py seed_curated_logos [--dir DIR]` — DIR defaults to `settings.CURATED_LOGO_SYNC_DIR`. For each entry: uploads the PNG to `platform/curated-logos/<filename>` (original basename kept, so the dev mirror writes back identical files) and upserts a `CuratedLogo` by exact `image_key` (idempotent; `position` = 1-based catalog order). Missing PNGs are skipped with a warning, not fatal.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_curated_logos.py`:

```python
from django.core.management import call_command


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
        call_command("seed_curated_logos", dir=str(catalog_dir))
        rows = list(CuratedLogo.objects.order_by("position"))
        assert [(r.title, r.position) for r in rows] == [("Yoga", 1), ("Chef", 2)]
        assert rows[0].image_key == "platform/curated-logos/yoga.png"
        assert "platform/curated-logos/yoga.png" in self.stored

    def test_idempotent_rerun(self, restore_public, catalog_dir):
        call_command("seed_curated_logos", dir=str(catalog_dir))
        call_command("seed_curated_logos", dir=str(catalog_dir))
        assert CuratedLogo.objects.count() == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logos.py::TestSeedCommand -q`
Expected: FAIL — `CommandError: Unknown command: 'seed_curated_logos'` (or monkeypatch import error).

- [ ] **Step 3: Implement the command**

```python
# backend/apps/core/management/commands/seed_curated_logos.py
"""One-time (idempotent) migration of the Phase 1 static curated catalog
(logo_meta.json + PNGs) into CuratedLogo rows + platform object storage.

Dev: `make seed` runs it against the bind-mounted repo catalog. Prod (no
mount): run with an explicit --dir, e.g. via a one-off bind mount:
  docker compose -f docker-compose.prod.yml run --rm \\
    -v $(pwd)/frontend-customer/public/logos:/seed django \\
    python manage.py seed_curated_logos --dir /seed
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context

from apps.core.models import CuratedLogo
from apps.core.platform.uploads import _store_object


class Command(BaseCommand):
    help = "Seed CuratedLogo rows from a static catalog directory (logo_meta.json + PNGs)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default=None, help="Catalog directory (default: CURATED_LOGO_SYNC_DIR)")

    def handle(self, *args, **options):
        directory = options["dir"] or settings.CURATED_LOGO_SYNC_DIR
        if not directory:
            raise CommandError("Pass --dir or set CURATED_LOGO_SYNC_DIR.")
        meta_path = Path(directory) / "logo_meta.json"
        if not meta_path.exists():
            raise CommandError(f"{meta_path} not found.")
        entries = json.loads(meta_path.read_text())
        with schema_context("public"):
            for index, entry in enumerate(entries):
                filename = entry["filename"]
                png = Path(directory) / filename
                if not png.exists():
                    self.stderr.write(f"skip {filename}: file missing")
                    continue
                key = f"platform/curated-logos/{filename}"
                with png.open("rb") as fh:
                    _store_object(key, fh, "image/png")
                _, created = CuratedLogo.objects.update_or_create(
                    image_key=key,
                    defaults={
                        "title": entry["title"],
                        "prompt": entry.get("prompt", ""),
                        "tags": entry.get("tags", ""),
                        "position": index + 1,
                        "enabled": True,
                    },
                )
                self.stdout.write(f"{'created' if created else 'updated'} {key}")
```

Update the Makefile `seed` target:

```make
seed: ## Seed plans, public tenant, superusers, and the curated logo catalog
	docker compose exec django python manage.py seed_plans
	docker compose exec django python manage.py seed_curated_logos
```

- [ ] **Step 4: Run tests, then seed the live dev stack**

```bash
docker compose exec django pytest apps/core/tests/test_curated_logos.py -q
docker compose exec django python manage.py seed_curated_logos
curl -s http://localhost/api/v1/logos/curated/ | head -c 400
```
Expected: tests PASS; seed prints `created platform/curated-logos/...` per entry; curl returns a JSON array with the seeded titles.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/management/commands/seed_curated_logos.py Makefile backend/apps/core/tests/test_curated_logos.py
git commit -m "feat(logo-library): seed_curated_logos command (git catalog -> DB+S3) + make seed"
```

---

### Task 7: coach-facing loader swap (`library-catalog.ts` → API)

**Files:**
- Modify: `frontend-customer/src/lib/logo/library-catalog.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/logos/curated/` (Task 4 shape).
- Produces: unchanged `CuratedLogo` TS interface + unchanged `rankByNiche` — downstream components untouched (Global Constraints).

- [ ] **Step 1: Update the test (red first)**

Replace the two fetch-related tests in `frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts` (keep the `rankByNiche` test as-is, but update `RAW` since entries now carry `image_url`):

```ts
const RAW = [
  {
    title: "Yoga",
    filename: "yoga.png",
    prompt: "a yoga logo",
    tags: "yoga, wellness, zen",
    image_url: "http://storage.local/platform/curated-logos/yoga.png?sig=1",
  },
  {
    title: "Chef",
    filename: "chef.png",
    prompt: "a chef logo",
    tags: "cooking, food",
    image_url: "http://storage.local/platform/curated-logos/chef.png?sig=2",
  },
];
```

```ts
  it("fetches the catalog API, splits tags, and passes image_url through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => RAW }),
    );
    const logos = await fetchCuratedCatalog();
    expect(fetch).toHaveBeenCalledWith("/api/v1/logos/curated/");
    expect(logos[0]).toMatchObject({
      title: "Yoga",
      filename: "yoga.png",
      imageUrl: RAW[0].image_url,
      tags: ["yoga", "wellness", "zen"],
    });
  });

  it("returns [] when the catalog is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchCuratedCatalog()).toEqual([]);
  });
```

In the `rankByNiche` test, keep building logos from `RAW` but map `imageUrl: r.image_url`.

- [ ] **Step 2: Run test to verify it fails**

Run (in `frontend-customer/`): `npx vitest run src/lib/logo/__tests__/library-catalog.test.ts`
Expected: FAIL — fetch called with `/logos/logo_meta.json`, `imageUrl` mismatch.

- [ ] **Step 3: Update the loader**

In `frontend-customer/src/lib/logo/library-catalog.ts`, update `RawEntry` and `fetchCuratedCatalog` (interfaces `CuratedLogo` and `rankByNiche` unchanged):

```ts
interface RawEntry {
  title: string;
  filename: string;
  prompt: string;
  tags: string;
  image_url: string;
}

export async function fetchCuratedCatalog(): Promise<CuratedLogo[]> {
  try {
    const res = await fetch("/api/v1/logos/curated/");
    if (!res.ok) return [];
    const raw = (await res.json()) as RawEntry[];
    return raw.map((e) => ({
      title: e.title,
      filename: e.filename,
      prompt: e.prompt ?? "",
      tags: (e.tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      imageUrl: e.image_url,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run src/lib/logo
npx tsc --noEmit
```
Expected: all logo tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/library-catalog.ts frontend-customer/src/lib/logo/__tests__/library-catalog.test.ts
git commit -m "feat(logo-library): curated loader reads the live catalog API"
```

---

### Task 8: adminkit `ImageField` widget (frontend, canonical + sync)

**Files:**
- Modify: `frontend-customer/src/lib/admin-kit/types.ts` (`FieldType` union + `FieldSchema`)
- Modify: `frontend-customer/src/components/admin-kit/widgets.tsx` (new widget + `case "image"`)
- Modify (via script): `frontend-main/src/{lib,components}/admin-kit/*` — run `scripts/sync-admin-kit.sh`

**Interfaces:**
- Consumes: `FieldSchema.upload_url` / `upload_prefix` (Task 2), `POST /api/v1/platform/upload/` → `{key, url}` (Task 3).
- Produces: `FieldInput` renders `type: "image"` as an upload control — file picker (PNG only), POSTs multipart to `field.upload_url`, on success calls `onChange(key)` and shows a thumbnail preview from `url`; upload errors render inline; an existing value with no fresh upload shows its basename. No vitest test (repo convention: component coverage = build + e2e).

- [ ] **Step 1: Extend the types**

In `frontend-customer/src/lib/admin-kit/types.ts`: add `| "image"` to the `FieldType` union (before `| "computed"`), and add to `FieldSchema`:

```ts
  /** image fields: where the widget POSTs the multipart upload */
  upload_url?: string;
  /** image fields: storage sub-prefix sent with the upload */
  upload_prefix?: string;
```

- [ ] **Step 2: Add the widget**

In `frontend-customer/src/components/admin-kit/widgets.tsx`:

1. Change the react import line — the file currently imports nothing from react; add:

```tsx
import { useRef, useState } from "react";
import { Check, ImageIcon, Loader2, Minus, Upload } from "lucide-react";
```

(keeping `Check` and `Minus`, which are already imported.)

2. Add `KitButton` to the primitives import:

```tsx
import { KitButton, KitInput, KitSelect, KitTextarea, KitToggle } from "./primitives";
```

3. Add the widget component above `FieldInput`:

```tsx
function ImageFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const key = typeof value === "string" ? value : "";
  const basename = key ? key.split("/").pop() : "";

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !field.upload_url) return;
    setUploading(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (field.upload_prefix) body.append("prefix", field.upload_prefix);
      const res = await fetch(field.upload_url, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(data?.detail ?? `Upload failed (${res.status}).`);
      }
      const data = (await res.json()) as { key: string; url: string };
      onChange(data.key);
      setPreview(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={field.label}
          className="h-24 w-24 rounded-md border bg-white object-contain"
        />
      ) : basename ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> {basename}
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={onFile}
        disabled={disabled}
      />
      <KitButton
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {basename || preview ? "Replace PNG" : "Upload PNG"}
      </KitButton>
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}
```

4. Add the case inside `FieldInput`'s `switch (field.type)`, before `default:`:

```tsx
      case "image":
        return (
          <ImageFieldInput
            field={field}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        );
```

**Note:** check `primitives.tsx`'s `KitButton` prop signature before wiring (`variant`/children conventions) and match it; if `KitButton` doesn't forward `type`, use a plain `<button type="button">` styled like the other kit buttons instead. Also verify the `case "image"` value never trips `model-form.tsx`'s empty-value omission logic — an empty image value is omitted from the payload (correct: server-side `required` validation reports the missing field).

- [ ] **Step 3: Sync the vendored copies + typecheck both apps**

```bash
./scripts/sync-admin-kit.sh
./scripts/sync-admin-kit.sh --check
cd frontend-customer && npx tsc --noEmit && cd ..
cd frontend-main && npx tsc --noEmit && cd ..
```
Expected: sync clean, both typechecks clean.

- [ ] **Step 4: Build check (frontend-main renders the platform admin)**

Run (in `frontend-main/`): `npx next build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/admin-kit/types.ts frontend-customer/src/components/admin-kit/widgets.tsx frontend-main/src/lib/admin-kit/ frontend-main/src/components/admin-kit/
git commit -m "feat(adminkit): ImageField upload widget (canonical + synced copies)"
```

---

### Task 9: e2e (superadmin adds → coach sees) + final verification

**Files:**
- Create: `e2e/specs/18-curated-library-admin.spec.ts`

**Interfaces:**
- Consumes: `superadminContext` / `coachContext` / `MAIN` / `TENANT` (`e2e/helpers/auth.ts`), the seeded dev stack (Task 6 ran `seed_curated_logos`), a repo PNG as the upload fixture.

- [ ] **Step 1: Write the e2e spec**

```ts
// e2e/specs/18-curated-library-admin.spec.ts
//
// Phase 2 loop: superadmin creates a curated logo through the generic
// adminkit page (including a real PNG upload through /api/v1/platform/upload/),
// a coach then sees it in the Logo Studio's Browse entrance, and the
// superadmin deletes it again (idempotent re-runs). Assumes the dev stack is
// seeded (make seed).

import path from "node:path";
import { test, expect } from "@playwright/test";
import { coachContext, superadminContext, MAIN, TENANT } from "../helpers/auth";

const FIXTURE_PNG = path.resolve(
  __dirname,
  "../../frontend-customer/public/logos/colorful_lotus_meditation_logo.png",
);
const TITLE = "E2E Curated Logo";

test("superadmin adds a curated logo; coach sees it in the studio", async ({
  browser,
}) => {
  // --- superadmin: create via the adminkit page -------------------------
  const admin = await superadminContext(browser);
  const adminPage = await admin.newPage();
  await adminPage.goto(`${MAIN}/admin/m/curated-logos`);
  await adminPage.getByRole("button", { name: /New Curated Logo/i }).click();

  // Adminkit form fields render in declared order: title, prompt, tags,
  // position, enabled, image. Labels aren't programmatically associated
  // (kit-wide), so address the text controls by order.
  const boxes = adminPage.getByRole("textbox");
  await boxes.nth(0).fill(TITLE); // title
  await boxes.nth(1).fill("an e2e test logo prompt"); // prompt (textarea)
  await boxes.nth(2).fill("e2e, yoga"); // tags

  await adminPage
    .locator('input[type="file"]')
    .setInputFiles(FIXTURE_PNG);
  // Upload finished when the thumbnail preview appears.
  await expect(adminPage.getByAltText("Image Key")).toBeVisible({
    timeout: 15_000,
  });

  await adminPage.getByRole("button", { name: "Create", exact: true }).click();
  await expect(adminPage.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

  // --- coach: the new logo appears in the Browse entrance ---------------
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();
  await coachPage.goto(`${TENANT}/admin/design?studio=1`);
  const dialog = coachPage.getByRole("dialog");
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 15_000 });
  await coach.close();

  // --- superadmin: clean up so re-runs stay idempotent -------------------
  await adminPage.getByText(TITLE).first().click();
  adminPage.once("dialog", (d) => d.accept()); // window.confirm on delete
  await adminPage.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    adminPage.getByText(TITLE, { exact: true }),
  ).toBeHidden({ timeout: 10_000 });
  await admin.close();
});
```

> Adjust selectors against the real DOM if the generic adminkit page differs
> (e.g. the row-open affordance in `model-list.tsx`, or the create-panel
> heading `New Curated Logo` from `model-form.tsx:191`). The upload preview's
> alt text is the field label (`Image Key`).

- [ ] **Step 2: Run the new spec + both Phase 1 logo specs (dev stack up, seeded)**

```bash
docker compose exec django python manage.py seed_curated_logos   # no-op if already seeded
cd e2e
npx playwright test specs/18-curated-library-admin.spec.ts specs/17-logo-curated-library.spec.ts specs/15-logo-studio.spec.ts
```
Expected: 3 passed. (17 now exercises the API-served catalog end-to-end, including the browser fetching a presigned MinIO image URL — this is the CORS proof.)

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/18-curated-library-admin.spec.ts
git commit -m "test(logo-library): e2e superadmin curated CRUD -> coach gallery"
```

- [ ] **Step 4: Final verification (whole feature)**

```bash
docker compose exec django pytest -q                                   # full backend suite
cd frontend-customer && npx vitest run src/lib && npx tsc --noEmit && npx next build && cd ..
cd frontend-main && npx tsc --noEmit && npx next build && cd ..
./scripts/sync-admin-kit.sh --check
pre-commit run --files $(git diff --name-only HEAD~9 | tr '\n' ' ')    # adjust range to this feature's commits
```
Expected: all green, zero warnings.

- [ ] **Step 5: Manual browser pass**

- Superadmin → `/admin/m/curated-logos`: list shows seeded rows; add a new logo with a PNG upload → appears immediately in a coach's studio (no deploy).
- Toggle a row `enabled=False` → it disappears from the coach gallery.
- Dev mirror: after the add, `frontend-customer/public/logos/logo_meta.json` contains the new entry and the PNG file exists (`git status` shows the mirror change; nothing deleted).
- Coach studio: **Use this** on a curated logo still lands in the Editor and saves (image-mark flow unchanged).

---

## Final verification (after all tasks)

- [ ] Backend: `docker compose exec django pytest -q` → all green.
- [ ] Frontend: vitest (`src/lib`), `tsc --noEmit`, `next build` in BOTH apps → clean.
- [ ] `./scripts/sync-admin-kit.sh --check` → in sync.
- [ ] e2e: specs 15, 17, 18 → green.
- [ ] `make lint` → zero errors/warnings/security issues.
- [ ] Manual pass per Task 9 Step 5.

## Self-review notes (spec coverage)

- Spec §2 data model → Task 1 (incl. max+1 position). §3 storage/prefix + serving
  fallback → Tasks 3–4 (presigned GET decision recorded in the header). §4 adminkit
  registration + generic image field + upload endpoint → Tasks 1, 2, 3, 8. §5 read
  path swap, components unchanged → Tasks 4, 7. §6 one-time migration → Task 6;
  dev-only automatic mirror + compose mount + never-delete → Task 5; manual
  prod-drift resync → covered by `seed_curated_logos --dir` being reusable in
  reverse? **No** — §6's "manual DB→git resync command" is intentionally folded
  into the signal helper: running any save (or the documented one-liner
  `python manage.py shell -c "from apps.core.signals import _mirror_curated_logos; _mirror_curated_logos()"`)
  regenerates the mirror. A dedicated command is YAGNI until prod actually drifts;
  noted here honestly rather than silently dropped.
- Spec §7 error handling → upload 400s (Task 3), enabled-filter test (Task 4),
  fail-soft mirror (Task 5), gallery fail-open unchanged (Task 7 keeps `[]` on error).
- Spec §8 testing → per-task tests; §8's "ImageField tested per existing widget
  pattern" resolved during planning: adminkit frontend has NO component tests
  (repo-wide convention) — coverage is tsc/build + e2e 18.
- Deviations from spec literal text (upload URL, multipart-vs-presign) are
  declared in the header with rationale — flag to the user at execution kickoff.
