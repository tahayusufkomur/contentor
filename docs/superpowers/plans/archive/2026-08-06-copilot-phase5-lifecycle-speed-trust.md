# Copilot Phase 5–7: Entity Lifecycle, Speed, Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the coach copilot from create-only/site-only to full content lifecycle (edit + publish existing courses/events/posts), branding (logo, SEO), speed (apply-all bundles, announcement drafts), and trust (undo, setup guidance, stats answers).

**Architecture:** Every new capability follows the established Phase 1–4 pattern in `backend/apps/core/copilot/`: a pydantic action model in `engine.py` (discriminated union on `kind`), a confirm-card builder in `_card()`, an executor reached from `views._execute()`, a line in `SYSTEM_PROMPT`, and digests riding in the user turn. Nothing writes without a confirmed single-use token; the system prompt stays byte-identical across tenants (prompt-cache rule). Undo works by capturing an inverse payload at execute time into the existing `CopilotAudit` row.

**Tech Stack:** Django 5.1 + DRF + django-tenants, pydantic (via `core_ai.structured`), Next.js 14 (frontend-customer), pytest.

## Global Constraints

- **No-risk envelope holds:** no deletes of real entities, no sends, no money movement. Publish actions are explicit confirm cards; announcement drafts are inert (`status="draft"` never matches the send tasks' `status="scheduled"` filters — verified `apps/notifications/tasks.py:81,96`).
- **`SYSTEM_PROMPT` must remain a module constant** — byte-identical across tenants. All tenant-specific data goes in the user turn.
- Reuse admin serializers for entity writes where they exist (`CourseCreateUpdateSerializer`, `BlogPostAdminSerializer`); sanitize all coach-visible HTML (`sanitize_rich_text` / serializer `validate_body_html`).
- Errors surfaced to coaches only via the existing `*OpError` classes (user-safe messages); model narration is never echoed when cards drop.
- Imports inside `apps/core` stay function-local where they cross apps (cycle-dodging convention).
- New tenant-schema migrations ⇒ run `make test-fresh` once before `make test-changed`.
- Frontend: async buttons use `<Button loading={...}>`, handlers wrapped in `useAsyncAction`, toasts via sonner (repo loading-conventions lint enforces this).
- Never commit without pre-commit passing clean. Do not push.
- Verify each task with `make test-app APP=core` (or `APP=notifications` where noted); finish each phase with `make test-changed`.

## Deferred (explicitly out of scope)

- `create_download` — blocked on Phase 8 file intake; a store product without its file is useless.
- Bulk-cover and recurring-event **action kinds** — covered by prompt steering + apply-all (Task 8); no new executors.
- Undo for entity actions (create/edit/publish course/event/post) — v1 undo covers TenantConfig-backed state only (pages, theme, navbar, logo, SEO, course cover). Follow-up phase.
- TR translations for new backend card strings (platform-wide TR pass is already a queued fast-follow).

---

# Phase A — Entity lifecycle (edit + publish)

### Task 1: Events + posts digests in the user turn

The model can only reference what the digest shows. Courses already have a digest; events and blog posts need one before any edit action can name an id.

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (after `_courses_digest`, ~line 340)
- Test: `backend/apps/core/tests/test_copilot_engine.py`

**Interfaces:**
- Produces: `_events_digest(tenant) -> str` — lines `  {id} | live|onsite | {title} | {iso date} | {price}`; `_posts_digest(tenant) -> str` — lines `  {id} | {title} | draft|published`. Both wired into `_user_turn` parts. Tasks 3–5 rely on ids/kinds appearing exactly in this format.

- [ ] **Step 1: Write failing tests** (mirror the tenant-fixture arrange helpers already in `test_copilot_engine.py` — same tenant factory the `_courses_digest` tests use)

```python
def test_events_digest_lists_upcoming_live_and_onsite(self):
    with tenant_context(self.tenant):
        live = LiveClass.objects.create(
            title="Morning Flow", instructor=self.coach, price=0,
            pricing_type="free", scheduled_at=timezone.now() + timedelta(days=3))
        onsite = OnsiteEvent.objects.create(
            title="Retreat", instructor=self.coach, price=50,
            pricing_type="paid", location="Berlin",
            scheduled_at=timezone.now() + timedelta(days=10))
    digest = engine._events_digest(self.tenant)
    assert f"{live.id} | live | Morning Flow" in digest
    assert f"{onsite.id} | onsite | Retreat" in digest

def test_events_digest_empty(self):
    assert "(none scheduled)" in engine._events_digest(self.tenant)

def test_posts_digest_lists_status(self):
    with tenant_context(self.tenant):
        post = BlogPost.objects.create(title="Why rest matters", status="draft",
                                       created_by=self.coach, slug="why-rest")
    digest = engine._posts_digest(self.tenant)
    assert f"{post.id} | Why rest matters | draft" in digest
```

- [ ] **Step 2: Run to verify failure** — `make test-app APP=core` (or targeted: `docker compose exec django pytest apps/core/tests/test_copilot_engine.py -k digest -x`). Expected: `AttributeError: ... has no attribute '_events_digest'`.

- [ ] **Step 3: Implement**

```python
MAX_DIGEST_EVENTS = 20
MAX_DIGEST_POSTS = 20


def _events_digest(tenant):
    """Upcoming events for the user turn: what edit_event proposals key off."""
    from apps.live.models import LiveClass, OnsiteEvent

    with tenant_context(tenant):
        now = timezone.now()
        rows = [
            ("live", e) for e in LiveClass.objects.filter(scheduled_at__gte=now).order_by("scheduled_at")[:MAX_DIGEST_EVENTS]
        ] + [
            ("onsite", e) for e in OnsiteEvent.objects.filter(scheduled_at__gte=now).order_by("scheduled_at")[:MAX_DIGEST_EVENTS]
        ]
    if not rows:
        return "Upcoming events: (none scheduled)"
    rows.sort(key=lambda r: r[1].scheduled_at)
    lines = ["Upcoming events (id | kind | title | when | price):"]
    for kind, e in rows[:MAX_DIGEST_EVENTS]:
        lines.append(f"  {e.id} | {kind} | {str(e.title)[:60]} | {e.scheduled_at.isoformat()} | {e.price}")
    return "\n".join(lines)


def _posts_digest(tenant):
    """Blog inventory for the user turn: what edit/publish proposals key off."""
    from apps.blog.models import BlogPost

    with tenant_context(tenant):
        rows = list(BlogPost.objects.order_by("-created_at").values("id", "title", "status")[:MAX_DIGEST_POSTS])
    if not rows:
        return "Blog posts: (none yet)"
    lines = ["Blog posts (id | title | status):"]
    for r in rows:
        lines.append(f"  {r['id']} | {str(r['title'])[:60]} | {r['status']}")
    return "\n".join(lines)
```

In `_user_turn`, extend `parts`: after `_courses_digest(tenant)` add `_events_digest(tenant)` and `_posts_digest(tenant)`.

- [ ] **Step 4: Run tests to verify pass.**
- [ ] **Step 5: Commit** — `git add -A backend/apps/core && git commit -m "feat(copilot): events + blog digests in the user turn"`

---

### Task 2: `edit_course` action

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (action model + `_card` branch + prompt line), `backend/apps/core/copilot/content.py` (executor), `backend/apps/core/copilot/views.py` (`_execute` dispatch + `_audit_summary`)
- Test: `backend/apps/core/tests/test_copilot_content.py`

**Interfaces:**
- Produces: `content.edit_course(course_id, params) -> dict` where `params` may contain `title`, `description`, `price`; returns `{"kind": "edit_course", "id", "title", "url", "changes": [{"field", "old", "new"}]}`. Card kind `"edit_course"` with `changes` rows (rendered by the existing generic card diff UI). Metadata only — **modules are deliberately not editable** (curriculum rewrites are too destructive for v1).

- [ ] **Step 1: Failing tests** (in `test_copilot_content.py`, same fixture style as its `create_course` tests)

```python
def test_edit_course_updates_fields(self):
    with tenant_context(self.tenant):
        course = Course.objects.create(title="Old", instructor=self.coach,
                                       price=0, pricing_type="free", is_published=False)
        result = content.edit_course(course.pk, {"title": "New title", "price": 49})
        course.refresh_from_db()
    assert course.title == "New title"
    assert str(course.price) == "49.00"
    assert course.pricing_type == "paid"
    assert {"field": "title", "old": "Old", "new": "New title"} in result["changes"]

def test_edit_course_unknown_id_raises(self):
    with tenant_context(self.tenant), pytest.raises(content.ContentOpError):
        content.edit_course(99999, {"title": "X"})

def test_edit_course_no_changes_raises(self):
    with tenant_context(self.tenant):
        course = Course.objects.create(title="Same", instructor=self.coach,
                                       price=0, pricing_type="free")
        with pytest.raises(content.ContentOpError):
            content.edit_course(course.pk, {"title": "Same"})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `content.py`:

```python
_COURSE_EDIT_FIELDS = ("title", "description", "price")


def edit_course(course_id, params):
    from apps.courses.models import Course
    from apps.courses.serializers import CourseCreateUpdateSerializer

    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        raise ContentOpError(f"no course with id {course_id}")
    data = {k: v for k, v in params.items() if k in _COURSE_EDIT_FIELDS and v is not None}
    if "price" in data:
        price = max(float(data["price"]), 0)
        data["price"] = f"{price:.2f}"
        data["pricing_type"] = "paid" if price > 0 else "free"
    if not data:
        raise ContentOpError("nothing to change on the course")
    old = {k: str(getattr(course, k)) for k in data}
    serializer = CourseCreateUpdateSerializer(instance=course, data=data, partial=True)
    if not serializer.is_valid():
        _fail(serializer.errors)
    course = serializer.save()
    changes = [
        {"field": k, "old": old[k][:200], "new": str(getattr(course, k))[:200]}
        for k in data
        if old[k] != str(getattr(course, k))
    ]
    if not changes:
        raise ContentOpError("those fields already have those values")
    return {"kind": "edit_course", "id": course.id, "title": course.title,
            "url": f"/admin/courses/{course.slug}", "changes": changes}
```

In `engine.py`: model + union entry + card branch + prompt line.

```python
class EditCourseAction(BaseModel):
    kind: Literal["edit_course"]
    course_id: int
    title: str | None = None
    description: str | None = None
    price: float | None = None
```

Card branch in `_card` (validation happens at execute; the card previews intent — resolve the course title now so the card is honest, same as `set_course_cover` does via `_course_for_cover`):

```python
    if isinstance(action, EditCourseAction):
        course_title, _ = _course_for_cover(tenant, action.course_id)  # raises PhotoOpError on unknown id
        parts = [p for p in (
            f"title → '{action.title[:60]}'" if action.title else None,
            "new description" if action.description else None,
            f"price → {max(action.price, 0):.2f}" if action.price is not None else None,
        ) if p]
        if not parts:
            raise content.ContentOpError("nothing to change on the course")
        return {
            "kind": "edit_course",
            "title": f"Update course: {course_title[:100]}",
            "detail": ", ".join(parts),
            "token": tokens.stash_action(schema, {
                "kind": "edit_course", "course_id": action.course_id,
                "params": {k: v for k, v in (("title", action.title), ("description", action.description), ("price", action.price)) if v is not None},
            }),
        }
```

Prompt line (append inside `SYSTEM_PROMPT`, keep with the other action bullets):

```
- edit_course: update an existing course's title, description, or price (course_id from the course list); modules cannot be changed here
```

In `views.py` `_CREATORS`-adjacent dispatch — add to `_CREATORS`:

```python
    "edit_course": lambda user, action: content.edit_course(action["course_id"], action["params"]),
```

`_audit_summary`: add `if kind == "edit_course": return f"Updated course '{title}'" if title else "Updated a course"`.

- [ ] **Step 4: Run tests to verify pass.** Also add one engine-level card test in `test_copilot_engine.py` asserting `_card` on an `EditCourseAction` returns kind/title/token (mirror existing `set_course_cover` card test).
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): edit_course action"`

---

### Task 3: `edit_event` action

**Files:**
- Modify: `engine.py`, `content.py`, `views.py` (same three touchpoints as Task 2)
- Test: `backend/apps/core/tests/test_copilot_content.py`

**Interfaces:**
- Produces: `content.edit_event(event_id, event_kind, params) -> dict` (`params` ⊆ `title`, `description`, `scheduled_at` iso string, `price`, `location`); returns `{"kind": "edit_event", "id", "title", "url": "/admin/live", "changes": [...]}`. Direct field writes with explicit validation (the live create-serializers carry create-only mixins; there is no admin update serializer to reuse — keep the same future-date rule `_card` already enforces for `create_event`).

- [ ] **Step 1: Failing tests**

```python
def test_edit_event_reschedules_live_class(self):
    with tenant_context(self.tenant):
        event = LiveClass.objects.create(title="Yoga", instructor=self.coach, price=0,
                                         pricing_type="free",
                                         scheduled_at=timezone.now() + timedelta(days=2))
        new_when = (timezone.now() + timedelta(days=5)).isoformat()
        result = content.edit_event(event.pk, "live", {"scheduled_at": new_when})
        event.refresh_from_db()
    assert event.scheduled_at.isoformat() == new_when
    assert result["changes"][0]["field"] == "scheduled_at"

def test_edit_event_rejects_past_date(self):
    with tenant_context(self.tenant):
        event = LiveClass.objects.create(title="Yoga", instructor=self.coach, price=0,
                                         pricing_type="free",
                                         scheduled_at=timezone.now() + timedelta(days=2))
        past = (timezone.now() - timedelta(days=1)).isoformat()
        with pytest.raises(content.ContentOpError):
            content.edit_event(event.pk, "live", {"scheduled_at": past})

def test_edit_event_onsite_location(self):
    with tenant_context(self.tenant):
        event = OnsiteEvent.objects.create(title="Retreat", instructor=self.coach, price=0,
                                           pricing_type="free", location="Berlin",
                                           scheduled_at=timezone.now() + timedelta(days=9))
        content.edit_event(event.pk, "onsite", {"location": "Hamburg"})
        event.refresh_from_db()
    assert event.location == "Hamburg"
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** in `content.py`:

```python
def edit_event(event_id, event_kind, params):
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime

    from apps.live.models import LiveClass, OnsiteEvent

    model = OnsiteEvent if event_kind == "onsite" else LiveClass
    event = model.objects.filter(pk=event_id).first()
    if event is None:
        raise ContentOpError(f"no {event_kind} event with id {event_id}")
    changes = []

    def _set(field, new):
        old = getattr(event, field)
        if str(old) == str(new):
            return
        changes.append({"field": field, "old": str(old)[:200], "new": str(new)[:200]})
        setattr(event, field, new)

    if params.get("title"):
        _set("title", str(params["title"])[:200])
    if params.get("description"):
        _set("description", str(params["description"]))
    if params.get("scheduled_at"):
        when = parse_datetime(str(params["scheduled_at"]))
        if when is None:
            raise ContentOpError("could not read the new date")
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.get_current_timezone())
        if when <= timezone.now():
            raise ContentOpError("event date must be in the future")
        _set("scheduled_at", when)
    if params.get("price") is not None:
        price = max(float(params["price"]), 0)
        _set("price", f"{price:.2f}")
        _set("pricing_type", "paid" if price > 0 else "free")
    if event_kind == "onsite" and params.get("location"):
        _set("location", str(params["location"])[:500])
    if not changes:
        raise ContentOpError("nothing to change on the event")
    event.save(update_fields=[c["field"] for c in changes])
    return {"kind": "edit_event", "id": event.id, "title": event.title,
            "url": "/admin/live", "changes": changes}
