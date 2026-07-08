# Community Phase 4 — Notifications + Unread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the engagement loop — web-push when the coach posts (respecting the settings toggle), web-push to a post's author when someone comments, and an unread dot on the student's Community nav link.

**Architecture:** Reuse the announcements push machinery wholesale: payload builders + `send_to_subscriptions`/`broadcast_to_tenant` from `apps.notifications.services`, and the `@shared_task fanout_x(id, schema_name)` Celery pattern from `apps.notifications.tasks`. Community gets its own small `payloads.py` + `tasks.py`; the Phase 1 views enqueue with `connection.schema_name`. Unread rides the existing `GET settings/` call the student layout already makes — one new `has_new_posts` field, zero extra requests.

**Tech Stack:** Celery + Redis, pywebpush (via `apps.notifications.services`), DRF, Next.js.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-06-community-feature-design.md` §7 (Notifications) + §5 unread dot. **Prerequisites: Phases 1–3 merged to local main.**
- Branch `feat/community-phase-4` in an **isolated worktree** off local `main`; verify `git branch --show-current` before every commit.
- **Isolated dev stack recipe** — same as Phase 2/3 plans (copy `.env` + `AWS_ENDPOINT_EXTERNAL=http://localhost:19000`; `docker-compose.worktree.yml` with `!override` ports, caddy `18080:80` + `container_name: contentor-caddy-phase4`; project `contentor-community-phase-4`) — **plus the `celery-worker` service** this time:
  `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml up -d --build caddy postgres redis minio minio-init django celery-worker nextjs-customer nextjs-main`
- Push senders live in `apps.notifications.services` (`send_to_subscription(s)`, `broadcast_to_tenant`) — do NOT reimplement webpush/VAPID handling. Payload dicts follow `apps.notifications.payloads` (`_brand()`-based `{title, body, url, icon…}`) so the existing student service worker renders them with zero changes.
- Tests never send real pushes: monkeypatch `apps.community.tasks.send_to_subscriptions` (and call task functions synchronously — no worker needed). Views are tested by monkeypatching the task's `.delay`.
- Moderation/notification silences: removal, hide, ban, mute send NOTHING to the affected member (spec: silent in v1).
- The unread check must NOT lazily create `CommunityMember` rows (nav renders on every page for every student — creating rows there would register every student as a member on first paint).
- Empty-success responses stay 204; `clientFetch` handles them.
- Backend tests: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/ -q` — baseline 59 passed (after Phase 3).

## File Structure

```
backend/apps/community/
  payloads.py                  # push payload builders (new)
  tasks.py                     # fanout_community_post, notify_post_comment (new)
  views.py                     # enqueue hooks + has_new_posts in settings_view (modify)
  tests/test_notifications.py  # (new)
  tests/test_unread.py         # (new)
frontend-customer/src/
  app/(student)/layout.tsx     # pass hasNewCommunityPosts (modify)
  components/shared/public-header.tsx  # dot on the Community link (modify, minimal)
  types/community.ts           # + has_new_posts (modify)
```

---

### Task 1: Payloads + Celery tasks

**Files:**
- Create: `backend/apps/community/payloads.py`
- Create: `backend/apps/community/tasks.py`
- Create: `backend/apps/community/tests/test_notifications.py`

**Interfaces:**
- Consumes: `apps.notifications.payloads._brand`, `apps.notifications.services.send_to_subscriptions`, `apps.notifications.models.PushSubscription`, `django_tenants.utils.tenant_context`, `get_tenant_model`.
- Produces:
  - `payloads.community_post_payload(author_name: str, body: str) -> dict` (url `/community`)
  - `payloads.community_comment_payload(commenter_name: str, body: str) -> dict` (url `/community`)
  - `tasks.fanout_community_post(post_id: int, schema_name: str)` — broadcast to every member's subscriptions EXCEPT the author's, only when the author is a moderator AND `CommunitySettings.notify_on_coach_post` is true.
  - `tasks.notify_post_comment(comment_id: int, schema_name: str)` — push to the post author's subscriptions, skipped when commenting on your own post.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_notifications.py`:

```python
import pytest

from apps.accounts.models import User
from apps.community.models import Comment, CommunityMember, CommunitySettings, Post
from apps.community import tasks
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def _member(email, name, role="student", is_staff=False):
    user = User.objects.create_user(
        email=email, name=name, password="pw123456", role=role, is_staff=is_staff
    )
    PushSubscription.objects.create(
        user=user, endpoint=f"https://push.example/{email}", p256dh="k", auth="a"
    )
    return CommunityMember.objects.create(user=user, display_name=name)


@pytest.fixture()
def sent(monkeypatch):
    """Capture (endpoints, payload) pairs instead of sending real pushes."""
    calls = []

    def fake_send(queryset, payload):
        calls.append((sorted(s.endpoint for s in queryset), payload))
        return len(calls[-1][0])

    monkeypatch.setattr(tasks, "send_to_subscriptions", fake_send)
    return calls


def test_coach_post_fans_out_to_everyone_but_author(enabled, sent, tenant_ctx):
    coach = _member("coach@x.com", "Coach", role="owner", is_staff=True)
    _member("s1@x.com", "S1")
    _member("s2@x.com", "S2")
    post = Post.objects.create(author=coach, body="New class Friday!")

    tasks.fanout_community_post(post.id, tenant_ctx.schema_name)

    assert len(sent) == 1
    endpoints, payload = sent[0]
    assert endpoints == ["https://push.example/s1@x.com", "https://push.example/s2@x.com"]
    assert payload["url"] == "/community"
    assert "Coach" in payload["title"]


def test_student_post_does_not_fan_out(enabled, sent, tenant_ctx):
    student = _member("s3@x.com", "S3")
    post = Post.objects.create(author=student, body="hello")
    tasks.fanout_community_post(post.id, tenant_ctx.schema_name)
    assert sent == []


def test_notify_toggle_off_suppresses_fanout(enabled, sent, tenant_ctx):
    enabled.notify_on_coach_post = False
    enabled.save()
    coach = _member("coach2@x.com", "Coach2", role="coach")
    post = Post.objects.create(author=coach, body="quiet post")
    tasks.fanout_community_post(post.id, tenant_ctx.schema_name)
    assert sent == []


def test_comment_notifies_post_author_only(enabled, sent, tenant_ctx):
    author = _member("a@x.com", "Author")
    commenter = _member("c@x.com", "Commenter")
    post = Post.objects.create(author=author, body="post")
    comment = Comment.objects.create(post=post, author=commenter, body="nice!")

    tasks.notify_post_comment(comment.id, tenant_ctx.schema_name)

    assert len(sent) == 1
    endpoints, payload = sent[0]
    assert endpoints == ["https://push.example/a@x.com"]
    assert "Commenter" in payload["title"]


def test_own_comment_is_silent(enabled, sent, tenant_ctx):
    author = _member("a2@x.com", "Author2")
    post = Post.objects.create(author=author, body="post")
    comment = Comment.objects.create(post=post, author=author, body="self reply")
    tasks.notify_post_comment(comment.id, tenant_ctx.schema_name)
    assert sent == []


def test_deleted_post_is_noop(enabled, sent, tenant_ctx):
    tasks.fanout_community_post(999999, tenant_ctx.schema_name)
    assert sent == []
```

(`tenant_ctx` yields the shared Tenant object — `tenant_ctx.schema_name` is `"shared_test"`. The tests already run inside that tenant context; re-entering it in the task is harmless.)

- [ ] **Step 2: Run to verify failure**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_notifications.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.community.tasks'`

- [ ] **Step 3: Implement**

`backend/apps/community/payloads.py`:

```python
"""Push payload builders — same shape as apps.notifications.payloads so the
existing student service worker renders them unchanged."""

from apps.notifications.payloads import _brand


def _trim(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def community_post_payload(author_name: str, body: str) -> dict:
    return {
        **_brand(),
        "title": f"{author_name} posted in the community",
        "body": _trim(body),
        "url": "/community",
    }


def community_comment_payload(commenter_name: str, body: str) -> dict:
    return {
        **_brand(),
        "title": f"{commenter_name} commented on your post",
        "body": _trim(body),
        "url": "/community",
    }
```

(Check `_brand()`'s exact keys in `backend/apps/notifications/payloads.py` — if it isn't importable as `_brand`, replicate what `announcement_payload` does around it.)

`backend/apps/community/tasks.py`:

```python
import logging

from celery import shared_task
from django_tenants.utils import get_tenant_model, tenant_context

from apps.notifications.models import PushSubscription
from apps.notifications.services import send_to_subscriptions

from .payloads import community_comment_payload, community_post_payload

logger = logging.getLogger(__name__)


def _with_tenant(schema_name):
    tenant_model = get_tenant_model()
    try:
        return tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return None


@shared_task
def fanout_community_post(post_id: int, schema_name: str) -> None:
    """Push to every member's subscriptions except the author's — but only for
    moderator-authored posts, and only while notify_on_coach_post is on."""
    tenant = _with_tenant(schema_name)
    if tenant is None:
        return
    with tenant_context(tenant):
        from .models import CommunitySettings, Post
        from .permissions import is_moderator

        post = Post.objects.select_related("author__user").filter(pk=post_id).first()
        if not post:
            return
        if not is_moderator(post.author.user):
            return
        if not CommunitySettings.load().notify_on_coach_post:
            return
        subs = PushSubscription.objects.exclude(user=post.author.user)
        send_to_subscriptions(
            subs, community_post_payload(post.author.display_name, post.body)
        )


@shared_task
def notify_post_comment(comment_id: int, schema_name: str) -> None:
    """Push to the post author when someone else comments on their post."""
    tenant = _with_tenant(schema_name)
    if tenant is None:
        return
    with tenant_context(tenant):
        from .models import Comment

        comment = (
            Comment.objects.select_related("author", "post__author__user")
            .filter(pk=comment_id)
            .first()
        )
        if not comment or comment.author_id == comment.post.author_id:
            return
        subs = PushSubscription.objects.filter(user=comment.post.author.user)
        send_to_subscriptions(
            subs, community_comment_payload(comment.author.display_name, comment.body)
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_notifications.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/payloads.py backend/apps/community/tasks.py backend/apps/community/tests/test_notifications.py
git commit -m "feat(community): push payloads + fanout tasks"
```

---

### Task 2: Enqueue from the views

**Files:**
- Modify: `backend/apps/community/views.py` (two call sites)
- Modify: `backend/apps/community/tests/test_notifications.py` (append view-level tests)

**Interfaces:**
- Consumes: Task 1 tasks; `django.db.connection.schema_name` (django-tenants sets it to the active tenant schema).
- Produces: `POST posts/` enqueues `fanout_community_post.delay(post.id, connection.schema_name)`; `POST posts/<id>/comments/` enqueues `notify_post_comment.delay(comment.id, connection.schema_name)`. Enqueue happens only for posts created VISIBLE (pending posts notify nobody until approved — approval-time notification is out of scope v1).

- [ ] **Step 1: Append the failing view tests**

Append to `backend/apps/community/tests/test_notifications.py`:

```python
def test_post_create_enqueues_fanout(enabled, monkeypatch, tenant_ctx):
    from rest_framework.test import APIClient

    calls = []
    monkeypatch.setattr(
        "apps.community.tasks.fanout_community_post.delay",
        lambda *args: calls.append(args),
    )
    user = User.objects.create_user(
        email="q@x.com", name="Q", password="pw123456", role="owner", is_staff=True
    )
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    resp = client.post("/api/v1/community/posts/", {"body": "ping"}, format="json")
    assert resp.status_code == 201
    assert len(calls) == 1
    assert calls[0][0] == resp.json()["id"]
    assert calls[0][1] == "shared_test"


def test_pending_post_does_not_enqueue(enabled, monkeypatch, tenant_ctx):
    from rest_framework.test import APIClient

    calls = []
    monkeypatch.setattr(
        "apps.community.tasks.fanout_community_post.delay",
        lambda *args: calls.append(args),
    )
    user = User.objects.create_user(email="p@x.com", name="P", password="pw123456")
    CommunityMember.objects.create(user=user, display_name="P", requires_approval=True)
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    resp = client.post("/api/v1/community/posts/", {"body": "wait"}, format="json")
    assert resp.status_code == 201
    assert calls == []


def test_comment_create_enqueues_notify(enabled, monkeypatch, tenant_ctx):
    from rest_framework.test import APIClient

    calls = []
    monkeypatch.setattr(
        "apps.community.tasks.notify_post_comment.delay",
        lambda *args: calls.append(args),
    )
    author = _member("pa@x.com", "PA")
    post = Post.objects.create(author=author, body="post")
    user = User.objects.create_user(email="cm@x.com", name="CM", password="pw123456")
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    resp = client.post(
        f"/api/v1/community/posts/{post.id}/comments/", {"body": "hey"}, format="json"
    )
    assert resp.status_code == 201
    assert len(calls) == 1
    assert calls[0][0] == resp.json()["id"]
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_notifications.py -v`
Expected: the 3 new tests FAIL (`calls == []` where 1 expected); the 6 Task 1 tests still PASS.

- [ ] **Step 3: Wire the enqueues in `views.py`**

Add to the imports block of `backend/apps/community/views.py`:

```python
from django.db import connection

from . import tasks
```

In `posts` (POST branch), right after the `post = serializer.save(...)` call and before building the Response:

```python
        if post.status == PostStatus.VISIBLE:
            tasks.fanout_community_post.delay(post.id, connection.schema_name)
```

In `post_comments` (POST branch), right after `services.adjust_comment_count(post, +1)`:

```python
        tasks.notify_post_comment.delay(comment.id, connection.schema_name)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_notifications.py -v`
Expected: 9 PASS

Also re-run the whole community suite (the enqueue must not break existing post/comment tests — they'll hit real `.delay`, which enqueues to test Redis and is consumed by nobody; if any existing test flakes on broker connectivity, monkeypatch `.delay` in that test the same way):

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/ -q`
Expected: 68 passed (59 + 9).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/views.py backend/apps/community/tests/test_notifications.py
git commit -m "feat(community): enqueue push fanout on post/comment creation"
```

---

### Task 3: Unread flag (`has_new_posts`)

**Files:**
- Modify: `backend/apps/community/views.py` (`settings_view`)
- Create: `backend/apps/community/tests/test_unread.py`

**Interfaces:**
- Consumes: `CommunityMember.last_seen_at` (stamped by `GET me/`, which the community page calls on every visit), `Post` ordering.
- Produces: `GET /api/v1/community/settings/` gains `"has_new_posts": bool` for every authenticated caller. Semantics: `false` when disabled, when the caller has no member row (never visited — the nav link itself is the call to action), or when nothing visible is newer than their `last_seen_at`. NO member row is created by this endpoint.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_unread.py`:

```python
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post, PostStatus

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="u@x.com"):
    user = User.objects.create_user(email=email, name="U", password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_no_member_row_means_false_and_creates_nothing(enabled):
    client, user = make_client()
    resp = client.get("/api/v1/community/settings/")
    assert resp.status_code == 200
    assert resp.json()["has_new_posts"] is False
    assert not CommunityMember.objects.filter(user=user).exists()


def test_new_visible_post_flips_flag(enabled):
    client, user = make_client(email="m@x.com")
    member = CommunityMember.objects.create(
        user=user, display_name="M", last_seen_at=timezone.now()
    )
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o@x.com", name="O", password="pw123456"),
        display_name="O",
    )
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is False

    Post.objects.create(author=other, body="fresh")
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is True

    # Visiting the community (GET me/) stamps last_seen and clears the flag.
    client.get("/api/v1/community/me/")
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is False


