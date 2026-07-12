# Community Phase 3 — Coach Moderation UI + Superadmin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give coaches an `/admin/community` surface (Feed with inline moderation, Reports queue with Remove/Keep, Members table, Settings) in `frontend-customer`, give platform superadmins an open-reports rollup in `frontend-main`, register community models in adminkit, and land the end-to-end Playwright journey.

**Architecture:** The coach page is one client route with four shadcn Tabs; the Feed tab **reuses Phase 2's `<Feed>`** by passing the `moderator` hooks prop it was designed for. Backend gains only two small pieces: an `admin_panels.py` (studio adminkit registration) and a cross-tenant reports rollup endpoint following the `platform_usage` iterate-schemas pattern. The Playwright spec is the capstone that exercises Phases 2+3 together.

**Tech Stack:** Next.js 14 (both frontends), shadcn Tabs/Table/Switch/Select, `clientFetch`, next-intl for the coach admin nav label, DRF + django-tenants for the rollup, Playwright.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-06-community-feature-design.md`. **Prerequisite: Phase 2 merged to local main** (this plan imports `Feed`, `PostCard`/`ModeratorHooks`, `lib/community.ts`, `types/community.ts`). Verify: `ls frontend-customer/src/components/community/feed.tsx` on your base commit.
- Branch `feat/community-phase-3` in an **isolated worktree** off local `main`; verify `git branch --show-current` before every commit (shared checkout, other agents may move HEAD).
- **Isolated dev stack recipe** — identical to Phase 2's (see that plan's Global Constraints): copy `.env` (+ set `AWS_ENDPOINT_EXTERNAL=http://localhost:19000`), `docker-compose.worktree.yml` with `!override` ports (caddy `18080:80` + `container_name: contentor-caddy-phase3`, postgres 15432, redis 16379, minio 19000/19001), project name `contentor-community-phase-3`, services: `caddy postgres redis minio minio-init django nextjs-customer nextjs-main`. Browser: `http://demo-yoga.localhost:18080` (tenant) and `http://localhost:18080/admin` (superadmin SPA). Do NOT commit the override file.
- **The e2e spec runs against a `:80` stack** (helpers hardcode `http://localhost` / `demo-yoga.localhost`). For the capstone task, either (a) stop the shared checkout's stack and re-up the isolated stack with caddy on `80:80`, or (b) if the shared checkout is free, run the suite there after merging. Option (a) is self-contained — prefer it.
- Coach admin nav labels are i18n'd (next-intl): every new key goes into BOTH `frontend-customer/messages/en/admin.json` and `messages/tr/admin.json` — `make lint` runs `check-i18n` which fails on parity gaps.
- **Coaches are non-technical** (memory: contentor-coach-non-technical-ux): moderation choices must be binary (Remove / Keep), no raw slugs/status enums in copy, confirm destructive actions in plain language.
- Empty-success moderation endpoints already return **204**; `clientFetch` handles that (returns `undefined`).
- Backend tests: `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/ -q` — baseline 55 passed (54 Phase 1 + 1 Phase 2 `me.id`).
- Type checks: `cd frontend-customer && npx tsc --noEmit` and `cd frontend-main && npx tsc --noEmit`.

## Backend API reference (Phase 1, moderation endpoints, `/api/v1/community/moderation/`)

| Endpoint | Notes |
|---|---|
| `GET queue/` | `{reports: Report[], pending_posts: Post[]}`; Report = `{id, reason, detail, status, created_at, reporter:{display_name}, target_type:"post"\|"comment", post:Post\|null, comment:Comment\|null}` |
| `POST reports/<id>/resolve/` | `{action:"remove"\|"keep"}` → 204; resolves ALL open reports on that target |
| `POST posts/<id>/pin\|unpin\|remove\|approve/` | → 204 |
| `POST comments/<id>/remove/` | → 204 |
| `GET members/?q=` | `{results:[{id, display_name, email, joined_at, is_banned, muted_until, requires_approval, post_count}]}` |
| `POST members/<id>/ban\|unban/` | → 204 |
| `POST members/<id>/mute/` | `{days:0..90}` (0 clears) → 204 |
| `POST members/<id>/require-approval/` | `{value:bool}` → 204 |
| `GET/PATCH settings/` | moderator shape `{is_enabled, welcome_message, notify_on_coach_post}` (under `/api/v1/community/`, not `/moderation/`) |