```

`engine.py` model + card + prompt:

```python
class EditEventAction(BaseModel):
    kind: Literal["edit_event"]
    event_id: int
    event_kind: Literal["live", "onsite"] = "live"
    title: str | None = None
    description: str | None = None
    scheduled_at: datetime | None = None
    location: str | None = None
    price: float | None = None
```

Card: title `f"Update event {action.event_id}"` is not coach-friendly — resolve the title in `_card` by querying the model (raise `content.ContentOpError(f"no event with id ...")` when absent) and build `detail` from the provided fields (reschedule shows `{when:%b %d, %Y %H:%M}`; enforce the future-date rule here too, exactly as the `create_event` branch does). Token payload: `{"kind": "edit_event", "event_id", "event_kind", "params": {...provided fields, scheduled_at as isoformat...}}`.

Prompt line:

```
- edit_event: reschedule or update an upcoming event (event_id + kind from the events list); date must be in the future
```

`views._CREATORS`: `"edit_event": lambda user, action: content.edit_event(action["event_id"], action["event_kind"], action["params"])`. `_audit_summary`: `"Updated event '{title}'"`.

- [ ] **Step 4: Run tests; add the `_card` resolution test in `test_copilot_engine.py`.**
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): edit_event action (reschedule, price, location)"`

---

