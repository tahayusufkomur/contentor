# Wizard Content-Creation APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the content-first wizard the backend it writes into: onboarding endpoints that create a real course, event, and blog post in the tenant schema from wizard-token auth, plus an AI endpoint that drafts three course outlines to choose from.

**Architecture:** These are public-schema onboarding views (wizard token in the request body, like every other `onboarding/wizard/*` endpoint) that enter `tenant_context` and write real rows — the exact pattern `provision_tenant`'s `_seed_starter_post` already uses to create a `BlogPost` in the tenant schema. Content is created **as the tenant owner** (fetched inside the schema), not `request.user` (there is no coach JWT during the wizard). The AI course-outline endpoint copies the frozen-system-prompt `core_ai.structured` pattern used by `ai_compose`.

**Tech Stack:** Django 5.1, DRF, django-tenants, Anthropic via `apps.core.ai`, pytest, Docker Compose.

## Why this plan exists (context for a fresh engineer)

Plan 3a made the tenant schema exist early (`provisioning_status="provisioned"`). Plan 3b (frontend) will render content steps. This plan is the middle layer: the endpoints those steps POST to. They must work under **wizard-token auth** (no session/JWT yet) and write into the tenant schema — which the coach-facing content APIs (`POST /api/v1/courses/` etc., `IsCoachOrOwner` + tenant JWT) cannot do during signup.

**Verified facts this plan relies on** (file:line):
- Wizard views resolve the tenant with `_resolve_tenant_from_wizard_token(request) -> (payload, tenant, err)` (`backend/apps/core/onboarding/wizard.py:29-57`).
- Writing tenant content from an onboarding task is done inside `with tenant_context(tenant):` (`backend/apps/core/tasks.py`, `_seed_starter_post`/`create_starter_post`).
- The owner user exists in the tenant schema with `role="owner"`, `is_staff=True` (created by `provision_tenant_schema`, Plan 3a).
- `Course.save()` auto-generates a unique slug from `title` (`backend/apps/courses/models.py:39-46`); `Course.instructor` is a required FK. `CourseCreateUpdateSerializer` requires only `title`.
- `LiveClass`/`OnsiteEvent` create serializers require only `title` (and set status `scheduled` when `scheduled_at` is provided, via `_ScheduledOnCreateMixin`, `apps/live/serializers.py:54`).
- AI calls go through `core_ai.structured(system=FROZEN, user=..., output_model=Pydantic, model=settings.ONBOARDING_AI_MODEL, max_tokens=...)` and raise `core_ai.AiError` (carrying `.cost_usd`) on failure. Onboarding AI availability + spend accounting: `ai_compose.compose_available()`, `ai_compose.record_spend(schema, usd)`.

## Global Constraints

- **Wizard-token auth only.** Every endpoint is `@authentication_classes([])` + `@permission_classes([AllowAny])` and resolves the tenant via `_resolve_tenant_from_wizard_token`. Never require a coach JWT.
- **The tenant must be `provisioned` (or `ready`) before content writes.** If `provisioning_status` is `pending`/`provisioning`, return `409 {"detail": "provisioning"}` so the frontend keeps polling — content can't be written before the schema exists.
- **Create as the owner, in `tenant_context`.** Fetch the owner inside the schema; never reference `request.user`.
- **Content the coach creates is their own (not seeded).** Do NOT `register_seeded()` these rows — they are the coach's real content and must satisfy the publish gate's `_has_own` check. (Seeded starter content is Plan 4 and is registered separately.)
- **Courses/events created here are published-ready per the spec:** the course is created `is_published=True`; events default to their scheduled state. The blog post is created `status="published"` only when the coach approves it (default draft otherwise).
- **AI endpoints are fail-soft.** If `compose_available()` is false or the model errors, the outline endpoint returns a small deterministic fallback set (never a 500), so a coach without AI can still proceed.
- Tests run in Docker: `docker compose exec django pytest <path> -n auto`, dev stack up.

## Scope boundaries

