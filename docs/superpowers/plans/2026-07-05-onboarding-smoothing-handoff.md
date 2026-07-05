# Onboarding Smoothing — EXECUTION HANDOFF (self-contained)

> **THIS IS THE SINGLE SOURCE OF TRUTH for executing this feature.** It supersedes
> `2026-07-05-onboarding-smoothing.md` (draft plan; contains two known errors fixed
> here) and assumes the executor has ZERO prior context. Follow it top to bottom.
> Design rationale lives in `docs/superpowers/specs/2026-07-05-onboarding-smoothing-design.md`.

**Goal:** Smooth the new-coach funnel: (A) one-click authenticated landing after
signup, (B) a state-driven Setup Guide checklist in /admin, (C) no blank-slate
tenants ("Something else" template replaces Skip), (D) "can't sell yet" nudges on
price fields.

---

## 0. Operating manual (read before touching anything)

- Repo root: `~/ws/projects-active/home-server/contentor`. Dev stack must be up
  (`docker compose ps` — if django/postgres aren't running: `make dev`).
- **Work on branch `feat/onboarding-smoothing` (already exists, checked out).**
  This working tree is SHARED with other agents. Before EVERY commit run
  `git branch --show-current` and confirm `feat/onboarding-smoothing`.
- **DO NOT stage, commit, revert, or modify these uncommitted files** (another
  agent's in-progress work, unrelated):
  - `Makefile`
  - `scripts/mirror_demo_assets.py`
  - `docs/superpowers/specs/2026-07-04-dev-demo-assets-design.md`
  Stage files explicitly by path; never `git add -A` / `git add .`.
- Backend tests: `docker compose exec -T django pytest <path> -v`.
  Known pre-existing failures you must IGNORE (not yours to fix):
  `apps/mailbox/tests/test_platform_address.py` — 2 teardown ERRORs
  (PlatformPlan ProtectedError).
- Frontend checks: `npx tsc --noEmit` inside `frontend-main/` or
  `frontend-customer/`. Full `npm run build` only at final verification
  (note: build prints a benign "Failed to patch lockfile … reading 'os'"
  warning — ignore it; "✓ Compiled successfully" is the success signal).
- Run `make format` from repo root before committing frontend files
  (pre-commit does NOT lint the frontends).
- Commit messages: conventional style, e.g. `feat(onboarding): …`, each ending
  with the trailer `Co-Authored-By:` line naming the executing model.
- Copy tone for all user-facing strings: non-technical coach voice — no jargon,
  no raw slugs/paths.
- Django dev server hot-reloads Python; Next dev containers hot-reload TSX. No
  container rebuilds needed until final verification.

## 1. CURRENT STATE (exactly where things stand)

Committed on this branch: `b2e0a3f` (spec + draft plan + PRODUCT.md stamp).

**Task A1 (handoff endpoint) is HALF-DONE in the uncommitted working tree:**

- `backend/apps/core/onboarding/views.py` — `onboarding_handoff` view ADDED
  (complete, correct — placed directly above `provisioning_status`).
- `backend/apps/core/onboarding/urls.py` — `handoff/` route ADDED (complete).
- `backend/apps/core/tests/test_onboarding_handoff.py` — EXISTS but has a bug:
  the `tenant` fixture uses `Tenant.objects.create(...)`; the row leaks across
  tests (public-schema rows aren't flushed between `transaction=True` tests) →
  2nd test dies with `duplicate key … core_tenant_schema_name_key`.
  **Fix: overwrite that file with the exact content in Task A1 below.**

Everything else (Tasks A2–D, section 3) is NOT started.

## 2. Shared facts (verified against the codebase — do not re-derive)

| Fact | Value |
|---|---|
| Signup token helpers | `apps.accounts.tokens.create_signup_token(email, name, brand_name, region="global")`, `verify_signup_token(token)` |
| Magic-link token | `apps.accounts.tokens.create_magic_link_token(email, tenant_schema, tenant_slug)` — consumed by tenant `/callback?token=…` → Next API `/api/auth/verify` → Django `magic-link/verify/` → session cookie → redirect `/` |
| Onboarding endpoints mount | `/api/v1/onboarding/` → `apps/core/onboarding/urls.py` |
| Tenant-admin endpoints mount | `/api/v1/admin/` → `apps/tenant_config/urls.py` |
| `apps/tenant_config/views.py` existing imports | already imports `api_view, permission_classes, connection, Response, IsCoachOrOwner, Course, DownloadFile, TenantConfig` — reuse them |
| Downloads model | **`apps.downloads.models.DownloadFile`** (NOT `Download`) |
| Course required fields | `title` (Char), `slug` (Slug, **unique, required**), `instructor` (FK to accounts.User — field name is **instructor**, not owner) |
| Monetization helpers | `apps.core.monetization.can_monetize(tenant)`, `is_paid_active(tenant)` |
| Tenant flags | `Tenant.is_published` (default False), `TenantConfig.onboarding_completed` (flips True on first site-builder save) |
| Seeder contract | module in `backend/apps/core/management/commands/demo_data/` with `TENANT` + `CONFIG` (+ optional `COURSES`, `DOWNLOADS`, …) is auto-discovered by `apps.core.demo.seed_template.available_niches()`; `_CONFIG_SKIP_KEYS = {brand_name, default_locale, onboarding_completed}` are never copied; `_expand_courses` cycles COURSES up to 12 with "— Volume N" suffixes |
| Demo media | reuse existing bucket keys `demo/photos/yoga_1..10.jpg`, `demo/videos/yoga_1..8.mp4` (neutral studio shots; no new assets exist) |
| i18n catalogs | `frontend-main/messages/en/auth.json` + `messages/tr/auth.json`; niche entry shape `"yoga": {"label": "Yoga", "tagline": "Mindful flows & breath"}` under `signup.questionnaire.niches` |
| Test conventions | root `backend/conftest.py` provides `tenant_ctx`, `restore_public`, shared host `shared-test.localhost`; tenant-schema API tests use `APIClient(HTTP_HOST="shared-test.localhost")` + `force_authenticate` |
| Dev email sink | `GET /api/v1/dev/emails/latest/?to=<email>` returns the last captured email (dev only) — use it to fetch the signup verification link during the browser walk |

---

## TASK A1 — Finish the handoff endpoint (backend)

The view + route already exist in the tree (see §1). Only the test file needs
replacing, then verify + commit.

**Step 1** — Overwrite `backend/apps/core/tests/test_onboarding_handoff.py` with
EXACTLY:

```python
import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token(email="coach@x.com", brand="Glow Studio"):
    return create_signup_token(email, "Coach", brand)


@pytest.fixture()
def tenant(restore_public):
    # Row-only tenant: the handoff endpoint never enters the tenant schema, so
    # skip schema creation. Public-schema rows are NOT flushed between
    # transaction=True tests — get_or_create + explicit cleanup keeps reruns green.
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="glow_studio",
            defaults={
                "name": "Glow Studio",
                "slug": "glow-studio",
                "subdomain": "glow-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "ready"
        t.save(update_fields=["provisioning_status"])
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="glow_studio").delete()


def test_handoff_returns_login_url(tenant, settings):
    settings.SITE_SCHEME = "https"
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": _token()}, format="json")
    assert resp.status_code == 200, resp.content
    url = resp.json()["login_url"]
    assert url.startswith(f"https://glow-studio.{settings.CONTENTOR_DOMAIN}/callback?token=")
    assert url.endswith("&next=/")


def test_handoff_requires_ready(tenant):
    tenant.provisioning_status = "provisioning"
    tenant.save(update_fields=["provisioning_status"])
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": _token()}, format="json")
    assert resp.status_code == 409


def test_handoff_rejects_bad_token(tenant):
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": "garbage"}, format="json")
    assert resp.status_code == 400
```

**Step 2** — Run:
`docker compose exec -T django pytest apps/core/tests/test_onboarding_handoff.py apps/core/tests/test_onboarding_authenticated.py -v`
Expected: **all pass** (3 new + existing).

**Step 3** — Reference: the already-implemented view in
`backend/apps/core/onboarding/views.py` must read exactly (verify, don't rewrite):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def onboarding_handoff(request):
    """Step 4: exchange the signup token for a one-click login URL.

    The signup token is the email-ownership proof; the returned URL carries a
    standard magic-link token consumed by the tenant's existing /callback flow.
    """
    payload, tenant, err = _resolve_tenant_from_signup_token(request)
    if err is not None:
        return err
    if tenant.provisioning_status != "ready":
        return Response({"detail": "not_ready"}, status=409)

    from apps.accounts.tokens import create_magic_link_token

    magic = create_magic_link_token(tenant.owner_email, tenant.schema_name, tenant.slug)
    base_domain = settings.CONTENTOR_DOMAIN
    fqdn = f"{tenant.slug}.tr.{base_domain}" if tenant.region == "tr" else f"{tenant.slug}.{base_domain}"
    return Response({"login_url": f"{settings.SITE_SCHEME}://{fqdn}/callback?token={magic}&next=/"})
```

and `urls.py` contains `path("handoff/", onboarding_handoff, name="onboarding-handoff"),`.

**Step 4** — Commit (paths only):
`git add backend/apps/core/onboarding/views.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_onboarding_handoff.py`
`git commit -m "feat(onboarding): handoff endpoint mints one-click login url"`

---

## TASK A2 — Verify page uses the handoff (frontend-main)

**File 1:** `frontend-main/src/lib/api/onboarding.ts` — append:

```ts
export async function requestHandoff(token: string): Promise<{ login_url: string }> {
  const res = await fetch("/api/v1/onboarding/handoff/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("handoff_failed");
  return res.json();
}
```

(Match the file's existing style; if it uses a shared fetch helper for
`seedFromTemplate`, mirror that helper instead — behavior identical.)

**File 2:** `frontend-main/src/app/signup/verify/page.tsx`:

1. Import `requestHandoff` alongside the existing imports from
   `@/lib/api/onboarding` (there are none today in this file — add
   `import { requestHandoff } from "@/lib/api/onboarding";`).
2. Add state next to the others: `const [loginUrl, setLoginUrl] = useState<string | null>(null);`
3. Add this effect after the existing verify effect:

```tsx
  // One-click login: when the studio is ready, swap the CTA for an
  // authenticated URL. Falls back to the plain domain link on any failure
  // (e.g. the signup token expired) — the lock screen's owner-login path
  // remains the safety net.
  useEffect(() => {
    if (state !== "ready" || !token || loginUrl) return;
    requestHandoff(token)
      .then((d) => setLoginUrl(d.login_url))
      .catch(() => {});
  }, [state, token, loginUrl]);
```

4. In the `state === "ready"` block, change the CTA anchor from
   `<a href={`http://${domain}`}>` to `<a href={loginUrl ?? `http://${domain}`}>`.

**Verify:** `cd frontend-main && npx tsc --noEmit` → clean.
**Commit:** `feat(signup): one-click authenticated landing after provisioning`

---

## TASK A3 — Edit sidebar "Continue setup →" (frontend-customer)

**File:** `frontend-customer/src/components/owner/edit-sidebar.tsx`

Locate the sidebar `{/* Header */}` block (a div with classes
`flex items-center justify-between border-b px-5 py-4` inside the
`{editMode && (<aside …>` region). Insert DIRECTLY AFTER that header div's
closing tag:

```tsx
                  {/* First-run: clear path from the builder to the setup guide */}
                  {!initialConfig.onboarding_completed && (
                    <a
                      href="/admin"
                      className="flex items-center justify-between border-b bg-primary/5 px-5 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                      style={{ minWidth: SIDEBAR_WIDTH }}
                    >
                      Continue setup
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
```

Add `ArrowRight` to the file's existing `lucide-react` import.
`initialConfig` and `SIDEBAR_WIDTH` are already in scope in this component.

**Verify:** `cd frontend-customer && npx tsc --noEmit` → clean.
**Commit:** `feat(builder): first-run "Continue setup" link to the studio admin`

---

## TASK B1 — `setup_guide_dismissed` field + setup-status endpoint (backend)

**File 1:** `backend/apps/tenant_config/models.py` — add to `TenantConfig`
(next to `onboarding_completed`):

```python
    setup_guide_dismissed = models.BooleanField(default=False)
```

**Migrations:**
`docker compose exec -T django python manage.py makemigrations tenant_config`
(creates the next-numbered migration), then
`docker compose exec -T django python manage.py migrate_schemas --tenant`.

**File 2:** `backend/apps/tenant_config/views.py` — add ONE import
(`from apps.core.monetization import can_monetize` — everything else needed is
already imported, see §2) and append:

```python
@api_view(["GET", "PATCH"])
@permission_classes([IsCoachOrOwner])
def setup_status(request):
    """Aggregated go-live state for the /admin Setup Guide."""
    config = TenantConfig.objects.first()
    if config is None:
        return Response(status=404)
    if request.method == "PATCH" and "dismissed" in request.data:
        config.setup_guide_dismissed = bool(request.data["dismissed"])
        config.save(update_fields=["setup_guide_dismissed"])
    tenant = connection.tenant
    return Response(
        {
            "site_customized": config.onboarding_completed,
            "has_content": Course.objects.exists() or DownloadFile.objects.exists(),
            "payments_ready": can_monetize(tenant),
            "published": bool(getattr(tenant, "is_published", False)),
            "dismissed": config.setup_guide_dismissed,
        }
    )
```

**File 3:** `backend/apps/tenant_config/urls.py` — add
`path("setup-status/", setup_status, name="setup-status"),` (+ import).

Do NOT add `setup_guide_dismissed` to `TenantConfigSerializer`.

**File 4 (tests):** create `backend/apps/tenant_config/tests/__init__.py`
(empty) and `backend/apps/tenant_config/tests/test_setup_status.py`:

```python
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.tenant_config.models import TenantConfig

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
    return TenantConfig.objects.get_or_create(brand_name="T")[0]


def test_setup_status_booleans(client, coach, config):
    with patch("apps.tenant_config.views.can_monetize", return_value=False):
        body = client.get("/api/v1/admin/setup-status/").json()
    assert body == {
        "site_customized": config.onboarding_completed,
        "has_content": False,
        "payments_ready": False,
        "published": False,
        "dismissed": False,
    }
    Course.objects.create(title="C", slug="c-setup-test", instructor=coach)
    with patch("apps.tenant_config.views.can_monetize", return_value=True):
        body = client.get("/api/v1/admin/setup-status/").json()
    assert body["has_content"] is True
    assert body["payments_ready"] is True


def test_setup_status_dismiss(client, config):
    with patch("apps.tenant_config.views.can_monetize", return_value=False):
        body = client.patch(
            "/api/v1/admin/setup-status/", {"dismissed": True}, format="json"
        ).json()
    assert body["dismissed"] is True
    config.refresh_from_db()
    assert config.setup_guide_dismissed is True
```

Note: if a `TenantConfig` row already exists in the shared test schema, the
`get_or_create(brand_name="T")` may create a SECOND row while the view reads
`.first()`. If `test_setup_status_dismiss` fails on the refresh assert, change
the `config` fixture to
`TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")`
— assert against whichever row the view mutated.

**Run:** `docker compose exec -T django pytest apps/tenant_config -v` → all pass.
**Commit** (include the generated migration file):
`feat(setup): setup-status endpoint + dismissible flag (tenant migration)`

---

## TASK B2 — SetupGuideCard (frontend-customer)

**File 1:** create `frontend-customer/src/components/admin/setup-guide-card.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, Check, ChevronRight, Paintbrush, Rocket, Wallet, X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { clientFetch } from '@/lib/api-client'

interface SetupStatus {
  site_customized: boolean
  has_content: boolean
  payments_ready: boolean
  published: boolean
  dismissed: boolean
}

const STEPS = [
  {
    key: 'site_customized' as const,
    icon: Paintbrush,
    title: 'Make it yours',
    description: 'Change the words, photos and colors on your site.',
    href: '/',
  },
  {
    key: 'has_content' as const,
    icon: BookOpen,
    title: 'Add your first course or download',
    description: 'Give your students something to learn from.',
    href: '/admin/courses/new',
  },
  {
    key: 'payments_ready' as const,
    icon: Wallet,
    title: 'Set up how you get paid',
    description: 'Connect payouts so students can buy from you.',
    href: '/admin/payouts',
  },
  {
    key: 'published' as const,
    icon: Rocket,
    title: 'Publish your site',
    description: 'Flip the switch when you are ready for the world.',
    href: '#publish-card',
  },
]

export function SetupGuideCard() {
  const [status, setStatus] = useState<SetupStatus | null>(null)

  useEffect(() => {
    clientFetch<SetupStatus>('/api/v1/admin/setup-status/')
      .then(setStatus)
      .catch(() => {})
  }, [])

  if (!status) return null

  const setDismissed = (dismissed: boolean) => {
    setStatus({ ...status, dismissed })
    clientFetch('/api/v1/admin/setup-status/', {
      method: 'PATCH',
      body: JSON.stringify({ dismissed }),
    }).catch(() => {})
  }

  if (status.dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Show setup guide
      </button>
    )
  }

  const done = STEPS.filter((s) => status[s.key]).length
  const allDone = done === STEPS.length

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {allDone ? 'You’re live! 🎉' : 'Get your studio live'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {allDone
                ? 'Everything is set up. Share your site with your students!'
                : `${done} of ${STEPS.length} steps done`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss setup guide"
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(done / STEPS.length) * 100}%` }}
          />
        </div>

        <ul className="space-y-1">
          {STEPS.map((step) => {
            const isDone = status[step.key]
            const Icon = step.icon
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50 ${
                    isDone ? 'opacity-60' : ''
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isDone
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-medium ${isDone ? 'line-through' : ''}`}
                    >
                      {step.title}
                    </span>
                    {!isDone && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {step.description}
                      </span>
                    )}
                  </span>
                  {!isDone && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
```

**File 2:** `frontend-customer/src/app/admin/page.tsx` — add
`import { SetupGuideCard } from '@/components/admin/setup-guide-card'` and render
`<SetupGuideCard />` on its own line IMMEDIATELY ABOVE the existing
`<PublishCard />`.

**File 3:** `frontend-customer/src/components/admin/publish-card.tsx` — add
`id="publish-card"` to the root `<Card>` element it returns (so the guide's
step-4 anchor scrolls to it).

**Verify:** `npx tsc --noEmit` → clean.
**Commit:** `feat(admin): setup guide checklist on the dashboard`

---

## TASK C1 — `general` demo template (backend)

**File 1 (test):** create `backend/apps/core/tests/test_general_template.py`:

```python
import pytest

from apps.core.demo.seed_template import available_niches

pytestmark = pytest.mark.django_db


def test_general_niche_available():
    assert "general" in available_niches()


def test_general_module_shape():
    from apps.core.management.commands.demo_data import general

    assert general.CONFIG["enabled_modules"]
    assert len(general.COURSES) == 3
    for course in general.COURSES:
        assert course["lessons"], course["title"]
    assert len(general.DOWNLOADS) == 2
```

**File 2:** create
`backend/apps/core/management/commands/demo_data/general.py` with EXACTLY:

```python
"""
Coaching Studio — neutral demo data for coaches who pick "Something else".

Same module shape as the niche templates (yoga.py et al). Copy is deliberately
niche-free so it fits any kind of coaching. Media reuses existing neutral
demo/* bucket keys — no new assets required.
"""

TENANT = {
    "name": "Coaching Studio",
    "slug": "demo-general",
    "subdomain": "demo-general",
    "schema_name": "demo_general",
    "domain": "demo-general.localhost",
}

CONFIG = {
    "brand_name": "Coaching Studio",
    "dark_mode_enabled": True,
    "onboarding_completed": True,
    "enabled_modules": [
        "courses",
        "live",
        "community",
        "downloads",
        "billing",
        "campaigns",
        "analytics",
        "pages",
    ],
    "navbar_config": {
        "links": [
            {"label": "Programs", "href": "/courses"},
            {"label": "Calendar", "href": "/calendar"},
            {"label": "About", "href": "/about"},
            {"label": "FAQ", "href": "/faq"},
        ],
        "cta": {"text": "Get Started", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Learn with me, at your own pace",
            "subheadline": (
                "Step-by-step programs, personal guidance, and a space to "
                "grow — everything you need to make real progress."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/yoga_10.jpg",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Hi, I'm so glad you're here. I've spent years helping people "
                "build skills and habits that stick — and this studio brings "
                "everything I teach into one place. Whether you're just "
                "starting out or leveling up, we'll take it one step at a "
                "time, together."
            ),
            "image_url": "demo/photos/yoga_3.jpg",
        },
        "courses": {"enabled": True, "heading": "Programs"},
        "testimonials": {"enabled": False, "heading": "What students say", "items": []},
        "faq": {"enabled": False, "heading": "FAQ", "items": []},
        "cta": {
            "enabled": True,
            "heading": "Ready to start?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Welcome — Start Here",
        "description": (
            "New here? This short free program shows you how the studio "
            "works, helps you set your first goal, and gets you moving on "
            "day one."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_1.jpg",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "Meet Your Coach",
                "order": 1,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 300,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome! In this first lesson I share who I am, how I "
                    "coach, and what you can expect from the programs in this "
                    "studio.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>What this studio offers and how it's organized</li>"
                    "<li>How I'll support you along the way</li>"
                    "<li>What to do right after this lesson</li></ul>"
                ),
            },
            {
                "title": "How This Studio Works",
                "order": 2,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>A quick tour: where to find your programs, how to "
                    "track progress, join live sessions, and download "
                    "resources.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Navigate programs, calendar, and downloads</li>"
                    "<li>Pick the right starting program for you</li>"
                    "<li>Where to ask questions when you're stuck</li></ul>"
                ),
            },
            {
                "title": "Set Your First Goal",
                "order": 3,
                "video_url": "demo/videos/yoga_3.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Progress starts with a clear, honest goal. We'll set "
                    "one together — small enough to start this week, big "
                    "enough to matter.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Write a goal you can act on this week</li>"
                    "<li>Break it into three tiny first steps</li>"
                    "<li>Decide when and how you'll practice</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "The Foundations Program",
        "description": (
            "The core program: build solid technique and a routine you can "
            "keep. Four focused sessions take you from scattered effort to "
            "steady progress."
        ),
        "pricing_type": "paid",
        "price": 29,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_4.jpg",
        "module_title": "Foundations",
        "lessons": [
            {
                "title": "Building Your Routine",
                "order": 1,
                "video_url": "demo/videos/yoga_4.mp4",
                "duration_seconds": 480,
                "is_free_preview": True,
                "content_html": (
                    "<p>A routine beats motivation every time. We'll design a "
                    "weekly rhythm that fits your real life — not an ideal "
                    "one.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Choose your practice days and protect them</li>"
                    "<li>Start small: the 20-minute session rule</li>"
                    "<li>Plan for the week you'll want to quit</li></ul>"
                ),
            },
            {
                "title": "Core Techniques, Step by Step",
                "order": 2,
                "video_url": "demo/videos/yoga_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>The essential techniques, broken down slowly with "
                    "checkpoints so you can self-correct as you practice.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Master the fundamentals before adding speed</li>"
                    "<li>Use the checkpoint method to catch mistakes early</li>"
                    "<li>Practice drills for the week ahead</li></ul>"
                ),
            },
            {
                "title": "Staying Consistent",
                "order": 3,
                "video_url": "demo/videos/yoga_6.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Everyone slips. The skill is coming back. This session "
                    "gives you the tools to restart without guilt and keep "
                    "the streak alive.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>The two-day rule: never miss twice</li>"
                    "<li>Track effort, not perfection</li>"
                    "<li>Design your environment to make practice easy</li></ul>"
                ),
            },
            {
                "title": "Review & Next Steps",
                "order": 4,
                "video_url": "demo/videos/yoga_7.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Look back at how far you've come, lock in what "
                    "worked, and choose your next challenge.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Review your progress against week one</li>"
                    "<li>Keep the habits that carried you</li>"
                    "<li>Pick your next program with confidence</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "30-Day Momentum Challenge",
        "description": (
            "One month, one focus: momentum. Daily prompts, weekly "
            "milestones, and a finish line worth celebrating."
        ),
        "pricing_type": "paid",
        "price": 49,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_7.jpg",
        "module_title": "The Challenge",
        "lessons": [
            {
                "title": "Week 1 — Kickoff",
                "order": 1,
                "video_url": "demo/videos/yoga_8.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Set your challenge goal, meet your weekly structure, "
                    "and bank your first three wins before the week is "
                    "out.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Define what \"done\" looks like on day 30</li>"
                    "<li>Schedule week one, session by session</li>"
                    "<li>Start your momentum tracker</li></ul>"
                ),
            },
            {
                "title": "Weeks 2–3 — The Deep Work",
                "order": 2,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>The middle is where challenges are won. We raise the "
                    "bar a notch and handle the mid-point dip head-on.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Progressively increase difficulty without burnout</li>"
                    "<li>Beat the week-two dip with micro-goals</li>"
                    "<li>Mid-point check-in: adjust, don't abandon</li></ul>"
                ),
            },
            {
                "title": "Final Week — The Push",
                "order": 3,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bring it home. A focused final week that turns your "
                    "30 days of effort into a lasting habit.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Finish strong with a personal-best session</li>"
                    "<li>Capture what changed since day one</li>"
                    "<li>Plan how the habit survives after the challenge</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Goal-Setting Worksheet (PDF)",
        "file_url": "demo/photos/yoga_8.jpg",
        "file_size": 1_400_000,
        "download_count": 63,
        "pricing_type": "free",
    },
    {
        "title": "Weekly Planner Template",
        "file_url": "demo/photos/yoga_9.jpg",
        "file_size": 900_000,
        "download_count": 41,
        "pricing_type": "free",
    },
]
```

(Note: CONFIG deliberately has NO `theme` and NO `font_family` key — the
platform default theme applies. Do not add them.)

**Run:**
`docker compose exec -T django pytest apps/core/tests/test_general_template.py -v` → 2 pass.
Sanity: `docker compose exec -T django python -W ignore manage.py shell -c "from apps.core.demo.seed_template import available_niches; print(available_niches())"` → list includes `general`.

**Commit:** `feat(onboarding): neutral "general" template — no more blank tenants`

---

## TASK C2 — Questionnaire: "Something else" tile, Skip removed (frontend-main)

**File 1:** `frontend-main/src/app/signup/verify/QuestionnaireStep.tsx`

1. Add `Sparkles` to the `lucide-react` import list.
2. Append to `NICHE_OPTIONS`: `{ key: "general", Icon: Sparkles },`
3. Remove the Skip affordance from the UI:
   - Delete the header Skip button JSX (the `<button … onClick={handleSkip} …>`
     rendering `t("skipping")` / `t("skipShort")`).
   - Delete the `handleSkip` function.
   - Remove `skipTemplate` from the `@/lib/api/onboarding` import (the lib
     export and the backend endpoint STAY — back-compat).
   - Narrow the busy state: `useState<"continue" | null>(null)` and fix any
     `"skip"` references left (the `busy === "skip"` ternaries go away with the
     button).
4. Do NOT remove the `skip`, `skipShort`, `skipping` i18n keys.

**File 2 + 3:** i18n catalogs — inside `signup.questionnaire.niches` add:

- `frontend-main/messages/en/auth.json`:
  `"general": { "label": "Something else", "tagline": "A flexible starter site for any kind of coaching" }`
- `frontend-main/messages/tr/auth.json`:
  `"general": { "label": "Başka bir şey", "tagline": "Her tür koçluk için esnek bir başlangıç sitesi" }`

(Mirror the exact entry shape of the sibling `"yoga"` entries in each file.)

**Verify:** `cd frontend-main && npx tsc --noEmit` → clean.
**Commit:** `feat(signup): "Something else" niche replaces Skip`

---

## TASK D — MonetizeNudge on price fields (frontend-customer)

**File 1:** create `frontend-customer/src/components/admin/monetize-nudge.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { clientFetch } from '@/lib/api-client'

let cached: boolean | null = null // one status fetch per page session

export function MonetizeNudge({ price }: { price: string | number | undefined }) {
  const [canMonetize, setCanMonetize] = useState<boolean | null>(cached)

  useEffect(() => {
    if (cached !== null) return
    clientFetch<{ can_monetize: boolean }>('/api/v1/billing/connect/status/')
      .then((s) => {
        cached = s.can_monetize
        setCanMonetize(s.can_monetize)
      })
      .catch(() => {})
  }, [])

  if (canMonetize !== false) return null
  if (!price || Number(price) <= 0) return null

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>
        Students can’t purchase yet —{' '}
        <Link href="/admin/payouts" className="font-medium underline underline-offset-2">
          set up payouts
        </Link>{' '}
        to start selling.
      </span>
    </div>
  )
}
```

**File 2:** `frontend-customer/src/components/admin/course-form.tsx` — find the
price input block (search `htmlFor="price"`, ~line 430; it sits inside a
`pricing_type === "paid"` conditional). Directly AFTER the `<Input id="price" …/>`
closing tag, still inside the same `<div className="space-y-2">`, add:

```tsx
                <MonetizeNudge price={isCreate ? createForm.price : (course?.price ?? 0)} />
```

+ import: `import { MonetizeNudge } from '@/components/admin/monetize-nudge'`.

**File 3:** `frontend-customer/src/app/admin/downloads/page.tsx` — find the
`dl_price` input (search `htmlFor="dl_price"`, ~line 288). Directly after that
`<Input id="dl_price" …/>`, add:

```tsx
                <MonetizeNudge price={form.price} />
```

+ the same import.

**Verify:** `npx tsc --noEmit` → clean.
**Commit:** `feat(admin): "can't sell yet" nudge on price fields`

---

## FINAL VERIFICATION (all must pass before handing back)

1. **Backend:** `docker compose exec -T django pytest apps/core apps/tenant_config -q`
   → green (ignore nothing here — the known mailbox teardown errors are in
   `apps/mailbox`, which this command doesn't run).
2. **Frontends:** `npm run build` in `frontend-main/` AND `frontend-customer/`
   → both "✓ Compiled successfully".
3. **Rebuild dev containers:**
   `docker compose build nextjs-main nextjs-customer && docker compose up -d nextjs-main nextjs-customer`
4. **Browser funnel walk** (dev stack; email sink is enabled in dev):
   a. Open `http://localhost/signup`, sign up with brand "Test Flow Studio",
      any name, email `flow-test@example.com`.
   b. Fetch the verification link:
      `curl -s "http://localhost/api/v1/dev/emails/latest/?to=flow-test@example.com"`
      → open the contained `/signup/verify?token=…` URL.
   c. Questionnaire: pick **Something else** (last tile) → goals → Continue.
   d. Wait for the Ready screen → click **Open test-flow-studio.localhost**.
      **PASS =** you land on the tenant homepage LOGGED IN (no "Coming soon"
      lock screen), edit sidebar open with a "Continue setup" row, site shows
      the neutral Coaching Studio content.
   e. Click "Continue setup" → `/admin` shows the Setup Guide: step 2
      (content) already done (template seeded courses), steps for payments +
      publish undone; progress bar correct.
   f. Open a course → set pricing type "paid" + price → the amber
      "Students can't purchase yet" nudge appears under the price field.
   g. Dismiss the guide (✕) → dashboard shows "Show setup guide" link →
      click → guide returns.
5. **Leave the branch UNMERGED and UNPUSHED.** Do not touch `main`. Report:
   task-by-task status, test counts, funnel-walk results (with screenshots if
   the harness allows), and any deviations from this document.