### Task 4: `edit_blog_post` action

**Files:**
- Modify: `engine.py`, `content.py`, `views.py`
- Test: `backend/apps/core/tests/test_copilot_content.py`

**Interfaces:**
- Produces: `content.edit_blog_post(post_id, params) -> dict` (`params` ⊆ `title`, `summary`, `body_html`); routes through `BlogPostAdminSerializer` so `validate_body_html` sanitizes. Returns `{"kind": "edit_blog_post", "id", "title", "url": f"/admin/blog/{id}", "changes": [...]}`.

- [ ] **Step 1: Failing tests**

```python
def test_edit_blog_post_updates_and_sanitizes(self):
    with tenant_context(self.tenant):
        post = BlogPost.objects.create(title="Old", status="draft",
                                       created_by=self.coach, slug="old")
        result = content.edit_blog_post(post.pk, {
            "title": "Newer", "body_html": "<p>ok</p><script>x()</script>"})
        post.refresh_from_db()
    assert post.title == "Newer"
    assert "<script>" not in post.body_html
    assert any(c["field"] == "title" for c in result["changes"])

def test_edit_blog_post_unknown_raises(self):
    with tenant_context(self.tenant), pytest.raises(content.ContentOpError):
        content.edit_blog_post(4242, {"title": "X"})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```python
_POST_EDIT_MAP = {"title": "title", "summary": "excerpt", "body_html": "body_html"}


def edit_blog_post(post_id, params):
    from apps.blog.models import BlogPost
    from apps.blog.serializers import BlogPostAdminSerializer

    post = BlogPost.objects.filter(pk=post_id).first()
    if post is None:
        raise ContentOpError(f"no blog post with id {post_id}")
    data = {}
    if params.get("title"):
        data["title"] = str(params["title"])[:200]
    if params.get("summary"):
        data["excerpt"] = str(params["summary"])[:300]
    if params.get("body_html"):
        data["body_html"] = str(params["body_html"])
    if not data:
        raise ContentOpError("nothing to change on the post")
    old = {k: str(getattr(post, k)) for k in data}
    serializer = BlogPostAdminSerializer(instance=post, data=data, partial=True)
    if not serializer.is_valid():
        _fail(serializer.errors)
    post = serializer.save()
    changes = [
        {"field": k, "old": old[k][:200], "new": str(getattr(post, k))[:200]}
        for k in data if old[k] != str(getattr(post, k))
    ]
    if not changes:
        raise ContentOpError("those fields already have those values")
    return {"kind": "edit_blog_post", "id": post.id, "title": post.title,
            "url": f"/admin/blog/{post.id}", "changes": changes}
