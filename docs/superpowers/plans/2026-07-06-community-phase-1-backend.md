# Community Feature — Phase 1 (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps.community` — the complete tenant-schema backend (models + REST API + moderation + tests) for the private per-tenant community feed, per the approved spec `docs/superpowers/specs/2026-07-06-community-feature-design.md`.

**Architecture:** New Django TENANT_APP following the house idiom (function-based DRF views, `@api_view`, plain `urls.py` path routing, pytest with the shared-tenant fixtures). Feed is cursor-paginated; moderation is report → Remove/Keep; all state lives in the tenant schema. No frontend in this plan (Phases 2–4 are separate plans).

**Tech Stack:** Django 5.1, DRF (TenantJWTAuthentication default), django-tenants, PostgreSQL, existing S3/MinIO presign helpers (`apps.core.storage`), pytest.

## Global Constraints

- Work on branch `feat/community-phase-1` in an **isolated worktree** (use superpowers:using-git-worktrees). Multiple agents share this checkout — verify `git branch --show-current` before every commit.
- The spec is the source of truth: `docs/superpowers/specs/2026-07-06-community-feature-design.md`.
- Empty-success responses MUST be **HTTP 204** (never body-less 200/202 — clientFetch/Cloudflare drop Content-Length and the UI misreads success as failure).
- Post/comment bodies are **plain text** (no HTML accepted, stored, or returned; frontend linkifies at render).
- Fixed constants (exact values): reaction emoji set `["❤️", "👍", "🎉", "💪", "😂"]`; auto-hide threshold `3` open reports from distinct members; max `4` images per post; throttles `10/hour` posts, `60/hour` comments (settings-tunable via `DEFAULT_THROTTLE_RATES`).
- All endpoints live under `/api/v1/community/` and use the default `TenantJWTAuthentication` + `IsAuthenticated`. There are NO public/anonymous endpoints in this app — never add `@authentication_classes([])`.
- Moderator = tenant user with `role in ("owner", "coach")` **or** `is_staff=True`.
- Banned member → 403 on every community endpoint (reads included). Muted member → reads OK, writes 403 until `muted_until` passes. Module disabled → content endpoints 404; `GET settings/` always answers; `PATCH settings/` (moderator) must work while disabled (that's how it gets enabled).
- Tests: run inside the container — `docker compose exec django pytest apps/community/tests/ -v` (full suite: `make test`). Reuse the shared-tenant fixtures from root `conftest.py` (`tenant_ctx`, host `shared-test.localhost`).
- Pre-commit must pass (`make lint`) with zero warnings before the final task completes.
- When a step says "Append to <file>" and the snippet includes `import` lines, merge those imports into the existing import block at the top of the file (ruff enforces E402/import sorting) — only the definitions get appended.

## File Structure

```
backend/apps/community/
    __init__.py
    apps.py                 # AppConfig
    models.py               # CommunitySettings, CommunityMember, Post, Comment, Reaction, Report
    permissions.py          # IsCommunityModerator, is_moderator()
    access.py               # get_member_or_deny() — gating/ban/mute enforcement
    services.py             # get_or_create_member, report_target, resolve_target, counters
    throttling.py           # CommunityPostThrottle, CommunityCommentThrottle
    serializers.py          # all serializers
    views.py                # member-facing endpoints
    moderation_views.py     # moderator endpoints
    urls.py
    migrations/
    tests/
        __init__.py
        test_models.py
        test_settings_api.py
        test_member_api.py
        test_posts_api.py
        test_comments_api.py
        test_reactions_api.py
        test_reports_api.py
        test_moderation_api.py
        test_enforcement_api.py
```

Modified files: `backend/config/settings/base.py` (TENANT_APPS + throttle rates), `backend/config/urls.py` (route), `backend/conftest.py` (cleanup).

---

### Task 1: App scaffold, models, migration

**Files:**
- Create: `backend/apps/community/__init__.py`, `apps.py`, `models.py`, `migrations/` (generated), `tests/__init__.py`, `tests/test_models.py`
- Modify: `backend/config/settings/base.py` (add `"apps.community"` to `TENANT_APPS` after `"apps.usage"`)
- Modify: `backend/conftest.py` (import + clean community models in `tenant_ctx`)

**Interfaces:**
- Produces: models `CommunitySettings` (classmethod `load()` → singleton), `CommunityMember` (property `is_muted`), `Post`, `Comment`, `Reaction`, `Report`; enum `PostStatus` (VISIBLE/PENDING/HIDDEN/REMOVED); constants `REACTION_EMOJIS`, `AUTO_HIDE_THRESHOLD = 3`, `MAX_POST_IMAGES = 4`. All later tasks import from `apps.community.models`.

- [ ] **Step 1: Write the failing model tests**

`backend/apps/community/tests/test_models.py`:

```python
import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.accounts.models import User
from apps.community.models import (
    CommunityMember,
    CommunitySettings,
    Comment,
    Post,
    PostStatus,
    Reaction,
    Report,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def member(tenant_ctx):
    user = User.objects.create_user(email="s1@x.com", name="Student One", password="pw123456")
    return CommunityMember.objects.create(user=user, display_name=user.name)


def test_settings_singleton_load(tenant_ctx):
    a = CommunitySettings.load()
    b = CommunitySettings.load()
    assert a.pk == b.pk == 1
    assert a.is_enabled is False
    assert a.notify_on_coach_post is True


def test_member_is_muted_property(member):
    assert member.is_muted is False
    member.muted_until = timezone.now() + timezone.timedelta(hours=1)
    assert member.is_muted is True
    member.muted_until = timezone.now() - timezone.timedelta(hours=1)
    assert member.is_muted is False


def test_post_defaults(member):
    post = Post.objects.create(author=member, body="hello")
    assert post.status == PostStatus.VISIBLE
    assert post.is_pinned is False
    assert post.image_keys == []
    assert post.comment_count == 0
    assert post.reaction_count == 0


def test_reaction_unique_per_member_and_post(member):
    post = Post.objects.create(author=member, body="hi")
    Reaction.objects.create(member=member, post=post, emoji="❤️")
    with pytest.raises(IntegrityError):
        Reaction.objects.create(member=member, post=post, emoji="👍")


def test_reaction_requires_exactly_one_target(member):
    post = Post.objects.create(author=member, body="hi")
    comment = Comment.objects.create(post=post, author=member, body="yo")
    with pytest.raises(IntegrityError):
        Reaction.objects.create(member=member, post=post, comment=comment, emoji="❤️")


def test_report_unique_per_reporter_and_target(member):
    post = Post.objects.create(author=member, body="hi")
    Report.objects.create(reporter=member, post=post, reason="spam")
    with pytest.raises(IntegrityError):
        Report.objects.create(reporter=member, post=post, reason="other")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_models.py -v`
Expected: FAIL/ERROR with `ModuleNotFoundError: No module named 'apps.community'`

- [ ] **Step 3: Create the app and models**

`backend/apps/community/__init__.py`: empty file.

`backend/apps/community/apps.py`:

```python
from django.apps import AppConfig


class CommunityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.community"
```

`backend/apps/community/models.py`:

```python
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

REACTION_EMOJIS = ["❤️", "👍", "🎉", "💪", "😂"]
AUTO_HIDE_THRESHOLD = 3
MAX_POST_IMAGES = 4


class CommunitySettings(models.Model):
    """Per-tenant singleton (pk=1). is_enabled is the feature gate — the
    legacy "community" entry in TenantConfig.enabled_modules is inert."""

    is_enabled = models.BooleanField(default=False)
    welcome_message = models.TextField(blank=True, default="")
    notify_on_coach_post = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class CommunityMember(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="community_member"
    )
    display_name = models.CharField(max_length=150)
    avatar_url = models.URLField(blank=True, default="")  # stable external URL (from user)
    avatar_key = models.CharField(max_length=500, blank=True, default="")  # uploaded, signed at read
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    is_banned = models.BooleanField(default=False)
    muted_until = models.DateTimeField(null=True, blank=True)
    requires_approval = models.BooleanField(default=False)

    @property
    def is_muted(self):
        return bool(self.muted_until and self.muted_until > timezone.now())


class PostStatus(models.TextChoices):
    VISIBLE = "visible", "Visible"
    PENDING = "pending", "Pending approval"
    HIDDEN = "hidden", "Auto-hidden by reports"
    REMOVED = "removed", "Removed by moderator"


class Post(models.Model):
    author = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="posts")
    body = models.TextField(max_length=10000)
    image_keys = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=PostStatus.choices, default=PostStatus.VISIBLE)
    is_pinned = models.BooleanField(default=False)
    comment_count = models.PositiveIntegerField(default=0)
    reaction_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "is_pinned", "-created_at"])]


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="comments")
    body = models.TextField(max_length=5000)
    status = models.CharField(max_length=10, choices=PostStatus.choices, default=PostStatus.VISIBLE)
    reaction_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class Reaction(models.Model):
    member = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="reactions")
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE, related_name="reactions")
    comment = models.ForeignKey(
        Comment, null=True, blank=True, on_delete=models.CASCADE, related_name="reactions"
    )
    emoji = models.CharField(max_length=8)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["member", "post"], condition=Q(post__isnull=False), name="uniq_reaction_member_post"
            ),
            models.UniqueConstraint(
                fields=["member", "comment"],
                condition=Q(comment__isnull=False),
                name="uniq_reaction_member_comment",
            ),
            models.CheckConstraint(
                check=Q(post__isnull=False, comment__isnull=True)
                | Q(post__isnull=True, comment__isnull=False),
                name="reaction_exactly_one_target",
            ),
        ]


class Report(models.Model):
    REASON_CHOICES = [
        ("spam", "Spam"),
        ("inappropriate", "Inappropriate"),
        ("harassment", "Harassment"),
        ("other", "Other"),
    ]
    STATUS_CHOICES = [("open", "Open"), ("resolved", "Resolved")]
    ACTION_CHOICES = [("removed", "Removed"), ("kept", "Kept")]

    reporter = models.ForeignKey(CommunityMember, on_delete=models.CASCADE, related_name="reports")
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE, related_name="reports")
    comment = models.ForeignKey(
        Comment, null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    detail = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="open")
    action_taken = models.CharField(max_length=10, choices=ACTION_CHOICES, blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["reporter", "post"], condition=Q(post__isnull=False), name="uniq_report_reporter_post"
            ),
            models.UniqueConstraint(
                fields=["reporter", "comment"],
                condition=Q(comment__isnull=False),
                name="uniq_report_reporter_comment",
            ),
            models.CheckConstraint(
                check=Q(post__isnull=False, comment__isnull=True)
                | Q(post__isnull=True, comment__isnull=False),
                name="report_exactly_one_target",
            ),
        ]
```

- [ ] **Step 4: Register the app and generate the migration**

In `backend/config/settings/base.py`, add to `TENANT_APPS` after `"apps.usage"`:

```python
    "apps.community",
```

Run: `make makemigrations`
Expected: `apps/community/migrations/0001_initial.py` created (6 models).

Run: `make migrate`
Expected: applies cleanly to all schemas.

- [ ] **Step 5: Register cleanup in `backend/conftest.py`**

Add to the imports block:

```python
from apps.community.models import (
    Comment as CommunityComment,
    CommunityMember,
    CommunitySettings,
    Post as CommunityPost,
    Reaction as CommunityReaction,
    Report as CommunityReport,
)
```

Add at the TOP of the cleanup block inside `tenant_ctx` (before `Progress.objects...`, dependency order):

```python
        CommunityReaction.objects.all().delete()
        CommunityReport.objects.all().delete()
        CommunityComment.objects.all().delete()
        CommunityPost.objects.all().delete()
        CommunityMember.objects.all().delete()
        CommunitySettings.objects.all().delete()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_models.py -v`
Expected: 6 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/community/ backend/config/settings/base.py backend/conftest.py
git commit -m "feat(community): tenant app scaffold + models"
```

---

### Task 2: Permissions, access gate, settings API, URL wiring

**Files:**
- Create: `backend/apps/community/permissions.py`, `access.py`, `serializers.py` (settings part), `views.py` (settings part), `urls.py`, `tests/test_settings_api.py`
- Modify: `backend/config/urls.py` (add route)

**Interfaces:**
- Consumes: `CommunitySettings.load()`, `CommunityMember` from Task 1.
- Produces:
  - `permissions.is_moderator(user) -> bool` and `permissions.IsCommunityModerator` (DRF permission)
  - `access.get_member_or_deny(request, write=False) -> CommunityMember` — raises `NotFound` when module disabled, `PermissionDenied("banned")` when banned, `PermissionDenied("muted")` when `write=True` and muted; lazily creates the member row (via `services.get_or_create_member`, added here as a minimal function).
  - Routes mounted at `/api/v1/community/`.
  - `GET /api/v1/community/settings/` → `{"is_enabled", "welcome_message"}` (+ `"notify_on_coach_post"` for moderators); `PATCH settings/` (moderator only, works while disabled) → 200 with same shape.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_settings_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunitySettings

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


def make_client(role="student", is_staff=False, email="u@x.com"):
    user = User.objects.create_user(
        email=email, name="U", password="pw123456", role=role, is_staff=is_staff
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_settings_get_default_disabled(tenant_ctx):
    client, _ = make_client()
    resp = client.get("/api/v1/community/settings/")
    assert resp.status_code == 200
    assert resp.json() == {"is_enabled": False, "welcome_message": ""}


def test_settings_patch_requires_moderator(tenant_ctx):
    client, _ = make_client()
    resp = client.patch("/api/v1/community/settings/", {"is_enabled": True}, format="json")
    assert resp.status_code == 403


def test_settings_patch_enables_while_disabled(tenant_ctx):
    client, _ = make_client(role="owner", is_staff=True, email="c@x.com")
    resp = client.patch(
        "/api/v1/community/settings/",
        {"is_enabled": True, "welcome_message": "Welcome!"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_enabled"] is True
    assert body["welcome_message"] == "Welcome!"
    assert body["notify_on_coach_post"] is True
    assert CommunitySettings.load().is_enabled is True


def test_settings_get_includes_notify_flag_for_moderator(tenant_ctx):
    client, _ = make_client(role="coach", email="co@x.com")
    resp = client.get("/api/v1/community/settings/")
    assert resp.status_code == 200
    assert "notify_on_coach_post" in resp.json()


def test_access_gate_unit(tenant_ctx):
    """get_member_or_deny: disabled→NotFound, banned→PermissionDenied, muted write→PermissionDenied."""
    from django.utils import timezone
    from rest_framework.exceptions import NotFound, PermissionDenied

    from apps.community.access import get_member_or_deny

    class FakeRequest:
        def __init__(self, user):
            self.user = user

    user = User.objects.create_user(email="s@x.com", name="S", password="pw123456")
    with pytest.raises(NotFound):
        get_member_or_deny(FakeRequest(user))

    settings_obj = CommunitySettings.load()
    settings_obj.is_enabled = True
    settings_obj.save()

    member = get_member_or_deny(FakeRequest(user))
    assert member.display_name == "S"

    member.is_banned = True
    member.save()
    with pytest.raises(PermissionDenied):
        get_member_or_deny(FakeRequest(user))

    member.is_banned = False
    member.muted_until = timezone.now() + timezone.timedelta(hours=1)
    member.save()
    assert get_member_or_deny(FakeRequest(user)) is not None  # reads OK
    with pytest.raises(PermissionDenied):
        get_member_or_deny(FakeRequest(user), write=True)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_settings_api.py -v`
Expected: FAIL (404s / ImportError — no urls or modules yet)

- [ ] **Step 3: Implement**

`backend/apps/community/permissions.py`:

```python
from rest_framework.permissions import BasePermission


def is_moderator(user):
    return bool(
        user.is_authenticated and (user.role in ("owner", "coach") or user.is_staff)
    )


class IsCommunityModerator(BasePermission):
    def has_permission(self, request, view):
        return is_moderator(request.user)
```

`backend/apps/community/services.py` (minimal; grows in Task 7):

```python
from .models import CommunityMember


def get_or_create_member(user):
    member, _ = CommunityMember.objects.get_or_create(
        user=user,
        defaults={
            "display_name": user.name or user.email.split("@")[0],
            "avatar_url": user.avatar_url or "",
        },
    )
    return member
```

`backend/apps/community/access.py`:

```python
from rest_framework.exceptions import NotFound, PermissionDenied

from . import services
from .models import CommunitySettings


def get_member_or_deny(request, write=False):
    """Gate every content endpoint: module enabled, member not banned,
    and (for writes) not muted. Lazily creates the member row."""
    if not CommunitySettings.load().is_enabled:
        raise NotFound("Community is not enabled.")
    member = services.get_or_create_member(request.user)
    if member.is_banned:
        raise PermissionDenied("You are banned from the community.")
    if write and member.is_muted:
        raise PermissionDenied("You are muted in the community.")
    return member
```

`backend/apps/community/serializers.py` (settings part):

```python
from rest_framework import serializers

from .models import CommunitySettings


class CommunitySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunitySettings
        fields = ["is_enabled", "welcome_message", "notify_on_coach_post"]


class CommunitySettingsPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunitySettings
        fields = ["is_enabled", "welcome_message"]
```

`backend/apps/community/views.py` (settings part):

```python
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CommunitySettings
from .permissions import is_moderator
from .serializers import CommunitySettingsPublicSerializer, CommunitySettingsSerializer


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def settings_view(request):
    obj = CommunitySettings.load()
    if request.method == "GET":
        cls = CommunitySettingsSerializer if is_moderator(request.user) else CommunitySettingsPublicSerializer
        return Response(cls(obj).data)
    if not is_moderator(request.user):
        return Response(status=status.HTTP_403_FORBIDDEN)
    serializer = CommunitySettingsSerializer(obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)
```

`backend/apps/community/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.settings_view, name="community-settings"),
]
```

In `backend/config/urls.py`, after the `api/v1/courses/` line, add:

```python
    path("api/v1/community/", include("apps.community.urls")),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_settings_api.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/ backend/config/urls.py
git commit -m "feat(community): permissions, access gate, settings API"
```

---

### Task 3: Member profile (`me/`) + community presign

**Files:**
- Create: `backend/apps/community/tests/test_member_api.py`
- Modify: `backend/apps/community/serializers.py`, `views.py`, `urls.py`

**Interfaces:**
- Consumes: `get_member_or_deny`, `services.get_or_create_member`, `apps.core.storage.build_s3_path`, `generate_presigned_upload_url`, `sign_if_s3_key`.
- Produces:
  - `GET /api/v1/community/me/` → `{"display_name", "avatar", "avatar_key", "joined_at", "is_moderator"}` where `avatar` = `sign_if_s3_key(avatar_key)` if set else `avatar_url`.
  - `PATCH me/` accepts `{"display_name"?, "avatar_key"?}` → 200 same shape. Also updates `last_seen_at` on GET.
  - `POST /api/v1/community/presign/` accepts `{"filename", "content_type"}` (content_type must be one of `image/jpeg`, `image/png`, `image/webp`, `image/gif`) → `{"upload_url", "s3_key", "method": "PUT", "headers": {...}}`; keys live under the `community` category. Any authenticated, non-banned member may call it (unlike the coach-only core presign).
  - `serializers.AuthorSerializer` — `{"id", "display_name", "avatar", "is_coach"}` for nesting in posts/comments (Tasks 4–5). `is_coach` = `author.user.role in ("owner", "coach") or author.user.is_staff`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_member_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="s@x.com", role="student", **user_kwargs):
    user = User.objects.create_user(
        email=email, name="Student", password="pw123456", role=role, **user_kwargs
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_me_lazy_creates_member_with_defaults(enabled):
    client, user = make_client()
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Student"
    assert body["is_moderator"] is False
    member = CommunityMember.objects.get(user=user)
    assert member.last_seen_at is not None


def test_me_patch_updates_profile(enabled):
    client, _ = make_client()
    resp = client.patch(
        "/api/v1/community/me/",
        {"display_name": "Ayşe", "avatar_key": "shared-test/community/abc.jpg"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Ayşe"


def test_me_404_when_disabled(tenant_ctx):
    client, _ = make_client()
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 404


def test_me_403_when_banned(enabled):
    client, user = make_client()
    CommunityMember.objects.create(user=user, display_name="X", is_banned=True)
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 403


def test_presign_accepts_images_only(enabled):
    client, _ = make_client()
    resp = client.post(
        "/api/v1/community/presign/",
        {"filename": "cv.pdf", "content_type": "application/pdf"},
        format="json",
    )
    assert resp.status_code == 400


def test_presign_returns_upload_url(enabled):
    client, _ = make_client()
    resp = client.post(
        "/api/v1/community/presign/",
        {"filename": "photo.jpg", "content_type": "image/jpeg"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["method"] == "PUT"
    assert "community" in body["s3_key"]
    assert body["upload_url"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_member_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

Append to `backend/apps/community/serializers.py`:

```python
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]


class MemberSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=150, required=False)
    avatar_key = serializers.CharField(max_length=500, required=False, allow_blank=True)
    avatar = serializers.SerializerMethodField(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)
    is_moderator = serializers.SerializerMethodField(read_only=True)

    def get_avatar(self, member):
        from apps.core.storage import sign_if_s3_key

        return sign_if_s3_key(member.avatar_key) if member.avatar_key else member.avatar_url

    def get_is_moderator(self, member):
        from .permissions import is_moderator

        return is_moderator(member.user)

    def update(self, member, validated_data):
        for field in ("display_name", "avatar_key"):
            if field in validated_data:
                setattr(member, field, validated_data[field])
        member.save(update_fields=["display_name", "avatar_key"])
        return member


class AuthorSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField(read_only=True)
    is_coach = serializers.SerializerMethodField(read_only=True)

    def get_avatar(self, member):
        from apps.core.storage import sign_if_s3_key

        return sign_if_s3_key(member.avatar_key) if member.avatar_key else member.avatar_url

    def get_is_coach(self, member):
        return member.user.role in ("owner", "coach") or member.user.is_staff


class CommunityPresignSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=ALLOWED_IMAGE_TYPES)
```

Append to `backend/apps/community/views.py`:

```python
import uuid

from django.utils import timezone

from apps.core.storage import build_s3_path, generate_presigned_upload_url

from .access import get_member_or_deny
from .serializers import CommunityPresignSerializer, MemberSerializer


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    member = get_member_or_deny(request, write=(request.method == "PATCH"))
    if request.method == "GET":
        member.last_seen_at = timezone.now()
        member.save(update_fields=["last_seen_at"])
        return Response(MemberSerializer(member).data)
    serializer = MemberSerializer(member, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(MemberSerializer(member).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presign(request):
    get_member_or_deny(request, write=True)
    serializer = CommunityPresignSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    ext = data["filename"].rsplit(".", 1)[-1] if "." in data["filename"] else ""
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    s3_key = build_s3_path("community", unique_name)
    upload_url = generate_presigned_upload_url(s3_key, data["content_type"])
    return Response(
        {
            "upload_url": upload_url,
            "s3_key": s3_key,
            "method": "PUT",
            "headers": {"Content-Type": data["content_type"]},
        }
    )
```

Append to `urlpatterns` in `backend/apps/community/urls.py`:

```python
    path("me/", views.me, name="community-me"),
    path("presign/", views.presign, name="community-presign"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_member_api.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/
git commit -m "feat(community): member profile endpoint + image presign"
```

---

### Task 4: Posts — create, edit, delete, cursor feed, throttle

**Files:**
- Create: `backend/apps/community/throttling.py`, `tests/test_posts_api.py`
- Modify: `backend/apps/community/serializers.py`, `views.py`, `urls.py`, `backend/config/settings/base.py` (throttle rates)

**Interfaces:**
- Consumes: Task 1 models/constants, `get_member_or_deny`, `AuthorSerializer`.
- Produces:
  - `GET /api/v1/community/posts/` → cursor page `{"results": [PostSerializer...], "next": url|null, "previous": url|null}`; first page (no `cursor` param) also has `"pinned": [PostSerializer...]` and `"welcome_message": str`. Main results EXCLUDE pinned posts. Visible = `status=visible`, plus the requester's own `pending` posts.
  - `POST posts/` `{"body", "image_keys"?}` → 201 PostSerializer. Body 1–10000 chars after strip; `image_keys` ≤ 4, each must contain `"/community/"`. Status is `pending` when `member.requires_approval` else `visible`.
  - `PATCH posts/<id>/` (author only) `{"body"?, "image_keys"?}` → 200, sets `edited_at`. `DELETE posts/<id>/` (author only) → 204, hard delete.
  - `PostSerializer` fields: `id, author (AuthorSerializer), body, image_keys, images (signed urls), status, is_pinned, comment_count, reaction_count, my_reaction (emoji|null), created_at, edited_at`. `my_reaction` read from serializer context `{"my_reactions": {post_id: emoji}}`.
  - `throttling.CommunityPostThrottle` (scope `community_posts`), `CommunityCommentThrottle` (scope `community_comments`); rates registered in `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_posts_api.py`:

```python
from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post, PostStatus
from apps.community.throttling import CommunityPostThrottle

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    yield
    cache.clear()


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="s@x.com", role="student"):
    user = User.objects.create_user(email=email, name="S", password="pw123456", role=role)
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_create_post(enabled):
    client, _ = make_client()
    resp = client.post("/api/v1/community/posts/", {"body": "hello world"}, format="json")
    assert resp.status_code == 201
    body = resp.json()
    assert body["body"] == "hello world"
    assert body["status"] == "visible"
    assert body["author"]["display_name"] == "S"


def test_create_post_rejects_five_images(enabled):
    client, _ = make_client()
    keys = [f"shared-test/community/{i}.jpg" for i in range(5)]
    resp = client.post("/api/v1/community/posts/", {"body": "x", "image_keys": keys}, format="json")
    assert resp.status_code == 400


def test_create_post_rejects_foreign_keys(enabled):
    client, _ = make_client()
    resp = client.post(
        "/api/v1/community/posts/",
        {"body": "x", "image_keys": ["shared-test/videos/secret.mp4"]},
        format="json",
    )
    assert resp.status_code == 400


def test_feed_first_page_has_pinned_and_excludes_hidden(enabled):
    client, user = make_client()
    member = CommunityMember.objects.create(
        user=User.objects.create_user(email="o@x.com", name="O", password="pw123456"),
        display_name="Other",
    )
    Post.objects.create(author=member, body="normal")
    Post.objects.create(author=member, body="pinned!", is_pinned=True)
    Post.objects.create(author=member, body="hidden", status=PostStatus.HIDDEN)
    resp = client.get("/api/v1/community/posts/")
    assert resp.status_code == 200
    body = resp.json()
    assert [p["body"] for p in body["pinned"]] == ["pinned!"]
    assert [p["body"] for p in body["results"]] == ["normal"]


def test_feed_cursor_pagination(enabled):
    client, _ = make_client()
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o2@x.com", name="O2", password="pw123456"),
        display_name="O2",
    )
    for i in range(25):
        Post.objects.create(author=other, body=f"post {i}")
    first = client.get("/api/v1/community/posts/").json()
    assert len(first["results"]) == 20
    assert first["next"]
    second = client.get(first["next"]).json()
    assert len(second["results"]) == 5
    assert "pinned" not in second


def test_author_sees_own_pending_post(enabled):
    client, user = make_client()
    CommunityMember.objects.create(user=user, display_name="S", requires_approval=True)
    resp = client.post("/api/v1/community/posts/", {"body": "await ok"}, format="json")
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"
    feed = client.get("/api/v1/community/posts/").json()
    assert [p["body"] for p in feed["results"]] == ["await ok"]
    other_client, _ = make_client(email="v@x.com")
    other_feed = other_client.get("/api/v1/community/posts/").json()
    assert other_feed["results"] == []


def test_edit_own_post_sets_edited_at(enabled):
    client, _ = make_client()
    post_id = client.post("/api/v1/community/posts/", {"body": "v1"}, format="json").json()["id"]
    resp = client.patch(f"/api/v1/community/posts/{post_id}/", {"body": "v2"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["body"] == "v2"
    assert resp.json()["edited_at"] is not None


def test_cannot_edit_others_post(enabled):
    client, _ = make_client()
    other = CommunityMember.objects.create(
        user=User.objects.create_user(email="o3@x.com", name="O3", password="pw123456"),
        display_name="O3",
    )
    post = Post.objects.create(author=other, body="theirs")
    resp = client.patch(f"/api/v1/community/posts/{post.id}/", {"body": "hax"}, format="json")
    assert resp.status_code == 404


def test_delete_own_post_hard_deletes(enabled):
    client, _ = make_client()
    post_id = client.post("/api/v1/community/posts/", {"body": "bye"}, format="json").json()["id"]
    resp = client.delete(f"/api/v1/community/posts/{post_id}/")
    assert resp.status_code == 204
    assert not Post.objects.filter(id=post_id).exists()


def test_post_throttle(enabled):
    # SimpleRateThrottle.THROTTLE_RATES is snapshotted at class-definition time from
    # api_settings, so django.test.override_settings(REST_FRAMEWORK=...) does not
    # reach it — patch the throttle class attribute directly instead.
    with patch.object(CommunityPostThrottle, "THROTTLE_RATES", {"community_posts": "2/hour"}):
        client, _ = make_client()
        assert client.post("/api/v1/community/posts/", {"body": "1"}, format="json").status_code == 201
        assert client.post("/api/v1/community/posts/", {"body": "2"}, format="json").status_code == 201
        resp = client.post("/api/v1/community/posts/", {"body": "3"}, format="json")
        assert resp.status_code == 429
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_posts_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

`backend/apps/community/throttling.py`:

```python
from rest_framework.throttling import UserRateThrottle


class CommunityPostThrottle(UserRateThrottle):
    scope = "community_posts"


class CommunityCommentThrottle(UserRateThrottle):
    scope = "community_comments"
```

In `backend/config/settings/base.py`, add to the `REST_FRAMEWORK` dict:

```python
    "DEFAULT_THROTTLE_RATES": {
        "community_posts": "10/hour",
        "community_comments": "60/hour",
    },
```

Append to `backend/apps/community/serializers.py`:

```python
from .models import MAX_POST_IMAGES, Post


class PostSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    images = serializers.SerializerMethodField()
    my_reaction = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=10000, trim_whitespace=True)
    image_keys = serializers.ListField(
        child=serializers.CharField(max_length=500), max_length=MAX_POST_IMAGES, required=False
    )

    class Meta:
        model = Post
        fields = [
            "id", "author", "body", "image_keys", "images", "status", "is_pinned",
            "comment_count", "reaction_count", "my_reaction", "created_at", "edited_at",
        ]
        read_only_fields = ["status", "is_pinned", "comment_count", "reaction_count"]

    def validate_image_keys(self, keys):
        for key in keys:
            if "/community/" not in key:
                raise serializers.ValidationError("Invalid image key.")
        return keys

    def get_images(self, post):
        from apps.core.storage import sign_if_s3_key

        return [sign_if_s3_key(key) for key in post.image_keys]

    def get_my_reaction(self, post):
        return self.context.get("my_reactions", {}).get(post.id)
```

Append to `backend/apps/community/views.py`:

```python
from django.db.models import Q
from django.http import Http404
from rest_framework.pagination import CursorPagination

from .models import Post, PostStatus, Reaction
from .serializers import PostSerializer
from .throttling import CommunityPostThrottle


class FeedPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "-id")


def _post_context(member, posts):
    ids = [p.id for p in posts]
    return {
        "my_reactions": {
            r.post_id: r.emoji
            for r in Reaction.objects.filter(member=member, post_id__in=ids)
        }
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def posts(request):
    if request.method == "POST":
        member = get_member_or_deny(request, write=True)
        throttle = CommunityPostThrottle()
        if not throttle.allow_request(request, None):
            return Response(status=status.HTTP_429_TOO_MANY_REQUESTS)
        serializer = PostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save(
            author=member,
            status=PostStatus.PENDING if member.requires_approval else PostStatus.VISIBLE,
        )
        return Response(
            PostSerializer(post, context=_post_context(member, [post])).data,
            status=status.HTTP_201_CREATED,
        )

    member = get_member_or_deny(request)
    qs = (
        Post.objects.filter(
            Q(status=PostStatus.VISIBLE) | Q(status=PostStatus.PENDING, author=member),
            is_pinned=False,
        )
        .select_related("author", "author__user")
    )
    paginator = FeedPagination()
    page = paginator.paginate_queryset(qs, request)
    data = PostSerializer(page, many=True, context=_post_context(member, page)).data
    response = paginator.get_paginated_response(data)
    if not request.query_params.get("cursor"):
        pinned = list(
            Post.objects.filter(status=PostStatus.VISIBLE, is_pinned=True)
            .select_related("author", "author__user")
            .order_by("-created_at")
        )
        response.data["pinned"] = PostSerializer(
            pinned, many=True, context=_post_context(member, pinned)
        ).data
        from .models import CommunitySettings

        response.data["welcome_message"] = CommunitySettings.load().welcome_message
    return response


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def post_detail(request, pk):
    member = get_member_or_deny(request, write=True)
    try:
        post = Post.objects.get(pk=pk, author=member)
    except Post.DoesNotExist:
        raise Http404
    if request.method == "DELETE":
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = PostSerializer(post, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(edited_at=timezone.now())
    return Response(PostSerializer(post, context=_post_context(member, [post])).data)
```

Append to `urlpatterns` in `backend/apps/community/urls.py`:

```python
    path("posts/", views.posts, name="community-posts"),
    path("posts/<int:pk>/", views.post_detail, name="community-post-detail"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_posts_api.py -v`
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/ backend/config/settings/base.py
git commit -m "feat(community): posts CRUD + cursor feed + throttle"
```

---

### Task 5: Comments + denormalized counter

**Files:**
- Create: `backend/apps/community/tests/test_comments_api.py`
- Modify: `backend/apps/community/serializers.py`, `views.py`, `urls.py`, `services.py`

**Interfaces:**
- Consumes: Task 4 views idiom, `CommunityCommentThrottle`, `AuthorSerializer`.
- Produces:
  - `GET /api/v1/community/posts/<id>/comments/` → default page-number pagination (DRF `PageNumberPagination`, page size 20, `?page=N`), oldest first. Only `visible` comments; 404 if the post isn't viewable by the requester (not `visible`, unless own pending or moderator-visible rules from Task 4 apply — same queryset rule: visible OR own pending).
  - `POST posts/<id>/comments/` `{"body"}` → 201 `CommentSerializer`; bumps `post.comment_count` via `services.adjust_comment_count(post, +1)`.
  - `DELETE comments/<id>/` (author only) → 204 hard delete, decrements count if the comment was `visible`.
  - `CommentSerializer` fields: `id, author (AuthorSerializer), body, reaction_count, my_reaction, status, created_at` (`my_reaction` via context `{"my_comment_reactions": {comment_id: emoji}}`).
  - `services.adjust_comment_count(post, delta)` — `F()`-based update, floor at zero.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_comments_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import Comment, CommunityMember, CommunitySettings, Post, PostStatus

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="s@x.com"):
    user = User.objects.create_user(email=email, name="S", password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def post(enabled):
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    return Post.objects.create(author=author, body="a post")


def test_comment_bumps_count(post):
    client, _ = make_client()
    resp = client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": "nice"}, format="json")
    assert resp.status_code == 201
    post.refresh_from_db()
    assert post.comment_count == 1


def test_comments_listed_oldest_first(post):
    client, _ = make_client()
    for i in range(3):
        client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": f"c{i}"}, format="json")
    resp = client.get(f"/api/v1/community/posts/{post.id}/comments/")
    assert resp.status_code == 200
    assert [c["body"] for c in resp.json()["results"]] == ["c0", "c1", "c2"]


def test_comment_on_hidden_post_404(post):
    client, _ = make_client()
    post.status = PostStatus.HIDDEN
    post.save()
    resp = client.post(f"/api/v1/community/posts/{post.id}/comments/", {"body": "x"}, format="json")
    assert resp.status_code == 404


def test_delete_own_comment_decrements(post):
    client, _ = make_client()
    cid = client.post(
        f"/api/v1/community/posts/{post.id}/comments/", {"body": "bye"}, format="json"
    ).json()["id"]
    resp = client.delete(f"/api/v1/community/comments/{cid}/")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.comment_count == 0
    assert not Comment.objects.filter(id=cid).exists()


def test_cannot_delete_others_comment(post):
    client, _ = make_client()
    other_client, _ = make_client(email="o@x.com")
    cid = client.post(
        f"/api/v1/community/posts/{post.id}/comments/", {"body": "mine"}, format="json"
    ).json()["id"]
    resp = other_client.delete(f"/api/v1/community/comments/{cid}/")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_comments_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

Append to `backend/apps/community/services.py`:

```python
from django.db.models import F

from .models import Post


def adjust_comment_count(post, delta):
    Post.objects.filter(pk=post.pk, comment_count__gte=max(0, -delta)).update(
        comment_count=F("comment_count") + delta
    )
```

Append to `backend/apps/community/serializers.py`:

```python
from .models import Comment


class CommentSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    my_reaction = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=5000, trim_whitespace=True)

    class Meta:
        model = Comment
        fields = ["id", "author", "body", "reaction_count", "my_reaction", "status", "created_at"]
        read_only_fields = ["reaction_count", "status"]

    def get_my_reaction(self, comment):
        return self.context.get("my_comment_reactions", {}).get(comment.id)
```

Append to `backend/apps/community/views.py`:

```python
from rest_framework.pagination import PageNumberPagination

from . import services
from .models import Comment
from .serializers import CommentSerializer
from .throttling import CommunityCommentThrottle


def _viewable_post_or_404(member, pk):
    try:
        return Post.objects.get(
            Q(status=PostStatus.VISIBLE) | Q(status=PostStatus.PENDING, author=member), pk=pk
        )
    except Post.DoesNotExist:
        raise Http404


def _comment_context(member, comments):
    ids = [c.id for c in comments]
    return {
        "my_comment_reactions": {
            r.comment_id: r.emoji
            for r in Reaction.objects.filter(member=member, comment_id__in=ids)
        }
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def post_comments(request, pk):
    if request.method == "POST":
        member = get_member_or_deny(request, write=True)
        post = _viewable_post_or_404(member, pk)
        throttle = CommunityCommentThrottle()
        if not throttle.allow_request(request, None):
            return Response(status=status.HTTP_429_TOO_MANY_REQUESTS)
        serializer = CommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(post=post, author=member)
        services.adjust_comment_count(post, +1)
        return Response(
            CommentSerializer(comment, context=_comment_context(member, [comment])).data,
            status=status.HTTP_201_CREATED,
        )

    member = get_member_or_deny(request)
    post = _viewable_post_or_404(member, pk)
    qs = post.comments.filter(status=PostStatus.VISIBLE).select_related("author", "author__user")
    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    data = CommentSerializer(page, many=True, context=_comment_context(member, page)).data
    return paginator.get_paginated_response(data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def comment_detail(request, pk):
    member = get_member_or_deny(request, write=True)
    try:
        comment = Comment.objects.get(pk=pk, author=member)
    except Comment.DoesNotExist:
        raise Http404
    was_visible = comment.status == PostStatus.VISIBLE
    post = comment.post
    comment.delete()
    if was_visible:
        services.adjust_comment_count(post, -1)
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Append to `urlpatterns`:

```python
    path("posts/<int:pk>/comments/", views.post_comments, name="community-post-comments"),
    path("comments/<int:pk>/", views.comment_detail, name="community-comment-detail"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_comments_api.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/
git commit -m "feat(community): comments + denormalized comment_count"
```

---

### Task 6: Reactions (posts + comments)

**Files:**
- Create: `backend/apps/community/tests/test_reactions_api.py`
- Modify: `backend/apps/community/views.py`, `urls.py`, `services.py`

**Interfaces:**
- Consumes: `Reaction`, `REACTION_EMOJIS`, `_viewable_post_or_404`, `adjust_comment_count` idiom.
- Produces:
  - `PUT /api/v1/community/posts/<id>/reaction/` and `PUT comments/<id>/reaction/` with `{"emoji"}` → 204. Creates the member's reaction (+1 to `reaction_count`) or changes the emoji in place (count unchanged). Emoji must be in `REACTION_EMOJIS` else 400.
  - `DELETE .../reaction/` → 204, idempotent (−1 only if a reaction existed).
  - `services.adjust_reaction_count(target, delta)` — works for both `Post` and `Comment` instances.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_reactions_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import Comment, CommunityMember, CommunitySettings, Post, Reaction

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email="s@x.com"):
    user = User.objects.create_user(email=email, name="S", password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def post(enabled):
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    return Post.objects.create(author=author, body="a post")


def test_react_and_change_emoji(post):
    client, _ = make_client()
    resp = client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "❤️"}, format="json")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 1
    resp = client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "💪"}, format="json")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 1
    assert Reaction.objects.get(post=post).emoji == "💪"


def test_invalid_emoji_400(post):
    client, _ = make_client()
    resp = client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "🦄"}, format="json")
    assert resp.status_code == 400


def test_unreact_idempotent(post):
    client, _ = make_client()
    client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "❤️"}, format="json")
    assert client.delete(f"/api/v1/community/posts/{post.id}/reaction/").status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 0
    assert client.delete(f"/api/v1/community/posts/{post.id}/reaction/").status_code == 204
    post.refresh_from_db()
    assert post.reaction_count == 0


def test_comment_reaction(post):
    client, _ = make_client()
    comment = Comment.objects.create(post=post, author=post.author, body="c")
    resp = client.put(f"/api/v1/community/comments/{comment.id}/reaction/", {"emoji": "🎉"}, format="json")
    assert resp.status_code == 204
    comment.refresh_from_db()
    assert comment.reaction_count == 1


def test_my_reaction_in_feed(post):
    client, _ = make_client()
    client.put(f"/api/v1/community/posts/{post.id}/reaction/", {"emoji": "❤️"}, format="json")
    feed = client.get("/api/v1/community/posts/").json()
    assert feed["results"][0]["my_reaction"] == "❤️"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_reactions_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

Append to `backend/apps/community/services.py`:

```python
def adjust_reaction_count(target, delta):
    type(target).objects.filter(pk=target.pk, reaction_count__gte=max(0, -delta)).update(
        reaction_count=F("reaction_count") + delta
    )
```

Append to `backend/apps/community/views.py`:

```python
from .models import REACTION_EMOJIS


def _handle_reaction(request, member, *, post=None, comment=None):
    target = post or comment
    kwargs = {"post": post} if post else {"comment": comment}
    if request.method == "PUT":
        emoji = request.data.get("emoji")
        if emoji not in REACTION_EMOJIS:
            return Response({"emoji": ["Invalid emoji."]}, status=status.HTTP_400_BAD_REQUEST)
        _, created = Reaction.objects.update_or_create(
            member=member, **kwargs, defaults={"emoji": emoji}
        )
        if created:
            services.adjust_reaction_count(target, +1)
        return Response(status=status.HTTP_204_NO_CONTENT)
    deleted, _ = Reaction.objects.filter(member=member, **kwargs).delete()
    if deleted:
        services.adjust_reaction_count(target, -1)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def post_reaction(request, pk):
    member = get_member_or_deny(request, write=True)
    post = _viewable_post_or_404(member, pk)
    return _handle_reaction(request, member, post=post)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def comment_reaction(request, pk):
    member = get_member_or_deny(request, write=True)
    try:
        comment = Comment.objects.get(pk=pk, status=PostStatus.VISIBLE)
    except Comment.DoesNotExist:
        raise Http404
    return _handle_reaction(request, member, comment=comment)
```

Append to `urlpatterns`:

```python
    path("posts/<int:pk>/reaction/", views.post_reaction, name="community-post-reaction"),
    path("comments/<int:pk>/reaction/", views.comment_reaction, name="community-comment-reaction"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_reactions_api.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/
git commit -m "feat(community): reactions on posts and comments"
```

---

### Task 7: Reports + auto-hide

**Files:**
- Create: `backend/apps/community/tests/test_reports_api.py`
- Modify: `backend/apps/community/services.py`, `views.py`, `urls.py`

**Interfaces:**
- Consumes: `Report`, `AUTO_HIDE_THRESHOLD`, `_viewable_post_or_404`.
- Produces:
  - `POST /api/v1/community/posts/<id>/report/` and `POST comments/<id>/report/` with `{"reason", "detail"?}` (`reason` ∈ spam/inappropriate/harassment/other) → **204** always (idempotent — re-reporting the same target is a no-op).
  - `services.report_target(member, *, post=None, comment=None, reason, detail="") -> Report` — `get_or_create` on (reporter, target); after creation, if the target's distinct open-report count ≥ `AUTO_HIDE_THRESHOLD` and target status is `visible`, flips target to `hidden`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_reports_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import (
    Comment,
    CommunityMember,
    CommunitySettings,
    Post,
    PostStatus,
    Report,
)

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email):
    user = User.objects.create_user(email=email, name=email.split("@")[0], password="pw123456")
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def post(enabled):
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    return Post.objects.create(author=author, body="reportable")


def test_report_creates_open_report(post):
    client, _ = make_client("r1@x.com")
    resp = client.post(
        f"/api/v1/community/posts/{post.id}/report/", {"reason": "spam"}, format="json"
    )
    assert resp.status_code == 204
    report = Report.objects.get(post=post)
    assert report.status == "open"
    assert report.reason == "spam"


def test_duplicate_report_idempotent(post):
    client, _ = make_client("r1@x.com")
    for _ in range(2):
        resp = client.post(
            f"/api/v1/community/posts/{post.id}/report/", {"reason": "spam"}, format="json"
        )
        assert resp.status_code == 204
    assert Report.objects.filter(post=post).count() == 1


def test_invalid_reason_400(post):
    client, _ = make_client("r1@x.com")
    resp = client.post(
        f"/api/v1/community/posts/{post.id}/report/", {"reason": "ugly"}, format="json"
    )
    assert resp.status_code == 400


def test_three_reports_auto_hide(post):
    for i in range(3):
        client, _ = make_client(f"r{i}@x.com")
        client.post(f"/api/v1/community/posts/{post.id}/report/", {"reason": "spam"}, format="json")
    post.refresh_from_db()
    assert post.status == PostStatus.HIDDEN
    viewer, _ = make_client("v@x.com")
    feed = viewer.get("/api/v1/community/posts/").json()
    assert feed["results"] == []


def test_comment_report_auto_hide(post):
    comment = Comment.objects.create(post=post, author=post.author, body="bad")
    for i in range(3):
        client, _ = make_client(f"c{i}@x.com")
        resp = client.post(
            f"/api/v1/community/comments/{comment.id}/report/",
            {"reason": "harassment"},
            format="json",
        )
        assert resp.status_code == 204
    comment.refresh_from_db()
    assert comment.status == PostStatus.HIDDEN
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_reports_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

Append to `backend/apps/community/services.py`:

```python
from .models import AUTO_HIDE_THRESHOLD, PostStatus, Report


def report_target(member, *, post=None, comment=None, reason, detail=""):
    target = post or comment
    kwargs = {"post": post} if post else {"comment": comment}
    report, created = Report.objects.get_or_create(
        reporter=member, **kwargs, defaults={"reason": reason, "detail": detail}
    )
    if created:
        open_count = Report.objects.filter(status="open", **kwargs).count()
        if open_count >= AUTO_HIDE_THRESHOLD and target.status == PostStatus.VISIBLE:
            target.status = PostStatus.HIDDEN
            target.save(update_fields=["status"])
    return report
```

Append to `backend/apps/community/serializers.py`:

```python
from .models import Report


class ReportCreateSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=[c[0] for c in Report.REASON_CHOICES])
    detail = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
```

Append to `backend/apps/community/views.py`:

```python
from .serializers import ReportCreateSerializer


def _report(request, member, *, post=None, comment=None):
    serializer = ReportCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    services.report_target(
        member,
        post=post,
        comment=comment,
        reason=serializer.validated_data["reason"],
        detail=serializer.validated_data["detail"],
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def post_report(request, pk):
    member = get_member_or_deny(request, write=True)
    post = _viewable_post_or_404(member, pk)
    return _report(request, member, post=post)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def comment_report(request, pk):
    member = get_member_or_deny(request, write=True)
    try:
        comment = Comment.objects.get(pk=pk, status=PostStatus.VISIBLE)
    except Comment.DoesNotExist:
        raise Http404
    return _report(request, member, comment=comment)
```

Append to `urlpatterns`:

```python
    path("posts/<int:pk>/report/", views.post_report, name="community-post-report"),
    path("comments/<int:pk>/report/", views.comment_report, name="community-comment-report"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_reports_api.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/
git commit -m "feat(community): reports with auto-hide at 3 distinct reporters"
```

---

### Task 8: Moderation — queue, resolve, pin, remove, approve

**Files:**
- Create: `backend/apps/community/moderation_views.py`, `tests/test_moderation_api.py`
- Modify: `backend/apps/community/services.py`, `serializers.py`, `urls.py`

**Interfaces:**
- Consumes: `IsCommunityModerator`, `PostSerializer`, `CommentSerializer`, `Report`, `adjust_comment_count`.
- Produces (all under `/api/v1/community/moderation/`, all `IsCommunityModerator`, none gated on `is_enabled`):
  - `GET moderation/queue/` → `{"reports": [ReportSerializer...], "pending_posts": [PostSerializer...]}` (open reports oldest-first; pending posts oldest-first). `ReportSerializer` fields: `id, reason, detail, status, created_at, reporter {display_name}, target_type ("post"|"comment"), post (PostSerializer|null), comment (CommentSerializer|null)`.
  - `POST moderation/reports/<id>/resolve/` `{"action": "remove"|"keep"}` → 204. Calls `services.resolve_target`.
  - `services.resolve_target(*, post=None, comment=None, moderator, action)` — `remove`: target → `removed` (decrement parent `comment_count` if a visible/hidden comment); `keep`: target → `visible` (if `hidden`). Both resolve ALL open reports on the target (`action_taken` set, `resolved_by`, `resolved_at`).
  - `POST moderation/posts/<id>/pin/` / `unpin/` → 204 (pin only `visible` posts).
  - `POST moderation/posts/<id>/remove/`, `POST moderation/comments/<id>/remove/` → 204 (direct removal without a report; also resolves any open reports).
  - `POST moderation/posts/<id>/approve/` → 204 (`pending` → `visible` only).

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_moderation_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import (
    Comment,
    CommunityMember,
    CommunitySettings,
    Post,
    PostStatus,
    Report,
)

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email, role="student", is_staff=False):
    user = User.objects.create_user(
        email=email, name=email.split("@")[0], password="pw123456", role=role, is_staff=is_staff
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def coach_client(enabled):
    client, _ = make_client("coach@x.com", role="owner", is_staff=True)
    return client


@pytest.fixture()
def member(enabled):
    return CommunityMember.objects.create(
        user=User.objects.create_user(email="m@x.com", name="M", password="pw123456"),
        display_name="M",
    )


def _report_post(post, n=1):
    for i in range(n):
        reporter = CommunityMember.objects.create(
            user=User.objects.create_user(email=f"rep{i}-{post.id}@x.com", name="R", password="pw123456"),
            display_name="R",
        )
        Report.objects.create(reporter=reporter, post=post, reason="spam")


def test_queue_requires_moderator(enabled):
    client, _ = make_client("stu@x.com")
    assert client.get("/api/v1/community/moderation/queue/").status_code == 403


def test_queue_lists_open_reports_and_pending(coach_client, member):
    reported = Post.objects.create(author=member, body="reported")
    _report_post(reported)
    Post.objects.create(author=member, body="pending", status=PostStatus.PENDING)
    body = coach_client.get("/api/v1/community/moderation/queue/").json()
    assert len(body["reports"]) == 1
    assert body["reports"][0]["target_type"] == "post"
    assert body["reports"][0]["post"]["body"] == "reported"
    assert [p["body"] for p in body["pending_posts"]] == ["pending"]


def test_resolve_remove(coach_client, member):
    post = Post.objects.create(author=member, body="bad")
    _report_post(post, n=2)
    report = Report.objects.filter(post=post).first()
    resp = coach_client.post(
        f"/api/v1/community/moderation/reports/{report.id}/resolve/",
        {"action": "remove"},
        format="json",
    )
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.status == PostStatus.REMOVED
    assert Report.objects.filter(post=post, status="open").count() == 0
    assert set(Report.objects.filter(post=post).values_list("action_taken", flat=True)) == {"removed"}


def test_resolve_keep_restores_hidden(coach_client, member):
    post = Post.objects.create(author=member, body="fine", status=PostStatus.HIDDEN)
    _report_post(post)
    report = Report.objects.get(post=post)
    resp = coach_client.post(
        f"/api/v1/community/moderation/reports/{report.id}/resolve/",
        {"action": "keep"},
        format="json",
    )
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.status == PostStatus.VISIBLE


def test_remove_comment_decrements_count(coach_client, member):
    post = Post.objects.create(author=member, body="p", comment_count=1)
    comment = Comment.objects.create(post=post, author=member, body="c")
    resp = coach_client.post(f"/api/v1/community/moderation/comments/{comment.id}/remove/")
    assert resp.status_code == 204
    comment.refresh_from_db()
    post.refresh_from_db()
    assert comment.status == PostStatus.REMOVED
    assert post.comment_count == 0


def test_pin_unpin(coach_client, member):
    post = Post.objects.create(author=member, body="pin me")
    assert coach_client.post(f"/api/v1/community/moderation/posts/{post.id}/pin/").status_code == 204
    post.refresh_from_db()
    assert post.is_pinned is True
    assert coach_client.post(f"/api/v1/community/moderation/posts/{post.id}/unpin/").status_code == 204
    post.refresh_from_db()
    assert post.is_pinned is False


def test_approve_pending(coach_client, member):
    post = Post.objects.create(author=member, body="waiting", status=PostStatus.PENDING)
    resp = coach_client.post(f"/api/v1/community/moderation/posts/{post.id}/approve/")
    assert resp.status_code == 204
    post.refresh_from_db()
    assert post.status == PostStatus.VISIBLE
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_moderation_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

Append to `backend/apps/community/services.py`:

```python
from django.utils import timezone


def resolve_target(*, post=None, comment=None, moderator, action):
    """action: 'remove' | 'keep'. Updates target status and resolves ALL open reports."""
    target = post or comment
    kwargs = {"post": post} if post else {"comment": comment}
    if action == "remove":
        if comment is not None and target.status in (PostStatus.VISIBLE, PostStatus.HIDDEN):
            adjust_comment_count(comment.post, -1)
        target.status = PostStatus.REMOVED
        target.save(update_fields=["status"])
    elif target.status == PostStatus.HIDDEN:
        target.status = PostStatus.VISIBLE
        target.save(update_fields=["status"])
    Report.objects.filter(status="open", **kwargs).update(
        status="resolved",
        action_taken="removed" if action == "remove" else "kept",
        resolved_by=moderator,
        resolved_at=timezone.now(),
    )
```

Append to `backend/apps/community/serializers.py`:

```python
class ReportSerializer(serializers.ModelSerializer):
    reporter = serializers.SerializerMethodField()
    target_type = serializers.SerializerMethodField()
    post = PostSerializer(read_only=True)
    comment = CommentSerializer(read_only=True)

    class Meta:
        model = Report
        fields = [
            "id", "reason", "detail", "status", "created_at",
            "reporter", "target_type", "post", "comment",
        ]

    def get_reporter(self, report):
        return {"display_name": report.reporter.display_name}

    def get_target_type(self, report):
        return "post" if report.post_id else "comment"
```

`backend/apps/community/moderation_views.py`:

```python
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from . import services
from .models import Comment, Post, PostStatus, Report
from .permissions import IsCommunityModerator
from .serializers import PostSerializer, ReportSerializer


def _get_or_404(model, **kwargs):
    try:
        return model.objects.get(**kwargs)
    except model.DoesNotExist:
        raise Http404


@api_view(["GET"])
@permission_classes([IsCommunityModerator])
def queue(request):
    reports = (
        Report.objects.filter(status="open")
        .select_related("reporter", "post__author__user", "comment__author__user", "comment__post")
    )
    pending = Post.objects.filter(status=PostStatus.PENDING).select_related("author__user").order_by("created_at")
    return Response(
        {
            "reports": ReportSerializer(reports, many=True).data,
            "pending_posts": PostSerializer(pending, many=True).data,
        }
    )


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def resolve_report_view(request, pk):
    report = _get_or_404(Report, pk=pk, status="open")
    action = request.data.get("action")
    if action not in ("remove", "keep"):
        return Response({"action": ["Must be 'remove' or 'keep'."]}, status=status.HTTP_400_BAD_REQUEST)
    services.resolve_target(
        post=report.post, comment=report.comment, moderator=request.user, action=action
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def pin_post(request, pk):
    post = _get_or_404(Post, pk=pk, status=PostStatus.VISIBLE)
    post.is_pinned = True
    post.save(update_fields=["is_pinned"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def unpin_post(request, pk):
    post = _get_or_404(Post, pk=pk)
    post.is_pinned = False
    post.save(update_fields=["is_pinned"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def remove_post(request, pk):
    post = _get_or_404(Post, pk=pk)
    services.resolve_target(post=post, moderator=request.user, action="remove")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def remove_comment(request, pk):
    comment = _get_or_404(Comment, pk=pk)
    services.resolve_target(comment=comment, moderator=request.user, action="remove")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def approve_post(request, pk):
    post = _get_or_404(Post, pk=pk, status=PostStatus.PENDING)
    post.status = PostStatus.VISIBLE
    post.save(update_fields=["status"])
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Append to `backend/apps/community/urls.py` (import at top: `from . import moderation_views`):

```python
    path("moderation/queue/", moderation_views.queue, name="community-mod-queue"),
    path("moderation/reports/<int:pk>/resolve/", moderation_views.resolve_report_view, name="community-mod-resolve"),
    path("moderation/posts/<int:pk>/pin/", moderation_views.pin_post, name="community-mod-pin"),
    path("moderation/posts/<int:pk>/unpin/", moderation_views.unpin_post, name="community-mod-unpin"),
    path("moderation/posts/<int:pk>/remove/", moderation_views.remove_post, name="community-mod-remove-post"),
    path("moderation/comments/<int:pk>/remove/", moderation_views.remove_comment, name="community-mod-remove-comment"),
    path("moderation/posts/<int:pk>/approve/", moderation_views.approve_post, name="community-mod-approve"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_moderation_api.py -v`
Expected: 7 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/
git commit -m "feat(community): moderation queue, resolve, pin, remove, approve"
```

---

### Task 9: Member moderation — ban, mute, require-approval, members list

**Files:**
- Create: `backend/apps/community/tests/test_enforcement_api.py`
- Modify: `backend/apps/community/moderation_views.py`, `serializers.py`, `urls.py`

**Interfaces:**
- Consumes: `CommunityMember`, `IsCommunityModerator`, `get_member_or_deny` (enforcement already built in Task 2 — this task adds the endpoints that set the flags and proves end-to-end enforcement).
- Produces (all `IsCommunityModerator`):
  - `GET moderation/members/?q=<search>` → `{"results": [{"id", "display_name", "email", "joined_at", "is_banned", "muted_until", "requires_approval", "post_count"}...]}` (no pagination — communities are ≤500 students; `q` filters display_name/email icontains).
  - `POST moderation/members/<id>/ban/` → 204; `POST .../unban/` → 204.
  - `POST moderation/members/<id>/mute/` `{"days": 1..90}` (default 7) → 204 (sets `muted_until = now + days`); mute with `{"days": 0}` clears the mute.
  - `POST moderation/members/<id>/require-approval/` `{"value": true|false}` → 204.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_enforcement_api.py`:

```python
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def enabled(tenant_ctx):
    s = CommunitySettings.load()
    s.is_enabled = True
    s.save()
    return s


def make_client(email, role="student", is_staff=False):
    user = User.objects.create_user(
        email=email, name=email.split("@")[0], password="pw123456", role=role, is_staff=is_staff
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


@pytest.fixture()
def coach_client(enabled):
    client, _ = make_client("coach@x.com", role="owner", is_staff=True)
    return client


def test_ban_blocks_everything(coach_client, enabled):
    student, user = make_client("s@x.com")
    student.post("/api/v1/community/posts/", {"body": "hi"}, format="json")
    member = CommunityMember.objects.get(user=user)
    assert coach_client.post(f"/api/v1/community/moderation/members/{member.id}/ban/").status_code == 204
    assert student.get("/api/v1/community/posts/").status_code == 403
    assert student.post("/api/v1/community/posts/", {"body": "x"}, format="json").status_code == 403
    assert coach_client.post(f"/api/v1/community/moderation/members/{member.id}/unban/").status_code == 204
    assert student.get("/api/v1/community/posts/").status_code == 200


def test_mute_blocks_writes_only(coach_client, enabled):
    student, user = make_client("s2@x.com")
    student.get("/api/v1/community/me/")
    member = CommunityMember.objects.get(user=user)
    resp = coach_client.post(
        f"/api/v1/community/moderation/members/{member.id}/mute/", {"days": 7}, format="json"
    )
    assert resp.status_code == 204
    member.refresh_from_db()
    assert member.muted_until > timezone.now()
    assert student.get("/api/v1/community/posts/").status_code == 200
    assert student.post("/api/v1/community/posts/", {"body": "x"}, format="json").status_code == 403
    resp = coach_client.post(
        f"/api/v1/community/moderation/members/{member.id}/mute/", {"days": 0}, format="json"
    )
    assert resp.status_code == 204
    assert student.post("/api/v1/community/posts/", {"body": "x"}, format="json").status_code == 201


def test_require_approval_flow(coach_client, enabled):
    student, user = make_client("s3@x.com")
    student.get("/api/v1/community/me/")
    member = CommunityMember.objects.get(user=user)
    resp = coach_client.post(
        f"/api/v1/community/moderation/members/{member.id}/require-approval/",
        {"value": True},
        format="json",
    )
    assert resp.status_code == 204
    created = student.post("/api/v1/community/posts/", {"body": "pending?"}, format="json").json()
    assert created["status"] == "pending"


def test_members_list_with_search_and_counts(coach_client, enabled):
    student, user = make_client("ayse@x.com")
    student.post("/api/v1/community/posts/", {"body": "1"}, format="json")
    student.post("/api/v1/community/posts/", {"body": "2"}, format="json")
    body = coach_client.get("/api/v1/community/moderation/members/?q=ayse").json()
    assert len(body["results"]) == 1
    row = body["results"][0]
    assert row["post_count"] == 2
    assert row["email"] == "ayse@x.com"


def test_members_endpoints_require_moderator(enabled):
    student, user = make_client("s4@x.com")
    student.get("/api/v1/community/me/")
    member = CommunityMember.objects.get(user=user)
    assert student.get("/api/v1/community/moderation/members/").status_code == 403
    assert student.post(f"/api/v1/community/moderation/members/{member.id}/ban/").status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/community/tests/test_enforcement_api.py -v`
Expected: FAIL (404 — routes missing)

- [ ] **Step 3: Implement**

Append to `backend/apps/community/serializers.py`:

```python
class ModerationMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)
    is_banned = serializers.BooleanField(read_only=True)
    muted_until = serializers.DateTimeField(read_only=True)
    requires_approval = serializers.BooleanField(read_only=True)
    post_count = serializers.IntegerField(read_only=True)
```

Append to `backend/apps/community/moderation_views.py`:

```python
from django.db.models import Count, Q
from django.utils import timezone

from .models import CommunityMember
from .serializers import ModerationMemberSerializer


@api_view(["GET"])
@permission_classes([IsCommunityModerator])
def members_list(request):
    qs = (
        CommunityMember.objects.select_related("user")
        .annotate(post_count=Count("posts"))
        .order_by("-joined_at")
    )
    q = request.query_params.get("q", "").strip()
    if q:
        qs = qs.filter(Q(display_name__icontains=q) | Q(user__email__icontains=q))
    return Response({"results": ModerationMemberSerializer(qs, many=True).data})


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def ban_member(request, pk):
    member = _get_or_404(CommunityMember, pk=pk)
    member.is_banned = True
    member.save(update_fields=["is_banned"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def unban_member(request, pk):
    member = _get_or_404(CommunityMember, pk=pk)
    member.is_banned = False
    member.save(update_fields=["is_banned"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def mute_member(request, pk):
    member = _get_or_404(CommunityMember, pk=pk)
    try:
        days = int(request.data.get("days", 7))
    except (TypeError, ValueError):
        return Response({"days": ["Must be an integer."]}, status=status.HTTP_400_BAD_REQUEST)
    if not 0 <= days <= 90:
        return Response({"days": ["Must be between 0 and 90."]}, status=status.HTTP_400_BAD_REQUEST)
    member.muted_until = timezone.now() + timezone.timedelta(days=days) if days else None
    member.save(update_fields=["muted_until"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def set_requires_approval(request, pk):
    member = _get_or_404(CommunityMember, pk=pk)
    member.requires_approval = bool(request.data.get("value"))
    member.save(update_fields=["requires_approval"])
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Append to `urlpatterns`:

```python
    path("moderation/members/", moderation_views.members_list, name="community-mod-members"),
    path("moderation/members/<int:pk>/ban/", moderation_views.ban_member, name="community-mod-ban"),
    path("moderation/members/<int:pk>/unban/", moderation_views.unban_member, name="community-mod-unban"),
    path("moderation/members/<int:pk>/mute/", moderation_views.mute_member, name="community-mod-mute"),
    path("moderation/members/<int:pk>/require-approval/", moderation_views.set_requires_approval, name="community-mod-require-approval"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/community/tests/test_enforcement_api.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/
git commit -m "feat(community): member ban/mute/require-approval + members list"
```

---

### Task 10: Full verification pass

**Files:**
- No new files. Fixes only if the suite/lint surfaces issues.

**Interfaces:**
- Consumes: everything above.
- Produces: a green backend suite and clean lint on the branch — Phase 1 done.

- [ ] **Step 1: Run the full community suite**

Run: `docker compose exec django pytest apps/community/tests/ -v`
Expected: ~54 tests PASS, 0 failures.

- [ ] **Step 2: Run the entire backend suite (regression check)**

Run: `make test`
Expected: everything green — especially the root `conftest.py` change (Task 1) must not break other apps' tests.

- [ ] **Step 3: Verify migrations are consistent**

Run: `docker compose exec django python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`

- [ ] **Step 4: Lint**

Run: `make lint`
Expected: pre-commit passes with zero errors/warnings. Fix and re-run until clean.

- [ ] **Step 5: Final commit (if lint produced fixes)**

```bash
git add -A backend/
git commit -m "chore(community): lint fixes for phase 1"
```

---

## Out of scope for this plan (separate plans, after Phase 1 lands)

- **Phase 2 — Student UI** (`/community` in `frontend-customer` `(student)` area): join step, feed, composer, reactions, comments, report; nav gating via `GET settings/`; unread dot via `last_seen_at`.
- **Phase 3 — Coach UI + superadmin**: `/admin/community` tabs (Feed with inline powers, Reports queue with Remove/Keep, Members), settings panel; adminkit registration (`admin_panels.py`) + cross-tenant open-reports rollup.
- **Phase 4 — Notifications**: Celery tasks — web push on coach post (respecting `notify_on_coach_post`) and comment-on-your-post; unread badge polish.
- User-deletion cascade already holds (all community FKs cascade from `CommunityMember` ← `User`).

**Deploy reminder:** `apps.community` is a TENANT_APP; the entrypoint's `migrate_schemas --tenant` (commit `973d0cf`) must be included in the deploy that ships this.