- No frontend (Plan 3b).
- No seeding of *extra* draft products or starter posts (Plan 4).
- No reveal/compose (Plan 3d).
- The blog endpoint here creates a post from a title/body the coach provides or a single AI draft; it does **not** build the reveal chat (Plan 5).

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/onboarding/content.py` | create | The four content endpoints + shared `_wizard_content_setup` helper. |
| `backend/apps/core/onboarding/course_outlines.py` | create | AI course-outline generation (frozen prompt, pydantic model, fallback). |
| `backend/apps/core/onboarding/urls.py` | modify | Route `wizard/content/*`. |
| `backend/apps/core/tests/test_wizard_content.py` | create | Endpoint tests (real schema, tenant_context assertions). |

---

### Task 1: Shared content plumbing + course-outline AI endpoint

**Files:**
- Create: `backend/apps/core/onboarding/content.py` (`_wizard_content_setup`)
- Create: `backend/apps/core/onboarding/course_outlines.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_content.py` (create)

**Interfaces:**
- Produces: `_wizard_content_setup(request) -> (tenant, owner, err)` — resolves the wizard token, enforces `provisioned`/`ready`, and returns the tenant + its owner `User` (or an error `Response`). `generate_course_outlines(brief, tenant_schema) -> list[dict]` returning up to 3 `{title, description, suggested_price}` dicts (AI, with a deterministic fallback). `POST /api/v1/onboarding/wizard/content/course-outlines/`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_wizard_content.py`. Reuse the real-schema harness from Plan 3a's `test_lazy_provisioning.py` (create tenant, `provision_tenant_schema`, drop in `finally`):

```python
"""Wizard content endpoints write real rows into the tenant schema under
wizard-token auth. Mirror test_provision_tenant.py's real-schema pattern."""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def client():
    return APIClient()


def _provisioned_tenant(schema="wcontent"):
    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name=schema,
        name=schema,
        slug=schema,
        subdomain=schema,
        owner_email=f"{schema}@example.com",
        region="global",
    )
    provision_tenant_schema(t, t.owner_email, "Owner", "en")  # status -> provisioned
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def _token(t):
    return create_wizard_token(t.owner_email, t.name, t.slug, region=t.region)


def test_course_outlines_returns_options(client, restore_public):
    t = _provisioned_tenant("wc_outlines")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course-outlines/",
            {"token": _token(t)},
            format="json",
        )
        assert resp.status_code == 200
        outlines = resp.json()["outlines"]
        assert 1 <= len(outlines) <= 3
        assert "title" in outlines[0]
    finally:
        _drop("wc_outlines")


def test_content_endpoint_rejects_unprovisioned_tenant(client, restore_public):
    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name="wc_pending", name="wc-pending", slug="wc-pending",
        subdomain="wc-pending", owner_email="p@example.com", region="global",
    )  # still 'pending', no schema
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course-outlines/",
            {"token": _token(t)},
            format="json",
        )
        assert resp.status_code == 409
    finally:
        Tenant.objects.filter(pk=t.pk).delete()
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -v`

Expected: FAIL — routes 404.

- [ ] **Step 3: Implement the outline generator**

Create `backend/apps/core/onboarding/course_outlines.py`:

```python
"""AI course-outline suggestions for the wizard content step. Frozen system
prompt (prompt caching); all coach specifics ride the user turn. Fail-soft: a
deterministic fallback keeps the wizard moving when AI is unavailable."""

import logging

from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.onboarding import ai_compose

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You design first-course outlines for online coaches. Given a coach's niche "
    "and description, propose exactly three distinct, sellable first courses. "
    "Each: a concrete title (<=60 chars), a 1-2 sentence description, and a "
    "suggested price in whole units of their currency (0 for a free intro). "
    "Practical, specific to their niche, never generic."
)
MAX_OUTPUT_TOKENS = 900


class _Outline(BaseModel):
    title: str
    description: str
    suggested_price: int


class _Outlines(BaseModel):
    outlines: list[_Outline]


def _fallback(brief) -> list[dict]:
    niche = (getattr(brief, "niche", "") or "your topic").replace("_", " ")
    return [
        {"title": f"Getting Started with {niche.title()}", "description": f"A beginner-friendly intro to {niche}.", "suggested_price": 0},
        {"title": f"{niche.title()} Fundamentals", "description": f"The core skills every {niche} student needs.", "suggested_price": 49},
        {"title": f"Advanced {niche.title()}", "description": f"Go deeper and get results in {niche}.", "suggested_price": 99},
    ]


def generate_course_outlines(brief, tenant_schema) -> list[dict]:
    if not ai_compose.compose_available():
        return _fallback(brief)
    user = (
        f"Niche: {getattr(brief, 'niche', '') or '-'}\n"
        f"Description: {getattr(brief, 'description', '') or '-'}\n"
        f"Goals: {', '.join(getattr(brief, 'goals', ()) or ()) or '-'}"
    )
    try:
        parsed, cost, _ = core_ai.structured(
            system=SYSTEM_PROMPT,
            user=user,
            output_model=_Outlines,
            model=__import__("django.conf", fromlist=["settings"]).settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
        ai_compose.record_spend(tenant_schema, cost)
        return [o.model_dump() for o in parsed.outlines[:3]] or _fallback(brief)
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, exc.cost_usd)
        logger.warning("course outline AI failed for %s; using fallback", tenant_schema)
        return _fallback(brief)
```

(Import `settings` normally at the top — `from django.conf import settings` — and use `model=settings.ONBOARDING_AI_MODEL`; the inline `__import__` above is only to keep this snippet self-contained. Match the real import style of neighboring onboarding modules.)

- [ ] **Step 4: Implement the shared helper + endpoint**

Create `backend/apps/core/onboarding/content.py`:

```python
"""Wizard content-creation endpoints. Wizard-token auth (body), writes into the
tenant schema as the owner. See docs/superpowers/plans/2026-07-26-wizard-content-apis.md."""

from django.utils.translation import gettext as _
from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .wizard import _resolve_tenant_from_wizard_token


def _owner(tenant):
    """The tenant's owner user, fetched inside the schema. Content is authored
    as the owner because the wizard has no request.user."""
    from apps.accounts.models import User

    return User.objects.filter(role="owner").order_by("id").first()


def _wizard_content_setup(request):
    """(tenant, owner, err). err is a Response when the token is bad or the
    schema isn't provisioned yet; exactly one of (owner, err) is truthy."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return None, None, err
    if tenant.provisioning_status not in ("provisioned", "ready"):
        return None, None, Response({"detail": "provisioning"}, status=409)
    with tenant_context(tenant):
        owner = _owner(tenant)
    if owner is None:
        return None, None, Response({"detail": "owner_missing"}, status=409)
    return tenant, owner, None


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_course_outlines(request):
    from apps.core.onboarding import ai_curate
    from apps.core.onboarding.course_outlines import generate_course_outlines

    tenant, owner, err = _wizard_content_setup(request)
    if err:
        return err
    brief = ai_curate.CoachBrief.from_tenant(tenant, locale=tenant.region and "en" or "en")
    outlines = generate_course_outlines(brief, tenant.schema_name)
    return Response({"outlines": outlines})
```

(Confirm `ai_curate.CoachBrief.from_tenant(tenant, locale=...)` — the starter-post path uses exactly this to build a brief; copy its call. If the locale argument differs, mirror `_seed_starter_post`'s usage.)

- [ ] **Step 5: Route it**

In `backend/apps/core/onboarding/urls.py`, import `content` and add:

```python
    path("wizard/content/course-outlines/", content.wizard_course_outlines, name="wizard-course-outlines"),
```

- [ ] **Step 6: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -v`

Expected: PASS (2 tests). The outline test passes via the deterministic fallback when AI isn't configured in the test env — that is the intended fail-soft behavior.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core/onboarding/content.py backend/apps/core/onboarding/course_outlines.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_content.py
git commit -m "feat(onboarding): wizard content plumbing + AI course-outline endpoint"
```

---

### Task 2: Create the first course

**Files:**
- Modify: `backend/apps/core/onboarding/content.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_content.py`

**Interfaces:**
- Consumes: `_wizard_content_setup`.
- Produces: `POST /api/v1/onboarding/wizard/content/course/` `{token, title, description?, price?}` → `{id, slug}`; creates a published `Course` owned by the tenant owner.

- [ ] **Step 1: Write the failing test**

Append to `test_wizard_content.py`:

```python
def test_create_course_writes_a_published_owned_course(client, restore_public):
    t = _provisioned_tenant("wc_course")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course/",
            {"token": _token(t), "title": "My First Course", "price": 49},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.courses.models import Course

            course = Course.objects.get(pk=resp.json()["id"])
            assert course.title == "My First Course"
            assert course.is_published is True
            assert course.instructor.role == "owner"
    finally:
        _drop("wc_course")


def test_create_course_requires_title(client, restore_public):
    t = _provisioned_tenant("wc_notitle")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course/",
            {"token": _token(t)},
            format="json",
        )
        assert resp.status_code == 400
    finally:
        _drop("wc_notitle")
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -k create_course -v`

Expected: FAIL — route 404.

- [ ] **Step 3: Implement the endpoint**

In `content.py`, add (reusing the existing course serializer for validation, and the model's own slug generation):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_create_course(request):
    from apps.courses.serializers import CourseCreateUpdateSerializer

    tenant, owner, err = _wizard_content_setup(request)
    if err:
        return err
    with tenant_context(tenant):
        serializer = CourseCreateUpdateSerializer(
            data={k: v for k, v in request.data.items() if k != "token"}
        )
        serializer.is_valid(raise_exception=True)
        course = serializer.save(instructor=owner, is_published=True)
        return Response({"id": course.id, "slug": course.slug}, status=201)
```

- [ ] **Step 4: Route it**

```python
    path("wizard/content/course/", content.wizard_create_course, name="wizard-create-course"),
```

- [ ] **Step 5: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -k create_course -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/onboarding/content.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_content.py
git commit -m "feat(onboarding): wizard first-course create endpoint"
```

---

### Task 3: Schedule the first event

**Files:**
- Modify: `backend/apps/core/onboarding/content.py`, `urls.py`
- Test: `backend/apps/core/tests/test_wizard_content.py`

**Interfaces:**
- Produces: `POST /api/v1/onboarding/wizard/content/event/` `{token, kind: "live"|"onsite", title, scheduled_at?, ...}` → `{id}`; creates a `LiveClass` (kind `live`) or `OnsiteEvent` (kind `onsite`) owned by the owner.

- [ ] **Step 1: Write the failing test**

```python
def test_create_live_event(client, restore_public):
    from django.utils import timezone
    from datetime import timedelta

    t = _provisioned_tenant("wc_event")
    try:
        when = (timezone.now() + timedelta(days=7)).isoformat()
        resp = client.post(
            "/api/v1/onboarding/wizard/content/event/",
            {"token": _token(t), "kind": "live", "title": "Kickoff Class", "scheduled_at": when},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.live.models import LiveClass

            assert LiveClass.objects.filter(pk=resp.json()["id"]).exists()
    finally:
        _drop("wc_event")
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -k create_live_event -v`
Expected: FAIL (404).

- [ ] **Step 3: Implement**

In `content.py`:

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_create_event(request):
    from apps.live.serializers import LiveClassCreateSerializer, OnsiteEventCreateSerializer

    tenant, owner, err = _wizard_content_setup(request)
    if err:
        return err
    kind = request.data.get("kind", "live")
    Serializer = OnsiteEventCreateSerializer if kind == "onsite" else LiveClassCreateSerializer
    payload = {k: v for k, v in request.data.items() if k not in ("token", "kind")}
    with tenant_context(tenant):
        serializer = Serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(instructor=owner) if kind != "onsite" else serializer.save()
        return Response({"id": obj.id}, status=201)
```

(Confirm whether `OnsiteEvent` has an `instructor`/organizer FK — `LiveClass` sets `instructor=request.user` in its view (`apps/live/views.py:56`); if `OnsiteEvent`'s create view also injects a user field, pass `owner` the same way. Read `onsite_event_list_create` and mirror its `serializer.save(...)` arguments exactly.)

- [ ] **Step 4: Route + run + commit**

```python
    path("wizard/content/event/", content.wizard_create_event, name="wizard-create-event"),
```

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -k event -v` → PASS.

```bash
git add backend/apps/core/onboarding/content.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_content.py
git commit -m "feat(onboarding): wizard first-event create endpoint"
```

---

### Task 4: Create the first blog post

**Files:**
- Modify: `backend/apps/core/onboarding/content.py`, `urls.py`
- Test: `backend/apps/core/tests/test_wizard_content.py`

**Interfaces:**
- Produces: `POST /api/v1/onboarding/wizard/content/blog/` `{token, title, body_html?, status?}` → `{id, slug}`; creates a `BlogPost` (default `draft`, or `published` when `status=="published"`) owned by the owner. AI drafting of the body is the coach-initiated free-grant flow and is out of scope here — this endpoint persists a post from provided fields (the frontend may pre-fill the body from the outline/AI in a later plan).

- [ ] **Step 1: Write the failing test**

```python
def test_create_blog_post_published(client, restore_public):
    t = _provisioned_tenant("wc_blog")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/blog/",
            {"token": _token(t), "title": "Welcome", "body_html": "<p>Hi</p>", "status": "published"},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.blog.models import BlogPost

            post = BlogPost.objects.get(pk=resp.json()["id"])
            assert post.status == "published"
            assert post.published_at is not None
    finally:
        _drop("wc_blog")
```

- [ ] **Step 2: Run to verify failure** — FAIL (404).

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -k create_blog -v`

- [ ] **Step 3: Implement** (reuse `BlogPostAdminSerializer`; it derives the slug and sets `published_at` on publish in `perform_create` — but since we bypass the viewset, set `published_at` explicitly on publish, matching `BlogPostAdminViewSet.perform_create`):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_create_blog(request):
    from django.utils import timezone

    from apps.blog.models import BlogPost, unique_slug
    from apps.blog.serializers import BlogPostAdminSerializer

    tenant, owner, err = _wizard_content_setup(request)
    if err:
        return err
    payload = {k: v for k, v in request.data.items() if k != "token"}
    with tenant_context(tenant):
        serializer = BlogPostAdminSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        published = data.get("status") == "published"
        post = BlogPost.objects.create(
            slug=unique_slug(data["title"]),
            title=data["title"],
            body_html=data.get("body_html", ""),
            excerpt=data.get("excerpt", ""),
            meta_description=data.get("meta_description", ""),
            tags=data.get("tags", []),
            status=data.get("status", "draft"),
            source="manual",
            created_by=owner,
            published_at=timezone.now() if published else None,
        )
        return Response({"id": post.id, "slug": post.slug}, status=201)
```

(Confirm `unique_slug` is importable from `apps.blog.models` — it is defined there at `models.py:11`.)

- [ ] **Step 4: Route + run + commit**

```python
    path("wizard/content/blog/", content.wizard_create_blog, name="wizard-create-blog"),
```

Run: `docker compose exec django pytest apps/core/tests/test_wizard_content.py -v` → PASS (all).

```bash
git add backend/apps/core/onboarding/content.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_content.py
git commit -m "feat(onboarding): wizard first-blog-post create endpoint"
```

---

## Verification before calling this plan done

- [ ] `docker compose exec django pytest apps/core/tests/test_wizard_content.py -n auto` passes.
- [ ] `make lint` passes.
- [ ] Manual: with a provisioned dev tenant + a valid wizard token, POSTing to each `wizard/content/*` route creates the row in the tenant schema owned by the owner user, and the created course/event/post satisfies the publish gate's `_has_own` check (i.e. it is NOT registered as seeded).
- [ ] Manual: hitting any content route on a still-`pending` tenant returns 409 `provisioning`.

## Where this sits in Plan 3

| Sub-plan | Scope | Depends on |
|----------|-------|------------|
| 3a — Lazy provisioning foundation | schema step, endpoint, cleanup | Plan 1 |
| 3b — Content-first step machine (frontend) | new flow; content steps POST to these endpoints | 3a, **3c**, 3e |
| **3c — Content-creation APIs** (this one) | course-outline AI + course/event/blog create | 3a |
| 3d — Reveal + compose fallback | compose from real content; fallback | 3c |
| 3e — Wizard holdout | bucket assignment + report | Plan 1 |