```

Engine model `EditBlogPostAction {post_id: int, title/summary/body_html: str | None}`, card branch resolving the post title (query in tenant_context; raise `ContentOpError` when missing), token `{"kind": "edit_blog_post", "post_id", "params"}`, prompt line:

```
- edit_blog_post: update an existing post's title, summary, or body (post_id from the blog list)
```

`views._CREATORS`: `"edit_blog_post": lambda user, action: content.edit_blog_post(action["post_id"], action["params"])`. Audit: `"Updated blog post '{title}'"`.

- [ ] **Step 4: Run tests to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): edit_blog_post action"`

---

### Task 5: `publish_course` + `publish_blog_post` actions

**Files:**
- Modify: `engine.py`, `content.py`, `views.py`; `frontend-customer/src/lib/copilot/state.ts` (CREATE_KINDS untouched — publish shows "applied")
- Test: `backend/apps/core/tests/test_copilot_content.py`, `backend/apps/core/tests/test_copilot_engine.py`

**Interfaces:**
- Produces: `content.publish_course(course_id) -> dict`, `content.publish_blog_post(post_id) -> dict`. Both raise `ContentOpError` if already published. Cards must say plainly that the content goes live for students on confirm — the card IS the review gate (same argument as `create_event`).

- [ ] **Step 1: Failing tests**

```python
def test_publish_course_flips_flag(self):
    with tenant_context(self.tenant):
        course = Course.objects.create(title="C", instructor=self.coach, price=0,
                                       pricing_type="free", is_published=False)
        content.publish_course(course.pk)
        course.refresh_from_db()
    assert course.is_published is True

def test_publish_course_already_published_raises(self):
    with tenant_context(self.tenant):
        course = Course.objects.create(title="C", instructor=self.coach, price=0,
                                       pricing_type="free", is_published=True)
        with pytest.raises(content.ContentOpError):
            content.publish_course(course.pk)

def test_publish_blog_post_sets_status_and_date(self):
    with tenant_context(self.tenant):
        post = BlogPost.objects.create(title="P", status="draft",
                                       created_by=self.coach, slug="p")
        content.publish_blog_post(post.pk)
        post.refresh_from_db()
    assert post.status == "published"
    assert post.published_at is not None
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```python
def publish_course(course_id):
    from apps.courses.models import Course

    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        raise ContentOpError(f"no course with id {course_id}")
    if course.is_published:
        raise ContentOpError("that course is already published")
    course.is_published = True
    course.save(update_fields=["is_published"])
    return {"kind": "publish_course", "id": course.id, "title": course.title,
            "url": f"/admin/courses/{course.slug}"}


def publish_blog_post(post_id):
    from django.utils import timezone

    from apps.blog.models import BlogPost

    post = BlogPost.objects.filter(pk=post_id).first()
    if post is None:
        raise ContentOpError(f"no blog post with id {post_id}")
    if post.status == "published":
        raise ContentOpError("that post is already published")
    post.status = "published"
    post.published_at = timezone.now()
    post.save(update_fields=["status", "published_at"])
    return {"kind": "publish_blog_post", "id": post.id, "title": post.title,
            "url": f"/blog/{post.slug}"}
```

Engine: `PublishCourseAction {course_id: int}`, `PublishBlogPostAction {post_id: int}`; card details **must** read `"Goes live for students the moment you confirm."`. Card builders resolve titles (courses via `_course_for_cover`; posts via a tenant_context query) and check current published state so an already-published id drops with an honest reason. Prompt lines:

```
- publish_course / publish_blog_post: make a draft live (id from the lists); ONLY propose this when the coach asks to publish or confirms the draft is ready
```

`views._CREATORS`: `"publish_course": lambda user, action: content.publish_course(action["course_id"])`, `"publish_blog_post": lambda user, action: content.publish_blog_post(action["post_id"])`. Audit summaries: `"Published course '{title}'"` / `"Published blog post '{title}'"`.

- [ ] **Step 4: Run tests to verify pass. Phase gate:** `make test-changed` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): publish_course + publish_blog_post actions"`

---

# Phase B — Brand & site polish

### Task 6: `set_logo` action (curated logo library)

**Files:**
- Create: `backend/apps/core/copilot/logos.py`, `backend/apps/core/curated_logos/materialize.py`
- Modify: `engine.py`, `views.py`
- Test: `backend/apps/core/tests/test_copilot_photos.py` (logo tests live beside the photo-pick tests — same shortlist mechanics)

**Interfaces:**
- Produces: `logos.pick_logo(description, niche, exclude_s3_key=None) -> CuratedLogo` (raises `logos.LogoOpError`); `materialize_curated_logo(row) -> Photo` (tenant-schema, dedup by s3_key, `width/height=None` — `media.Photo` allows null dims); executor branch `set_logo` in `views._execute` writing `cfg.logo` + clearing `cfg.logo_url`, then busting `tenant:{schema}:config` cache.

- [ ] **Step 1: Failing tests**

```python
def test_pick_logo_matches_description(self):
    CuratedLogo.objects.create(title="Lotus mark", tags="yoga,calm,flower",
                               image_key="platform/curated-logos/lotus.png", enabled=True)
    CuratedLogo.objects.create(title="Barbell mark", tags="gym,strength",
                               image_key="platform/curated-logos/barbell.png", enabled=True)
    row = logos.pick_logo("a calm lotus flower", "yoga")
    assert row.title == "Lotus mark"

def test_pick_logo_excludes_current(self):
    CuratedLogo.objects.create(title="Only", tags="yoga",
                               image_key="platform/curated-logos/only.png", enabled=True)
    with pytest.raises(logos.LogoOpError):
        logos.pick_logo("anything", "yoga", exclude_s3_key="platform/curated-logos/only.png")

def test_materialize_curated_logo_creates_tenant_photo(self):
    row = CuratedLogo.objects.create(title="Mark",
                                     image_key="platform/curated-logos/mark.png", enabled=True)
    with tenant_context(self.tenant):
        photo = materialize_curated_logo(row)
        again = materialize_curated_logo(row)
    assert photo.s3_key == row.image_key
    assert photo.pk == again.pk  # dedup by s3_key
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `curated_logos/materialize.py` (mirror `curated_photos/materialize.py`; CuratedLogo has no dims/alt):

```python
"""Copy-on-use: turn a public-schema CuratedLogo into a tenant media.Photo.
Same non-duplicating reference model as curated_photos/materialize.py."""


def materialize_curated_logo(row):
    from apps.media.models import Photo

    existing = Photo.objects.filter(s3_key=row.image_key).first()
    if existing is not None:
        return existing
    return Photo.objects.create(
        s3_key=row.image_key, title=row.title, alt_text=row.title,
        content_type="image/png", width=None, height=None,
    )
```

`copilot/logos.py`:

```python
"""Curated-logo pick behind the copilot's set_logo action — the logo sibling
of photos.py: deterministic shortlist, no extra AI call, DB writes in the
execute view."""


