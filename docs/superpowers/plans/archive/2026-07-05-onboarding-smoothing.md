# Onboarding Smoothing Implementation Plan

> **SUPERSEDED — do not execute from this file.** Use
> `2026-07-05-onboarding-smoothing-handoff.md` (self-contained, corrects two
> errors in this draft: Course uses `instructor`+required `slug`, downloads
> model is `DownloadFile`). Kept for design history only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smooth the new-coach funnel: authenticated one-click handoff after signup, a state-driven Setup Guide in /admin, no blank-slate tenants, and can't-sell-yet nudges on price fields.

**Architecture:** Backend adds one onboarding endpoint (handoff → magic-link URL), one tenant-config endpoint (setup-status GET/PATCH + `setup_guide_dismissed` field), and one demo-data module (`general`). Frontend-main rewires the verify Ready CTA and the questionnaire; frontend-customer adds `SetupGuideCard`, `MonetizeNudge`, and a "Continue setup" affordance in the edit sidebar.

**Tech Stack:** Django 5.1 + DRF (existing magic-link/token machinery, `apps.core.monetization`), Next.js 14 × 2 frontends, next-intl catalogs.

**Spec:** `docs/superpowers/specs/2026-07-05-onboarding-smoothing-design.md`

## Global Constraints

- Branch `feat/onboarding-smoothing` off local `main`. Shared tree: verify `git branch --show-current` before EVERY commit.
- Backend tests: `docker compose exec -T django pytest <path> -v` (dev stack up).
- Frontends: after changes run `npx tsc --noEmit` in the touched frontend; full `npm run build` at final verification. `make format` before frontend commits (pre-commit doesn't lint frontends).
- The `skip_template` API endpoint is kept (back-compat); only the UI loses Skip.
- New tenant migration auto-applies on deploy via entrypoint `--tenant`.
- Copy tone: non-technical coach voice (no jargon, no raw slugs).

---

### Task 1: Handoff endpoint (backend)

**Files:**
- Modify: `backend/apps/core/onboarding/views.py`, `backend/apps/core/onboarding/urls.py`
- Create: `backend/apps/core/tests/test_onboarding_handoff.py`

**Interfaces:**
- Consumes: `_resolve_tenant_from_signup_token` (views.py), `create_magic_link_token(email, tenant_schema, tenant_slug)` (`apps.accounts.tokens`), `settings.SITE_SCHEME`, `settings.CONTENTOR_DOMAIN`.
- Produces: `POST /api/v1/onboarding/handoff/` `{token}` → 200 `{"login_url": "<scheme>://<fqdn>/callback?token=<magic>&next=/"}` | 409 `{"detail":"not_ready"}` | 400/403/404 (same guards as seed endpoints).

- [ ] **Step 1: Write the failing tests**

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)


def _token(email="coach@x.com", brand="Glow Studio"):
    return create_signup_token(email, "Coach", brand)


@pytest.fixture()
def tenant(db):
    return Tenant.objects.create(
        schema_name="glow-studio", name="Glow Studio", slug="glow-studio",
        subdomain="glow-studio", owner_email="coach@x.com",
        provisioning_status="ready",
    )


def test_handoff_returns_login_url(tenant, settings):
    settings.SITE_SCHEME = "https"
    resp = APIClient().post("/api/v1/onboarding/handoff/", {"token": _token()}, format="json")
    assert resp.status_code == 200, resp.content
    url = resp.json()["login_url"]
    assert url.startswith(f"https://glow-studio.{settings.CONTENTOR_DOMAIN}/callback?token=")
    assert url.endswith("&next=/")


def test_handoff_requires_ready(tenant):
    tenant.provisioning_status = "provisioning"
    tenant.save(update_fields=["provisioning_status"])
    resp = APIClient().post("/api/v1/onboarding/handoff/", {"token": _token()}, format="json")
    assert resp.status_code == 409


def test_handoff_rejects_bad_token(tenant):
    resp = APIClient().post("/api/v1/onboarding/handoff/", {"token": "garbage"}, format="json")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to verify failure** — `docker compose exec -T django pytest apps/core/tests/test_onboarding_handoff.py -v` → 404s (route missing).

- [ ] **Step 3: Implement**

`views.py` (after `skip_template`):

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

`urls.py`: add `path("handoff/", onboarding_handoff, name="onboarding-handoff"),` (+ import).