def test_hidden_posts_do_not_count(enabled):
    client, user = make_client(email="h@x.com")
    CommunityMember.objects.create(user=user, display_name="H", last_seen_at=timezone.now())
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o2@x.com", name="O2", password="pw123456"),
        display_name="O2",
    )
    Post.objects.create(author=other, body="hidden", status=PostStatus.HIDDEN)
    assert client.get("/api/v1/community/settings/").json()["has_new_posts"] is False


def test_disabled_module_is_false(tenant_ctx):
    client, _ = make_client(email="d@x.com")
    resp = client.get("/api/v1/community/settings/")
    assert resp.json().get("has_new_posts") is False
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_unread.py -v`
Expected: FAIL — `KeyError: 'has_new_posts'`

- [ ] **Step 3: Implement in `settings_view`**

In `backend/apps/community/views.py`, replace the GET branch of `settings_view`:

```python
    if request.method == "GET":
        cls = CommunitySettingsSerializer if is_moderator(request.user) else CommunitySettingsPublicSerializer
        data = dict(cls(obj).data)
        data["has_new_posts"] = _has_new_posts(request.user, obj)
        return Response(data)
```

and add the helper above the view:

```python
def _has_new_posts(user, settings_obj):
    """Unread indicator for the nav link. Never creates a member row."""
    if not settings_obj.is_enabled:
        return False
    from .models import CommunityMember

    member = CommunityMember.objects.filter(user=user).only("last_seen_at", "joined_at").first()
    if member is None:
        return False
    since = member.last_seen_at or member.joined_at
    return Post.objects.filter(status=PostStatus.VISIBLE, created_at__gt=since).exists()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_unread.py apps/community/tests/test_settings_api.py -v`
Expected: 4 new PASS + the 5 Phase 1 settings tests still PASS — **except** `test_settings_get_default_disabled`, which asserts the exact response dict `{"is_enabled": False, "welcome_message": ""}`. Update that assertion to include the new field:

```python
    assert resp.json() == {"is_enabled": False, "welcome_message": "", "has_new_posts": False}
```

Re-run → all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/views.py backend/apps/community/tests/test_unread.py backend/apps/community/tests/test_settings_api.py
git commit -m "feat(community): has_new_posts unread flag on settings endpoint"
```

---

### Task 4: Unread dot in the student nav

**Files:**
- Modify: `frontend-customer/src/types/community.ts` (add `has_new_posts?: boolean` to `CommunitySettings`)
- Modify: `frontend-customer/src/app/(student)/layout.tsx`
- Modify: `frontend-customer/src/components/shared/public-header.tsx` (minimal)

**Interfaces:**
- Consumes: Task 3's `has_new_posts`; the `communityEnabled` prop wiring from Phase 2.
- Produces: `PublicHeader` prop `communityUnread?: boolean`; a small primary-colored dot on the "Community" nav link when true.

- [ ] **Step 1: Extend the layout fetch**

In `frontend-customer/src/app/(student)/layout.tsx`, widen the existing community fetch:

```tsx
let communityEnabled = false;
let communityUnread = false;
try {
  const community = await serverFetch<{
    is_enabled: boolean;
    has_new_posts?: boolean;
  }>("/api/v1/community/settings/");
  communityEnabled = community.is_enabled;
  communityUnread = Boolean(community.has_new_posts);
} catch {}
```

Pass it: `<PublicHeader user={user} hasSubscription={hasSubscription} communityEnabled={communityEnabled} communityUnread={communityUnread} />`.

- [ ] **Step 2: Render the dot in PublicHeader**

In `public-header.tsx` (still additive-only — the navbar branch hazard from Phase 2 applies):