class LogoOpError(Exception):
    """User-safe message describing why a logo operation was refused."""


SHORTLIST_LIMIT = 30


def pick_logo(description, niche, *, exclude_s3_key=None):
    from django_tenants.utils import schema_context

    from apps.core.models import CuratedLogo
    from apps.core.onboarding.ai_curate import CoachBrief, shortlist

    with schema_context("public"):
        rows = [
            r for r in CuratedLogo.objects.filter(enabled=True).order_by("position", "id")
            if r.image_key.startswith("platform/") and r.image_key != (exclude_s3_key or "")
        ]
    if not rows:
        raise LogoOpError("no logos are available in the library yet")
    brief = CoachBrief(niche=str(niche or "general"), description=str(description or ""))
    return shortlist(rows, brief, limit=SHORTLIST_LIMIT)[0]


def current_logo_key(tenant):
    """s3_key of the tenant's current logo Photo (to exclude on re-pick)."""
    from django_tenants.utils import tenant_context

    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.select_related("logo").first()
        return cfg.logo.s3_key if cfg and cfg.logo_id and cfg.logo else None
```

Engine: `SetLogoAction {kind: Literal["set_logo"], description: str = ""}`; card branch mirrors `set_block_image` (pick now, show `image_url` via `photos.preview_url`-style presign of `row.image_key` — add `preview_url(row)` to `logos.py` calling `generate_presigned_download_url(row.image_key, expiry=86400)`), token `{"kind": "set_logo", "curated_logo_id": row.pk}`. Detail: `"Ask for a different style anytime — nothing changes until you apply."` Prompt line:

```
- set_logo: put a ready-made logo from the platform library on the site (describe the style you want); propose again with a different description for another style
```

`views._execute` branch (before the block-ops fallthrough):

```python
    if kind == "set_logo":
        from django_tenants.utils import schema_context

        from apps.core.curated_logos.materialize import materialize_curated_logo
        from apps.core.models import CuratedLogo

        with schema_context("public"):
            row = CuratedLogo.objects.filter(pk=action.get("curated_logo_id"), enabled=True).first()
        if row is None:
            raise logos.LogoOpError("that logo is no longer available")
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise logos.LogoOpError("site is not set up yet")
            cfg.logo = materialize_curated_logo(row)
            cfg.logo_url = ""
            # Setup Assistant parity: a logo counts as "look edited".
            progress = dict(cfg.setup_progress or {})
            if not progress.get("look_edited"):
                progress["look_edited"] = True
                cfg.setup_progress = progress
            cfg.save(update_fields=["logo", "logo_url", "setup_progress"])
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return {"kind": kind}
```

Import `logos` alongside the other copilot modules in `views.py` and `engine.py`; add `logos.LogoOpError` to both drop/except tuples (engine `run_turn` card-drop except; views `copilot_execute` except). Audit summary: `"Set a new logo"`.

- [ ] **Step 4: Run tests to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): set_logo from the curated logo library"`

---

### Task 7: `edit_seo` action

**Files:**
- Modify: `engine.py`, `chrome.py` (validator), `views.py`
- Test: `backend/apps/core/tests/test_copilot_chrome.py`

**Interfaces:**
- Produces: `chrome.clean_meta_description(value) -> str` (strip, cap 300, raise `ChromeOpError` when empty); executor branch `edit_seo` writing `TenantConfig.meta_description`; card shows old→new via the generic `changes` rows.

- [ ] **Step 1: Failing tests**

```python
def test_clean_meta_description_caps_and_strips(self):
    assert chrome.clean_meta_description("  hello  ") == "hello"
    assert len(chrome.clean_meta_description("x" * 500)) == 300

def test_clean_meta_description_empty_raises(self):
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_meta_description("   ")
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `chrome.py`:

```python
def clean_meta_description(value):
    text = " ".join(str(value or "").split())
    if not text:
        raise ChromeOpError("the description cannot be empty")
    return text[:300]
```

Engine: `EditSeoAction {kind: Literal["edit_seo"], meta_description: str}`; card:

```python
    if isinstance(action, EditSeoAction):
        text = chrome.clean_meta_description(action.meta_description)
        from apps.tenant_config.models import TenantConfig
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
        old = (cfg.meta_description if cfg else "") or ""
        return {
            "kind": "edit_seo",
            "title": "Update the site's search description",
            "detail": "This is the text Google shows under your site name.",
            "changes": [{"page": "site", "block_type": "", "field": "meta_description",
                         "old": old[:200] or None, "new": text[:200]}],
            "token": tokens.stash_action(schema, {"kind": "edit_seo", "meta_description": text}),
        }
```

Prompt line:

```
- edit_seo: rewrite the site's meta description (the snippet search engines show); write it yourself from the site's content when the coach asks for "better Google text"
```

`views._execute` branch: load cfg in tenant_context, `cfg.meta_description = chrome.clean_meta_description(action.get("meta_description"))`, `cfg.save(update_fields=["meta_description"])`, cache bust, return `{"kind": kind}`. Audit: `"Updated the search description"`.

- [ ] **Step 4: Run tests. Phase gate:** `make test-changed` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): edit_seo meta-description action"`

---

# Phase C — Speed

### Task 8: Apply-all bundles (frontend) + bulk/recurring prompt steering

No new backend action kinds: the engine already returns N cards; the gap is one-click apply. Client loops the existing execute endpoint sequentially so each action keeps its own audit row and error isolation.

**Files:**
- Modify: `frontend-customer/src/components/copilot/action-card.tsx` (bundle context + ApplyAllBar), `frontend-customer/src/components/copilot/copilot-bubble.tsx` (render ApplyAllBar above multi-card entries), `backend/apps/core/copilot/engine.py` (two prompt lines)
- Test: `frontend-customer/src/lib/__tests__/copilot.test.ts` (bundle reducer), plus existing engine prompt snapshot tests if present

