# Setup Assistant v2 — Implementation Plan (self-contained execution handoff)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document assumes ZERO prior context. Design rationale: `docs/superpowers/specs/2026-07-05-setup-assistant-design.md`.

**Goal:** Always-on setup assistant (floating bubble + slide-over checklist) with per-page/per-object items, plus a demo-content registry that powers "Demo" badges and a safe one-click "Remove demo content".

**Architecture:** A tenant-schema `SeededObject` registry (content-type + pk + content fingerprint) is written by the template seeder and read by three surfaces: `GET/POST /api/v1/admin/demo-content/`, the reshaped `setup-status` endpoint (per-item checklist state, auto + manual), and the `frontend-customer` assistant UI (module-cached hooks feeding a bubble, an edit-sidebar row, a slide-over panel, badges, and an erase dialog).

**Tech Stack:** Django 5.1 + DRF + django-tenants (backend), Next.js 14 App Router + Tailwind + next-intl (frontend-customer), pytest, docker compose dev stack.

## Global Constraints (read before touching anything)

- Repo root: `~/ws/projects-active/home-server/contentor`. Dev stack must be up (`docker compose ps`; if django/postgres aren't running: `make dev`).
- **Create and work on branch `feat/setup-assistant` off local `main`.** The working tree is SHARED with other agents: before EVERY commit run `git branch --show-current` and confirm. Local `main` is ~78 commits ahead of origin — that is expected; never push, never touch `main`.
- Pre-existing uncommitted modifications may exist (e.g. `docs/screenshot-map/index.html`, `.pre-commit-config.yaml`, `backend/conftest.py`). **Stage files explicitly by path; never `git add -A` / `git add .`.** Files this plan rewrites wholesale (`backend/apps/tenant_config/tests/test_setup_status.py`) may be committed even if already dirty.
- Backend tests: `docker compose exec -T django pytest <path> -v`. Known pre-existing failures to IGNORE: `apps/mailbox/tests/test_platform_address.py` (2 teardown ERRORs).
- Frontend checks: `npx tsc --noEmit` inside `frontend-customer/`. Full `npm run build` only at final verification ("✓ Compiled successfully" is the success signal; a benign "Failed to patch lockfile" warning appears — ignore it).
- Run `make format` from repo root before committing frontend files (pre-commit does NOT lint the frontends).
- Commit messages: conventional style ending with a `Co-Authored-By:` trailer naming the executing model.
- Copy tone for coach-facing strings: non-technical, no jargon/slugs. Every new string ships in BOTH `frontend-customer/messages/en/admin.json` and `messages/tr/admin.json`.
- Django hot-reloads Python; Next dev containers hot-reload TSX. No rebuilds until final verification.
- **Never delete bucket/S3 objects anywhere in this plan** — seeded rows point at shared platform `demo/*` keys used by every tenant. DB rows only.

## Shared facts (verified against the codebase — do not re-derive)

| Fact | Value |
|---|---|
| Builder pages | fixed keys `home, about, courses, pricing, faq, contact` (`apps/tenant_config/defaults.py: KNOWN_PAGE_KEYS`); **`pricing` renders at `/plans`** on the tenant site |
| TenantConfig fields | `pages` (JSON dict by page key), `theme`, `font_family`, `logo_url`, `logo` (FK media.Photo), `enabled_modules` (JSON list), `onboarding_completed`, `setup_guide_dismissed`, `landing_sections` (legacy JSON) |
| Config update path | `TenantConfigView(RetrieveUpdateAPIView)` in `apps/tenant_config/views.py`; `get_object` may return a cached instance; `perform_update` invalidates `tenant:{schema}:config` cache |
| Seeder | `apps/core/demo/seed_template.py::seed_template_into_tenant(tenant, niche)`; helpers `_seed_photos` (returns photo_map), `_seed_courses` (returns list), `_seed_extra_videos`/`_seed_extra_photos`/`_seed_downloads` (currently return None), `_seed_subscription_plans`/`_seed_bundles` (return lists), 4 live seeders (return None); constants `TARGET_COURSES=12, TARGET_VIDEOS=40, TARGET_PHOTOS=60` |
| Seeded model types | `courses.Course` (+ cascading `Module related_name="modules"`, `Lesson related_name="lessons"`), `courses.Video`, `downloads.DownloadFile`, `media.Photo` (**UUID pk**), `billing.SubscriptionPlan`, `billing.Bundle`, `live.LiveClass/LiveStream/ZoomClass/OnsiteEvent` |
| Timestamps | only Course/Module/Lesson have `updated_at` — hence content fingerprints, not timestamps |
| Media FKs | ALL `SET_NULL`: `Course.thumbnail`, `courses.Video.thumbnail`, 4 live `.thumbnail`, `Lesson.video`, `TenantConfig.logo` — deleting media never raises, it silently blanks; the reference guard exists to protect kept objects' images |
| Tenant flags | `Tenant.is_published`, `Tenant.template_seed_status` (`ready` after seed), `Tenant.template_niche`; `apps.core.monetization.can_monetize(tenant)`, `is_paid_active(tenant)` |
| Public-schema (SHARED) models usable from tenant requests | `apps.domains.models.PlatformMailboxAddress` (OneToOne `tenant`), `apps.domains.models.CustomDomain` (search_path is `tenant, public`) |
| Announcements | `apps.notifications.models.Announcement` (tenant app; never seeded) |
| Admin API mount | `/api/v1/admin/` → `apps/tenant_config/urls.py`; perms class `apps.core.permissions.IsCoachOrOwner` |
| Existing setup endpoint | `GET/PATCH /api/v1/admin/setup-status/` (`apps/tenant_config/views.py::setup_status`) — old 4-boolean shape; sole consumer is `frontend-customer/src/components/admin/setup-guide-card.tsx` (replaced by this plan) |
| frontend-customer | serves BOTH the tenant public site and `/admin` (one Next app). i18n: next-intl, namespace hook `useTranslations("admin")`, catalogs `messages/{en,tr}/admin.json`. Fetch helper `clientFetch<T>(path, options?)` from `@/lib/api-client`. UI primitives in `src/components/ui/` — **there is NO sheet/dialog primitive; use `ModalPortal` (`src/components/ui/modal-portal.tsx`) + fixed-position divs**, `badge.tsx` exists |
| Floating buttons | tenant site already has `EditButton` fixed `bottom-6 right-6` (`src/components/owner/edit-button.tsx`) — the assistant bubble mounts ONLY in `/admin` (`AdminShell`); on the site it lives as a row in `edit-sidebar.tsx` (current "Continue setup" block at ~line 250) |
| Dashboard | `src/app/admin/page.tsx` renders `<SetupGuideCard />` above `<PublishCard />` (which has `id="publish-card"`) |
| Test conventions | root `backend/conftest.py` provides `tenant_ctx`, `restore_public`, host `shared-test.localhost`; tenant API tests: `APIClient(HTTP_HOST="shared-test.localhost")` + `force_authenticate`; owner user factory pattern in `apps/tenant_config/tests/test_setup_status.py` |
| Dev email sink | `GET /api/v1/dev/emails/latest/?to=<email>` (for the browser funnel walk) |

---

### Task 1: SeededObject registry + fingerprint helper + `setup_progress` field

**Files:**
- Modify: `backend/apps/tenant_config/models.py`
- Create: `backend/apps/tenant_config/seeding.py`
- Create: `backend/apps/tenant_config/tests/test_seeding.py`
- Generated: next tenant_config migration

**Interfaces (later tasks rely on):**
- `SeededObject(content_type, object_id: str, fingerprint: str, niche: str, seeded_at)` with `unique_together ("content_type", "object_id")`
- `seeding.fingerprint_for(obj) -> str` (sha256 hex; Course folds in modules+lessons)
- `seeding.register_seeded(objs: Iterable[models.Model], niche: str = "") -> None`
- `TenantConfig.setup_progress: dict` — shape `{"pages_edited": [...], "look_edited": bool, "manual": {key: True}}`

- [ ] **Step 1: Write the failing test** — create `backend/apps/tenant_config/tests/test_seeding.py`:

```python
import pytest

from apps.accounts.models import User
from apps.courses.models import Course, Lesson, Module
from apps.tenant_config.models import SeededObject
from apps.tenant_config.seeding import fingerprint_for, register_seeded

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="own@x.com", name="Own", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def course(owner):
    c = Course.objects.create(title="Demo A", slug="demo-a-seedtest", instructor=owner)
    m = Module.objects.create(course=c, title="M1", order=1)
    Lesson.objects.create(module=m, title="L1", order=1, content_html="<p>hi</p>")
    yield c
    SeededObject.objects.all().delete()
    c.delete()


def test_fingerprint_stable_and_lesson_sensitive(course):
    fp1 = fingerprint_for(course)
    assert fp1 == fingerprint_for(course)  # stable across recomputes
    lesson = Lesson.objects.get(module__course=course)
    lesson.content_html = "<p>coach edited this</p>"
    lesson.save()
    assert fingerprint_for(course) != fp1  # lesson edits protect the course


def test_register_seeded_idempotent(course):
    register_seeded([course], niche="general")
    register_seeded([course], niche="general")  # re-run must not raise
    rows = SeededObject.objects.all()
    assert rows.count() == 1
    row = rows.get()
    assert row.object_id == str(course.pk)
    assert row.niche == "general"
    assert row.fingerprint == fingerprint_for(course)
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_seeding.py -v`
Expected: FAIL — `ImportError` (no `seeding` module / `SeededObject`).

- [ ] **Step 3: Add the model + field.** In `backend/apps/tenant_config/models.py`, add to `TenantConfig` (next to `setup_guide_dismissed`):

```python
    # Setup Assistant state: {"pages_edited": [...], "look_edited": bool,
    # "manual": {item_key: True}}. Auto-detection is append-only.
    setup_progress = models.JSONField(default=dict, blank=True)
```

and at the bottom of the file:

```python
class SeededObject(models.Model):
    """Registry of objects created by the template seeder for this tenant.

    Powers the "Demo" badges and the "Remove demo content" action. The
    fingerprint answers "has the coach touched this?" without adding
    updated_at columns across five apps.
    """

    content_type = models.ForeignKey(
        "contenttypes.ContentType", on_delete=models.CASCADE, related_name="+"
    )
    object_id = models.CharField(max_length=64)  # str(pk); works for int and UUID pks
    fingerprint = models.CharField(max_length=64)
    niche = models.CharField(max_length=64, blank=True, default="")
    seeded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tenant_config"
        unique_together = [("content_type", "object_id")]

    def __str__(self):
        return f"{self.content_type.model}:{self.object_id}"
```

- [ ] **Step 4: Create `backend/apps/tenant_config/seeding.py`** with exactly:

```python
"""Demo-seed registry helpers.

`fingerprint_for` hashes the coach-editable content of a seeded object so
"has the coach touched this since seeding?" stays answerable long after the
fact. The seeder and the erase endpoint both use it — one implementation.
"""

from __future__ import annotations

import hashlib
import json

from django.contrib.contenttypes.models import ContentType

from .models import SeededObject

# Bookkeeping fields — mutate on their own, never mark coach intent.
_SKIP_FIELDS = {"created_at", "updated_at", "download_count"}


def fingerprint_for(obj) -> str:
    payload = {}
    for field in obj._meta.concrete_fields:
        if field.primary_key or field.name in _SKIP_FIELDS:
            continue
        payload[field.name] = str(getattr(obj, field.attname))
    if obj._meta.label == "courses.Course":
        # Fold in modules + lessons: editing a lesson protects the course.
        payload["_modules"] = [
            {
                "title": module.title,
                "order": module.order,
                "lessons": [
                    {
                        "title": lesson.title,
                        "order": lesson.order,
                        "content_html": lesson.content_html,
                        "video_url": lesson.video_url,
                    }
                    for lesson in module.lessons.all().order_by("order", "pk")
                ],
            }
            for module in obj.modules.all().order_by("order", "pk")
        ]
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def register_seeded(objs, niche: str = "") -> None:
    rows = [
        SeededObject(
            content_type=ContentType.objects.get_for_model(obj, for_concrete_model=True),
            object_id=str(obj.pk),
            fingerprint=fingerprint_for(obj),
            niche=niche,
        )
        for obj in objs
    ]
    SeededObject.objects.bulk_create(rows, ignore_conflicts=True)
```

- [ ] **Step 5: Migrations**

Run: `docker compose exec -T django python manage.py makemigrations tenant_config`
then `docker compose exec -T django python manage.py migrate_schemas --tenant`
Expected: one new migration (SeededObject + setup_progress), applies cleanly.

- [ ] **Step 6: Run the tests**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_seeding.py -v`
Expected: 2 PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/tenant_config/models.py backend/apps/tenant_config/seeding.py \
  backend/apps/tenant_config/tests/test_seeding.py backend/apps/tenant_config/migrations/
git commit -m "feat(setup): SeededObject registry + content fingerprints (tenant migration)"
```

---

### Task 2: Seeder registers everything it creates (+ volume reduction)

**Files:**
- Modify: `backend/apps/core/demo/seed_template.py`
- Test: extends `backend/apps/tenant_config/tests/test_seeding.py`

**Interfaces:**
- Consumes: `register_seeded` from Task 1.
- Produces: every seeder-created top-level object (courses, downloads, plans, bundles, 4 live types, filler videos, photos) has a `SeededObject` row after `seed_template_into_tenant` runs.

- [ ] **Step 1: Make every `_seed_*` helper return what it created.** In `seed_template.py`:
  - `_seed_extra_videos`: collect each `Video.objects.create(...)` into a local `created = []` and `return created` (returns `[]` on the early-exit paths).
  - `_seed_extra_photos`: same pattern with `Photo.objects.create(...)`.
  - `_seed_downloads`: `created = [DownloadFile.objects.create(**_coerce_pricing(dl)) for dl in downloads_data]; return created`.
  - `_seed_live_classes`, `_seed_live_streams`, `_seed_zoom_classes`, `_seed_onsite_events`: collect each `.objects.create(...)` result into `created = []`, `return created` (early-exit paths return `[]`).

- [ ] **Step 2: Register at the end of the atomic block.** In `seed_template_into_tenant`, capture every helper's return value, and after `_seed_onsite_events(...)` (still INSIDE `with transaction.atomic():`) add:

```python
            # Register everything for the "Demo" badges + one-click erase.
            # Courses are fingerprinted last so modules/lessons are included.
            from apps.tenant_config.seeding import register_seeded

            seeded = [
                *photo_map.values(),
                *extra_photos,
                *extra_videos,
                *courses,
                *downloads,
                *sub_plans,
                *bundles,
                *live_classes,
                *live_streams,
                *zoom_classes,
                *onsite_events,
            ]
            register_seeded(seeded, niche=niche)
```

(where `extra_videos = _seed_extra_videos(...)`, `extra_photos = _seed_extra_photos(...)`, `downloads = _seed_downloads(downloads_data) if downloads_data else []`, and the four live lists are the captured returns).

- [ ] **Step 3: Volume reduction (recommended defaults — separate commit so it's trivially revertable).** Change the module constants:

```python
TARGET_COURSES = 6
TARGET_VIDEOS = 16
TARGET_PHOTOS = 24
```

- [ ] **Step 4: Add the integration test** — append to `backend/apps/tenant_config/tests/test_seeding.py`:

```python
def test_seed_template_registers_all_objects(tenant_ctx, owner):
    """Real seed run: everything created gets a registry row. Cleans up via
    the registry itself so the shared test schema stays usable."""
    from django.db import connection
    from django.forms.models import model_to_dict

    from apps.core.demo.seed_template import seed_template_into_tenant
    from apps.courses.models import Course as C
    from apps.downloads.models import DownloadFile
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    tenant = connection.tenant
    tenant.owner_email = owner.email
    # transaction=True tests don't roll back: snapshot the shared schema's
    # TenantConfig so the seeder's CONFIG merge can be undone afterwards.
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg_snapshot = model_to_dict(cfg)
    seed_template_into_tenant(tenant, "general")
    try:
        registered = SeededObject.objects.count()
        assert registered > 0
        # Spot-check coverage: every seeded course/download/photo is registered.
        from django.contrib.contenttypes.models import ContentType

        for model in (C, DownloadFile, Photo):
            ct = ContentType.objects.get_for_model(model)
            assert (
                SeededObject.objects.filter(content_type=ct).count()
                == model.objects.count()
            ), model
    finally:
        # Tear down by walking the registry (order: content, then media).
        for row in SeededObject.objects.select_related("content_type"):
            model = row.content_type.model_class()
            model.objects.filter(pk=row.object_id).delete()
            row.delete()
        # Restore the shared TenantConfig the seeder merged into.
        cfg.refresh_from_db()
        for field, value in cfg_snapshot.items():
            if field not in ("id", "logo"):
                setattr(cfg, field, value)
        cfg.save()
```

Note: `seed_template_into_tenant` merges CONFIG into the existing TenantConfig — in the shared test schema that's acceptable (tests must not assert on TenantConfig defaults after this file runs; keep this test LAST in the file). If the fixture schema has no TenantConfig, the merge path creates one.

- [ ] **Step 5: Run**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_seeding.py apps/core/tests/test_general_template.py -v`
Expected: all PASS (the general-template shape test must still pass with the new constants).

- [ ] **Step 6: Commit (two commits)**

```bash
git add backend/apps/core/demo/seed_template.py backend/apps/tenant_config/tests/test_seeding.py
git commit -m "feat(setup): template seeder registers every created object"
git add backend/apps/core/demo/seed_template.py
git commit -m "feat(onboarding): trim template volume (6 courses, 16 videos, 24 photos)"
```

(If Step 3 was folded into one edit pass, split the commits with `git add -p` or just make one commit noting both.)

---

### Task 3: Demo-content endpoints — GET ids/counts + POST erase

**Files:**
- Create: `backend/apps/tenant_config/demo_content.py`
- Modify: `backend/apps/tenant_config/urls.py`
- Create: `backend/apps/tenant_config/tests/test_demo_content.py`

**Interfaces:**
- Produces: `GET /api/v1/admin/demo-content/` → `{"present": bool, "counts": {courses, downloads, plans, bundles, live_events, videos, photos}, "ids": {courses: [str], downloads, live_classes, live_streams, zoom_classes, onsite_events, plans, bundles, videos, photos}}`
- Produces: `POST /api/v1/admin/demo-content/erase/` → `{"deleted": {<count_key>: n}, "kept": {<count_key>: n}}` (single transaction, idempotent).

- [ ] **Step 1: Write the failing tests** — `backend/apps/tenant_config/tests/test_demo_content.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, Lesson, Module
from apps.downloads.models import DownloadFile
from apps.media.models import Photo
from apps.tenant_config.models import SeededObject, TenantConfig
from apps.tenant_config.seeding import register_seeded

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach-demo@x.com", name="Coach", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def seeded(coach):
    TenantConfig.objects.get_or_create(brand_name="T")
    photo = Photo.objects.create(s3_key="demo/photos/yoga_1.jpg", title="p")
    untouched = Course.objects.create(
        title="Demo Course", slug="demo-c-erasetest", instructor=coach, thumbnail=photo
    )
    edited = Course.objects.create(title="Edited Course", slug="demo-e-erasetest", instructor=coach)
    m = Module.objects.create(course=edited, title="M", order=1)
    Lesson.objects.create(module=m, title="L", order=1)
    dl = DownloadFile.objects.create(title="Demo DL")
    register_seeded([photo, untouched, edited, dl], niche="general")
    # Coach edits one course AFTER seeding:
    edited.title = "My Real Course Now"
    edited.save()
    yield {"photo": photo, "untouched": untouched, "edited": edited, "dl": dl}
    SeededObject.objects.all().delete()
    Course.objects.filter(slug__endswith="erasetest").delete()
    DownloadFile.objects.filter(title__in=["Demo DL"]).delete()
    Photo.objects.filter(pk=photo.pk).delete()


def test_demo_content_ids_and_counts(client, seeded):
    body = client.get("/api/v1/admin/demo-content/").json()
    assert body["present"] is True
    assert body["counts"]["courses"] == 2
    assert body["counts"]["downloads"] == 1
    assert body["counts"]["photos"] == 1
    assert str(seeded["untouched"].pk) in body["ids"]["courses"]


def test_erase_deletes_untouched_keeps_edited(client, seeded):
    body = client.post("/api/v1/admin/demo-content/erase/").json()
    assert body["deleted"]["courses"] == 1
    assert body["kept"]["courses"] == 1
    assert body["deleted"]["downloads"] == 1
    assert not Course.objects.filter(pk=seeded["untouched"].pk).exists()
    assert Course.objects.filter(pk=seeded["edited"].pk).exists()
    assert SeededObject.objects.count() == 0  # registry fully drained
    # Idempotent rerun:
    body2 = client.post("/api/v1/admin/demo-content/erase/").json()
    assert body2["deleted"] == {}


def test_erase_keeps_photo_referenced_by_kept_course(client, coach, seeded):
    # Point the EDITED (kept) course at the demo photo, then erase.
    seeded["edited"].thumbnail = seeded["photo"]
    seeded["edited"].save()
    client.post("/api/v1/admin/demo-content/erase/")
    assert Photo.objects.filter(pk=seeded["photo"].pk).exists()
```

- [ ] **Step 2: Run to verify FAIL** (404 route):
`docker compose exec -T django pytest apps/tenant_config/tests/test_demo_content.py -v`

- [ ] **Step 3: Create `backend/apps/tenant_config/demo_content.py`** with exactly:

```python
"""Demo-content admin endpoints: what is still demo, and erase the untouched.

Never touches bucket objects — seeded rows point at shared platform demo/*
keys used by every tenant. DB rows only.
"""

from collections import defaultdict

from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .models import SeededObject, TenantConfig
from .seeding import fingerprint_for

# Deletion order: content first, then the media it references, so the
# reference guard sees the final set of surviving rows.
_ERASE_ORDER = [
    "billing.bundle",
    "billing.subscriptionplan",
    "live.liveclass",
    "live.livestream",
    "live.zoomclass",
    "live.onsiteevent",
    "courses.course",
    "downloads.downloadfile",
    "courses.video",
    "media.photo",
]

_ID_KEYS = {
    "courses.course": "courses",
    "downloads.downloadfile": "downloads",
    "billing.subscriptionplan": "plans",
    "billing.bundle": "bundles",
    "live.liveclass": "live_classes",
    "live.livestream": "live_streams",
    "live.zoomclass": "zoom_classes",
    "live.onsiteevent": "onsite_events",
    "courses.video": "videos",
    "media.photo": "photos",
}

_LIVE_ID_KEYS = ("live_classes", "live_streams", "zoom_classes", "onsite_events")

# Count keys collapse the four live types into one number for dialog copy.
_COUNT_KEYS = {
    label: ("live_events" if key in _LIVE_ID_KEYS else key)
    for label, key in _ID_KEYS.items()
}


def _rows_by_label():
    grouped = defaultdict(list)
    for row in SeededObject.objects.select_related("content_type"):
        grouped[f"{row.content_type.app_label}.{row.content_type.model}"].append(row)
    return grouped


def _photo_referenced(photo, config) -> bool:
    import json

    from apps.courses.models import Course, Video
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

    if config is not None:
        if config.logo_id == photo.pk:
            return True
        pk_str = str(photo.pk)
        if pk_str in json.dumps(config.pages or {}) or pk_str in json.dumps(
            config.landing_sections or {}
        ):
            return True
    return any(
        model.objects.filter(thumbnail=photo).exists()
        for model in (Course, Video, LiveClass, LiveStream, ZoomClass, OnsiteEvent)
    )


def _video_referenced(video) -> bool:
    from apps.courses.models import Lesson

    return Lesson.objects.filter(video=video).exists()


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def demo_content(request):
    ids = {key: [] for key in _ID_KEYS.values()}
    for label, rows in _rows_by_label().items():
        key = _ID_KEYS.get(label)
        if key:
            ids[key] = [row.object_id for row in rows]
    counts = {
        "courses": len(ids["courses"]),
        "downloads": len(ids["downloads"]),
        "plans": len(ids["plans"]),
        "bundles": len(ids["bundles"]),
        "live_events": sum(len(ids[k]) for k in _LIVE_ID_KEYS),
        "videos": len(ids["videos"]),
        "photos": len(ids["photos"]),
    }
    return Response(
        {"present": any(ids.values()), "counts": counts, "ids": ids}
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def erase_demo_content(request):
    deleted: dict[str, int] = {}
    kept: dict[str, int] = {}
    config = TenantConfig.objects.first()
    with transaction.atomic():
        grouped = _rows_by_label()
        for label in _ERASE_ORDER:
            count_key = _COUNT_KEYS[label]
            for row in grouped.get(label, []):
                model = row.content_type.model_class()
                obj = model.objects.filter(pk=row.object_id).first()
                if obj is None:
                    row.delete()
                    continue
                keep = (
                    fingerprint_for(obj) != row.fingerprint
                    or (label == "media.photo" and _photo_referenced(obj, config))
                    or (label == "courses.video" and _video_referenced(obj))
                )
                if keep:
                    kept[count_key] = kept.get(count_key, 0) + 1
                    row.delete()  # keep the object, drop the badge forever
                    continue
                obj.delete()
                row.delete()
                deleted[count_key] = deleted.get(count_key, 0) + 1
    return Response({"deleted": deleted, "kept": kept})
```

- [ ] **Step 4: Routes.** In `backend/apps/tenant_config/urls.py` add the import and paths:

```python
from .demo_content import demo_content, erase_demo_content
...
    path("demo-content/", demo_content, name="demo-content"),
    path("demo-content/erase/", erase_demo_content, name="demo-content-erase"),
```

- [ ] **Step 5: Run** — all 3 tests PASS. Then the whole app: `docker compose exec -T django pytest apps/tenant_config -v`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/demo_content.py backend/apps/tenant_config/urls.py \
  backend/apps/tenant_config/tests/test_demo_content.py
git commit -m "feat(setup): demo-content endpoints — ids for badges + fingerprint-guarded erase"
```

---

### Task 4: setup-status v2 — per-item checklist state + builder edit tracking

**Files:**
- Create: `backend/apps/tenant_config/setup_items.py`
- Modify: `backend/apps/tenant_config/views.py` (replace `setup_status` body; extend `TenantConfigView.perform_update`)
- Rewrite: `backend/apps/tenant_config/tests/test_setup_status.py`

**Interfaces:**
- Produces: `GET /api/v1/admin/setup-status/` → `{"items": [{key, group, done, source, optional}], "progress": {done, total}, "demo_present": bool, "dismissed": bool}`. Groups: `site | content | business | live | extras`. Core keys always present: `page_home page_about page_courses page_pricing page_faq page_contact look first_course payouts publish` (+ `demo_cleanup` only when the tenant was ever seeded). Optional keys (`optional: true`, group `extras`, excluded from progress): `first_download` (downloads module), `first_live` (live module), `first_announcement` (always), `share_site` (only when published), `studio_email` (only when paid tier active).
- Produces: `PATCH {"dismissed": bool}` (unchanged) and `PATCH {"item": key, "done": bool}` (manual override; 400 on unknown key). Both PATCH responses return the same full GET shape.
- Produces: saving the config through `TenantConfigView` records changed page keys in `setup_progress.pages_edited` and theme/font/logo changes as `setup_progress.look_edited`.

- [ ] **Step 1: Rewrite the test file** `backend/apps/tenant_config/tests/test_setup_status.py` with exactly:

```python
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.tenant_config.models import SeededObject, TenantConfig
from apps.tenant_config.seeding import register_seeded

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com", name="Coach", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.setup_progress = {}
    cfg.setup_guide_dismissed = False
    cfg.enabled_modules = ["courses", "downloads"]
    cfg.save()
    yield cfg
    SeededObject.objects.all().delete()


def _items(body):
    return {i["key"]: i for i in body["items"]}


def test_core_items_present_and_progress(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.get("/api/v1/admin/setup-status/").json()
    items = _items(body)
    for key in ("page_home", "page_faq", "look", "first_course", "payouts", "publish"):
        assert key in items, key
        assert items[key]["done"] is False
    assert "demo_cleanup" not in items  # never seeded
    assert body["progress"]["total"] == len([i for i in body["items"] if not i["optional"]])
    assert body["demo_present"] is False


def test_pages_edited_marks_page_items(client, config):
    config.setup_progress = {"pages_edited": ["home", "faq"]}
    config.save(update_fields=["setup_progress"])
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        items = _items(client.get("/api/v1/admin/setup-status/").json())
    assert items["page_home"]["done"] is True
    assert items["page_home"]["source"] == "auto"
    assert items["page_about"]["done"] is False


def test_first_course_ignores_untouched_demo(client, coach, config):
    demo = Course.objects.create(title="D", slug="d-setupv2", instructor=coach)
    register_seeded([demo], niche="general")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        items = _items(client.get("/api/v1/admin/setup-status/").json())
    assert items["first_course"]["done"] is False  # only demo content exists
    assert items["demo_cleanup"]["done"] is False  # registry non-empty
    demo.title = "Coach renamed me"
    demo.save()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        items = _items(client.get("/api/v1/admin/setup-status/").json())
    assert items["first_course"]["done"] is True  # edited demo counts as own
    demo.delete()


def test_manual_override_roundtrip(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.patch(
            "/api/v1/admin/setup-status/", {"item": "page_faq", "done": True}, format="json"
        ).json()
    assert _items(body)["page_faq"] == {
        "key": "page_faq", "group": "site", "done": True,
        "source": "manual", "optional": False,
    }
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.patch(
            "/api/v1/admin/setup-status/", {"item": "page_faq", "done": False}, format="json"
        ).json()
    assert _items(body)["page_faq"]["done"] is False


def test_manual_unknown_key_400(client, config):
    resp = client.patch(
        "/api/v1/admin/setup-status/", {"item": "hack_me", "done": True}, format="json"
    )
    assert resp.status_code == 400


def test_dismiss_roundtrip(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.patch(
            "/api/v1/admin/setup-status/", {"dismissed": True}, format="json"
        ).json()
    assert body["dismissed"] is True
    config.refresh_from_db()
    assert config.setup_guide_dismissed is True


def test_config_save_tracks_page_and_look_edits(client, config):
    from django.core.cache import cache
    from django.db import connection

    config.pages = {"home": {"blocks": []}, "about": {"blocks": []}}
    config.save(update_fields=["pages"])
    # TenantConfigView.get_object may serve a cached instance with stale pages
    # from an earlier test — clear it so the diff compares against the DB row.
    cache.delete(f"tenant:{connection.tenant.schema_name}:config")
    client.patch(
        "/api/v1/admin/config/",
        {"pages": {"home": {"blocks": [{"id": "b1", "type": "richText", "enabled": True}]},
                    "about": {"blocks": []}},
         "theme": "ember"},
        format="json",
    )
    config.refresh_from_db()
    assert config.setup_progress.get("pages_edited") == ["home"]  # about unchanged
    assert config.setup_progress.get("look_edited") is True
```

- [ ] **Step 2: Run to verify FAIL**: `docker compose exec -T django pytest apps/tenant_config/tests/test_setup_status.py -v`

- [ ] **Step 3: Create `backend/apps/tenant_config/setup_items.py`** with exactly:

```python
"""Computes the Setup Assistant checklist from live tenant state.

The API returns state only (key/group/done/source/optional) — titles,
descriptions, icons, and deep links live in the frontend catalog, where
next-intl owns the copy.
"""

from collections import defaultdict

from apps.core.monetization import can_monetize, is_paid_active

from .models import SeededObject
from .seeding import fingerprint_for

CORE_PAGE_KEYS = ("home", "about", "courses", "pricing", "faq", "contact")

ALL_ITEM_KEYS = frozenset(
    [f"page_{page}" for page in CORE_PAGE_KEYS]
    + [
        "look",
        "first_course",
        "demo_cleanup",
        "payouts",
        "publish",
        "first_download",
        "first_live",
        "first_announcement",
        "share_site",
        "studio_email",
    ]
)


def _seeded_by_label():
    grouped = defaultdict(list)
    for row in SeededObject.objects.select_related("content_type"):
        grouped[f"{row.content_type.app_label}.{row.content_type.model}"].append(row)
    return grouped


def _has_own(model, rows) -> bool:
    """A non-demo object exists: anything outside the registry, or a
    registered object whose content no longer matches its seed fingerprint."""
    if model.objects.exclude(pk__in=[row.object_id for row in rows]).exists():
        return True
    for row in rows:  # bounded by seed volume (small)
        obj = model.objects.filter(pk=row.object_id).first()
        if obj is not None and fingerprint_for(obj) != row.fingerprint:
            return True
    return False


def compute_setup_state(config, tenant) -> dict:
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
    from apps.notifications.models import Announcement

    progress = config.setup_progress or {}
    pages_edited = set(progress.get("pages_edited", []))
    manual = progress.get("manual", {})
    seeded = _seeded_by_label()
    seeded_rows_exist = any(seeded.values())
    was_seeded = seeded_rows_exist or getattr(tenant, "template_seed_status", "") == "ready"
    modules = config.enabled_modules or []
    published = bool(getattr(tenant, "is_published", False))

    items = []

    def add(key, group, auto, optional=False):
        done = bool(auto) or manual.get(key) is True
        source = "auto" if auto else ("manual" if manual.get(key) is True else None)
        items.append(
            {"key": key, "group": group, "done": done, "source": source, "optional": optional}
        )

    for page in CORE_PAGE_KEYS:
        add(f"page_{page}", "site", page in pages_edited)
    add(
        "look",
        "site",
        bool(progress.get("look_edited")) or bool(config.logo_id or config.logo_url),
    )
    add("first_course", "content", _has_own(Course, seeded.get("courses.course", [])))
    if was_seeded:
        add("demo_cleanup", "content", not seeded_rows_exist)
    add("payouts", "business", can_monetize(tenant))
    add("publish", "live", published)

    if "downloads" in modules:
        add(
            "first_download",
            "extras",
            _has_own(DownloadFile, seeded.get("downloads.downloadfile", [])),
            optional=True,
        )
    if "live" in modules:
        live_pairs = (
            (LiveClass, "live.liveclass"),
            (LiveStream, "live.livestream"),
            (ZoomClass, "live.zoomclass"),
            (OnsiteEvent, "live.onsiteevent"),
        )
        add(
            "first_live",
            "extras",
            any(_has_own(model, seeded.get(label, [])) for model, label in live_pairs),
            optional=True,
        )
    add("first_announcement", "extras", Announcement.objects.exists(), optional=True)
    if published:
        add("share_site", "extras", False, optional=True)
    if is_paid_active(tenant):
        from apps.domains.models import PlatformMailboxAddress

        add(
            "studio_email",
            "extras",
            PlatformMailboxAddress.objects.filter(tenant=tenant).exists(),
            optional=True,
        )

    core = [item for item in items if not item["optional"]]
    return {
        "items": items,
        "progress": {
            "done": sum(1 for item in core if item["done"]),
            "total": len(core),
        },
        "demo_present": seeded_rows_exist,
        "dismissed": config.setup_guide_dismissed,
    }
```

- [ ] **Step 4: Replace the `setup_status` view.** In `backend/apps/tenant_config/views.py`, replace the whole existing `setup_status` function with:

```python
@api_view(["GET", "PATCH"])
@permission_classes([IsCoachOrOwner])
def setup_status(request):
    """Setup Assistant state: per-item checklist + dismiss + manual overrides."""
    from .setup_items import ALL_ITEM_KEYS, compute_setup_state

    config = TenantConfig.objects.first()
    if config is None:
        return Response(status=404)
    if request.method == "PATCH":
        if "dismissed" in request.data:
            config.setup_guide_dismissed = bool(request.data["dismissed"])
            config.save(update_fields=["setup_guide_dismissed"])
        if "item" in request.data:
            key = str(request.data["item"])
            if key not in ALL_ITEM_KEYS:
                return Response({"detail": "unknown_item"}, status=400)
            progress = dict(config.setup_progress or {})
            manual = dict(progress.get("manual", {}))
            if bool(request.data.get("done")):
                manual[key] = True
            else:
                manual.pop(key, None)
            progress["manual"] = manual
            config.setup_progress = progress
            config.save(update_fields=["setup_progress"])
    return Response(compute_setup_state(config, connection.tenant))
```

(The old imports `Course`, `DownloadFile`, `can_monetize` may become unused in views.py — remove any that ruff flags.)

- [ ] **Step 5: Track builder edits.** In the same file, replace `TenantConfigView.perform_update` with:

```python
    def perform_update(self, serializer):
        # Snapshot pre-save values for Setup Assistant auto-detection. The
        # instance may come from cache; JSON-normalize for a fair comparison.
        import json as _json

        instance = serializer.instance
        old_pages = _json.loads(_json.dumps(instance.pages or {}, sort_keys=True))
        old_look = (instance.theme, instance.font_family, instance.logo_url, instance.logo_id)

        config = serializer.save()

        progress = dict(config.setup_progress or {})
        edited = set(progress.get("pages_edited", []))
        new_pages = _json.loads(_json.dumps(config.pages or {}, sort_keys=True))
        for key, value in new_pages.items():
            if old_pages.get(key) != value:
                edited.add(key)
        new_look = (config.theme, config.font_family, config.logo_url, config.logo_id)
        changed = False
        if sorted(edited) != progress.get("pages_edited", []):
            progress["pages_edited"] = sorted(edited)
            changed = True
        if new_look != old_look and not progress.get("look_edited"):
            progress["look_edited"] = True
            changed = True
        if changed:
            config.setup_progress = progress
            config.save(update_fields=["setup_progress"])

        cache_key = f"tenant:{connection.tenant.schema_name}:config"
        cache.delete(cache_key)
```

Known caveat (accepted in the spec): if the builder client normalizes blocks differently than the server stored them, a save could mark unchanged pages as edited once. The e2e walk in Task 9 checks that only the edited page flips.

- [ ] **Step 6: Run**: `docker compose exec -T django pytest apps/tenant_config -v` → all PASS (Tasks 1–4 files). Also run `docker compose exec -T django pytest apps/core -q` to catch seeder regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/tenant_config/setup_items.py backend/apps/tenant_config/views.py \
  backend/apps/tenant_config/tests/test_setup_status.py
git commit -m "feat(setup): setup-status v2 — per-item checklist, manual overrides, builder edit tracking"
```

---

### Task 5: Frontend data layer + item catalog + i18n

**Files:**
- Create: `frontend-customer/src/lib/setup-assistant.ts`
- Create: `frontend-customer/src/components/setup/catalog.ts`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces (Tasks 6–7 rely on):**
- `useSetupStatus(): SetupStatus | null`, `refreshSetupStatus()`, `patchSetup(body)`, `useDemoContent(): DemoContent | null`, `refreshDemoContent()`, `eraseDemoContent()` — all fail-soft (errors → null / no-op).
- `SETUP_CATALOG[key] -> {icon, href, action?}`, `SETUP_GROUP_ORDER`.
- i18n namespace `admin.setup.*`.

- [ ] **Step 1: Create `frontend-customer/src/lib/setup-assistant.ts`:**

```ts
import { useEffect, useState } from 'react'

import { clientFetch } from '@/lib/api-client'

export type SetupGroup = 'site' | 'content' | 'business' | 'live' | 'extras'

export interface SetupItem {
  key: string
  group: SetupGroup
  done: boolean
  source: 'auto' | 'manual' | null
  optional: boolean
}

export interface SetupStatus {
  items: SetupItem[]
  progress: { done: number; total: number }
  demo_present: boolean
  dismissed: boolean
}

export interface DemoContent {
  present: boolean
  counts: Record<string, number>
  ids: Record<string, string[]>
}

// Module-level caches: every mount point (bubble, panel, sidebar row,
// dashboard card, badges) shares one fetch and stays in sync.
let statusCache: SetupStatus | null = null
const statusListeners = new Set<(s: SetupStatus | null) => void>()
let statusInflight: Promise<void> | null = null

function broadcastStatus(next: SetupStatus | null) {
  statusCache = next
  statusListeners.forEach((listener) => listener(next))
}

export function refreshSetupStatus(): Promise<void> {
  statusInflight ??= clientFetch<SetupStatus>('/api/v1/admin/setup-status/')
    .then(broadcastStatus)
    .catch(() => {}) // fail-soft: surfaces render nothing
    .finally(() => {
      statusInflight = null
    }) as Promise<void>
  return statusInflight
}

export function useSetupStatus(): SetupStatus | null {
  const [status, setStatus] = useState<SetupStatus | null>(statusCache)
  useEffect(() => {
    statusListeners.add(setStatus)
    if (statusCache === null) void refreshSetupStatus()
    return () => {
      statusListeners.delete(setStatus)
    }
  }, [])
  return status
}

export async function patchSetup(body: Record<string, unknown>): Promise<void> {
  try {
    const next = await clientFetch<SetupStatus>('/api/v1/admin/setup-status/', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    broadcastStatus(next)
  } catch {
    /* fail-soft */
  }
}

let demoCache: DemoContent | null = null
const demoListeners = new Set<(d: DemoContent | null) => void>()
let demoInflight: Promise<void> | null = null

function broadcastDemo(next: DemoContent | null) {
  demoCache = next
  demoListeners.forEach((listener) => listener(next))
}

export function refreshDemoContent(): Promise<void> {
  demoInflight ??= clientFetch<DemoContent>('/api/v1/admin/demo-content/')
    .then(broadcastDemo)
    .catch(() => {})
    .finally(() => {
      demoInflight = null
    }) as Promise<void>
  return demoInflight
}

export function useDemoContent(): DemoContent | null {
  const [demo, setDemo] = useState<DemoContent | null>(demoCache)
  useEffect(() => {
    demoListeners.add(setDemo)
    if (demoCache === null) void refreshDemoContent()
    return () => {
      demoListeners.delete(setDemo)
    }
  }, [])
  return demo
}

export async function eraseDemoContent(): Promise<Record<string, number> | null> {
  try {
    const res = await clientFetch<{ deleted: Record<string, number> }>(
      '/api/v1/admin/demo-content/erase/',
      { method: 'POST' }
    )
    await Promise.all([refreshSetupStatus(), refreshDemoContent()])
    return res.deleted
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Create `frontend-customer/src/components/setup/catalog.ts`:**

```ts
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Download,
  FileQuestion,
  Home,
  Info,
  Mail,
  Megaphone,
  Paintbrush,
  Phone,
  Rocket,
  Share2,
  Tag,
  Trash2,
  Video,
  Wallet,
} from 'lucide-react'

export interface CatalogEntry {
  icon: LucideIcon
  /** Deep link the row navigates to; null rows trigger `action` instead. */
  href: string | null
  action?: 'erase' | 'copy-link'
}

export const SETUP_GROUP_ORDER = ['site', 'content', 'business', 'live', 'extras'] as const

export const SETUP_CATALOG: Record<string, CatalogEntry> = {
  page_home: { icon: Home, href: '/' },
  page_about: { icon: Info, href: '/about' },
  page_courses: { icon: BookOpen, href: '/courses' },
  // The builder's "pricing" page renders at /plans on the tenant site.
  page_pricing: { icon: Tag, href: '/plans' },
  page_faq: { icon: FileQuestion, href: '/faq' },
  page_contact: { icon: Phone, href: '/contact' },
  look: { icon: Paintbrush, href: '/admin/design' },
  first_course: { icon: BookOpen, href: '/admin/courses/new' },
  demo_cleanup: { icon: Trash2, href: null, action: 'erase' },
  payouts: { icon: Wallet, href: '/admin/payouts' },
  publish: { icon: Rocket, href: '/admin#publish-card' },
  first_download: { icon: Download, href: '/admin/downloads' },
  first_live: { icon: Video, href: '/admin/live' },
  first_announcement: { icon: Megaphone, href: '/admin/notifications' },
  share_site: { icon: Share2, href: null, action: 'copy-link' },
  studio_email: { icon: Mail, href: '/admin/inbox' },
}
```

- [ ] **Step 3: i18n.** In `frontend-customer/messages/en/admin.json`, add a top-level `"setup"` key (sibling of `"nav"`):

```json
"setup": {
  "title": "Get your studio live",
  "progressLabel": "{done} of {total} done",
  "bubbleLabel": "Setup guide",
  "openFull": "Open the setup guide",
  "dismiss": "Hide the guide",
  "show": "Show setup guide",
  "niceToHave": "Nice to have",
  "markDone": "Mark as done",
  "markUndone": "Mark as not done",
  "celebrateTitle": "You're live! 🎉",
  "celebrateBody": "Everything is set up. Share your site with your students!",
  "copyLink": "Copy your site link",
  "copied": "Link copied!",
  "groups": {
    "site": "Your site",
    "content": "Your content",
    "business": "Getting paid",
    "live": "Go live",
    "extras": "Nice to have"
  },
  "items": {
    "page_home": { "title": "Home page", "description": "Make the first thing visitors see yours." },
    "page_about": { "title": "About page", "description": "Tell your story in your own words." },
    "page_courses": { "title": "Programs page", "description": "Check how your programs are presented." },
    "page_pricing": { "title": "Pricing page", "description": "Review the plans your students will see." },
    "page_faq": { "title": "FAQ page", "description": "Answer the questions students ask most." },
    "page_contact": { "title": "Contact page", "description": "Make sure students can reach you." },
    "look": { "title": "Pick your look", "description": "Choose your colors, font and logo." },
    "first_course": { "title": "Create your first course", "description": "Replace the examples with something of your own." },
    "demo_cleanup": { "title": "Remove the demo content", "description": "Clear the example courses, photos and videos." },
    "payouts": { "title": "Set up how you get paid", "description": "Connect payouts so students can buy from you." },
    "publish": { "title": "Publish your site", "description": "Flip the switch when you are ready for the world." },
    "first_download": { "title": "Add a download", "description": "Share a worksheet, plan or guide." },
    "first_live": { "title": "Schedule a live session", "description": "Put your first class on the calendar." },
    "first_announcement": { "title": "Send an announcement", "description": "Say hello to your students." },
    "share_site": { "title": "Share your site", "description": "Copy your link and send it to your students." },
    "studio_email": { "title": "Pick your studio email address", "description": "Get your own address for student mail." }
  },
  "demoBadge": "Demo",
  "erase": {
    "title": "Remove demo content?",
    "body": "This removes the example content that came with your site:",
    "countCourses": "{count} courses",
    "countDownloads": "{count} downloads",
    "countLive": "{count} live sessions",
    "countPlans": "{count} plans",
    "countBundles": "{count} bundles",
    "countVideos": "{count} videos",
    "countPhotos": "{count} photos",
    "keepNote": "Anything you've edited will be kept.",
    "confirm": "Remove demo content",
    "cancel": "Cancel",
    "success": "Demo content removed",
    "error": "Something went wrong — nothing was removed. Please try again."
  }
}
```

and the Turkish mirror in `messages/tr/admin.json` (translate naturally, same keys — e.g. `"title": "Stüdyonu yayına hazırla"`, `"demoBadge": "Örnek"`, `"erase.confirm": "Örnek içeriği kaldır"`, `"keepNote": "Düzenlediğin hiçbir şey silinmez."`, items translated in the same warm, non-technical tone).

- [ ] **Step 4: Typecheck**: `cd frontend-customer && npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/setup-assistant.ts frontend-customer/src/components/setup/catalog.ts \
  frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(setup): assistant data layer, item catalog, en+tr copy"
```

---

### Task 6: Assistant UI — panel, bubble, dashboard card, edit-sidebar row

**Files:**
- Create: `frontend-customer/src/components/setup/setup-assistant-panel.tsx`
- Create: `frontend-customer/src/components/setup/setup-assistant-bubble.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx` (mount bubble)
- Rewrite: `frontend-customer/src/components/admin/setup-guide-card.tsx` (slim summary)
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx` (progress row replaces "Continue setup")

**Interfaces:**
- Consumes Task 5's hooks + catalog.
- Produces: `<SetupAssistantPanel open onClose />` (portal slide-over) and `<SetupAssistantBubble />` (self-contained: bubble + its own panel instance).

- [ ] **Step 1: Create `setup-assistant-panel.tsx`:**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, ChevronRight, Copy, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ModalPortal } from '@/components/ui/modal-portal'
import { EraseDemoDialog } from '@/components/setup/erase-demo-dialog'
import { SETUP_CATALOG, SETUP_GROUP_ORDER } from '@/components/setup/catalog'
import {
  patchSetup,
  useDemoContent,
  useSetupStatus,
  type SetupItem,
} from '@/lib/setup-assistant'

export function SetupAssistantPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const t = useTranslations('admin')
  const status = useSetupStatus()
  const demo = useDemoContent()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [eraseOpen, setEraseOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!open || !status) return null

  const { items, progress } = status
  const allDone = progress.done === progress.total
  const groups = SETUP_GROUP_ORDER.map((group) => ({
    group,
    rows: items.filter((item) => item.group === group),
  })).filter(({ rows }) => rows.length > 0)

  const copySiteLink = () => {
    void navigator.clipboard.writeText(window.location.origin)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    void patchSetup({ item: 'share_site', done: true })
  }

  const renderRow = (item: SetupItem) => {
    const entry = SETUP_CATALOG[item.key]
    if (!entry) return null
    const Icon = entry.icon
    const title = t(`setup.items.${item.key}.title`)
    const description = t(`setup.items.${item.key}.description`)
    const checkCircle = (
      <button
        type="button"
        aria-label={item.done ? t('setup.markUndone') : t('setup.markDone')}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Manual toggle; unticking only clears a manual tick — auto wins.
          void patchSetup({ item: item.key, done: !item.done })
        }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
          item.done
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30 bg-background text-muted-foreground hover:border-primary'
        }`}
      >
        {item.done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
      </button>
    )
    const body = (
      <>
        {checkCircle}
        <span className="min-w-0 flex-1 text-left">
          <span
            className={`block text-sm font-medium ${item.done ? 'text-muted-foreground line-through' : ''}`}
          >
            {title}
            {item.key === 'demo_cleanup' && demo?.present ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({demo.counts.courses + demo.counts.videos + demo.counts.photos}+)
              </span>
            ) : null}
          </span>
          {!item.done && (
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          )}
        </span>
        {!item.done && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </>
    )
    const rowClass = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50 ${
      item.done ? 'opacity-70' : ''
    }`
    if (entry.action === 'erase') {
      return (
        <button type="button" onClick={() => setEraseOpen(true)} className={rowClass}>
          {body}
        </button>
      )
    }
    if (entry.action === 'copy-link') {
      return (
        <button type="button" onClick={copySiteLink} className={rowClass}>
          {body}
        </button>
      )
    }
    return (
      <Link href={entry.href ?? '/admin'} onClick={onClose} className={rowClass}>
        {body}
      </Link>
    )
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label={t('setup.dismiss')}
          onClick={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-background shadow-xl">
          <div className="border-b p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {allDone ? t('setup.celebrateTitle') : t('setup.title')}
              </h2>
              <button
                type="button"
                aria-label={t('setup.dismiss')}
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {allDone ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('setup.celebrateBody')}</p>
                <button
                  type="button"
                  onClick={copySiteLink}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? t('setup.copied') : t('setup.copyLink')}
                </button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  {t('setup.progressLabel', { done: progress.done, total: progress.total })}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {groups.map(({ group, rows }) => (
              <div key={group} className="mb-2">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t(`setup.groups.${group}`)}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${collapsed[group] ? '-rotate-90' : ''}`}
                  />
                </button>
                {!collapsed[group] && (
                  <ul className="space-y-0.5">
                    {rows.map((item) => (
                      <li key={item.key}>{renderRow(item)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="border-t p-3 text-center">
            <button
              type="button"
              onClick={() => {
                void patchSetup({ dismissed: true })
                onClose()
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {t('setup.dismiss')}
            </button>
          </div>
        </aside>
      </div>
    </ModalPortal>
  )
}
```

(`EraseDemoDialog` is created in Task 7 — to keep this task compiling, ALSO create the stub file now; Task 7 fills it in:)

`frontend-customer/src/components/setup/erase-demo-dialog.tsx` (stub for this task):

```tsx
'use client'

export function EraseDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  void open
  void onClose
  return null
}
```

and render it at the bottom of the panel's `<aside>`, before `</aside>`:

```tsx
          <EraseDemoDialog open={eraseOpen} onClose={() => setEraseOpen(false)} />
```

- [ ] **Step 2: Create `setup-assistant-bubble.tsx`:**

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { SetupAssistantPanel } from '@/components/setup/setup-assistant-panel'
import { useSetupStatus } from '@/lib/setup-assistant'

/** Always-on floating entry point, /admin pages only (the tenant site's
 *  bottom-right corner belongs to the EditButton). */
export function SetupAssistantBubble() {
  const t = useTranslations('admin')
  const status = useSetupStatus()
  const [open, setOpen] = useState(false)

  if (!status || status.dismissed) return null
  const { done, total } = status.progress
  if (total > 0 && done === total && !open) return null // celebrated + closed → gone

  const radius = 16
  const circumference = 2 * Math.PI * radius
  const ratio = total > 0 ? done / total : 0

  return (
    <>
      <button
        type="button"
        aria-label={t('setup.bubbleLabel')}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border bg-background py-2 pl-2 pr-4 text-sm font-medium shadow-lg transition-all hover:scale-105 hover:shadow-xl"
      >
        <span className="relative flex h-9 w-9 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
            <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3" className="stroke-muted" />
            <circle
              cx="18"
              cy="18"
              r={radius}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className="stroke-primary transition-all"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ratio)}
            />
          </svg>
        </span>
        <span>
          {done}/{total}
        </span>
      </button>
      <SetupAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

- [ ] **Step 3: Mount in AdminShell.** In `admin-shell.tsx`, add `import { SetupAssistantBubble } from "@/components/setup/setup-assistant-bubble";` and render `<SetupAssistantBubble />` directly before `<ImpersonationBanner />`.

- [ ] **Step 4: Rewrite `setup-guide-card.tsx`** (keep the exported name `SetupGuideCard` so `admin/page.tsx` is untouched):

```tsx
'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Card, CardContent } from '@/components/ui/card'
import { SETUP_CATALOG } from '@/components/setup/catalog'
import { SetupAssistantPanel } from '@/components/setup/setup-assistant-panel'
import { patchSetup, useSetupStatus } from '@/lib/setup-assistant'

export function SetupGuideCard() {
  const t = useTranslations('admin')
  const status = useSetupStatus()
  const [open, setOpen] = useState(false)

  if (!status) return null

  if (status.dismissed) {
    return (
      <button
        type="button"
        onClick={() => void patchSetup({ dismissed: false })}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t('setup.show')}
      </button>
    )
  }

  const { done, total } = status.progress
  const next = status.items.filter((i) => !i.optional && !i.done).slice(0, 3)
  const allDone = done === total

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {allDone ? t('setup.celebrateTitle') : t('setup.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {allDone
                  ? t('setup.celebrateBody')
                  : t('setup.progressLabel', { done, total })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              {t('setup.openFull')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
            />
          </div>
          {!allDone && (
            <ul className="space-y-1">
              {next.map((item) => {
                const Icon = SETUP_CATALOG[item.key]?.icon
                return (
                  <li key={item.key} className="flex items-center gap-2 text-sm">
                    {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
                    {t(`setup.items.${item.key}.title`)}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SetupAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

- [ ] **Step 5: Edit-sidebar row.** In `frontend-customer/src/components/owner/edit-sidebar.tsx`, replace the first-run "Continue setup" block (the `{!initialConfig.onboarding_completed && (<a href="/admin" ...>Continue setup...</a>)}` region around line 250) with a progress row that opens the panel in place:

```tsx
                  {/* Always-on setup progress: same panel as /admin */}
                  <SetupSidebarRow minWidth={SIDEBAR_WIDTH} />
```

and add at the bottom of the same file (or a small sibling component inside the file, matching its local-component style):

```tsx
function SetupSidebarRow({ minWidth }: { minWidth: number }) {
  const [open, setOpen] = useState(false)
  const status = useSetupStatus()
  if (!status || status.dismissed) return null
  const { done, total } = status.progress
  if (total > 0 && done === total) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between border-b bg-primary/5 px-5 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        style={{ minWidth }}
      >
        <span>
          Setup · {done} of {total}
        </span>
        <ArrowRight className="h-4 w-4" />
      </button>
      <SetupAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

Add imports: `useSetupStatus` from `@/lib/setup-assistant`, `SetupAssistantPanel` from `@/components/setup/setup-assistant-panel` (`useState` and `ArrowRight` are already imported in this file). NOTE: the edit sidebar renders on the tenant PUBLIC site — it may not sit under the next-intl `admin` provider, which is why `SetupSidebarRow` uses plain strings ("Setup · X of Y"); if `useTranslations('admin')` works in this tree (check neighboring components), prefer `t('setup.progressLabel', ...)`.

- [ ] **Step 6: Verify** — `cd frontend-customer && npx tsc --noEmit` → clean. Then eyeball in the browser: `/admin` shows the bubble bottom-right; clicking opens the panel; dashboard card shows progress + next 3; site edit mode shows the "Setup · X of Y" row.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/components/setup/ frontend-customer/src/components/admin/admin-shell.tsx \
  frontend-customer/src/components/admin/setup-guide-card.tsx frontend-customer/src/components/owner/edit-sidebar.tsx
git commit -m "feat(setup): always-on assistant — bubble, slide-over checklist, sidebar row, slim dashboard card"
```

---

### Task 7: Demo badges + erase dialog + settings entry

**Files:**
- Create: `frontend-customer/src/components/setup/demo-badge.tsx`
- Rewrite stub: `frontend-customer/src/components/setup/erase-demo-dialog.tsx`
- Modify: admin list pages — `src/app/admin/courses/page.tsx`, `src/app/admin/downloads/page.tsx`, `src/app/admin/photos/page.tsx`, `src/app/admin/videos/page.tsx`, `src/app/admin/live/page.tsx` (and its per-type lists if split into components)
- Modify: `src/app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `useDemoContent`, `eraseDemoContent`, `refreshSetupStatus` from Task 5.
- Produces: `<DemoBadge type="courses" id={...} />`, working `<EraseDemoDialog open onClose />`.

- [ ] **Step 1: `demo-badge.tsx`:**

```tsx
'use client'

import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { useDemoContent, type DemoContent } from '@/lib/setup-assistant'

export type DemoType = keyof DemoContent['ids'] | string

export function DemoBadge({ type, id }: { type: DemoType; id: string | number }) {
  const t = useTranslations('admin')
  const demo = useDemoContent()
  if (!demo?.ids?.[type as string]?.includes(String(id))) return null
  return (
    <Badge variant="secondary" className="ml-2 align-middle text-[10px] uppercase">
      {t('setup.demoBadge')}
    </Badge>
  )
}
```

- [ ] **Step 2: Fill in `erase-demo-dialog.tsx`** (replaces the Task 6 stub):

```tsx
'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ModalPortal } from '@/components/ui/modal-portal'
import { eraseDemoContent, useDemoContent } from '@/lib/setup-assistant'

export function EraseDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('admin')
  const demo = useDemoContent()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  if (!open || !demo?.present) return null

  const counts = demo.counts
  const lines = [
    counts.courses > 0 && t('setup.erase.countCourses', { count: counts.courses }),
    counts.downloads > 0 && t('setup.erase.countDownloads', { count: counts.downloads }),
    counts.live_events > 0 && t('setup.erase.countLive', { count: counts.live_events }),
    counts.plans > 0 && t('setup.erase.countPlans', { count: counts.plans }),
    counts.bundles > 0 && t('setup.erase.countBundles', { count: counts.bundles }),
    counts.videos > 0 && t('setup.erase.countVideos', { count: counts.videos }),
    counts.photos > 0 && t('setup.erase.countPhotos', { count: counts.photos }),
  ].filter(Boolean) as string[]

  const confirm = async () => {
    setBusy(true)
    setError(false)
    const deleted = await eraseDemoContent()
    setBusy(false)
    if (deleted === null) {
      setError(true)
      return
    }
    onClose()
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button type="button" aria-label={t('setup.erase.cancel')} onClick={onClose} className="absolute inset-0 bg-black/50" />
        <div className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-base font-semibold">{t('setup.erase.title')}</h3>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">{t('setup.erase.body')}</p>
          <ul className="mb-3 list-inside list-disc text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mb-4 text-sm font-medium">{t('setup.erase.keepNote')}</p>
          {error && <p className="mb-3 text-sm text-destructive">{t('setup.erase.error')}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              {t('setup.erase.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('setup.erase.confirm')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
```

- [ ] **Step 3: Badges in list pages.** For each page below, import `DemoBadge` and attach it next to the item title render. The `type` prop must match the API `ids` keys. If a page's list payload does not expose the row's `id`, skip that page and record the deviation in the final report.
  - `src/app/admin/courses/page.tsx` — next to `{course.title}` (~line 166): `<DemoBadge type="courses" id={course.id} />`
  - `src/app/admin/downloads/page.tsx` — next to the download title render: `type="downloads"`
  - `src/app/admin/photos/page.tsx` — on the photo card title/overlay: `type="photos"`
  - `src/app/admin/videos/page.tsx` — next to the video title: `type="videos"`
  - `src/app/admin/live/page.tsx` (or its per-type list components) — map each list to its type: `live_classes`, `live_streams`, `zoom_classes`, `onsite_events`.

- [ ] **Step 4: Settings entry.** In `src/app/admin/settings/page.tsx`, add a "Demo content" card/section (visible only while `useDemoContent()?.present`) with the demo counts one-liner and a destructive-styled button opening `<EraseDemoDialog />` — so the erase action survives guide dismissal. Follow the page's existing card/section pattern.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; in the browser a freshly seeded tenant shows "Demo" badges on courses/photos/videos/downloads/live lists; Settings shows the section; erase removes content, badges disappear, assistant's `demo_cleanup` flips done.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/setup/ frontend-customer/src/app/admin/
git commit -m "feat(setup): demo badges on admin lists + destructive erase dialog + settings entry"
```

---

### Task 8: Backfill command (QA convenience for pre-registry tenants)

**Files:**
- Create: `backend/apps/core/management/commands/backfill_seed_registry.py`

**Interfaces:** consumes `register_seeded`. Manual-only; never auto-run.

- [ ] **Step 1: Create the command:**

```python
"""Best-effort demo registry backfill for tenants seeded BEFORE the registry
existed. Registers objects that are recognizably demo (media pointing at the
shared demo/* bucket keys, and content referencing that media). Run
consciously, per tenant; never wired into deploy.

Usage: python manage.py backfill_seed_registry <schema_name>
"""

from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Register recognizably-demo objects of one tenant in the SeededObject registry."

    def add_arguments(self, parser):
        parser.add_argument("schema_name")

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(schema_name=options["schema_name"])
        except Tenant.DoesNotExist as exc:
            raise CommandError(f"No tenant {options['schema_name']}") from exc

        with tenant_context(tenant):
            from apps.billing.models import Bundle, SubscriptionPlan
            from apps.courses.models import Course, Video
            from apps.downloads.models import DownloadFile
            from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
            from apps.media.models import Photo
            from apps.tenant_config.seeding import register_seeded

            demo_photos = list(Photo.objects.filter(s3_key__startswith="demo/"))
            demo_videos = list(Video.objects.filter(s3_key__startswith="demo/"))
            objs = [*demo_photos, *demo_videos]
            objs += list(Course.objects.filter(thumbnail__in=demo_photos))
            objs += list(DownloadFile.objects.filter(file_url__startswith="demo/"))
            for model in (LiveClass, LiveStream, ZoomClass, OnsiteEvent):
                objs += list(model.objects.filter(thumbnail__in=demo_photos))
            # Plans/bundles only if the tenant was template-seeded (they have
            # no media signature to key off).
            if tenant.template_seed_status == "ready":
                objs += list(SubscriptionPlan.objects.all())
                objs += list(Bundle.objects.all())

            register_seeded(objs, niche=tenant.template_niche or "backfill")
            self.stdout.write(self.style.SUCCESS(f"Registered {len(objs)} objects."))
```

- [ ] **Step 2: Smoke it** against a dev tenant: `docker compose exec -T django python manage.py backfill_seed_registry <some_dev_schema>` → prints a count, reruns are idempotent (`ignore_conflicts`).

- [ ] **Step 3: Commit**

```bash
git add backend/apps/core/management/commands/backfill_seed_registry.py
git commit -m "feat(setup): best-effort seed-registry backfill command"
```

---

### Task 9: Final verification (all must pass before handing back)

- [ ] **1. Backend:** `docker compose exec -T django pytest apps/tenant_config apps/core -q` → green (mailbox teardown errors live elsewhere and don't run here).
- [ ] **2. Frontend:** `cd frontend-customer && npm run build` → "✓ Compiled successfully". Also `cd frontend-main && npm run build` (untouched, but confirms no cross-app type breakage).
- [ ] **3. Rebuild dev containers:** `docker compose build nextjs-customer && docker compose up -d nextjs-customer`.
- [ ] **4. Browser funnel walk** (dev stack, email sink on):
  - a. `http://localhost/signup` → brand "Assistant Test Studio", email `assistant-test@example.com`; fetch the verify link via `curl -s "http://localhost/api/v1/dev/emails/latest/?to=assistant-test@example.com"`; pick **Something else** → Continue → wait Ready → open the studio (auto-logged-in).
  - b. Edit sidebar shows **"Setup · X of Y"** row; click → panel opens on the tenant site.
  - c. Go to `/admin`: floating bubble bottom-right with matching fraction; dashboard shows the slim card with next 3 items.
  - d. Edit the About page in the builder + save → `page_about` flips done (auto); OTHER page items stay undone (this validates the diff — if all pages flip, the client normalizes blocks; investigate before proceeding).
  - e. `/admin/courses`: demo courses show "Demo" badges. Create a real course → `first_course` flips done.
  - f. Edit ONE demo course's title. Open the erase dialog from the panel (counts listed) → confirm → list now shows only the edited demo course (badge gone) + your real course; photos/videos libraries shrink accordingly; `demo_cleanup` flips done.
  - g. Manual tick: check `page_faq` via its circle → persists across reload; untick works.
  - h. Connect payouts (dev bypass/Stripe test) → `payouts` done. Publish → `publish` done → celebration state in panel + card; copy-link works; bubble disappears after closing.
  - i. Dismiss/re-show round-trip via panel footer + dashboard link.
  - Screenshot each state if the harness allows.
- [ ] **5. Leave the branch UNMERGED and UNPUSHED. Do not touch `main`.** Report task-by-task status, test counts, funnel-walk results, and any deviations (especially list pages whose payloads lacked `id` for badges, and any page-diff false positives observed in step 4d).