1. Add `communityUnread` to the props type: `communityUnread?: boolean;`
2. Where Phase 2 builds `fullNavLinks`, tag the community entry:
```tsx
const fullNavLinks =
  user && communityEnabled
    ? [
        ...navLinks,
        { label: "Community", href: "/community", dot: communityUnread },
      ]
    : navLinks;
```
3. In both render sites, show the dot (the existing link map renders `link.label`; wrap it):
```tsx
<span className="relative">
  {link.label}
  {"dot" in link && link.dot && (
    <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-primary" />
  )}
</span>
```
   If the `link` type is a shared `NavbarLink` interface, don't widen it — type the local array as `(typeof navLinks[number] & { dot?: boolean })[]` instead.

- [ ] **Step 3: Type-check + browser verification**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

Browser (`http://demo-yoga.localhost:18080`, module enabled):
1. Coach posts something new. Student navigates to any page → "Community" link shows the dot.
2. Student opens /community (this stamps `last_seen_at`) → navigate elsewhere → dot gone. (The layout is server-rendered per navigation with `dynamic = "force-dynamic"`, so the flag refreshes on each page load.)
3. Student who never visited /community → no dot (no member row).

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/types/community.ts frontend-customer/src/app/\(student\)/layout.tsx frontend-customer/src/components/shared/public-header.tsx
git commit -m "feat(community-ui): unread dot on the Community nav link"
```

---

### Task 5: Live push smoke + full verification

**Files:** fixes only.

- [ ] **Step 1: End-to-end push smoke (manual, isolated stack)**

Web push needs real VAPID keys (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` in `.env` — the dev `.env` has working dev keys since the announcements work; verify they're non-empty: `grep -c "VAPID" .env` → 2+):

1. Student at `http://demo-yoga.localhost:18080` — accept the push-permission flow (the PWA/announcements UI already exposes subscribe; the announcement bell / install page has the toggle). Confirm a `PushSubscription` row exists: `docker compose -p contentor-community-phase-4 ... exec django python manage.py shell -c "from django_tenants.utils import schema_context
with schema_context('demo_yoga'):
    from apps.notifications.models import PushSubscription; print(PushSubscription.objects.count())"` → ≥ 1.
2. Coach posts in /admin/community Feed tab → within seconds the student's browser shows the OS notification "Coach posted in the community"; clicking focuses `/community`.
3. Student comments on their own... no — coach comments on the STUDENT's post → student gets "…commented on your post".
4. Settings → toggle "Notify students when you post" OFF → coach posts again → no notification.
5. Check the celery worker log for errors: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml logs celery-worker --tail=50`.

(Chrome treats `*.localhost` as a secure context, so service-worker push works on the port-mapped dev host. If the browser refuses, run the same smoke on the shared stack at `:80` after merge instead — note the result either way.)

- [ ] **Step 2: Full backend suite**

Run: `docker compose -p contentor-community-phase-4 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest -q`
Expected: everything green except the 2 known pre-existing mailbox teardown errors (if the `chore/faster-test-suite` fix hasn't merged yet).

- [ ] **Step 3: Frontend checks**

Run: `cd frontend-customer && npx tsc --noEmit && npm run build && npm run lint` → clean.

- [ ] **Step 4: pre-commit**

Run: `pre-commit run --all-files` → passes.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A backend/apps/community frontend-customer/src
git commit -m "chore(community): phase 4 verification fixes"
```

---

## Explicit non-goals (unchanged from the spec)

- Email digests (phase-2-of-notifications idea, uses the email infra — not planned yet).
- Notifying members when their pending post is approved or content removed (silent v1).
- Reaction notifications, @mentions, comment-thread notifications.
- Sidebar badge in the coach admin shell (needs shell badge support; the in-page tab badge from Phase 3 covers the need).

## After all phases

Update `docs/PRODUCT.md` (community inventory row → built status) via `/po done`, and consider a Flowmap flow for the community journey (`make flowmap-register` after the dev stack has the feature).
