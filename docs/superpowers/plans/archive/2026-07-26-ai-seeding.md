# AI Seeding (Complete Site) Implementation Plan

**STATUS: COMPLETE** — implemented on branch feat/lazy-provisioning-foundation (2026-07-26).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the content-first reveal show a *complete* website — the coach's real content plus a few AI-generated, niche-appropriate starter blog posts (noindex until reviewed) and draft product outlines — instead of a near-empty shell, without fabricating social proof and without blocking publishing on cleanup.

**Architecture:** At reveal, `compose_wizard_site` (Plan 3d) already composes page copy + photos. This plan adds two seeders that run alongside it: `seed_starter_posts` (2 AI draft posts, `noindex=True`, registered as seeded/erasable) and `seed_draft_products` (draft course outlines the coach can finish). A new `BlogPost.noindex` field, respected by the public page's metadata, keeps model-written posts out of search until a human edits them. Because seeded content registers `SeededObject` rows, the `demo_cleanup` **publish blocker** is removed (seeded starter content must never block going live).

**Tech Stack:** Django 5.1, DRF, django-tenants, Next.js 14 metadata, Anthropic via `apps.core.ai`, pytest.

## Why this plan exists

The spec ("AI seeding — a complete website") wants the reveal to read as a real business. Plan 3 gives the coach's *own* content; this fills the rest with unique, per-tenant AI content and marks it safely. Three safety rules from the spec shape it:
- **Seeded and published:** starter blog posts (unique per tenant — generated from their description), page copy (Plan 3d), curated photos.
- **Seeded as drafts:** extra course outlines — invisible on the public site so no student can buy an empty product.
- **Never seeded:** testimonials/reviews/ratings (the compose trust boundary already excludes them).
- **SEO safeguard:** seeded posts are `noindex` until the coach opens and saves them.

**Verified facts** (file:line):
- The existing single starter post: `create_starter_post(fields, niche)` creates a `BlogPost` `status="draft", source="ai"`, `register_seeded([post], niche=...)`, and skips if any post exists (`starter_post.py:58`).
- `BlogPost` has **no** `noindex`/robots field (`apps/blog/models.py:22-49`); `cover_photo` is a FK to `media.Photo`.
- Public post metadata: `generateMetadata` in `frontend-customer/src/app/(public)/blog/[slug]/page.tsx:8` (Next.js `Metadata` supports `robots`).
- Admin edit path: `BlogPostAdminViewSet.perform_update` (`apps/blog/views.py:79`).
- The `demo_cleanup` publish blocker only fires when the tenant was seeded (`setup_items.py` `publish_blockers`, `was_seeded and seeded_rows_exist`). Plan 4's `register_seeded` rows make `seeded_rows_exist` true, so this blocker would otherwise fire on content-first tenants.
- `compose_wizard_site(tenant_id)` (Plan 3d) is where reveal-time work runs, in the caller's `tenant_context` via `_apply_wizard_answers`.

## Global Constraints

- **Seeded posts are `noindex` and draft; never published.** They read as a complete site to visitors browsing the blog index but stay out of search until reviewed.
- **Draft products are `is_published=False`** and thus invisible on the public site and excluded from the publish gate's "own published product" check.
- **Seeding is fail-soft.** An AI failure seeds fewer (or zero) items and never fails the reveal — `compose_wizard_site` must still reach `ready`.
- **No fabricated social proof.** Do not seed testimonials, reviews, ratings, or counts.
- **Removing `demo_cleanup` as a blocker must not remove it as a nudge** where a tenant genuinely has old static demo content (classic flow). Only the *blocker* is dropped; the checklist item stays (relabeled) and non-blocking.
- Tests: `docker compose exec django pytest <path> -n auto`, dev stack up.

## Scope boundaries