All moderation endpoints require tenant role owner/coach or `is_staff`; they work even while the module is disabled (that's how it gets enabled).

## File Structure

```
backend/apps/community/
  admin_panels.py                 # studio adminkit registration (new)
  platform_views.py               # superadmin cross-tenant rollup (new)
  urls_platform.py                # rollup routing (new)
  tests/test_admin_panels.py      # (new)
  tests/test_platform_rollup.py   # (new)
backend/config/urls.py            # + platform community route (modify)

frontend-customer/src/
  lib/community-admin.ts           # moderation API wrappers (new)
  app/admin/community/page.tsx     # tabs page (new)
  components/admin/community/
    mod-feed.tsx                   # Feed + ModeratorHooks wiring
    reports-queue.tsx              # Remove/Keep cards + pending approvals
    members-table.tsx              # search + ban/mute/approval
    community-settings.tsx         # enable toggle, welcome, notify
  components/admin/admin-shell.tsx # + nav item (modify)
  messages/en/admin.json, messages/tr/admin.json  # + nav label (modify)

frontend-main/src/
  app/admin/community/page.tsx     # rollup table (new)
  app/admin/admin-shell.tsx        # + nav item (modify)
  lib/platform-community-api.ts    # rollup fetch (new)

e2e/specs/15-community.spec.ts     # capstone journey (new)
```

---

### Task 1: Adminkit registration (studio site)

**Files:**
- Create: `backend/apps/community/admin_panels.py`
- Create: `backend/apps/community/tests/test_admin_panels.py`

**Interfaces:**
- Consumes: `apps.adminkit.options.ModelAdmin`, `admin_action`, `apps.adminkit.sites.studio_site`; community models.
- Produces: adminkit panels auto-discovered at startup (`autodiscover_modules("admin_panels")`), keyed `community-posts`, `community-comments`, `community-reports`, `community-members` — they appear automatically in the coach SPA's dynamic "Data" nav.

- [ ] **Step 1: Write the failing test**

`backend/apps/community/tests/test_admin_panels.py`:

```python
import pytest

pytestmark = pytest.mark.django_db(transaction=True)


def test_community_models_registered_on_studio_site():
    import apps.community.admin_panels  # noqa: F401 — ensure module import registers

    from apps.adminkit.sites import studio_site

    keys = set(studio_site._registry.keys())
    assert {"community-posts", "community-comments", "community-reports", "community-members"} <= keys


def test_registered_admins_are_owner_scoped():
    import apps.community.admin_panels  # noqa: F401

    from apps.adminkit.sites import studio_site
    from apps.core.permissions import IsCoachOrOwner

    for key in ("community-posts", "community-comments", "community-reports", "community-members"):
        admin = studio_site._registry[key]
        assert IsCoachOrOwner in tuple(admin.permission_classes)
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_admin_panels.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.community.admin_panels'`

- [ ] **Step 3: Implement `admin_panels.py`**

```python
"""Studio admin-kit registrations for the community module (tenant schema).

The coach's day-to-day moderation lives at /admin/community; these panels are
the raw-data fallback (and what platform staff use via impersonation).
"""

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site
from apps.core.permissions import IsCoachOrOwner

from .models import Comment, CommunityMember, Post, PostStatus, Report


@studio_site.register(Post)
class CommunityPostAdmin(ModelAdmin):
    label = "Community Post"
    label_plural = "Community Posts"
    key = "community-posts"
    icon = "message-square"
    description = "Every community post, including hidden and removed ones."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("author", "body", "status", "is_pinned", "comment_count", "reaction_count", "created_at")
    search_fields = ("body", "author__display_name")
    list_filters = ("status", "is_pinned")
    ordering = ("-created_at",)
    fields = ("body", "status", "is_pinned")
    readonly_fields = ("comment_count", "reaction_count")

    @admin_action(label="Remove", style="danger", confirm="Remove selected posts from the community?")
    def remove(self, request, queryset):
        updated = queryset.exclude(status=PostStatus.REMOVED).update(status=PostStatus.REMOVED)
        return f"Removed {updated} post(s)."


@studio_site.register(Comment)
class CommunityCommentAdmin(ModelAdmin):
    label = "Community Comment"
    label_plural = "Community Comments"
    key = "community-comments"
    icon = "message-circle"
    description = "Every community comment, including removed ones."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("author", "body", "status", "post", "created_at")
    search_fields = ("body", "author__display_name")
    list_filters = ("status",)
    ordering = ("-created_at",)
    fields = ("body", "status")

    @admin_action(label="Remove", style="danger", confirm="Remove selected comments?")
    def remove(self, request, queryset):
        updated = queryset.exclude(status=PostStatus.REMOVED).update(status=PostStatus.REMOVED)
        return f"Removed {updated} comment(s)."


@studio_site.register(Report)
class CommunityReportAdmin(ModelAdmin):
    label = "Community Report"
    label_plural = "Community Reports"
    key = "community-reports"
    icon = "flag"
    description = "Member reports on posts and comments. Resolve them from Community → Reports."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("reporter", "reason", "status", "action_taken", "created_at")
    search_fields = ("reporter__display_name", "detail")
    list_filters = ("status", "reason")
    ordering = ("-created_at",)
    fields = ("reason", "detail", "status", "action_taken")
    readonly_fields = ("reporter", "resolved_by", "resolved_at")


@studio_site.register(CommunityMember)
class CommunityMemberAdmin(ModelAdmin):
    label = "Community Member"
    label_plural = "Community Members"
    key = "community-members"
    icon = "users"
    description = "Community profiles with moderation state (ban / mute / approval)."
    permission_classes = (IsCoachOrOwner,)
    list_display = ("display_name", "is_banned", "muted_until", "requires_approval", "joined_at")
    search_fields = ("display_name", "user__email")
    list_filters = ("is_banned", "requires_approval")
    ordering = ("-joined_at",)
    fields = ("display_name", "is_banned", "muted_until", "requires_approval")
```

(If `ModelAdmin` has no `key` attribute, check `backend/apps/adminkit/options.py:41-80` — `key` defaults to `slugify(label_plural)`, which for "Community Posts" is already `community-posts`; in that case the explicit `key = ...` lines are redundant but harmless if the attribute exists. If assignment fails, delete the `key` lines and keep the labels — the defaults produce the same keys.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_admin_panels.py -v`
Expected: 2 PASS

- [ ] **Step 5: Browser sanity + commit**

Coach at `http://demo-yoga.localhost:18080/admin` → the Data section of the sidebar now lists "Community Posts", "Community Comments", "Community Reports", "Community Members".

```bash
git add backend/apps/community/admin_panels.py backend/apps/community/tests/test_admin_panels.py
git commit -m "feat(community): adminkit studio registration for community models"
```

---

### Task 2: Cross-tenant open-reports rollup (superadmin backend)

**Files:**
- Create: `backend/apps/community/platform_views.py`
- Create: `backend/apps/community/urls_platform.py`
- Create: `backend/apps/community/tests/test_platform_rollup.py`
- Modify: `backend/config/urls.py`

**Interfaces:**
- Consumes: the `platform_usage` pattern (`backend/apps/core/platform/views.py:385` — iterate active tenants, `tenant_context`, skip broken schemas), `IsSuperUser` from `apps.core.permissions`.
- Produces: `GET /api/v1/platform/community/reports/` (superuser only) →
  ```json
  {"total_open_reports": 3, "total_pending_posts": 1,
   "by_tenant": [{"tenant": "Yoga Demo", "slug": "demo-yoga", "enabled": true,
                   "open_reports": 3, "pending_posts": 1, "members": 12}]}
  ```
  `by_tenant` includes only tenants where community is enabled OR has any open reports/pending posts; sorted by `open_reports` desc.

- [ ] **Step 1: Write the failing tests**

`backend/apps/community/tests/test_platform_rollup.py`:

```python
import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post, Report

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def seeded_tenant_data(tenant_ctx):
    """Enable community in the shared tenant and create one open report + one pending post."""
    settings_obj = CommunitySettings.load()
    settings_obj.is_enabled = True
    settings_obj.save()
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@x.com", name="A", password="pw123456"),
        display_name="A",
    )
    reporter = CommunityMember.objects.create(
        user=User.objects.create_user(email="r@x.com", name="R", password="pw123456"),
        display_name="R",
    )
    post = Post.objects.create(author=author, body="reported")
    Report.objects.create(reporter=reporter, post=post, reason="spam")
    Post.objects.create(author=author, body="pending", status="pending")
    return tenant_ctx


def _superadmin_client():
    connection.set_schema_to_public()
    admin = User.objects.create_superuser(email="root@x.com", name="Root", password="pw123456")
    client = APIClient(HTTP_HOST="localhost")
    client.force_authenticate(user=admin)
    return client


def test_rollup_requires_superuser(seeded_tenant_data):
    connection.set_schema_to_public()
    plain = User.objects.create_user(email="pleb@x.com", name="P", password="pw123456")
    client = APIClient(HTTP_HOST="localhost")
    client.force_authenticate(user=plain)
    assert client.get("/api/v1/platform/community/reports/").status_code == 403


def test_rollup_counts_shared_tenant(seeded_tenant_data):
    client = _superadmin_client()
    resp = client.get("/api/v1/platform/community/reports/")
    assert resp.status_code == 200
    body = resp.json()
    row = next((t for t in body["by_tenant"] if t["slug"] == "shared-test"), None)
    assert row is not None
    assert row["enabled"] is True
    assert row["open_reports"] == 1
    assert row["pending_posts"] == 1
    assert body["total_open_reports"] >= 1
```

(Note the tests create the superadmin in the PUBLIC schema — the platform SPA authenticates against public-schema users. `create_superuser` must exist on the custom manager; check `apps/accounts/models.py` — if it doesn't, use `User.objects.create_user(..., role="owner", is_staff=True)` plus `is_superuser=True` via direct field assignment and `save()`.)

- [ ] **Step 2: Run to verify failure**

Run: `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_platform_rollup.py -v`
Expected: FAIL (404 — no route)

- [ ] **Step 3: Implement**

`backend/apps/community/platform_views.py`:

```python
"""Superadmin cross-tenant community rollup.

Iterates tenant schemas like `apps.core.platform.views.platform_usage` — fine
at current fleet size; a broken schema is skipped, never 500s the dashboard.
"""

import logging

from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.models import Tenant
from apps.core.permissions import IsSuperUser

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def community_reports_rollup(request):
    from .models import CommunityMember, CommunitySettings, Post, PostStatus, Report

    total_open = 0
    total_pending = 0
    by_tenant = []
    for tenant in Tenant.objects.exclude(schema_name="public").filter(is_active=True):
        try:
            with tenant_context(tenant):
                enabled = CommunitySettings.load().is_enabled
                open_reports = Report.objects.filter(status="open").count()
                pending_posts = Post.objects.filter(status=PostStatus.PENDING).count()
                members = CommunityMember.objects.count()
        except Exception:  # noqa: BLE001 — a broken schema must not take down the page
            logger.warning("community rollup: skipping tenant %s", tenant.slug, exc_info=True)
            continue
        total_open += open_reports
        total_pending += pending_posts
        if enabled or open_reports or pending_posts:
            by_tenant.append(
                {
                    "tenant": tenant.name,
                    "slug": tenant.slug,
                    "enabled": enabled,
                    "open_reports": open_reports,
                    "pending_posts": pending_posts,
                    "members": members,
                }
            )
    by_tenant.sort(key=lambda row: row["open_reports"], reverse=True)
    return Response(
        {
            "total_open_reports": total_open,
            "total_pending_posts": total_pending,
            "by_tenant": by_tenant,
        }
    )
```

`backend/apps/community/urls_platform.py`:

```python
from django.urls import path

from . import platform_views

urlpatterns = [
    path("reports/", platform_views.community_reports_rollup, name="platform-community-reports"),
]
```

In `backend/config/urls.py`, next to the other `api/v1/platform/` includes:

```python
    path("api/v1/platform/community/", include("apps.community.urls_platform")),
```

(`Tenant` lives in `apps.core.models`; `is_active` field — confirm with `grep -n "is_active" backend/apps/core/models.py`; if the field doesn't exist, drop the `.filter(is_active=True)`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_platform_rollup.py -v`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/community/platform_views.py backend/apps/community/urls_platform.py backend/apps/community/tests/test_platform_rollup.py backend/config/urls.py
git commit -m "feat(community): superadmin cross-tenant open-reports rollup"
```

---

### Task 3: Coach admin lib + page scaffold + Settings tab + nav entry

**Files:**
- Create: `frontend-customer/src/lib/community-admin.ts`
- Create: `frontend-customer/src/app/admin/community/page.tsx`
- Create: `frontend-customer/src/components/admin/community/community-settings.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: `clientFetch`; Phase 2 `types/community.ts` (`CommunitySettings`, `CommunityPost`, `CommunityComment`); shadcn `Tabs` from `@/components/ui/tabs`; `Switch`, `Textarea`, `Button`.
- Produces (`lib/community-admin.ts`, used by Tasks 4–6):
  ```ts
  getModerationQueue(): Promise<ModerationQueue>
  resolveReport(id: number, action: "remove" | "keep"): Promise<void>
  pinPost(id) / unpinPost(id) / removePost(id) / approvePost(id): Promise<void>
  removeCommentMod(id: number): Promise<void>
  getMembers(q?: string): Promise<{ results: ModerationMember[] }>
  banMember(id) / unbanMember(id): Promise<void>
  muteMember(id: number, days: number): Promise<void>
  setRequiresApproval(id: number, value: boolean): Promise<void>
  getAdminSettings(): Promise<CommunitySettings>
  patchAdminSettings(patch: Partial<CommunitySettings>): Promise<CommunitySettings>
  ```
  plus types `ModerationQueue { reports: QueueReport[]; pending_posts: CommunityPost[] }`, `QueueReport { id; reason; detail; status; created_at; reporter: { display_name: string }; target_type: "post" | "comment"; post: CommunityPost | null; comment: CommunityComment | null }`, `ModerationMember { id; display_name; email; joined_at; is_banned; muted_until: string | null; requires_approval; post_count }`.

- [ ] **Step 1: Write `lib/community-admin.ts`**

```typescript
import { clientFetch } from "@/lib/api-client";
import type {
  CommunityComment,
  CommunityPost,
  CommunitySettings,
} from "@/types/community";

const BASE = "/api/v1/community";
const MOD = `${BASE}/moderation`;

export interface QueueReport {
  id: number;
  reason: string;
  detail: string;
  status: string;
  created_at: string;
  reporter: { display_name: string };
  target_type: "post" | "comment";
  post: CommunityPost | null;
  comment: CommunityComment | null;
}

export interface ModerationQueue {
  reports: QueueReport[];
  pending_posts: CommunityPost[];
}

export interface ModerationMember {
  id: number;
  display_name: string;
  email: string;
  joined_at: string;
  is_banned: boolean;
  muted_until: string | null;
  requires_approval: boolean;
  post_count: number;
}

const post = (path: string, body?: unknown) =>
  clientFetch<void>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

export const getModerationQueue = () =>
  clientFetch<ModerationQueue>(`${MOD}/queue/`);
export const resolveReport = (id: number, action: "remove" | "keep") =>
  post(`${MOD}/reports/${id}/resolve/`, { action });
export const pinPost = (id: number) => post(`${MOD}/posts/${id}/pin/`);
export const unpinPost = (id: number) => post(`${MOD}/posts/${id}/unpin/`);
export const removePost = (id: number) => post(`${MOD}/posts/${id}/remove/`);
export const approvePost = (id: number) => post(`${MOD}/posts/${id}/approve/`);
export const removeCommentMod = (id: number) =>
  post(`${MOD}/comments/${id}/remove/`);
export const getMembers = (q = "") =>
  clientFetch<{ results: ModerationMember[] }>(
    `${MOD}/members/${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
export const banMember = (id: number) => post(`${MOD}/members/${id}/ban/`);
export const unbanMember = (id: number) => post(`${MOD}/members/${id}/unban/`);
export const muteMember = (id: number, days: number) =>
  post(`${MOD}/members/${id}/mute/`, { days });
export const setRequiresApproval = (id: number, value: boolean) =>
  post(`${MOD}/members/${id}/require-approval/`, { value });
export const getAdminSettings = () =>
  clientFetch<CommunitySettings>(`${BASE}/settings/`);
export const patchAdminSettings = (patch: Partial<CommunitySettings>) =>
  clientFetch<CommunitySettings>(`${BASE}/settings/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
```

- [ ] **Step 2: Create the Settings tab component**

`frontend-customer/src/components/admin/community/community-settings.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getAdminSettings, patchAdminSettings } from "@/lib/community-admin";
import type { CommunitySettings } from "@/types/community";

export function CommunitySettingsTab() {
  const [settings, setSettings] = useState<CommunitySettings | null>(null);
  const [welcome, setWelcome] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setSettings(s);
        setWelcome(s.welcome_message);
      })
      .catch(() => toast.error("Couldn't load community settings."));
  }, []);

  if (!settings) return <Skeleton className="h-48 w-full" />;

  const apply = async (patch: Partial<CommunitySettings>) => {
    setBusy(true);
    try {
      const updated = await patchAdminSettings(patch);
      setSettings(updated);
      toast.success("Saved.");
    } catch {
      toast.error("Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Community</Label>
            <p className="text-sm text-muted-foreground">
              When on, students see a Community tab and can post, react and
              comment.
            </p>
          </div>
          <Switch
            checked={settings.is_enabled}
            disabled={busy}
            onCheckedChange={(on) => void apply({ is_enabled: on })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Notify students when you post</Label>
            <p className="text-sm text-muted-foreground">
              Sends a push notification to members whenever you or your team
              posts.
            </p>
          </div>
          <Switch
            checked={settings.notify_on_coach_post ?? true}
            disabled={busy}
            onCheckedChange={(on) => void apply({ notify_on_coach_post: on })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-base">Welcome message</Label>
          <p className="text-sm text-muted-foreground">
            Shown at the top of the community feed.
          </p>
          <Textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={3}
            placeholder="Welcome! Introduce yourself and be kind. 💛"
          />
          <Button
            size="sm"
            disabled={busy || welcome === settings.welcome_message}
            onClick={() => void apply({ welcome_message: welcome })}
          >
            Save message
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the tabs page**

`frontend-customer/src/app/admin/community/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModerationQueue } from "@/lib/community-admin";
import { CommunitySettingsTab } from "@/components/admin/community/community-settings";

export default function AdminCommunityPage() {
  const [queueCount, setQueueCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getModerationQueue()
      .then((q) => setQueueCount(q.reports.length + q.pending_posts.length))
      .catch(() => {});
  }, [refreshKey]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-lg font-semibold">Community</h1>
      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="reports">
            Reports
            {queueCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
                {queueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="feed" className="pt-4">
          {/* Task 4 mounts <ModFeed /> here */}
          <p className="text-sm text-muted-foreground">Feed tab lands in Task 4.</p>
        </TabsContent>
        <TabsContent value="reports" className="pt-4">
          {/* Task 5 mounts <ReportsQueue onResolved={() => setRefreshKey(k => k+1)} /> */}
          <p className="text-sm text-muted-foreground">Reports tab lands in Task 5.</p>
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          {/* Task 6 mounts <MembersTable /> */}
          <p className="text-sm text-muted-foreground">Members tab lands in Task 6.</p>
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <CommunitySettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Nav entry + i18n**

In `frontend-customer/src/components/admin/admin-shell.tsx`, in the `community` section's `items` array (currently Students / Notifications / Inbox — around line 76), add FIRST in the list:

```tsx
        {
          label: t("nav.items.communityFeed"),
          href: "/admin/community",
          icon: MessagesSquare,
        },
```

Import `MessagesSquare` from `lucide-react` alongside the existing icon imports.

In `frontend-customer/messages/en/admin.json`, add under `nav.items`: `"communityFeed": "Community"`.
In `frontend-customer/messages/tr/admin.json`, add under `nav.items`: `"communityFeed": "Topluluk"`.

- [ ] **Step 5: Verify in the browser**

1. Coach at `http://demo-yoga.localhost:18080/admin` → sidebar Community section shows "Community" first; clicking opens the tabs page.
2. Settings tab: toggle Community ON → student header (other browser/profile) now shows the Community link; welcome message saves; toggles persist across reload.
3. `make check-i18n` passes (or `make lint` if the target isn't standalone).

- [ ] **Step 6: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/lib/community-admin.ts frontend-customer/src/app/admin/community/ frontend-customer/src/components/admin/community/ frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(community-admin): admin page scaffold, settings tab, nav entry"
```

---

### Task 4: Feed tab with inline moderation

**Files:**
- Create: `frontend-customer/src/components/admin/community/mod-feed.tsx`
- Modify: `frontend-customer/src/app/admin/community/page.tsx` (mount it)

**Interfaces:**
- Consumes: Phase 2 `<Feed me moderator />` and `ModeratorHooks` from `@/components/community/feed` / `post-card`; `getCommunityMe` from `@/lib/community`; Task 3 moderation functions.
- Produces: `<ModFeed />` — the same feed the students see, with pin/unpin/remove/ban in every post's overflow menu and Remove on comments.

- [ ] **Step 1: Implement `mod-feed.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Feed } from "@/components/community/feed";
import type { ModeratorHooks } from "@/components/community/post-card";
import { getCommunityMe } from "@/lib/community";
import {
  banMember,
  pinPost,
  removeCommentMod,
  removePost,
  unpinPost,
} from "@/lib/community-admin";
import type { CommunityMe } from "@/types/community";

export function ModFeed() {
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    getCommunityMe()
      .then(setMe)
      .catch(() => toast.error("Enable the community in Settings first."));
  }, []);

  if (!me) return <Skeleton className="h-64 w-full" />;

  const refresh = () => setFeedKey((k) => k + 1);

  const hooks: ModeratorHooks = {
    pin: async (post) => {
      await pinPost(post.id);
      toast.success("Pinned to the top of the feed.");
      refresh();
    },
    unpin: async (post) => {
      await unpinPost(post.id);
      refresh();
    },
    remove: async (post) => {
      if (!window.confirm("Remove this post from the community?")) return;
      await removePost(post.id);
      toast.success("Post removed.");
      refresh();
    },
    banAuthor: async (post) => {
      if (
        !window.confirm(
          `Ban ${post.author.display_name} from the community? They won't be able to see or post anything.`,
        )
      )
        return;
      await banMember(post.author.id);
      toast.success(`${post.author.display_name} is banned.`);
      refresh();
    },
    removeComment: async (comment) => {
      if (!window.confirm("Remove this comment?")) return;
      await removeCommentMod(comment.id);
      toast.success("Comment removed.");
      refresh();
    },
  };

  return <Feed key={feedKey} me={me} moderator={hooks} />;
}
```

**Note on `banAuthor`:** `post.author.id` is the CommunityMember id — the same id `moderation/members/<id>/ban/` expects (both come from `CommunityMember.pk`). Verified in Phase 1: `AuthorSerializer.id` serializes the member row.

- [ ] **Step 2: Mount in the page**

Replace the Feed tab placeholder in `app/admin/community/page.tsx`:

```tsx
import { ModFeed } from "@/components/admin/community/mod-feed";
// …
<TabsContent value="feed" className="pt-4">
  <ModFeed />
</TabsContent>
```

- [ ] **Step 3: Verify in the browser**

Seed content as a student first (post + comment + a couple of reactions). Then as the coach on the Feed tab:

1. Overflow menu on the student's post shows Pin / Remove post / Ban member (plus Report — that's fine, moderators can report too; if it reads odd, acceptable v1).
2. Pin → post moves to the pinned section on refresh with pin icon; Unpin reverses.
3. Remove → confirm dialog → post gone from feed (soft-removed; still visible in adminkit "Community Posts" with status removed).
4. Expand comments → "Remove" appears next to the student's comments → removes.
5. Ban member → confirm → student's browser now gets the banned EmptyState on /community.
6. Unban via Members tab comes in Task 6 — for now unban via API: `POST /api/v1/community/moderation/members/<id>/unban/` from the coach devtools console.

- [ ] **Step 4: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/admin/community/mod-feed.tsx frontend-customer/src/app/admin/community/page.tsx
git commit -m "feat(community-admin): feed tab with inline moderation"
```

---

### Task 5: Reports queue tab

**Files:**
- Create: `frontend-customer/src/components/admin/community/reports-queue.tsx`
- Modify: `frontend-customer/src/app/admin/community/page.tsx` (mount it)

**Interfaces:**
- Consumes: `getModerationQueue`, `resolveReport`, `approvePost`, `removePost` (Task 3); `Linkify`, `timeAgo` (Phase 2); `QueueReport`.
- Produces: `<ReportsQueue onResolved={() => void} />` — one card per open report (content + reporter + reason, buttons **Remove** / **Keep**) and one card per pending post (**Approve** / **Remove**). `onResolved` lets the page refresh the tab badge.

- [ ] **Step 1: Implement `reports-queue.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Linkify } from "@/components/community/linkify";
import { timeAgo } from "@/components/community/post-card";
import {
  approvePost,
  getModerationQueue,
  type ModerationQueue,
  type QueueReport,
  removePost,
  resolveReport,
} from "@/lib/community-admin";

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  inappropriate: "Inappropriate",
  harassment: "Harassment",
  other: "Other",
};

function ReportCard({
  report,
  onAction,
}: {
  report: QueueReport;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const target = report.post ?? report.comment;
  if (!target) return null;

  const act = async (action: "remove" | "keep") => {
    setBusy(true);
    try {
      await resolveReport(report.id, action);
      toast.success(action === "remove" ? "Content removed." : "Content kept.");
      onAction();
    } catch {
      toast.error("Couldn't resolve the report.");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="destructive">{REASON_LABELS[report.reason] ?? report.reason}</Badge>
          <span className="text-muted-foreground">
            Reported by {report.reporter.display_name} · {timeAgo(report.created_at)}
          </span>
        </div>
        {report.detail && (
          <p className="text-sm italic text-muted-foreground">“{report.detail}”</p>
        )}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {report.target_type === "post" ? "Post" : "Comment"} by{" "}
            {target.author.display_name}
          </div>
          <Linkify text={target.body} />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void act("remove")}
          >
            Remove
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void act("keep")}
          >
            Keep
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportsQueue({ onResolved }: { onResolved: () => void }) {
  const [queue, setQueue] = useState<ModerationQueue | null>(null);

  const load = useCallback(() => {
    getModerationQueue()
      .then(setQueue)
      .catch(() => toast.error("Couldn't load the queue."));
  }, []);

  useEffect(load, [load]);

  const refresh = () => {
    load();
    onResolved();
  };

  if (!queue) return <Skeleton className="h-48 w-full" />;

  const empty = queue.reports.length === 0 && queue.pending_posts.length === 0;
  if (empty) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="All clear"
        description="No reports or posts waiting for you."
      />
    );
  }

  return (
    <div className="space-y-4">
      {queue.pending_posts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Waiting for approval
          </h3>
          {queue.pending_posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="space-y-3 p-4">
                <div className="text-sm text-muted-foreground">
                  {post.author.display_name} · {timeAgo(post.created_at)}
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <Linkify text={post.body} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await approvePost(post.id);
                      toast.success("Post approved.");
                      refresh();
                    }}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await removePost(post.id);
                      toast.success("Post removed.");
                      refresh();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {queue.reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Reports</h3>
          {queue.reports.map((report) => (
            <ReportCard key={report.id} report={report} onAction={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in the page**

```tsx
import { ReportsQueue } from "@/components/admin/community/reports-queue";
// …
<TabsContent value="reports" className="pt-4">
  <ReportsQueue onResolved={() => setRefreshKey((k) => k + 1)} />
</TabsContent>
```

- [ ] **Step 3: Verify in the browser**

1. As student: report the coach's post ("spam"). As coach: Reports tab badge shows 1; the card shows the post body + reporter + reason.
2. **Keep** → card clears, badge drops, post still visible in the student feed, report resolved.
3. Report again from a second student account is blocked (one report per member per target) — report a different post instead; **Remove** → post disappears from the student feed.
4. Set a member `requires_approval` via API (Members tab comes next): their new post appears under "Waiting for approval"; **Approve** → visible in feed.

- [ ] **Step 4: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/admin/community/reports-queue.tsx frontend-customer/src/app/admin/community/page.tsx
git commit -m "feat(community-admin): reports queue with Remove/Keep + approvals"
```

---

### Task 6: Members tab

**Files:**
- Create: `frontend-customer/src/components/admin/community/members-table.tsx`
- Modify: `frontend-customer/src/app/admin/community/page.tsx` (mount it)

**Interfaces:**
- Consumes: `getMembers`, `banMember`, `unbanMember`, `muteMember`, `setRequiresApproval`, `ModerationMember` (Task 3); `Table` components from `@/components/ui/table`; `Input`, `DropdownMenu`.
- Produces: `<MembersTable />`.

- [ ] **Step 1: Implement `members-table.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  banMember,
  getMembers,
  type ModerationMember,
  muteMember,
  setRequiresApproval,
  unbanMember,
} from "@/lib/community-admin";

export function MembersTable() {
  const [members, setMembers] = useState<ModerationMember[] | null>(null);
  const [q, setQ] = useState("");

  const load = (query = q) =>
    getMembers(query)
      .then((r) => setMembers(r.results))
      .catch(() => toast.error("Couldn't load members."));

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<void>, message: string) => {
    try {
      await fn();
      toast.success(message);
      void load();
    } catch {
      toast.error("Action failed.");
    }
  };

  const stateBadge = (m: ModerationMember) => {
    if (m.is_banned) return <Badge variant="destructive">Banned</Badge>;
    if (m.muted_until && new Date(m.muted_until) > new Date())
      return <Badge variant="outline">Muted until {new Date(m.muted_until).toLocaleDateString()}</Badge>;
    if (m.requires_approval) return <Badge variant="outline">Posts need approval</Badge>;
    return <Badge variant="secondary">Active</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search members…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value);
          }}
        />
      </div>
      {members === null ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium">{m.display_name}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </TableCell>
                <TableCell>{m.post_count}</TableCell>
                <TableCell>{stateBadge(m)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Member actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.is_banned ? (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(() => unbanMember(m.id), `${m.display_name} can access the community again.`)
                          }
                        >
                          Unban
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm(`Ban ${m.display_name}? They lose all access to the community.`))
                              void run(() => banMember(m.id), `${m.display_name} is banned.`);
                          }}
                        >
                          Ban
                        </DropdownMenuItem>
                      )}
                      {m.muted_until && new Date(m.muted_until) > new Date() ? (
                        <DropdownMenuItem
                          onClick={() => void run(() => muteMember(m.id, 0), "Mute lifted.")}
                        >
                          Unmute
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(() => muteMember(m.id, 7), `${m.display_name} muted for 7 days.`)
                          }
                        >
                          Mute for 7 days
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          void run(
                            () => setRequiresApproval(m.id, !m.requires_approval),
                            m.requires_approval
                              ? "Their posts publish instantly again."
                              : "Their next posts will wait for your approval.",
                          )
                        }
                      >
                        {m.requires_approval ? "Stop reviewing their posts" : "Review their posts first"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in the page**

```tsx
import { MembersTable } from "@/components/admin/community/members-table";
// …
<TabsContent value="members" className="pt-4">
  <MembersTable />
</TabsContent>
```

- [ ] **Step 3: Verify in the browser**

1. Members tab lists everyone who visited /community, with post counts.
2. Search narrows by name/email.
3. Ban → status flips to Banned; student side blocked. Unban restores.
4. Mute for 7 days → badge with the date; student can read but posting toasts an error. Unmute lifts it.
5. "Review their posts first" → student's next post lands in the Reports tab's approval section.

- [ ] **Step 4: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/admin/community/members-table.tsx frontend-customer/src/app/admin/community/page.tsx
git commit -m "feat(community-admin): members table with ban/mute/approval"
```

---

### Task 7: Superadmin rollup page (frontend-main)

**Files:**
- Create: `frontend-main/src/lib/platform-community-api.ts`
- Create: `frontend-main/src/app/admin/community/page.tsx`
- Modify: `frontend-main/src/app/admin/admin-shell.tsx`

**Interfaces:**
- Consumes: Task 2's `GET /api/v1/platform/community/reports/`; frontend-main's local fetch idiom (each platform lib defines its own `clientFetch`, see `lib/platform-mailbox-api.ts`); `NavItem` shape in `admin-shell.tsx` (`{label, href, icon, group}`).
- Produces: `/admin/community` page in the superadmin SPA.

- [ ] **Step 1: Write `lib/platform-community-api.ts`**

```typescript
// Superadmin community rollup API client. Auth rides the same-origin admin
// cookie (like platform-mailbox-api).

export interface TenantCommunityRow {
  tenant: string;
  slug: string;
  enabled: boolean;
  open_reports: number;
  pending_posts: number;
  members: number;
}

export interface CommunityRollup {
  total_open_reports: number;
  total_pending_posts: number;
  by_tenant: TenantCommunityRow[];
}

export async function getCommunityRollup(): Promise<CommunityRollup> {
  const res = await fetch("/api/v1/platform/community/reports/", {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
```

- [ ] **Step 2: Create the page**

`frontend-main/src/app/admin/community/page.tsx` — follow the visual idiom of the existing superadmin pages (cards + table, no i18n):

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  getCommunityRollup,
  type CommunityRollup,
} from "@/lib/platform-community-api";

export default function PlatformCommunityPage() {
  const [data, setData] = useState<CommunityRollup | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCommunityRollup().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="p-6 text-sm text-red-500">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Community moderation</h1>
      <div className="flex gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold">{data.total_open_reports}</div>
          <div className="text-sm text-muted-foreground">Open reports</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold">{data.total_pending_posts}</div>
          <div className="text-sm text-muted-foreground">Posts awaiting approval</div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Tenant</th>
            <th>Enabled</th>
            <th>Open reports</th>
            <th>Pending posts</th>
            <th>Members</th>
          </tr>
        </thead>
        <tbody>
          {data.by_tenant.map((row) => (
            <tr key={row.slug} className="border-b">
              <td className="py-2">
                {row.tenant}{" "}
                <span className="text-xs text-muted-foreground">({row.slug})</span>
              </td>
              <td>{row.enabled ? "Yes" : "No"}</td>
              <td className={row.open_reports ? "font-semibold text-red-500" : ""}>
                {row.open_reports}
              </td>
              <td>{row.pending_posts}</td>
              <td>{row.members}</td>
            </tr>
          ))}
          {data.by_tenant.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                No tenant has the community enabled yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        To act on a report, impersonate the tenant's coach and use their
        Community → Reports tab.
      </p>
    </div>
  );
}
```

(Match the surrounding pages' exact layout/classes if they use shared card components — copy the idiom from `frontend-main/src/app/admin/health/page.tsx` or the inbox page; adjust the markup accordingly rather than inventing a new look.)

- [ ] **Step 3: Nav entry**

In `frontend-main/src/app/admin/admin-shell.tsx`, add to the `COMMUNICATION` array:

```tsx
  {
    label: "Community",
    href: "/admin/community",
    icon: MessagesSquare,
    group: "Communication",
  },
```

Import `MessagesSquare` from `lucide-react`.

- [ ] **Step 4: Verify in the browser**

1. `http://localhost:18080/admin` as superadmin → "Community" under Communication.
2. With a live report in demo-yoga (create one as a student), the table shows the tenant row with `open_reports: 1` highlighted.
3. Non-superadmin gets 403 from the API (page shows the error message).

- [ ] **Step 5: Type-check and commit**

Run: `cd frontend-main && npx tsc --noEmit` → clean.

```bash
git add frontend-main/src/lib/platform-community-api.ts frontend-main/src/app/admin/community/ frontend-main/src/app/admin/admin-shell.tsx
git commit -m "feat(community-admin): superadmin cross-tenant reports rollup page"
```

---

### Task 8: End-to-end Playwright journey + full verification

**Files:**
- Create: `e2e/specs/15-community.spec.ts`

**Interfaces:**
- Consumes: `coachContext`, `studentContext`, `TENANT` from `e2e/helpers/auth`; the running full stack on **:80**.

**Scope note:** the spec's journey includes "three students report → auto-hide". The e2e helpers cache one JWT per role, so three distinct reporter identities aren't available cheaply; the 3-reporter auto-hide threshold is already covered by backend tests (`test_three_reports_auto_hide`). This spec covers the single-report → coach Remove path instead, plus pin and ban — the full UI surface.

- [ ] **Step 1: Write the spec**

`e2e/specs/15-community.spec.ts`:

```typescript
// e2e/specs/15-community.spec.ts
//
// Full community journey: coach enables the module in Settings → student joins
// and posts → coach sees the post in the admin Feed tab and pins it → student
// reports the coach's post → coach resolves it with Remove → post disappears
// from the student feed → coach bans the student → student is blocked.
//
// Cleanup-first: the spec disables the module and wipes community rows via the
// coach API before starting, so reruns are deterministic.

import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

const POST_BODY = `E2E community post ${Date.now()}`;
const COACH_POST = `E2E coach post ${Date.now()}`;

test("community: enable → post → pin → report → remove → ban", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  // ── 0. Coach: reset + enable via the admin UI ────────────────────────────
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();

  await coachPage.goto(`${TENANT}/admin/community`);
  await coachPage.getByRole("tab", { name: /settings/i }).click();
  // Idempotent: switch ON if currently off.
  const enableSwitch = coachPage.getByRole("switch").first();
  if ((await enableSwitch.getAttribute("data-state")) !== "checked") {
    await enableSwitch.click();
  }
  await expect(enableSwitch).toHaveAttribute("data-state", "checked");

  // ── 1. Student joins and posts ───────────────────────────────────────────
  const student = await studentContext(browser);
  const studentPage = await student.newPage();
  await studentPage.goto(`${TENANT}/community`);

  // Join card may or may not show (depends on prior runs) — handle both.
  const joinButton = studentPage.getByRole("button", {
    name: /join the community/i,
  });
  if (await joinButton.isVisible().catch(() => false)) {
    await joinButton.click();
  }

  await studentPage
    .getByPlaceholder(/share something/i)
    .fill(POST_BODY);
  await studentPage.getByRole("button", { name: /^post$/i }).click();
  await expect(studentPage.getByText(POST_BODY)).toBeVisible({
    timeout: 10_000,
  });

  // ── 2. Coach sees it in the admin feed and pins it ───────────────────────
  await coachPage.getByRole("tab", { name: /feed/i }).click();
  await expect(coachPage.getByText(POST_BODY)).toBeVisible({ timeout: 10_000 });
  await coachPage
    .locator("div")
    .filter({ hasText: POST_BODY })
    .getByLabel("Post actions")
    .first()
    .click();
  await coachPage.getByRole("menuitem", { name: /^pin$/i }).click();
  await expect(coachPage.getByText(/pinned to the top/i)).toBeVisible();

  // ── 3. Coach posts; student reports the coach's post ────────────────────
  await coachPage.getByPlaceholder(/share something/i).fill(COACH_POST);
  await coachPage.getByRole("button", { name: /^post$/i }).click();
  await expect(coachPage.getByText(COACH_POST)).toBeVisible({ timeout: 10_000 });

  await studentPage.reload();
  await expect(studentPage.getByText(COACH_POST)).toBeVisible({
    timeout: 10_000,
  });
  await studentPage
    .locator("div")
    .filter({ hasText: COACH_POST })
    .getByLabel("Post actions")
    .first()
    .click();
  await studentPage.getByRole("menuitem", { name: /report/i }).click();
  await studentPage.getByRole("button", { name: /^spam$/i }).click();
  await studentPage.getByRole("button", { name: /^report$/i }).click();
  await expect(studentPage.getByText(/moderator will take a look/i)).toBeVisible();

  // ── 4. Coach resolves the report with Remove ─────────────────────────────
  await coachPage.getByRole("tab", { name: /reports/i }).click();
  await expect(coachPage.getByText(COACH_POST)).toBeVisible({ timeout: 10_000 });
  await coachPage.getByRole("button", { name: /^remove$/i }).first().click();
  await expect(coachPage.getByText(/content removed/i)).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByText(COACH_POST)).not.toBeVisible();

  // ── 5. Coach bans the student; student is blocked ────────────────────────
  await coachPage.getByRole("tab", { name: /members/i }).click();
  const studentRow = coachPage.getByRole("row").filter({ hasText: "student" });
  await studentRow.getByLabel("Member actions").click();
  coachPage.once("dialog", (d) => void d.accept());
  await coachPage.getByRole("menuitem", { name: /^ban$/i }).click();

  await studentPage.reload();
  await expect(
    studentPage.getByText(/can't access the community/i),
  ).toBeVisible({ timeout: 10_000 });

  // ── 6. Cleanup: unban so reruns start clean ──────────────────────────────
  await coachPage.reload();
  await coachPage.getByRole("tab", { name: /members/i }).click();
  const bannedRow = coachPage.getByRole("row").filter({ hasText: /banned/i });
  await bannedRow.getByLabel("Member actions").click();
  await coachPage.getByRole("menuitem", { name: /unban/i }).click();

  await coach.close();
  await student.close();
});
```

**Selector caveats for the executor:** window.confirm dialogs need `page.once("dialog", ...)` BEFORE the click that triggers them (already done for the ban; the report flow's Remove/Keep has no confirm). If the `locator("div").filter({hasText})` scoping proves flaky, add `data-testid={post-${post.id}}` to `PostCard`'s root Card and select by test id — that's an acceptable Phase 2 file touch in this task.

- [ ] **Step 2: Run the spec against a `:80` stack**

1. Stop the shared checkout's caddy if it holds :80: `docker stop contentor-caddy-dev` (note it, restart after).
2. Re-up the isolated stack with caddy remapped to 80: temporarily change the override's caddy ports to `"80:80"` and `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml up -d caddy`.
3. Run: `cd e2e && npx playwright test specs/15-community.spec.ts`
   Expected: 1 passed. (GOTCHA from memory: run playwright FROM `e2e/`, not the repo root — a stray `@playwright/test` resolution from a sibling project causes silent hangs.)
4. Restore: caddy back to 18080, `docker start contentor-caddy-dev`.

- [ ] **Step 3: Full verification**

- `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/ -q` → 59 passed (55 + 2 adminkit + 2 rollup).
- `docker compose -p contentor-community-phase-3 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest -q` → whole suite green (2 known pre-existing mailbox teardown errors may appear if the fix from `chore/faster-test-suite` hasn't merged; anything else is yours).
- `cd frontend-customer && npx tsc --noEmit && npm run build` → clean.
- `cd frontend-main && npx tsc --noEmit && npm run build` → clean.
- `pre-commit run --all-files` → passes (includes check-i18n parity).

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/15-community.spec.ts
git commit -m "test(community): end-to-end moderation journey"
```

---

## Out of scope (Phase 4 plan)

- Web-push notifications (coach post → members; comment → post author).
- Unread dot on the student nav link.
- Nav-item badge count in the coach sidebar (the tab badge inside the page ships here; a sidebar badge needs admin-shell badge support — polish item).