**Interfaces:**
- Produces: `CardBundleProvider` React context — cards register `(token, confirmFn)` on mount, deregister on done/dismiss; `<ApplyAllBar tokens={...}>` runs registered confirms sequentially, stopping on first failure (its toast already fired via each card's own `useAsyncAction`).

- [ ] **Step 1: Write the failing test** for the sequential runner (pure logic, extract as `runBundle`):

```typescript
// frontend-customer/src/lib/__tests__/copilot.test.ts
import { runBundle } from "@/lib/copilot/state";

it("runs confirms in order and stops on failure", async () => {
  const calls: string[] = [];
  const ok = (id: string) => async () => { calls.push(id); };
  const fail = async () => { throw new Error("nope"); };
  const result = await runBundle([ok("a"), ok("b"), fail, ok("d")]);
  expect(calls).toEqual(["a", "b"]);
  expect(result).toEqual({ done: 2, failed: true });
});
```

- [ ] **Step 2: Run** `make test-frontend` — expected FAIL (`runBundle` not exported).

- [ ] **Step 3: Implement.** In `state.ts`:

```typescript
/** Sequentially run card confirms; stop at the first failure so a broken
 * mid-bundle action never leaves later actions silently un-applied. */
export async function runBundle(
  confirms: (() => Promise<void>)[],
): Promise<{ done: number; failed: boolean }> {
  let done = 0;
  for (const confirm of confirms) {
    try {
      await confirm();
      done += 1;
    } catch {
      return { done, failed: true };
    }
  }
  return { done, failed: false };
}
```

In `action-card.tsx`: create `CardBundleContext` (`register(token, fn)`, `unregister(token)` backed by a `useRef<Map>` in the provider); `ActionCard` registers its `confirm` while `state === "proposed"`. Add:

```typescript
export function ApplyAllBar() {
  const t = useTranslations("student.copilot");
  const bundle = useContext(CardBundleContext);
  const { run, loading } = useAsyncAction(async () => {
    const confirms = bundle ? [...bundle.current.values()] : [];
    if (confirms.length < 2) return;
    const { done, failed } = await runBundle(confirms);
    if (!failed) toast.success(t("appliedAll", { count: done }));
  });
  return (
    <Button size="sm" variant="outline" onClick={run} loading={loading}
            loadingText={t("applying")}>
      {t("applyAll")}
    </Button>
  );
}
```

In `copilot-bubble.tsx`, wrap each assistant entry's cards in `CardBundleProvider` and render `<ApplyAllBar />` when `entry.cards.length > 1`. Add i18n keys `applyAll` ("Apply all"), `appliedAll` ("Applied {count} changes") to the `student.copilot` namespace in every locale messages file (`grep -rl "student" frontend-customer/messages/` to enumerate — currently en + tr).

Prompt steering in `SYSTEM_PROMPT` (engine.py, after the action list):

```
When several changes belong together (covers for every course missing one, a
weekly class for the next N weeks — max 12 cards, or a multi-section page
refresh), propose them as one set of cards in a single turn; the coach can
apply them all at once.
```

- [ ] **Step 4: Run** `make test-frontend` + `make lint` (loading-pattern check must pass). Manual check in the running dev stack: ask the copilot for covers on 2+ courses, click Apply all.
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): apply-all bundles + bulk/recurring steering"`

---

### Task 9: `draft_announcement` action

**Files:**
- Modify: `backend/apps/notifications/models.py` (add draft status), new migration `backend/apps/notifications/migrations/00XX_announcement_draft_status.py` (autogenerated), `engine.py`, `content.py`, `views.py`; frontend announcements admin list status labels
- Test: `backend/apps/core/tests/test_copilot_content.py`, `backend/apps/notifications/tests/` (one send-filter guard)

**Interfaces:**
- Produces: `content.create_announcement_draft(user, params) -> dict` (`params`: `title`, `body_html`, `link`); `Announcement.STATUS_CHOICES` gains `("draft", "Draft")`. **Safety invariant:** send tasks select on `status="scheduled"` (`tasks.py:81,96`) so drafts can never send — the guard test pins this.

- [ ] **Step 1: Failing tests**

```python
# test_copilot_content.py
def test_create_announcement_draft(self):
    with tenant_context(self.tenant):
        result = content.create_announcement_draft(self.coach, {
            "title": "New timetable", "body_html": "<p>From Monday…</p><script>x</script>",
            "link": "/courses"})
        row = Announcement.objects.get(pk=result["id"])
    assert row.status == "draft"
    assert "<script>" not in row.body
    assert result["url"] == "/admin/announcements"

# apps/notifications/tests/ (beside the existing send-task tests)
def test_draft_announcements_never_picked_up_by_send_tasks(self):
    Announcement.objects.create(title="Draft", status="draft")
    due = Announcement.objects.filter(status="scheduled", scheduled_at__lte=timezone.now())
    assert due.count() == 0
```

- [ ] **Step 2: Run to verify failure** (`make test-app APP=core` and `APP=notifications`).

- [ ] **Step 3: Implement.** Model: `STATUS_CHOICES = [("draft", "Draft"), ("scheduled", "Scheduled"), ("sent", "Sent")]`; run `make makemigrations` (choices-only migration, no schema change) then `make test-fresh`. `content.py`:

```python
def create_announcement_draft(user, params):
    from apps.notifications.models import Announcement
    from apps.tenant_config.defaults import sanitize_rich_text

    title = str(params.get("title") or "").strip()[:200]
    if not title:
        raise ContentOpError("the announcement needs a title")
    row = Announcement.objects.create(
        title=title,
        body=sanitize_rich_text(str(params.get("body_html") or "")),
        link=str(params.get("link") or "")[:500],
        status="draft",
        created_by=user if getattr(user, "pk", None) else None,
    )
    return {"kind": "draft_announcement", "id": row.id, "title": row.title,
            "url": "/admin/announcements"}
```

Engine: `DraftAnnouncementAction {kind: Literal["draft_announcement"], title: str, body_html: str = "", link: str = ""}`; card detail **must** read `"Saved as a draft — review and send it from Announcements. Nothing is sent now."`. Prompt line:

```
- draft_announcement: write an announcement to students as a DRAFT the coach reviews and sends from their admin (title, body_html with simple tags, optional internal link); you can never send anything yourself
```

`views._CREATORS`: `"draft_announcement": lambda user, action: content.create_announcement_draft(user, action["params"])`. Audit: `"Drafted announcement '{title}'"`. Frontend: `CREATE_KINDS` in `state.ts` gains `"draft_announcement"`; in the announcements admin page add a status label for `draft` (locate with `grep -rn "scheduled" frontend-customer/src/app --include=*.tsx -l | grep -i announce`; add a `Draft` chip mapping beside the existing `scheduled`/`sent` labels, plus the i18n key in both locale files).

- [ ] **Step 4: Run both app test suites. Phase gate:** `make test-changed` (+ `make e2e-changed` if the announcements page diff maps to a spec).
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): draft_announcement (inert draft status, coach sends from admin)"`

---

# Phase D — Trust & guidance

### Task 10: Capture undo inverses in the audit trail

**Files:**
- Modify: `backend/apps/tenant_config/models.py` (CopilotAudit + 2 fields), new tenant migration `backend/apps/tenant_config/migrations/0022_copilotaudit_inverse.py`, `backend/apps/core/copilot/views.py` (`_execute` returns `(result, inverse)`)
- Test: `backend/apps/core/tests/test_copilot_views.py`