- No reveal chat (Plan 5).
- No change to classic `provision_tenant` seeding (`seed_template_into_tenant` stays for control/dev tenants).

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/blog/models.py` | modify | `BlogPost.noindex` field. |
| `backend/apps/blog/migrations/00XX_blogpost_noindex.py` | generate | Migration (tenant schema). |
| `backend/apps/blog/serializers.py` | modify | Expose `noindex` (public read + admin). |
| `backend/apps/blog/views.py:79` | modify | `perform_update` clears `noindex` on coach edit. |
| `frontend-customer/src/app/(public)/blog/[slug]/page.tsx` | modify | `robots:{index:false}` when `post.noindex`. |
| `frontend-customer/src/types/*` | modify | `noindex` on the blog post type. |
| `backend/apps/core/onboarding/seeding_content.py` | create | `seed_starter_posts`, `seed_draft_products`. |
| `backend/apps/core/tasks.py` | modify | Call the seeders inside `compose_wizard_site`. |
| `backend/apps/tenant_config/setup_items.py` | modify | Drop `demo_cleanup` from `publish_blockers`; keep a non-blocking checklist item. |
| tests | create | `apps/blog/tests/test_noindex.py`, `apps/core/tests/test_seeding_content.py`, extend `test_publish_gate.py`. |

---

### Task 1: `noindex` field, rendering, and clear-on-review

**Files:** `apps/blog/models.py`, migration, `apps/blog/serializers.py`, `apps/blog/views.py:79`, `frontend-customer/src/app/(public)/blog/[slug]/page.tsx`, blog post type.

**Interfaces:** `BlogPost.noindex: bool` (default False). Public serializer exposes it read-only; admin `perform_update` sets it False on save.

- [x] **Step 1: Write the failing backend test**

Create `backend/apps/blog/tests/test_noindex.py` (tenant-context test; model on `apps/blog/tests/test_admin_api.py`'s fixtures):

```python
import pytest

from apps.blog.models import BlogPost

pytestmark = pytest.mark.django_db


def test_noindex_defaults_false():
    p = BlogPost.objects.create(title="X", slug="x")
    assert p.noindex is False


def test_coach_edit_clears_noindex(client_coach):
    # client_coach: an authenticated coach APIClient (copy the fixture from
    # apps/blog/tests/test_admin_api.py).
    p = BlogPost.objects.create(title="Seeded", slug="seeded", noindex=True, source="ai")
    resp = client_coach.patch(
        f"/api/v1/admin/blog/posts/{p.pk}/", {"title": "Seeded edited"}, format="json"
    )
    assert resp.status_code == 200
    p.refresh_from_db()
    assert p.noindex is False
```

- [x] **Step 2: Run to verify failure** — FAIL (`noindex` unknown field).

Run: `docker compose exec django pytest apps/blog/tests/test_noindex.py -v`

- [x] **Step 3: Add the field + migration**

`apps/blog/models.py`, on `BlogPost`:

```python
    noindex = models.BooleanField(
        default=False,
        help_text="Seeded AI drafts start noindex; cleared when a human edits the post.",
    )
```

```bash
docker compose exec django python manage.py makemigrations blog --name blogpost_noindex
docker compose exec django python manage.py migrate_schemas
```

- [x] **Step 4: Expose + clear on edit**

In `apps/blog/serializers.py`: add `"noindex"` to `BlogPostAdminSerializer` fields (writable) and to the public serializer's read fields.

In `apps/blog/views.py` `perform_update` (line 79), clear noindex on any coach save:

```python
    def perform_update(self, serializer):
        serializer.save(noindex=False)  # a human reviewed it → allow indexing
```

(If `perform_update` already sets fields, add `noindex=False` to its `save(...)` kwargs.)

- [x] **Step 5: Public metadata honors noindex**

In `frontend-customer/src/app/(public)/blog/[slug]/page.tsx` `generateMetadata`, add to the returned metadata:

```tsx
    robots: post.noindex ? { index: false, follow: true } : undefined,
```

Add `noindex?: boolean` to the blog post type the page consumes (`src/types/blog.ts` or wherever `post` is typed), and ensure the public blog API serializer returns it (Step 4).

- [x] **Step 6: Run + typecheck + commit**

Run: `docker compose exec django pytest apps/blog/tests/test_noindex.py -v` → PASS.
Run: `make typecheck` → PASS.

```bash
git add backend/apps/blog/models.py backend/apps/blog/migrations backend/apps/blog/serializers.py backend/apps/blog/views.py backend/apps/blog/tests/test_noindex.py "frontend-customer/src/app/(public)/blog/[slug]/page.tsx" frontend-customer/src/types
git commit -m "feat(blog): noindex flag for seeded AI posts, cleared on human edit"
```

---

### Task 2: Seed starter blog posts

**Files:** `backend/apps/core/onboarding/seeding_content.py` (create), test `apps/core/tests/test_seeding_content.py`.

**Interfaces:** `seed_starter_posts(tenant, brief, *, count=2) -> int` — generates up to `count` AI draft posts (`noindex=True`, `source="ai"`, registered seeded), returns how many were created. Fail-soft (returns fewer on AI failure).

- [x] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_seeding_content.py` (real-schema harness from Plan 3a; AI mocked to avoid a live call):

```python
import pytest
from unittest import mock
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)


def _tenant(schema="seedc"):
    connection.set_schema_to_public()
    t = Tenant.objects.create(schema_name=schema, name=schema, slug=schema,
                              subdomain=schema, owner_email=f"{schema}@e.com", region="global")
    provision_tenant_schema(t, t.owner_email, "Owner", "en")
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_seeds_noindex_draft_posts(restore_public):
    from apps.core.onboarding import seeding_content

    t = _tenant("seedc_posts")
    fake = {"title": "Welcome", "body_html": "<p>hi</p>", "excerpt": "", "meta_description": "",
            "tags": [], "ai_model": "test", "image_placements": [], "cover_photo_id": None}
    try:
        with mock.patch.object(seeding_content, "_draft_one", return_value=fake):
            with tenant_context(t):
                n = seeding_content.seed_starter_posts(t, brief=None, count=2)
                from apps.blog.models import BlogPost

                posts = list(BlogPost.objects.all())
                assert n == 2 and len(posts) == 2
                assert all(p.noindex and p.status == "draft" and p.source == "ai" for p in posts)
    finally:
        _drop("seedc_posts")
```

- [x] **Step 2: Run to verify failure** — FAIL (module missing).

- [x] **Step 3: Implement the seeder**

Create `backend/apps/core/onboarding/seeding_content.py`. Reuse the existing starter-post AI (`starter_post.generate_starter_draft`) but drop its skip-if-any-post guard (the coach may already have their own post) and force `noindex=True`, and vary the topic per index:

```python
"""Seed a 'complete site': a couple of niche AI blog drafts (noindex until
reviewed) and a few draft course outlines the coach can finish. Fail-soft."""

import logging

from apps.blog.models import BlogPost, unique_slug
from apps.blog.curated import resolve_curated_photo_ids
from apps.tenant_config.seeding import register_seeded

logger = logging.getLogger(__name__)

STARTER_TOPICS = [
    "Three things every beginner in {niche} should know",
    "How I help my {niche} students get results",
]


def _draft_one(brief, tenant_schema, topic):
    """One AI draft's fields dict, or None on failure. Mirrors
    starter_post.generate_starter_draft but with an explicit topic."""
    from apps.core.onboarding import starter_post

    try:
        return starter_post.generate_starter_draft(brief, tenant_schema, topic=topic)
    except Exception:  # noqa: BLE001 — fail-soft, seed fewer
        logger.warning("starter post draft failed for %s", tenant_schema)
        return None


def seed_starter_posts(tenant, brief, *, count=2) -> int:
    from apps.core.onboarding import ai_compose

    if not ai_compose.compose_available():
        return 0
    niche = (getattr(brief, "niche", "") or "your topic").replace("_", " ")
    made = 0
    for i in range(count):
        topic = STARTER_TOPICS[i % len(STARTER_TOPICS)].format(niche=niche)
        fields = _draft_one(brief, tenant.schema_name, topic)
        if not fields:
            continue
        resolve_curated_photo_ids(fields)
        post = BlogPost.objects.create(
            slug=unique_slug(fields["title"]),
            status="draft",
            source="ai",
            noindex=True,
            cover_photo_id=fields.get("cover_photo_id") or None,
            title=fields["title"], body_html=fields["body_html"], excerpt=fields["excerpt"],
            meta_description=fields["meta_description"], tags=fields["tags"],
            ai_model=fields["ai_model"], image_placements=fields["image_placements"],
        )
        register_seeded([post], niche=tenant.template_niche or "general")
        made += 1
    return made
```

(Confirm `starter_post.generate_starter_draft` accepts a `topic` kwarg — the existing call hardcodes a welcome topic (`starter_post.py:34`). If it does not, add an optional `topic=None` parameter defaulting to the current welcome topic; that is a small, backward-compatible change to `starter_post.py`. Confirm the `apps.blog.curated` import path for `resolve_curated_photo_ids`.)

- [x] **Step 4: Run + commit**

Run: `docker compose exec django pytest apps/core/tests/test_seeding_content.py -k posts -v` → PASS.

```bash
git add backend/apps/core/onboarding/seeding_content.py backend/apps/core/tests/test_seeding_content.py backend/apps/core/onboarding/starter_post.py
git commit -m "feat(onboarding): seed noindex AI starter blog posts"
```

---

### Task 3: Seed draft product outlines

**Files:** `backend/apps/core/onboarding/seeding_content.py`, test extends `test_seeding_content.py`.

**Interfaces:** `seed_draft_products(tenant, brief, *, count=3) -> int` — creates up to `count` **draft** (`is_published=False`) `Course` rows from AI outlines, registered seeded. Fail-soft.

- [x] **Step 1: Write the failing test**

```python
def test_seeds_draft_courses(restore_public):
    from apps.core.onboarding import seeding_content

    t = _tenant("seedc_prod")
    outlines = [{"title": "Draft A", "description": "d", "suggested_price": 0},
                {"title": "Draft B", "description": "d", "suggested_price": 49}]
    try:
        with mock.patch.object(seeding_content, "_outlines_for", return_value=outlines):
            with tenant_context(t):
                n = seeding_content.seed_draft_products(t, brief=None)
                from apps.courses.models import Course

                courses = list(Course.objects.all())
                assert n == 2
                assert all(c.is_published is False for c in courses)
    finally:
        _drop("seedc_prod")
```

- [x] **Step 2: Run to verify failure** — FAIL.

- [x] **Step 3: Implement**

Add to `seeding_content.py` (reusing Plan 3c's outline generator and the owner lookup):

```python
def _outlines_for(brief, tenant_schema):
    from apps.core.onboarding.course_outlines import generate_course_outlines

    return generate_course_outlines(brief, tenant_schema)


def seed_draft_products(tenant, brief, *, count=3) -> int:
    from apps.accounts.models import User
    from apps.courses.models import Course

    owner = User.objects.filter(role="owner").order_by("id").first()
    if owner is None:
        return 0
    made = 0
    for o in _outlines_for(brief, tenant.schema_name)[:count]:
        course = Course.objects.create(
            title=o["title"], description=o.get("description", ""),
            price=o.get("suggested_price", 0), instructor=owner, is_published=False,
        )
        register_seeded([course], niche=tenant.template_niche or "general")
        made += 1
    return made
```

- [x] **Step 4: Run + commit**

Run: `docker compose exec django pytest apps/core/tests/test_seeding_content.py -v` → PASS.

```bash
git add backend/apps/core/onboarding/seeding_content.py backend/apps/core/tests/test_seeding_content.py
git commit -m "feat(onboarding): seed draft course outlines for a complete site"
```

---

### Task 4: Wire seeding into the reveal + drop the demo_cleanup blocker

**Files:** `backend/apps/core/tasks.py` (`compose_wizard_site`), `backend/apps/tenant_config/setup_items.py`, test extends `test_publish_gate.py`.

**Interfaces:** `compose_wizard_site` also seeds starter posts + draft products (fail-soft). `publish_blockers` no longer returns `demo_cleanup`.

- [x] **Step 1: Write the failing publish-gate test**

Add to `backend/apps/tenant_config/tests/test_publish_gate.py`:

```python
def test_seeded_content_does_not_block_publishing(config):
    """Seeded AI starter content registers SeededObject rows; that must NOT
    reintroduce a demo_cleanup publish blocker."""
    from apps.tenant_config.models import SeededObject
    from apps.tenant_config.seeding import register_seeded
    from apps.blog.models import BlogPost

    _published_course()  # satisfies first_course
    seeded = BlogPost.objects.create(title="Seeded", slug="seeded", status="draft", source="ai", noindex=True)
    register_seeded([seeded], niche="general")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["sell_courses"]))
    assert "demo_cleanup" not in blockers
```

- [x] **Step 2: Run to verify failure** — FAIL (`demo_cleanup` present).

Run: `docker compose exec django pytest apps/tenant_config/tests/test_publish_gate.py -k seeded_content -v`

- [x] **Step 3: Drop the blocker (keep the nudge)**

In `backend/apps/tenant_config/setup_items.py` `publish_blockers`, remove the `demo_cleanup` append:

```python
    # demo_cleanup is NO LONGER a publish blocker: seeded content is now
    # niche-appropriate AI/starter content (see the AI-seeding plan), which
    # must never block going live. It remains a non-blocking checklist nudge
    # ("review your starter content") in compute_setup_state.
```

Delete the `if was_seeded and seeded_rows_exist: blockers.append("demo_cleanup")` lines. Leave `compute_setup_state`'s `demo_cleanup` checklist item as-is (it is already optional/non-blocking there) — optionally relabel its i18n copy to "Review your starter content".

- [x] **Step 4: Wire the seeders into compose_wizard_site**

In `backend/apps/core/tasks.py` `compose_wizard_site` (Plan 3d), after `_apply_wizard_answers(...)` and before setting `ready`:

```python
        try:
            from apps.core.onboarding import ai_curate, seeding_content

            brief = ai_curate.CoachBrief.from_tenant(tenant, locale=preferred_locale)
            with tenant_context(tenant):
                seeding_content.seed_starter_posts(tenant, brief)
                seeding_content.seed_draft_products(tenant, brief)
        except Exception:  # noqa: BLE001 — seeding is best-effort, never fails the reveal
            logger.exception("reveal seeding failed for %s", tenant.slug)
```

- [x] **Step 5: Run + commit**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_publish_gate.py apps/core/tests/test_reveal_compose.py -n auto` → PASS.

```bash
git add backend/apps/core/tasks.py backend/apps/tenant_config/setup_items.py backend/apps/tenant_config/tests/test_publish_gate.py
git commit -m "feat(onboarding): seed a complete site at reveal; drop demo_cleanup publish blocker"
```

---

## Verification before calling this plan done

- [x] `docker compose exec django pytest apps/blog apps/core apps/tenant_config -n auto` passes.
- [x] `make typecheck` + `make lint` pass.
- [x] Manual: after `compose_wizard_site` on a dev content-first tenant, the blog index shows 2 extra draft posts (noindex), the admin course list shows draft outlines, and `publish_blockers` does not contain `demo_cleanup`.
- [x] Manual: opening + saving a seeded post in the admin flips its `noindex` to false; its public page then omits the `noindex` robots tag.
- [x] Manual: seeding with AI disabled creates zero seeded items and the reveal still reaches `ready`.

## Where this sits in the plan set

| Plan | Scope | Depends on |
|------|-------|------------|
| 3a–3e | Content-first wizard + provisioning + holdout | Plan 1 |
| **4 — AI seeding** (this one) | starter posts, draft products, noindex, drop demo_cleanup blocker | 3c, 3d |
| 5 — Reveal chat + quota | metered site-AI chat | 3d |