- [ ] **Step 4: Run tests** → 3 PASS. Also `docker compose exec -T django pytest apps/core/tests/test_onboarding_authenticated.py -v` still green.
- [ ] **Step 5: Commit** — `feat(onboarding): handoff endpoint mints one-click login url`

---

### Task 2: Verify page auto-login (frontend-main)

**Files:**
- Modify: `frontend-main/src/lib/api/onboarding.ts`, `frontend-main/src/app/signup/verify/page.tsx`

**Interfaces:**
- Consumes: Task 1 endpoint.
- Produces: `requestHandoff(token: string): Promise<{ login_url: string }>`; Ready CTA uses `login_url` with plain-domain fallback.

- [ ] **Step 1: API helper** — in `onboarding.ts` add (matching the file's existing fetch style):

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

- [ ] **Step 2: Wire into verify page** — in `page.tsx`: add `const [loginUrl, setLoginUrl] = useState<string | null>(null);` and one effect:

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

Change the Ready CTA: `<a href={loginUrl ?? \`http://${domain}\`}>` (import `requestHandoff`).

- [ ] **Step 3: Typecheck** — `cd frontend-main && npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit** — `feat(signup): one-click authenticated landing after provisioning`

---

### Task 3: Edit sidebar "Continue setup →" (frontend-customer)

**Files:**
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx`

**Interfaces:** none new — first-run-only UI affordance.

- [ ] **Step 1: Add the row** — directly AFTER the sidebar `{/* Header */}` div (the `flex items-center justify-between border-b px-5 py-4` block), insert:

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

(Add `ArrowRight` to the existing lucide import.)

- [ ] **Step 2: Typecheck** — `cd frontend-customer && npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit** — `feat(builder): first-run "Continue setup" link to the studio admin`

---

### Task 4: `setup_guide_dismissed` + setup-status endpoint (backend)

**Files:**
- Modify: `backend/apps/tenant_config/models.py`, `views.py`, `urls.py`, `serializers.py`
- Create: migration (generated), `backend/apps/tenant_config/tests/__init__.py`, `backend/apps/tenant_config/tests/test_setup_status.py`

**Interfaces:**
- Consumes: `apps.core.monetization.can_monetize`, `connection.tenant`, `Course`/`Download` models.
- Produces: `GET /api/v1/admin/setup-status/` → `{site_customized, has_content, payments_ready, published, dismissed}` (all bool); `PATCH {"dismissed": bool}` → same payload. Coach/owner only.

- [ ] **Step 1: Write failing tests**

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
    Course.objects.create(title="C", owner=coach)
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

(If `Course` requires different kwargs, mirror the minimal creation used in `apps/courses` tests.)

- [ ] **Step 2: Verify failure** — route 404 / field missing.
- [ ] **Step 3: Implement**

`models.py`: `setup_guide_dismissed = models.BooleanField(default=False)` on TenantConfig.
Run `docker compose exec -T django python manage.py makemigrations tenant_config` then `migrate_schemas --tenant`.

`views.py`:

```python
from django.db import connection

from apps.core.monetization import can_monetize
from apps.courses.models import Course
from apps.downloads.models import Download


@api_view(["GET", "PATCH"])
@permission_classes([IsCoachOrOwner])
def setup_status(request):
    config = TenantConfig.objects.first()
    if config is None:
        return Response(status=404)
    if request.method == "PATCH":
        if "dismissed" in request.data:
            config.setup_guide_dismissed = bool(request.data["dismissed"])
            config.save(update_fields=["setup_guide_dismissed"])
    tenant = connection.tenant
    return Response({
        "site_customized": config.onboarding_completed,
        "has_content": Course.objects.exists() or Download.objects.exists(),
        "payments_ready": can_monetize(tenant),
        "published": bool(getattr(tenant, "is_published", False)),
        "dismissed": config.setup_guide_dismissed,
    })
```

(Use the same `IsCoachOrOwner` import path the file/neighbours already use; `api_view` imports as in `admin_stats`.)

`urls.py`: `path("setup-status/", setup_status, name="setup-status"),`
`serializers.py`: no change needed unless TenantConfigSerializer whitelists fields — do NOT expose `setup_guide_dismissed` there.

- [ ] **Step 4: Run** — `docker compose exec -T django pytest apps/tenant_config -v` → PASS (plus suite untouched).
- [ ] **Step 5: Commit** — `feat(setup): setup-status endpoint + dismissible flag (tenant migration)`

---

### Task 5: SetupGuideCard (frontend-customer)

**Files:**
- Create: `frontend-customer/src/components/admin/setup-guide-card.tsx`
- Modify: `frontend-customer/src/app/admin/page.tsx`, `frontend-customer/src/components/admin/publish-card.tsx` (anchor id only)

**Interfaces:**
- Consumes: Task 4 endpoint via `clientFetch`.
- Produces: `<SetupGuideCard />` rendered above `<PublishCard />`; PublishCard root Card gets `id="publish-card"`.

- [ ] **Step 1: Component**

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

  if (!status || status.dismissed) return null

  const done = STEPS.filter((s) => status[s.key]).length
  const allDone = done === STEPS.length

  const dismiss = () => {
    setStatus({ ...status, dismissed: true })
    clientFetch('/api/v1/admin/setup-status/', {
      method: 'PATCH',
      body: JSON.stringify({ dismissed: true }),
    }).catch(() => {})
  }

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
            onClick={dismiss}
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
                      isDone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${isDone ? 'line-through' : ''}`}>
                      {step.title}
                    </span>
                    {!isDone && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {step.description}
                      </span>
                    )}
                  </span>
                  {!isDone && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
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

- [ ] **Step 2: Wire in** — `admin/page.tsx`: import + render `<SetupGuideCard />` immediately above `<PublishCard />`. `publish-card.tsx`: add `id="publish-card"` to its root `<Card>`. Un-dismiss affordance: `SetupGuideCard` renders, when `status.dismissed`, a single small text link instead of `null`:

```tsx
  if (status.dismissed)
    return (
      <button
        type="button"
        onClick={() => {
          setStatus({ ...status, dismissed: false })
          clientFetch('/api/v1/admin/setup-status/', {
            method: 'PATCH',
            body: JSON.stringify({ dismissed: false }),
          }).catch(() => {})
        }}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Show setup guide
      </button>
    )
```

(Replace the plain `if (!status || status.dismissed) return null` with `if (!status) return null` plus this branch.)
- [ ] **Step 3: Typecheck** → clean. **Step 4: Commit** — `feat(admin): setup guide checklist on the dashboard`

---

### Task 6: `general` template (backend)

**Files:**
- Create: `backend/apps/core/management/commands/demo_data/general.py`
- Test: extend `backend/apps/core/tests/test_onboarding_handoff.py`? No — create `backend/apps/core/tests/test_general_template.py`

**Interfaces:**
- Produces: niche key `general` auto-discovered by `available_niches()`; module shape identical to `yoga.py` (`TENANT`, `CONFIG`, `COURSES` ×3, `DOWNLOADS` ×2). Media: reuse existing neutral `demo/photos/yoga_*.jpg` + `demo/videos/yoga_*.mp4` keys (studio/people shots read neutral; no new assets).

- [ ] **Step 1: Failing test**

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

- [ ] **Step 2: Verify failure** (ImportError / not in niches).
- [ ] **Step 3: Write `general.py`** — mirror `yoga.py` structure exactly. Content outline (write full copy in the module, coach-neutral tone):
  - `TENANT`: name "Coaching Studio", slug/subdomain/schema `demo-general`/`demo_general`, domain `demo-general.localhost`.
  - `CONFIG`: brand_name "Coaching Studio"; NO `theme` key (keep platform default); `onboarding_completed: True` (parity with other modules; the seeder skips it anyway); enabled_modules same 8 as yoga; navbar links Programs/Calendar/About/FAQ + CTA "Get Started"; landing_sections: hero ("Learn with me, at your own pace" / subhead about programs & guidance, bg `demo/photos/yoga_10.jpg`), about enabled with warm generic coach bio, courses heading "Programs", testimonials 3 generic quotes, faq 3 entries (how do courses work / do I need experience / refunds), cta enabled.
  - `COURSES` (3): 1) "Welcome — Start Here" (free, 3 lessons: Meet your coach / How this studio works / Set your first goal), 2) "The Foundations Program" (paid 29, 4 lessons: Building your routine / Core techniques step by step / Staying consistent / Review & next steps), 3) "30-Day Momentum Challenge" (paid 49, 4 lessons: Week 1 kickoff / Weeks 2–3 deep work / Final week push / Celebrate & continue). Each lesson: `video_url` cycling `demo/videos/yoga_{1..8}.mp4`, `duration_seconds` 300–600, first lesson `is_free_preview: True`, 2-3 sentence `content_html` with a `<h4>Key takeaways</h4><ul>` list — copy written generic-coaching, NO niche words.
  - `DOWNLOADS` (2): "Goal-Setting Worksheet (PDF)" free + "Weekly Planner Template" paid 9 — `file_url` reuse `demo/photos/yoga_8.jpg`/`yoga_9.jpg` pattern, realistic sizes.