**Interfaces:**
- Produces: `CopilotAudit.inverse` (JSONField, default dict — empty = not undoable) and `CopilotAudit.undone_at` (DateTimeField, null). `_execute(tenant, user, action) -> (result, inverse)`. Inverse kinds (private to the copilot): `restore_pages {pages}`, `edit_theme {theme}`, `restore_navbar {navbar_config}`, `restore_logo {logo_id, logo_url}`, `edit_seo {meta_description}`, `restore_course_cover {course_id, thumbnail_id}`. Entity actions (create/edit/publish/draft) return `{}` — not undoable in v1.

- [ ] **Step 1: Failing tests**

```python
def test_execute_pages_action_records_pages_inverse(self):
    # arrange a tenant with a hero block, build a toggle_block token, POST execute
    before = self._current_pages()
    self._execute_token(self._toggle_token(enabled=False))
    audit = self._latest_audit()
    assert audit.inverse["kind"] == "restore_pages"
    assert audit.inverse["pages"] == before

def test_execute_theme_action_records_old_theme(self):
    self._set_theme("ocean")
    self._execute_token(self._theme_token("ember"))
    assert self._latest_audit().inverse == {"kind": "edit_theme", "theme": "ocean"}

def test_create_course_has_empty_inverse(self):
    self._execute_token(self._create_course_token())
    assert self._latest_audit().inverse == {}
```

(Use the request/arrange helpers already present in `test_copilot_views.py` — the execute-view tests there already mint tokens via `tokens.stash_action` and POST `/api/v1/admin/copilot/execute/`.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Model fields + `make makemigrations` + `make test-fresh`:

```python
    inverse = models.JSONField(default=dict, blank=True)  # empty = not undoable
    undone_at = models.DateTimeField(null=True, blank=True)
```

In `views._execute`, capture pre-state per branch and return `(result, inverse)`:
- All `TenantConfig.pages`-mutating branches (`edit_pages`, `add_block`, `remove_block`, `move_block`, `edit_block_fields`, `toggle_block`, `duplicate_block`, `set_block_image`): before writing, `from copy import deepcopy; pages_before = deepcopy(cfg.pages or {})` → `inverse = {"kind": "restore_pages", "pages": pages_before}`. (For `edit_pages`, read the snapshot inside `tenant_context` before `site_ai.apply_edit`.)
- `edit_theme`: `inverse = {"kind": "edit_theme", "theme": cfg.theme}` (read before assignment).
- `edit_navbar`: `inverse = {"kind": "restore_navbar", "navbar_config": dict(cfg.navbar_config or {})}`.
- `set_logo`: `inverse = {"kind": "restore_logo", "logo_id": cfg.logo_id, "logo_url": cfg.logo_url}`.
- `edit_seo`: `inverse = {"kind": "edit_seo", "meta_description": cfg.meta_description}`.
- `set_course_cover`: `inverse = {"kind": "restore_course_cover", "course_id": course.pk, "thumbnail_id": course.thumbnail_id}` (read before assignment).
- Everything in `_CREATORS` and unknown kinds: `inverse = {}`.

Update the two call sites: `copilot_execute` unpacks `result, inverse = _execute(...)` and passes `inverse` through to `_record_audit(tenant, user, action, result, inverse)`; `_record_audit` stores it and **returns the created row's id** (`None` on failure — it is best-effort). `copilot_execute` response becomes `Response({"result": result, "audit_id": audit_id})`.

- [ ] **Step 4: Run tests to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): capture undo inverses on the audit trail"`

---

### Task 11: Undo endpoint + frontend undo affordance

**Files:**
- Modify: `backend/apps/core/copilot/views.py` (+ `copilot_undo`), `backend/apps/core/copilot/urls.py`, `frontend-customer/src/lib/copilot/api.ts`, `frontend-customer/src/lib/copilot/types.ts`, `frontend-customer/src/components/copilot/action-card.tsx`
- Test: `backend/apps/core/tests/test_copilot_views.py`

**Interfaces:**
- Produces: `POST /api/v1/admin/copilot/undo/ {audit_id}` → 200 `{"undone": kind}` | 400 (not latest / not undoable / already undone) | 404. **Only the most recent not-undone undoable entry may be undone** — pages inverses are full snapshots, so out-of-order undo would silently revert newer changes. Frontend: `undoCopilotAction(auditId)`; applied cards show an Undo link while they are the latest change.

- [ ] **Step 1: Failing tests**

```python
def test_undo_restores_pages_snapshot(self):
    before = self._current_pages()
    res = self._execute_token(self._toggle_token(enabled=False))
    undo = self.client.post("/api/v1/admin/copilot/undo/",
                            {"audit_id": res.data["audit_id"]}, format="json")
    assert undo.status_code == 200
    assert self._current_pages() == before
    assert self._latest_audit().undone_at is not None

def test_undo_rejects_non_latest(self):
    first = self._execute_token(self._toggle_token(enabled=False))
    self._execute_token(self._theme_token("ember"))
    res = self.client.post("/api/v1/admin/copilot/undo/",
                           {"audit_id": first.data["audit_id"]}, format="json")
    assert res.status_code == 400

def test_undo_twice_rejected(self):
    res = self._execute_token(self._theme_token("ember"))
    self.client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.data["audit_id"]}, format="json")
    again = self.client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.data["audit_id"]}, format="json")
    assert again.status_code == 400
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

```python
def _apply_inverse(tenant, inverse):
    from apps.tenant_config.models import TenantConfig

    kind = inverse.get("kind")
    with tenant_context(tenant):
        if kind == "restore_course_cover":
            from apps.courses.models import Course

            course = Course.objects.filter(pk=inverse.get("course_id")).first()
            if course is None:
                raise blocks.BlockOpError("that course no longer exists")
            course.thumbnail_id = inverse.get("thumbnail_id")
            course.save(update_fields=["thumbnail"])
            return
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError("site is not set up yet")
        if kind == "restore_pages":
            cfg.pages = inverse.get("pages") or {}
            cfg.save(update_fields=["pages"])
        elif kind == "edit_theme":
            cfg.theme = chrome.clean_theme(inverse.get("theme"))
            cfg.save(update_fields=["theme"])
        elif kind == "restore_navbar":
            cfg.navbar_config = inverse.get("navbar_config") or {}
            cfg.save(update_fields=["navbar_config"])
        elif kind == "restore_logo":
            cfg.logo_id = inverse.get("logo_id")
            cfg.logo_url = inverse.get("logo_url") or ""
            cfg.save(update_fields=["logo", "logo_url"])
        elif kind == "edit_seo":
            cfg.meta_description = str(inverse.get("meta_description") or "")
            cfg.save(update_fields=["meta_description"])
        else:
            raise blocks.BlockOpError("that change cannot be undone")
    cache.delete(f"tenant:{tenant.schema_name}:config")


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_undo(request):
    from django.utils import timezone

    from apps.tenant_config.models import CopilotAudit

    tenant = connection.tenant
    audit_id = (request.data or {}).get("audit_id")
    with tenant_context(tenant):
        latest = (
            CopilotAudit.objects.filter(undone_at__isnull=True)
            .exclude(inverse={})
            .order_by("-created_at", "-id")
            .first()
        )
        entry = CopilotAudit.objects.filter(pk=audit_id).first()
    if entry is None:
        return Response({"detail": "not_found"}, status=404)
    if entry.undone_at is not None or not entry.inverse:
        return Response({"detail": "not_undoable"}, status=400)
    if latest is None or latest.pk != entry.pk:
        return Response({"detail": "only the latest change can be undone"}, status=400)
    try:
        _apply_inverse(tenant, entry.inverse)
    except (blocks.BlockOpError, chrome.ChromeOpError) as exc:
        return Response({"detail": str(exc)}, status=400)
    with tenant_context(tenant):
        entry.undone_at = timezone.now()
        entry.save(update_fields=["undone_at"])
    logger.info("copilot undid %s schema=%s", entry.kind, tenant.schema_name)
    return Response({"undone": entry.kind})
