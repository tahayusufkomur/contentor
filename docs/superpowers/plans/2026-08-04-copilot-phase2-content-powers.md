# Copilot Phase 2 — Content Powers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three content-creation actions to the coach copilot — `create_course`, `create_event`, `create_blog_post` — as confirmable cards that execute through the same DRF serializers the admin surfaces use.

**Architecture:** Phase 1 (shipped, on `main`) built the whole conversation loop: `engine.run_turn` returns `answer | ask | actions`, each action becomes a card with a single-use signed token, and `copilot_execute` runs the confirmed action. Phase 2 only extends three seams: the pydantic action union + card builder in `engine.py`, a new executor module `content.py` dispatched from `views._execute`, and the frontend card/result rendering. The union transport, tokens, SSE, auth, and metering conventions do not change.

**Tech Stack:** Django 5.1 + DRF (backend `apps/core/copilot/`), pydantic via `apps/core/ai.py`, Next.js 14 `frontend-customer` (vitest lib tests only), Playwright e2e.

**Design decision — events are `scheduled`, not `draft` (deviation from the spec's "draft-only" wording):** a `LiveClass`/`OnsiteEvent` created without `scheduled_at` stays `status="draft"` forever — `_ScheduledOnCreateMixin` (`backend/apps/live/serializers.py:43-57`) promotes draft→scheduled **only at creation**, the update path reuses the create serializer where the mixin doesn't hook, and nothing else in the lifecycle promotes it. A strictly-draft event would be permanently invisible to students with no way for the coach to publish it. So `create_event` requires a future `scheduled_at` and lands as `scheduled` — exactly what the coach gets creating an event in the admin — and the confirmation card states the date and that it becomes visible. Courses (`is_published=False`) and blog posts (`status="draft"`) are true drafts the coach publishes from the admin.

## Global Constraints

- No metering for the coach: no quota checks, no `record_update`, no upsell copy. Cost still lands via `ai_compose.record_spend` (already handled in `copilot_converse`'s `finally`; converse is untouched by this plan).
- Nothing executes without a tap: proposals are cards backed by single-use tokens (`tokens.stash_action` / `take_action`); executors only run from `copilot_execute` after confirm.
- `SYSTEM_PROMPT` stays a module-level constant, byte-identical across tenants (prompt-cache rule). Tenant specifics ride in the user turn.
- Both endpoints keep coach-JWT (`IsCoachOrOwner`, DRF default auth) — never clear `authentication_classes`.
- Fabricated social proof stays impossible: no testimonials block, and blog `body_html` passes `clean_rich_html` (via `BlogPostAdminSerializer.validate_body_html`).
- Frontend: `useAsyncAction` for async handlers, sonner toasts for outcomes, `<NavLink>` (never raw `next/link`), i18n keys under `student.copilot` in `messages/{en,tr}/student.json`.
- Frontend unit tests are lib-only `.ts` under `src/**/__tests__/` (no React harness); components are covered by build + e2e.
- Verification gates: `make test-app APP=core`, `cd frontend-customer && npm test && npm run build`, `make e2e-spec SPEC=29-copilot`, pre-commit clean. Never commit without the step saying so.

---

### Task 1: Backend content executors (`content.py`)

**Files:**
- Create: `backend/apps/core/copilot/content.py`
- Test: `backend/apps/core/tests/test_copilot_content.py`

**Interfaces:**
- Consumes: `CourseCreateUpdateSerializer` (`apps/courses/serializers.py:278`), `LiveClassCreateSerializer` / `OnsiteEventCreateSerializer` (`apps/live/serializers.py:164,390`), `BlogPostAdminSerializer` + `unique_slug` (`apps/blog/serializers.py:56`, `apps/blog/models.py:11`), `settings.COPILOT_MODEL`.
- Produces (used by Task 3's dispatch — callers run these inside `tenant_context(tenant)`):
  - `create_course(user, params: dict) -> dict` — result `{"kind": "create_course", "id": int, "title": str, "url": f"/admin/courses/{slug}"}`
  - `create_event(user, event_kind: str, params: dict) -> dict` — result `{"kind": "create_event", "id": int, "title": str, "url": "/admin/live"}`
  - `create_blog_post(user, params: dict) -> dict` — result `{"kind": "create_blog_post", "id": int, "title": str, "url": f"/admin/blog/{id}"}`
  - `ContentOpError(Exception)` — user-safe refusal message (the analogue of `blocks.BlockOpError`)

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_copilot_content.py` (fixtures mirror `test_copilot_views.py` — same `tenant_ctx` conftest fixture, same coach shape):

```python
"""Copilot content executors: each create_* runs the same DRF serializer the
admin surface uses, injects the server-side fields, and returns a result-card
payload. Course and blog land as drafts; events land as 'scheduled' (a draft
event can never be published later — see the phase-2 plan)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.core.copilot import content

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="copilot-content@x.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


def test_create_course_lands_as_draft_with_outline(coach):
    from apps.courses.models import Course

    result = content.create_course(
        coach,
        {
            "title": "Yoga Foundations",
            "description": "Start here.",
            "price": "49.00",
            "pricing_type": "paid",
            "modules": [
                {"title": "Basics", "lessons": [{"title": "Breathing"}, {"title": "Posture"}]},
                {"title": "Flow", "lessons": [{"title": "Sun salutation"}]},
            ],
        },
    )
    course = Course.objects.get(id=result["id"])
    assert course.is_published is False
    assert course.instructor == coach
    assert course.slug  # derived server-side in Course.save()
    modules = list(course.modules.order_by("order"))
    assert [m.title for m in modules] == ["Basics", "Flow"]
    assert modules[0].lessons.count() == 2
    assert result["kind"] == "create_course"
    assert result["url"] == f"/admin/courses/{course.slug}"


def test_create_course_invalid_input_raises_user_safe_error(coach):
    with pytest.raises(content.ContentOpError):
        content.create_course(coach, {"title": ""})


def test_create_event_live_lands_scheduled(coach):
    from apps.live.models import LiveClass

    when = timezone.now() + timedelta(days=7)
    result = content.create_event(
        coach, "live", {"title": "Morning flow", "scheduled_at": when.isoformat()}
    )
    event = LiveClass.objects.get(id=result["id"])
    assert event.status == "scheduled"  # _ScheduledOnCreateMixin, same as the admin path
    assert event.instructor == coach
    assert result["url"] == "/admin/live"


def test_create_event_onsite_carries_location(coach):
    from apps.live.models import OnsiteEvent

    when = timezone.now() + timedelta(days=14)
    result = content.create_event(
        coach,
        "onsite",
        {"title": "Berlin retreat", "location": "Studio Mitte", "scheduled_at": when.isoformat()},
    )
    event = OnsiteEvent.objects.get(id=result["id"])
    assert event.status == "scheduled"
    assert event.location == "Studio Mitte"


def test_create_blog_post_draft_sanitized_and_stamped_ai(coach):
    from django.conf import settings

    from apps.blog.models import BlogPost

    result = content.create_blog_post(
        coach,
        {
            "title": "5 stretches before breakfast",
            "excerpt": "A five-minute routine.",
            "body_html": "<h2>Why</h2><p>It works.</p><script>evil()</script>",
        },
    )
    post = BlogPost.objects.get(id=result["id"])
    assert post.status == "draft"
    assert post.published_at is None
    assert post.source == "ai"
    assert post.ai_model == settings.COPILOT_MODEL
    assert post.created_by == coach
    assert post.slug  # unique_slug() must be called manually off-viewset
    assert "<script>" not in post.body_html  # clean_rich_html ran
    assert result["url"] == f"/admin/blog/{post.id}"


def test_create_blog_post_requires_title(coach):
    with pytest.raises(content.ContentOpError):
        content.create_blog_post(coach, {"excerpt": "no title"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest apps/core/tests/test_copilot_content.py -x -q` (or `make test-app APP=core` scoped equivalent; use the repo's usual in-container invocation, e.g. `docker compose exec django python -m pytest apps/core/tests/test_copilot_content.py -q`)
Expected: FAIL — `ModuleNotFoundError`/`ImportError: cannot import name 'content'`

- [ ] **Step 3: Write the implementation**

Create `backend/apps/core/copilot/content.py`:

```python
"""Content-creation executors behind the copilot's create_* actions.

Each function validates through the same DRF serializer the admin surface
uses, calling it outside its viewset and injecting the server-side fields
(the wizard-content convention — see apps/core/onboarding/content.py).
Courses and blog posts land as drafts; events land as 'scheduled' because
nothing in the live app promotes a draft event after creation — the
copilot's confirmation card is the review step and states the date.
Callers wrap these in tenant_context; imports are function-local to match
apps/core's cycle-dodging convention."""

from django.conf import settings


class ContentOpError(Exception):
    """User-safe message describing why a create was refused."""


def _fail(errors):
    field, messages = next(iter(errors.items()))
    first = messages[0] if isinstance(messages, list) and messages else messages
    raise ContentOpError(f"{field}: {first}")


def create_course(user, params):
    from apps.courses.serializers import CourseCreateUpdateSerializer

    serializer = CourseCreateUpdateSerializer(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    course = serializer.save(instructor=user, is_published=False)
    return {
        "kind": "create_course",
        "id": course.id,
        "title": course.title,
        "url": f"/admin/courses/{course.slug}",
    }


def create_event(user, event_kind, params):
    from apps.live.serializers import LiveClassCreateSerializer, OnsiteEventCreateSerializer

    serializer_class = OnsiteEventCreateSerializer if event_kind == "onsite" else LiveClassCreateSerializer
    serializer = serializer_class(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    event = serializer.save(instructor=user)
    return {"kind": "create_event", "id": event.id, "title": event.title, "url": "/admin/live"}


def create_blog_post(user, params):
    from apps.blog.models import unique_slug
    from apps.blog.serializers import BlogPostAdminSerializer

    serializer = BlogPostAdminSerializer(data=params)
    if not serializer.is_valid():
        _fail(serializer.errors)
    post = serializer.save(
        created_by=user,
        slug=unique_slug(serializer.validated_data.get("title", "")),
        published_at=None,
        source="ai",
        ai_model=settings.COPILOT_MODEL,
    )
    return {"kind": "create_blog_post", "id": post.id, "title": post.title, "url": f"/admin/blog/{post.id}"}
```

Notes for the implementer:
- `serializer.save(**kwargs)` merges kwargs into `validated_data`, which is how read-only fields (`source`, `ai_model`) and the server-derived `slug` get injected — same trick `BlogPostAdminViewSet.perform_create` and `wizard_create_blog` use.
- Do NOT accept `status`, `is_published`, or `noindex` from `params` — the action builder in Task 2 never puts them there, and the serializer defaults handle draft.
- `Course.save()` derives the course slug itself; only blog needs the explicit `unique_slug()` call (its model `save()` does not derive it).

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2.
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/content.py backend/apps/core/tests/test_copilot_content.py
git commit -m "feat(copilot): content-create executors for course, event, blog draft"
```

---

### Task 2: Engine — action union, prompt, proposal cards

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (union at :43-78, `SYSTEM_PROMPT` at :25-40, `_card` at :120-160)
- Test: `backend/apps/core/tests/test_copilot_engine.py` (append)

**Interfaces:**
- Consumes: `tokens.stash_action(schema, payload)` (Phase 1), `content.ContentOpError` (Task 1 — imported for the past-date refusal).
- Produces: three new members of `CopilotAction` (`CreateCourseAction`, `CreateEventAction`, `CreateBlogPostAction`) and `_card` branches that stash exactly these payload shapes (Task 3's dispatch and Task 1's executors depend on them):
  - `{"kind": "create_course", "params": {title, description, price: "NN.NN", pricing_type, modules: [{"title", "lessons": [{"title"}]}]}}`
  - `{"kind": "create_event", "event_kind": "live"|"onsite", "params": {title, description, price, pricing_type, scheduled_at: iso-string, (+ location for onsite)}}`
  - `{"kind": "create_blog_post", "params": {title, excerpt, body_html}}`
- Card dicts keep the Phase 1 shape `{kind, title, detail, token}` (no `changes` — the generic frontend card renders them as-is).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_copilot_engine.py`:

```python
def test_create_course_action_becomes_card_with_stashed_params():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_course",
                "title": "Yoga Foundations",
                "description": "Start here.",
                "price": 49,
                "modules": [{"title": "Basics", "lessons": ["Breathing", "Posture"]}],
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "create my first course")
    (card,) = payload["actions"]
    assert card["kind"] == "create_course"
    assert "Yoga Foundations" in card["title"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["pricing_type"] == "paid"
    assert stashed["params"]["price"] == "49.00"
    assert stashed["params"]["modules"][0]["lessons"] == [{"title": "Breathing"}, {"title": "Posture"}]
    assert "is_published" not in stashed["params"]


def test_create_event_card_requires_future_date():
    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_event",
                "event_kind": "live",
                "title": "Morning flow",
                "scheduled_at": "2020-01-01T09:00:00Z",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "schedule a class")
    assert payload["kind"] == "answer"  # past-date proposal dropped, fallback answer


def test_create_event_onsite_card_stashes_location_and_kind():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_event",
                "event_kind": "onsite",
                "title": "Berlin retreat",
                "location": "Studio Mitte",
                "scheduled_at": "2030-06-01T10:00:00Z",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "plan a retreat")
    (card,) = payload["actions"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["event_kind"] == "onsite"
    assert stashed["params"]["location"] == "Studio Mitte"
    assert stashed["params"]["scheduled_at"].startswith("2030-06-01")


def test_create_blog_post_card_maps_summary_to_excerpt():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[
            {
                "kind": "create_blog_post",
                "title": "5 stretches",
                "summary": "A five-minute routine.",
                "body_html": "<p>Go.</p>",
            }
        ],
    )
    with (
        mock.patch.object(engine.core_ai, "structured", return_value=(parsed, Decimal("0.01"), "m")),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
    ):
        payload, _ = engine.run_turn(TENANT, [], [], "write a blog post")
    (card,) = payload["actions"]
    assert card["kind"] == "create_blog_post"
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed["params"]["excerpt"] == "A five-minute routine."
    assert "status" not in stashed["params"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest apps/core/tests/test_copilot_engine.py -q`
Expected: the 4 new tests FAIL with pydantic validation errors ("Input tag 'create_course' found using 'kind' does not match any of the expected tags"); the 5 Phase 1 tests still pass.

- [ ] **Step 3: Implement — union members, prompt lines, card branches**

In `backend/apps/core/copilot/engine.py`:

3a. Add imports (top of file): `from datetime import UTC, datetime` and extend the copilot import line to `from apps.core.copilot import blocks, content, tokens`. Also `from django.utils import timezone`.

3b. Append to `SYSTEM_PROMPT` (inside the existing parenthesized string, after the move_block line, before the final "Use block ids…" sentence):

```python
    "- create_course: create a DRAFT course (title, description, price, "
    "modules each with lesson titles); the coach reviews and publishes it "
    "from their admin\n"
    "- create_event: schedule a live class (event_kind=live) or an "
    "in-person event (event_kind=onsite, include location), with a future "
    "ISO 8601 scheduled_at — it becomes visible to students once the coach "
    "confirms the card\n"
    "- create_blog_post: create a DRAFT blog post (title, one-sentence "
    "summary, full body_html using simple tags: h2, h3, p, ul, li, strong)\n"
```

3c. Add the pydantic models after `MoveBlockAction` and extend the union:

```python
class CourseModuleOutline(BaseModel):
    title: str
    lessons: list[str] = Field(default_factory=list)


class CreateCourseAction(BaseModel):
    kind: Literal["create_course"]
    title: str
    description: str = ""
    price: float = 0
    modules: list[CourseModuleOutline] = Field(default_factory=list)


class CreateEventAction(BaseModel):
    kind: Literal["create_event"]
    event_kind: Literal["live", "onsite"] = "live"
    title: str
    description: str = ""
    scheduled_at: datetime
    location: str = ""
    price: float = 0


class CreateBlogPostAction(BaseModel):
    kind: Literal["create_blog_post"]
    title: str
    summary: str = ""
    body_html: str = ""


CopilotAction = Annotated[
    EditPagesAction
    | AddBlockAction
    | RemoveBlockAction
    | MoveBlockAction
    | CreateCourseAction
    | CreateEventAction
    | CreateBlogPostAction,
    Field(discriminator="kind"),
]
```

3d. Add branches to `_card` (before the final `move_block` return; the create cards are pure param packaging — no DB, no preview compute):

```python
    if isinstance(action, CreateCourseAction):
        price = max(action.price, 0)
        params = {
            "title": action.title[:200],
            "description": action.description,
            "price": f"{price:.2f}",
            "pricing_type": "paid" if price > 0 else "free",
            "modules": [
                {"title": m.title[:200], "lessons": [{"title": t[:200]} for t in m.lessons]}
                for m in action.modules
            ],
        }
        lesson_count = sum(len(m.lessons) for m in action.modules)
        price_label = "free" if price == 0 else params["price"]
        return {
            "kind": "create_course",
            "title": f"Create draft course: {action.title[:120]}",
            "detail": f"{len(action.modules)} module(s), {lesson_count} lesson(s) — {price_label}",
            "token": tokens.stash_action(schema, {"kind": "create_course", "params": params}),
        }
    if isinstance(action, CreateEventAction):
        when = action.scheduled_at if action.scheduled_at.tzinfo else action.scheduled_at.replace(tzinfo=UTC)
        if when <= timezone.now():
            raise content.ContentOpError("event date must be in the future")
        price = max(action.price, 0)
        params = {
            "title": action.title[:200],
            "description": action.description,
            "price": f"{price:.2f}",
            "pricing_type": "paid" if price > 0 else "free",
            "scheduled_at": when.isoformat(),
        }
        if action.event_kind == "onsite":
            params["location"] = action.location[:500]
        label = "onsite event" if action.event_kind == "onsite" else "live class"
        return {
            "kind": "create_event",
            "title": f"Schedule {label}: {action.title[:120]}",
            "detail": f"{when:%b %d, %Y %H:%M} — visible to students once confirmed",
            "token": tokens.stash_action(
                schema, {"kind": "create_event", "event_kind": action.event_kind, "params": params}
            ),
        }
    if isinstance(action, CreateBlogPostAction):
        params = {
            "title": action.title[:200],
            "excerpt": action.summary[:300],
            "body_html": action.body_html,
        }
        return {
            "kind": "create_blog_post",
            "title": f"Draft blog post: {action.title[:120]}",
            "detail": action.summary[:500] or "Draft for your review",
            "token": tokens.stash_action(schema, {"kind": "create_blog_post", "params": params}),
        }
```

(`run_turn`'s existing `except Exception` around `_card` already turns the past-date `ContentOpError` into a dropped card + fallback answer — no change there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest apps/core/tests/test_copilot_engine.py apps/core/tests/test_copilot_content.py -q`
Expected: all pass (9 engine + 6 content).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/engine.py backend/apps/core/tests/test_copilot_engine.py
git commit -m "feat(copilot): propose create_course/create_event/create_blog_post cards"
```

---

### Task 3: Execute dispatch

**Files:**
- Modify: `backend/apps/core/copilot/views.py` (`_execute` at :73-95, `copilot_execute` at :98-112)
- Test: `backend/apps/core/tests/test_copilot_views.py` (append)

**Interfaces:**
- Consumes: Task 1's `content.create_*` functions and `ContentOpError`; Task 2's stashed payload shapes.
- Produces: `POST /api/v1/admin/copilot/execute/` response `{"result": {"kind", "id", "title", "url"}}` for create actions (Task 4's frontend renders `result.url`). Validation failures → `400 {"detail": "<field>: <message>"}`; token failures stay `403 {"detail": "invalid_token"}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_copilot_views.py`:

```python
def test_execute_create_course_creates_draft_and_returns_url(client, coach):
    from apps.courses.models import Course

    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_course", "params": {"title": "Yoga 101", "price": "0.00", "pricing_type": "free"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    result = resp.json()["result"]
    course = Course.objects.get(id=result["id"])
    assert course.is_published is False
    assert course.instructor == coach
    assert result["url"] == f"/admin/courses/{course.slug}"


def test_execute_create_event_lands_scheduled(client, coach):
    from datetime import timedelta

    from django.utils import timezone

    from apps.live.models import LiveClass

    when = (timezone.now() + timedelta(days=3)).isoformat()
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_event", "event_kind": "live", "params": {"title": "Flow", "scheduled_at": when}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert LiveClass.objects.get(id=resp.json()["result"]["id"]).status == "scheduled"


def test_execute_create_blog_post_draft(client, coach):
    from apps.blog.models import BlogPost

    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_blog_post", "params": {"title": "Hello", "excerpt": "hi", "body_html": "<p>x</p>"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    post = BlogPost.objects.get(id=resp.json()["result"]["id"])
    assert post.status == "draft" and post.created_by == coach


def test_execute_create_validation_failure_returns_400_detail(client):
    token = copilot_tokens.stash_action("shared_test", {"kind": "create_course", "params": {"title": ""}})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "title" in resp.json()["detail"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest apps/core/tests/test_copilot_views.py -q`
Expected: the 4 new tests FAIL (`_execute` raises `BlockOpError("unknown action: create_course")` → 400 in the first three, and the last asserts "title" in a detail that says "unknown action…"). Phase 1's 8 tests still pass.

- [ ] **Step 3: Implement the dispatch**

In `backend/apps/core/copilot/views.py`:

3a. Extend the copilot import: `from apps.core.copilot import blocks, content, engine, tokens`.

3b. Add a creator table above `_execute` and route create kinds; thread `user` through:

```python
_CREATORS = {
    "create_course": lambda user, action: content.create_course(user, action["params"]),
    "create_event": lambda user, action: content.create_event(user, action["event_kind"], action["params"]),
    "create_blog_post": lambda user, action: content.create_blog_post(user, action["params"]),
}


def _execute(tenant, user, action):
    from apps.tenant_config.models import TenantConfig

    kind = action.get("kind")
    if kind == "edit_pages":
        site_ai.apply_edit(tenant, action["pages"], extras=action.get("extras"))
        return {"kind": kind, "changes_count": action.get("changes_count", 0)}
    creator = _CREATORS.get(kind)
    if creator is not None:
        with tenant_context(tenant):
            return creator(user, action)
    with tenant_context(tenant):
        # ... existing block-op body unchanged (cfg fetch, add/remove/move, save) ...
```

3c. In `copilot_execute`: change the call to `result = _execute(tenant, request.user, action)` and widen the error mapping:

```python
    try:
        result = _execute(tenant, request.user, action)
    except (blocks.BlockOpError, content.ContentOpError) as exc:
        return Response({"detail": str(exc)}, status=400)
```

- [ ] **Step 4: Run the whole copilot suite**

Run: `python -m pytest apps/core/tests/test_copilot_views.py apps/core/tests/test_copilot_engine.py apps/core/tests/test_copilot_content.py apps/core/tests/test_copilot_tokens.py apps/core/tests/test_copilot_blocks.py -q`
Expected: all pass. Then `make test-app APP=core` for the app-level gate.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/views.py backend/apps/core/tests/test_copilot_views.py
git commit -m "feat(copilot): execute content creates behind confirm tokens"
```

---

### Task 4: Frontend — kinds, result link, toast copy, i18n

**Files:**
- Modify: `frontend-customer/src/lib/copilot/types.ts`
- Modify: `frontend-customer/src/lib/copilot/api.ts`
- Modify: `frontend-customer/src/lib/copilot/state.ts`
- Modify: `frontend-customer/src/components/copilot/action-card.tsx`
- Modify: `frontend-customer/messages/en/student.json`, `frontend-customer/messages/tr/student.json` (the `copilot` namespace)
- Test: `frontend-customer/src/lib/__tests__/copilot.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's execute response `{result: {kind, id?, title?, url?, changes_count?, page?}}`.
- Produces: `ActionKind` union type, `ExecuteResult` interface, `isCreateKind(kind: string): boolean` (exported from `state.ts`; used by `action-card.tsx` to pick toast/done copy).

- [ ] **Step 1: Write the failing lib test**

Append to `frontend-customer/src/lib/__tests__/copilot.test.ts` (import `isCreateKind` from `../copilot/state`):

```ts
describe("isCreateKind", () => {
  it("separates content creates from site edits", () => {
    expect(isCreateKind("create_course")).toBe(true);
    expect(isCreateKind("create_event")).toBe(true);
    expect(isCreateKind("create_blog_post")).toBe(true);
    expect(isCreateKind("edit_pages")).toBe(false);
    expect(isCreateKind("add_block")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend-customer && npm test`
Expected: FAIL — `isCreateKind` is not exported.

- [ ] **Step 3: Implement types + helper + card rendering**

3a. `src/lib/copilot/types.ts` — widen the kind union and type the execute result:

```ts
export type ActionKind =
  | "edit_pages"
  | "add_block"
  | "remove_block"
  | "move_block"
  | "create_course"
  | "create_event"
  | "create_blog_post";

export interface ActionCard {
  kind: ActionKind;
  title: string;
  detail: string;
  changes?: DiffRow[];
  token: string;
}

export interface ExecuteResult {
  kind: string;
  changes_count?: number;
  page?: string;
  id?: number;
  title?: string;
  url?: string;
}
```

3b. `src/lib/copilot/api.ts` — reuse the new type (drop the inline shape):

```ts
export const executeCopilotAction = (token: string) =>
  clientFetch<{ result: ExecuteResult }>(`${BASE}/execute/`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
```

(add `ExecuteResult` to the `types` import.)

3c. `src/lib/copilot/state.ts` — add the exported helper:

```ts
const CREATE_KINDS = new Set(["create_course", "create_event", "create_blog_post"]);

export const isCreateKind = (kind: string) => CREATE_KINDS.has(kind);
```

3d. `src/components/copilot/action-card.tsx` — keep the generic card, but capture the result and link to the created draft. Changes (match the existing component style; imports: `isCreateKind` from `@/lib/copilot/state`, `ExecuteResult` type, `NavLink` from the app's nav components — the same one other admin views use, never raw `next/link`):

```tsx
const [result, setResult] = useState<ExecuteResult | null>(null);

const { run: confirm, loading } = useAsyncAction(
  async () => {
    const res = await executeCopilotAction(card.token);
    setResult(res.result);
    setState("done");
    router.refresh();
    toast.success(t(isCreateKind(card.kind) ? "created" : "applied"));
  },
  { errorToast: t("error") },
);
```

and in the `state === "done"` render:

```tsx
<p className="mt-2 text-xs font-medium text-primary">
  {t(isCreateKind(card.kind) ? "createdShort" : "appliedShort")}
  {result?.url ? (
    <NavLink href={result.url} className="ml-2 underline">
      {t("view")}
    </NavLink>
  ) : null}
</p>
```

3e. i18n — add to the `copilot` object in `messages/en/student.json`:

```json
"created": "Done — it's been created as a draft for your review.",
"createdShort": "Created",
"view": "Open"
```

and in `messages/tr/student.json`:

```json
"created": "Hazır — incelemeniz için taslak olarak oluşturuldu.",
"createdShort": "Oluşturuldu",
"view": "Aç"
```

- [ ] **Step 4: Verify**

Run: `cd frontend-customer && npm test && npm run build`
Expected: tests pass (7 + new), build clean (this also type-checks the component changes; `make lint` covers the loading-pattern checker).

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/copilot frontend-customer/src/lib/__tests__/copilot.test.ts frontend-customer/src/components/copilot/action-card.tsx frontend-customer/messages/en/student.json frontend-customer/messages/tr/student.json
git commit -m "feat(copilot): render create-action cards with a link to the new draft"
```

---

### Task 5: e2e — create flow through the widget

**Files:**
- Modify: `e2e/specs/29-copilot.spec.ts` (append one test; mirror the first test's setup exactly)
- Verify: `e2e/impact-map.json` (frontend copilot paths already map to `29-copilot`; add a backend mapping if `backend/apps/core/copilot` has none)

**Interfaces:**
- Consumes: the widget UI (Task 4) and the stubbed wire shapes from Tasks 2–3.

- [ ] **Step 1: Append the test**

In `e2e/specs/29-copilot.spec.ts`, after the existing confirm test (same imports; reuse the exact `coachContext`/`TENANT` setup and open/send interaction lines from test 1 — placeholder `"e.g. make this section warmer"`, `Send` exact, `?copilot=1` deep link):

```ts
test("a create-course card confirms and links to the new draft", async ({ browser }) => {
  const page = await coachContext(browser);
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Course plan ready.",' +
        '"actions":[{"kind":"create_course","title":"Create draft course: Yoga 101",' +
        '"detail":"2 module(s), 6 lesson(s) — free","token":"e2e-course-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({
      json: { result: { kind: "create_course", id: 1, title: "Yoga 101", url: "/admin/courses/yoga-101" } },
    });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByPlaceholder("e.g. make this section warmer").fill("create my first course");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Create draft course: Yoga 101")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Created", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open" })).toHaveAttribute("href", /\/admin\/courses\/yoga-101/);
  expect(executed).toBe(true);
  await page.close();
});
```

(If test 1 uses different exact locators for open/send, copy those — the locators above are from the current spec.)

- [ ] **Step 2: Check the impact map**

Open `e2e/impact-map.json`. The `frontend-customer` section already maps `src/components/copilot` and `src/lib/copilot` → `["29-copilot"]`. Find the backend section: if `backend/apps/core/copilot` (or the `apps/core` prefix that covers it) has no mapping to `29-copilot`, add one following the file's existing backend entry format. If backend paths aren't part of the map's scheme, skip — `make lint`'s selector self-test is the gate.

- [ ] **Step 3: Run the spec**

Run: `make e2e-spec SPEC=29-copilot` (dev stack must be up — check `make health-check` first, do not rebuild).
Expected: 3 passed.

- [ ] **Step 4: Full verification gate**

```bash
make test-changed
make lint
cd frontend-customer && npm test && npm run build
```
Expected: all green, pre-commit-clean.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/29-copilot.spec.ts e2e/impact-map.json
git commit -m "test(copilot): e2e create-course card confirm flow"
```

---

## Out of scope (explicitly)

- Publishing anything: no `is_published=True`, no blog `status="published"` from the copilot.
- Phase 3 items: `edit_theme`/`edit_navbar`, platform-KB grounding, superadmin ask-cap setting.
- Persisting conversation across navigations, per-kind card UIs, editing/deleting existing content.
- `npm run gen:api`: no drf-spectacular-visible serializer changed (copilot endpoints are plain `api_view`s), so no regen expected — if `make lint`/CI flags a schema diff anyway, regenerate and review.

## Self-review notes (done at planning time)

- Spec coverage: `create_course` (Task 1–3), `create_event` (1–3), `create_blog_post` (1–3), cards + result rendering (2, 4), testing section's "each executor against real serializers" (Task 1), e2e widget flow (5). The spec's "created as draft" for events is deliberately implemented as `scheduled` — rationale in the header; raise with the owner if that reading is wrong.
- Type consistency: stashed payload keys (`params`, `event_kind`) match between Task 2 (producer) and Tasks 1/3 (consumers); `ExecuteResult.url` matches backend result dicts; `isCreateKind` names match between state.ts and action-card.tsx.
- Phase 1 conventions honored: single-use tokens, tenant-schema guard in `take_action`, `record_spend` untouched, generic card component reused, lib-only frontend tests, `NavLink` navigation.