- [ ] **Step 4: Run tests** → PASS. Also live-smoke the seeder:
  `docker compose exec -T django python -W ignore manage.py shell -c "from apps.core.demo.seed_template import available_niches; print(available_niches())"` → includes `general`.
- [ ] **Step 5: Commit** — `feat(onboarding): neutral "general" template — no more blank tenants`

---

### Task 7: Questionnaire — "Something else" tile, Skip removed (frontend-main)

**Files:**
- Modify: `frontend-main/src/app/signup/verify/QuestionnaireStep.tsx`, `frontend-main/messages/en/auth.json`, `frontend-main/messages/tr/auth.json`

**Interfaces:**
- Consumes: `general` niche (Task 6).
- Produces: 8-tile niche grid; Skip button/handler removed from UI (`skipTemplate` lib fn untouched).

- [ ] **Step 1: Tile + removal** — in `QuestionnaireStep.tsx`:
  - Add `Sparkles` to the lucide import; append `{ key: "general", Icon: Sparkles }` to `NICHE_OPTIONS`.
  - Delete the Skip button JSX in the header, the `handleSkip` function, the `skipTemplate` import, and the `"skip"` variant from the `busy` union type (`useState<"continue" | null>`), fixing references.
- [ ] **Step 2: i18n** — in BOTH `en/auth.json` and `tr/auth.json` under the questionnaire `niches` object add (match the sibling entry shape):
  - en: `"general": { "label": "Something else", "tagline": "A flexible starter site for any kind of coaching" }`
  - tr: `"general": { "label": "Başka bir şey", "tagline": "Her tür koçluk için esnek bir başlangıç sitesi" }`