```

`urls.py`: `path("undo/", views.copilot_undo, name="copilot-undo")`. Frontend: `api.ts` adds

```typescript
export const undoCopilotAction = (auditId: number) =>
  clientFetch<{ undone: string }>(`${BASE}/undo/`, {
    method: "POST",
    body: JSON.stringify({ audit_id: auditId }),
  });
```

`types.ts`: execute response type gains `audit_id: number | null`. `action-card.tsx`: in the `state === "done"` branch, when `auditId` is set render an Undo ghost button (wrapped in `useAsyncAction`; on success `announceSiteUpdated(); router.refresh(); toast.success(t("undone")); setState("dismissed")`). Hide it on 400 (another change landed since) by treating that error as `t("undoStale")` toast. i18n keys: `undo` ("Undo"), `undone` ("Change undone"), `undoStale` ("A newer change exists — undo it first from Recent changes.") in both locale files.

- [ ] **Step 4: Run backend + frontend tests, `make lint`. Manual: apply theme change → Undo → site reverts.**
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): undo the latest applied change"`

---

### Task 12: Setup guidance + stats digests (proactive next-steps, analytics answers)

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (`_setup_digest`, `_stats_digest`, `_user_turn`, prompt)
- Test: `backend/apps/core/tests/test_copilot_engine.py`

**Interfaces:**
- Produces: `_setup_digest(tenant) -> str` from `apps.tenant_config.setup_items.compute_setup_state(config, tenant)` (returns a dict with an `items` list of `{key, done, ...}` — inspect it once in a shell and list only not-done item keys; if the shape differs, format whatever boolean map it exposes as `Setup still open: a, b, c`); `_stats_digest(tenant) -> str` with model counts only (no usage-event semantics guessing).

- [ ] **Step 1: Failing tests**

```python
def test_stats_digest_counts(self):
    with tenant_context(self.tenant):
        Course.objects.create(title="C", instructor=self.coach, price=0,
                              pricing_type="free", is_published=True)
    digest = engine._stats_digest(self.tenant)
    assert "published courses: 1" in digest
    assert "students:" in digest

def test_setup_digest_lists_open_items(self):
    digest = engine._setup_digest(self.tenant)
    assert digest.startswith("Setup still open:") or digest == "Setup: all done"

def test_user_turn_includes_stats_and_setup(self):
    turn = engine._user_turn(self.tenant, [], [], "hi")
    assert "students:" in turn
    assert "Setup" in turn
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```python
def _stats_digest(tenant):
    """Read-only numbers the copilot may answer with — model counts only."""
    from datetime import timedelta

    from django.contrib.auth import get_user_model

    from apps.blog.models import BlogPost
    from apps.courses.models import Course
    from apps.live.models import LiveClass, OnsiteEvent

    with tenant_context(tenant):
        User = get_user_model()
        students = User.objects.filter(role="student").count()
        new_week = User.objects.filter(
            role="student", date_joined__gte=timezone.now() - timedelta(days=7)
        ).count()
        published = Course.objects.filter(is_published=True).count()
        drafts = Course.objects.filter(is_published=False).count()
        upcoming = (
            LiveClass.objects.filter(scheduled_at__gte=timezone.now()).count()
            + OnsiteEvent.objects.filter(scheduled_at__gte=timezone.now()).count()
        )
        posts_live = BlogPost.objects.filter(status="published").count()
    return (
        f"Stats: students: {students} ({new_week} new this week); "
        f"published courses: {published} ({drafts} draft); "
        f"upcoming events: {upcoming}; published posts: {posts_live}"
    )


def _setup_digest(tenant):
    from apps.tenant_config.models import TenantConfig
    from apps.tenant_config.setup_items import compute_setup_state

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        if cfg is None:
            return "Setup still open: site"
        state = compute_setup_state(cfg, tenant)
    open_items = [str(i.get("key", "")) for i in state.get("items", []) if not i.get("done")]
    return ("Setup still open: " + ", ".join(open_items)) if open_items else "Setup: all done"
```

Add both to `_user_turn` parts (after the courses digest). Prompt additions (module constant, after the KB rules note — still tenant-independent):

```
The user turn includes a Stats line (answer number questions from it — never
invent figures) and a Setup line. When the coach asks what to do next, use
the open setup items: explain the top one or two in plain words and, where
one maps to an action you have (logo, photos, events, blog), propose that
card directly.
```

- [ ] **Step 4: Run tests. Phase + plan gate:** `make test-changed`, `make lint`, `make e2e-changed`. Manual smoke in the dev stack: ask "how many students do I have?" and "what should I do next?".
- [ ] **Step 5: Commit** — `git commit -m "feat(copilot): setup guidance + stats digests"`

---

## Final verification (whole plan)

- [ ] `make test-fresh` once (two new migrations: notifications draft status, tenant_config 0022), then full `make test`.
- [ ] `make test-frontend`, `make lint`, `make typecheck`.
- [ ] `make e2e-spec SPEC=29-copilot` (extend the spec with one apply-all + one undo step if time allows; otherwise file it as a follow-up in docs/PRODUCT.md via /po add).
- [ ] Browser click-through on the dev stack: edit a course price, publish a draft, set a logo, apply-all covers, undo a theme switch, ask a stats question.