- [ ] **Step 3: Typecheck** — `cd frontend-main && npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit** — `feat(signup): "Something else" niche replaces Skip`

---

### Task 8: MonetizeNudge (frontend-customer)

**Files:**
- Create: `frontend-customer/src/components/admin/monetize-nudge.tsx`
- Modify: `frontend-customer/src/components/admin/course-form.tsx` (price field ~line 430), `frontend-customer/src/app/admin/downloads/page.tsx` (price field ~line 288, `dl_price`)

**Interfaces:**
- Produces: `<MonetizeNudge price={string | number | undefined} />` — renders nothing unless `Number(price) > 0` AND connect-status says `!can_monetize`.

- [ ] **Step 1: Component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { clientFetch } from '@/lib/api-client'

let cached: boolean | null = null // module-level: one status fetch per session

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
        Students can’t purchase yet — {' '}
        <Link href="/admin/payouts" className="font-medium underline underline-offset-2">
          set up payouts
        </Link>{' '}
        to start selling.
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Insert** — directly under the price `<Input>` in `course-form.tsx` (`<MonetizeNudge price={isCreate ? createForm.price : course?.price} />`) and under the `dl_price` input in `downloads/page.tsx` (`<MonetizeNudge price={form.price} />`).
- [ ] **Step 3: Typecheck** → clean. **Step 4: Commit** — `feat(admin): "can't sell yet" nudge on price fields`

---

### Task 9: Full verification

- [ ] Backend: `docker compose exec -T django pytest apps/core apps/tenant_config apps/mailbox -q` → green (known `test_platform_address` teardown errors excepted).
- [ ] Frontends: `npm run build` in BOTH `frontend-main` and `frontend-customer` → compiled.
- [ ] Rebuild containers: `docker compose build nextjs-main nextjs-customer && docker compose up -d nextjs-main nextjs-customer`.
- [ ] **Browser funnel walk (dev, email-sink on):** signup at `localhost/signup` with a fresh brand → read verify link via `GET /api/v1/dev/emails/latest/?to=<email>` → questionnaire → pick **Something else** → provisioning → Ready → CTA lands **authenticated** on the new tenant (no lock screen, edit sidebar open, "Continue setup" visible) → `/admin` shows Setup Guide with correct states → create a priced course → MonetizeNudge appears → guide step 2 flips done.
- [ ] Commit any fixes; report. Merge/push decision → user (finishing-a-development-branch).
