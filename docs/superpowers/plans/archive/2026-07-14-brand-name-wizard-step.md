# Brand Name As Wizard Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the anonymous pre-wizard signup form into two screens (brand name with a live preview, then name+email) that render inside the wizard's own shell, so brand-name entry feels like the wizard's first step instead of a disconnected form.

**Architecture:** A new public, throttled `check-brand-name` endpoint mirrors `creator_signup`'s existing slug-availability check so step 1 can validate before advancing without minting a token or sending an email. `signup-form.tsx`'s anonymous branch becomes a 2-step local state machine, reusing the wizard's existing presentational `WizardShell` (chrome) and `LivePreview` (brand mockup) components — no changes to `WizardFlow`, `creator_signup`, or `creator_signup_verify`. The already-logged-in "create another platform" path is untouched.

**Tech Stack:** Django 5.1 + DRF (backend), Next.js 14 App Router + next-intl (frontend-main), Playwright (e2e).

## Global Constraints

- All commands from repo root `~/ws/projects-active/home-server/contentor`; backend tests run **inside** the container: `docker compose exec django pytest <path> -v`.
- Public/anon endpoints MUST set `@authentication_classes([])` — `AllowAny` alone is not enough (project rule).
- `make lint` must pass with zero errors/warnings on files this plan touches. Note: this repo currently has no working `frontend-main` ESLint config (`npm run lint` prompts interactively — pre-existing, unrelated gap, do not fix it here); use `docker compose exec nextjs-main npm run build` for frontend verification instead, which does run type-checking.
- `frontend-main` has no unit/component test runner (no Jest/Vitest/Testing Library) — every wizard-area component is verified via the `e2e/` Playwright suite or manual browser walkthrough. This plan follows that precedent; no new test framework is introduced.
- EN and TR message catalogs must stay key-identical (`node scripts/check-i18n-parity.mjs`). TR strings need native review (note in commit).
- Commit after each task (this SDD flow is the explicitly-approved exception to the repo's "never commit unless asked" rule). Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Existing behavior for the already-logged-in "create another platform" path (`authenticatedName` set) and for `creator_signup`/`creator_signup_verify`/`WizardFlow` must stay byte-for-byte unchanged.

---

### Task 1: Backend — `check-brand-name` endpoint

**Files:**
- Modify: `backend/config/settings/base.py` (`DEFAULT_THROTTLE_RATES`, after `"signup": "5/min",`)
- Modify: `backend/apps/core/throttling.py` (new throttle class)
- Modify: `backend/apps/core/onboarding/views.py` (new view)
- Modify: `backend/apps/core/onboarding/urls.py` (new route)
- Test: `backend/apps/core/tests/test_check_brand_name.py` (create)

**Interfaces:**
- Consumes: `apps.core.models.Tenant`, `apps.core.i18n_helpers.msg` (existing `brand_taken`/`brand_required` keys), `apps.core.throttling.ClientIpAnonThrottle`.
- Produces: `POST /api/v1/onboarding/check-brand-name/` `{brand_name}` → `200 {"available": true}` | `200 {"available": false, "detail": "<localized>"}` | `400 {"detail": "<localized brand_required>"}`. Task 2's frontend helper calls this exact contract.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_check_brand_name.py`:

```python
"""check-brand-name: pre-wizard step 1 availability check (no token minted,
no email sent — mirrors creator_signup's own slug-availability check)."""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db(transaction=True)

CHECK_URL = "/api/v1/onboarding/check-brand-name/"
SHARED_DOMAIN = "shared-test.localhost"


def _client(**extra):
    return APIClient(HTTP_HOST=SHARED_DOMAIN, **extra)


def test_available_brand_name_returns_true(restore_public):
    resp = _client().post(CHECK_URL, {"brand_name": "Totally Unique Studio Name"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"available": True}


def test_taken_brand_name_returns_false(restore_public):
    # restore_public's shared tenant has slug "shared-test"; "Shared Test"
    # slugifies to exactly that.
    resp = _client().post(CHECK_URL, {"brand_name": "Shared Test"}, format="json")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert data["detail"]  # localized brand_taken message, non-empty


def test_blank_brand_name_returns_400(restore_public):
    resp = _client().post(CHECK_URL, {"brand_name": "   "}, format="json")
    assert resp.status_code == 400


def test_missing_brand_name_returns_400(restore_public):
    resp = _client().post(CHECK_URL, {}, format="json")
    assert resp.status_code == 400


def test_check_brand_name_is_throttled(restore_public):
    # Mirrors test_signup_throttle.py's pattern exactly: use the real
    # configured rate (30/min) rather than overriding it — one call over
    # the limit within the same minute must 429.
    client = _client()
    statuses = [
        client.post(CHECK_URL, {"brand_name": f"Brand {i}"}, format="json").status_code for i in range(31)
    ]
    assert statuses[:30] == [s for s in statuses[:30] if s != 429]
    assert 429 in statuses, f"expected a 429 within 31 rapid calls, got {statuses}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_check_brand_name.py -v`
Expected: FAIL — `404` (no such URL) on every test.

- [ ] **Step 3: Add the throttle rate**

In `backend/config/settings/base.py`, find `"signup": "5/min",` (inside `DEFAULT_THROTTLE_RATES`) and add directly after it:

```python
        # Pre-wizard brand-name availability check — read-only, no email
        # sent, generous but still capped against slug-enumeration scraping.
        "brand_name_check": "30/min",
```

- [ ] **Step 4: Add the throttle class**

In `backend/apps/core/throttling.py`, append:

```python
class BrandNameCheckThrottle(ClientIpAnonThrottle):
    """Pre-wizard step 1 availability check — read-only, no email sent."""

    scope = "brand_name_check"
```

- [ ] **Step 5: Implement the view**

In `backend/apps/core/onboarding/views.py`, add directly after `creator_signup`:

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([BrandNameCheckThrottle])
def check_brand_name(request):
    """Pre-wizard step 1: is this brand name available? Read-only — mirrors
    creator_signup's own slug check without minting a token or emailing."""
    from apps.core.i18n_helpers import msg

    brand_name = (request.data.get("brand_name") or "").strip()
    if not brand_name:
        return Response({"detail": msg(request, "brand_required")}, status=400)

    slug = slugify(brand_name)[:63]
    region = getattr(request, "region", "global")
    if Tenant.objects.filter(slug=slug, region=region).exists():
        return Response({"available": False, "detail": msg(request, "brand_taken")})
    return Response({"available": True})
```

Add the import at the top of the file, alongside the existing `SignupThrottle` import line:

```python
from apps.core.throttling import BrandNameCheckThrottle
```

- [ ] **Step 6: Wire the route**

In `backend/apps/core/onboarding/urls.py`, add the import next to `creator_signup`:

```python
    check_brand_name,
```

And the route directly after `path("signup/", creator_signup, name="creator-signup"),`:

```python
    path("check-brand-name/", check_brand_name, name="check-brand-name"),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_check_brand_name.py -v`
Expected: 5 PASS.

- [ ] **Step 8: Full backend suite + lint**

Run: `docker compose exec django pytest -n auto -q`
Expected: all pass, no new failures.
Run: `make lint`
Expected: zero errors/warnings.

- [ ] **Step 9: Commit**

```bash
git add backend/config/settings/base.py backend/apps/core/throttling.py backend/apps/core/onboarding/views.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_check_brand_name.py
git commit -m "feat(onboarding): check-brand-name availability endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — API helper + translation keys

**Files:**
- Modify: `frontend-main/src/lib/api/onboarding.ts`
- Modify: `frontend-main/messages/en/auth.json`
- Modify: `frontend-main/messages/tr/auth.json`

**Interfaces:**
- Consumes: `POST /api/v1/onboarding/check-brand-name/` (Task 1).
- Produces: `checkBrandName(brandName: string): Promise<{ available: boolean; detail?: string }>`. Task 3 imports this. New message keys under `auth.signup`: `brandStepHeading`, `brandStepSubhead`, `contactStepHeading`, `contactStepSubhead`, `back` (generic "Back" — check `common.back` doesn't already exist in this namespace before adding; if the wizard's own `common.back` in `wizard.json` is reusable, use that instead and skip adding a duplicate here — see Step 3 note).

- [ ] **Step 1: Add the API helper**

In `frontend-main/src/lib/api/onboarding.ts`, append:

```typescript
export async function checkBrandName(
  brandName: string,
): Promise<{ available: boolean; detail?: string }> {
  const res = await fetch("/api/v1/onboarding/check-brand-name/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ brand_name: brandName }),
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json();
}
```

- [ ] **Step 2: Check whether `wizard.json`'s `common.back` is usable from the auth namespace**

Run: `grep -n '"common"' frontend-main/messages/en/wizard.json`

The wizard's `WizardShell` component calls `useTranslations("wizard")` internally for its own back-button label (`t("common.back")`) — this is already wired inside `WizardShell` itself, so Task 3 does NOT need to pass or manage a back-button label at all. Skip adding any `back` key to `auth.json`.

- [ ] **Step 3: Add the new message keys**

In `frontend-main/messages/en/auth.json`, inside the `"signup"` object, add directly after `"brandNamePlaceholder"`:

```json
    "brandStepHeading": "What's your brand name?",
    "brandStepSubhead": "This is what your students will see — you can always change it later.",
    "contactStepHeading": "Almost there",
    "contactStepSubhead": "We'll email you a link to verify and start building.",
```

In `frontend-main/messages/tr/auth.json`, same position (TR: needs native review):

```json
    "brandStepHeading": "Marka adınız nedir?",
    "brandStepSubhead": "Öğrencileriniz bunu görecek — daha sonra her zaman değiştirebilirsiniz.",
    "contactStepHeading": "Neredeyse tamam",
    "contactStepSubhead": "Doğrulamanız ve kuruluma başlamanız için size bir bağlantı e-postalayacağız.",
```

- [ ] **Step 4: Verify parity and build**

Run: `node scripts/check-i18n-parity.mjs`
Expected: `Translation parity OK.`
Run: `docker compose exec nextjs-main npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/lib/api/onboarding.ts frontend-main/messages/en/auth.json frontend-main/messages/tr/auth.json
git commit -m "feat(onboarding): checkBrandName API helper + step copy

TR copy needs native review.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — two-step anonymous signup flow

**Files:**
- Modify: `frontend-main/src/app/signup/signup-form.tsx`

**Interfaces:**
- Consumes: `checkBrandName` (Task 2), `WizardShell` (`frontend-main/src/app/signup/verify/wizard/WizardShell.tsx` — presentational, no token required), `LivePreview` (`frontend-main/src/app/signup/verify/wizard/previews.tsx`, signature `{ answers: WizardAnswers; brand: string; headline?: string }`).
- Produces: `SignupForm` keeps its existing external contract (`{ authenticatedName?: string | null }` prop, same rendered result for the authenticated path). No other file imports anything new from this one.

This is a full-file rewrite — the current file is 192 lines and every line of the anonymous path changes. Read the current file first (`frontend-main/src/app/signup/signup-form.tsx`, shown in the "Task 1: Backend" section context above and re-readable directly) to confirm no other logic exists beyond what's covered here before replacing it.

- [ ] **Step 1: Write the new component**

Replace the full contents of `frontend-main/src/app/signup/signup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { checkBrandName, createPlatformAuthenticated } from "@/lib/api/onboarding";
import { LivePreview } from "./verify/wizard/previews";
import { WizardShell } from "./verify/wizard/WizardShell";
import { ApiError } from "@/types/api";

interface SignupFormProps {
  /** Set when an already-logged-in coach is creating an additional platform. */
  authenticatedName?: string | null;
}

export function SignupForm({ authenticatedName }: SignupFormProps) {
  if (authenticatedName) {
    return <AuthenticatedSignupForm authenticatedName={authenticatedName} />;
  }
  return <AnonymousSignupFlow />;
}

/** Already-logged-in coach creating an additional platform — unchanged from
 * before this feature: single brand-name field, no email verification. */
function AuthenticatedSignupForm({ authenticatedName }: { authenticatedName: string }) {
  const t = useTranslations("auth.signup");
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await createPlatformAuthenticated(brandName);
      router.push(`/signup/verify?token=${encodeURIComponent(token)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.data?.detail as string | undefined) ?? t("errors.generic"))
          : t("errors.generic"),
      );
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow={t("authTitle")} title={t("authTitle")} subtitle={t("authSubtitle", { name: authenticatedName })}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="brandName" className="text-[13px] font-medium text-foreground/80">
            {t("brandNameLabel")}
          </Label>
          <Input
            id="brandName"
            placeholder={t("brandNamePlaceholder")}
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            required
          />
        </div>
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5">
            <p className="text-[13px] text-destructive">{error}</p>
          </div>
        )}
        <Button type="submit" variant="brand" size="lg" className="w-full" loading={loading}>
          {loading ? t("authSubmitting") : t("authSubmit")}
        </Button>
      </form>
    </AuthShell>
  );
}

type Step = "brand" | "contact" | "email-sent";

/** New coach: brand name (with live preview) -> name+email -> verification
 * email sent. Renders inside the wizard's own shell so this feels like the
 * wizard's first step instead of a separate form. */
function AnonymousSignupFlow() {
  const t = useTranslations("auth.signup");
  const [step, setStep] = useState<Step>("brand");
  const [brandName, setBrandName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBrandContinue() {
    const trimmed = brandName.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await checkBrandName(trimmed);
      if (!result.available) {
        setError(result.detail ?? t("errors.generic"));
        return;
      }
      setStep("contact");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/onboarding/signup/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName, name, email }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || t("errors.generic"));
        return;
      }
      setStep("email-sent");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  if (step === "email-sent") {
    return (
      <AuthShell eyebrow={t("verifyTitle")} title={t("verifyTitle")} subtitle={t("verifyDescription", { email })}>
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl glass-strong">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            <strong className="text-foreground">{brandName}</strong>
          </p>
        </div>
      </AuthShell>
    );
  }

  const preview = <LivePreview answers={{}} brand={brandName || t("brandNamePlaceholder")} />;

  if (step === "brand") {
    return (
      <WizardShell
        chapter="business"
        progress={0}
        canBack={false}
        onBack={() => {}}
        showFinishRest={false}
        onFinishRest={() => {}}
        error={error}
        aside={preview}
        footer={
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full"
            loading={loading}
            disabled={!brandName.trim()}
            onClick={handleBrandContinue}
          >
            {t("submit")}
          </Button>
        }
      >
        <div>
          <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">
            {t("brandStepHeading")}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{t("brandStepSubhead")}</p>
          <div className="mt-5 space-y-2">
            <Label htmlFor="brandName" className="text-[13px] font-medium text-foreground/80">
              {t("brandNameLabel")}
            </Label>
            <Input
              id="brandName"
              placeholder={t("brandNamePlaceholder")}
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </WizardShell>
    );
  }

  // step === "contact"
  return (
    <WizardShell
      chapter="business"
      progress={8}
      canBack
      onBack={() => {
        setError(null);
        setStep("brand");
      }}
      showFinishRest={false}
      onFinishRest={() => {}}
      error={error}
      aside={preview}
      footer={
        <Button type="submit" form="contact-form" variant="brand" size="lg" className="w-full" loading={loading}>
          {loading ? t("submitting") : t("submit")}
        </Button>
      }
    >
      <div>
        <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">
          {t("contactStepHeading")}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{t("contactStepSubhead")}</p>
        <form id="contact-form" onSubmit={handleContactSubmit} className="mt-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[13px] font-medium text-foreground/80">
              {t("nameLabel")}
            </Label>
            <Input
              id="name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[13px] font-medium text-foreground/80">
              {t("emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </form>
      </div>
    </WizardShell>
  );
}
```

Note the `form="contact-form"` / `id="contact-form"` pairing: the submit button lives in `WizardShell`'s `footer` slot (outside the `<form>` element in the DOM tree), so it's linked to the form by HTML's `form` attribute rather than being a descendant submit button — this is the only structural wrinkle from reusing `WizardShell`'s footer slot for a real form submit.

- [ ] **Step 2: Build check**

Run: `docker compose exec nextjs-main npm run build`
Expected: `✓ Compiled successfully`, zero type errors.

- [ ] **Step 3: Manual verification — fresh brand name**

Start the dev stack if not already running (`make dev`). In a browser:
1. Go to `http://localhost/signup`.
2. Confirm it now shows the wizard shell chrome (progress bar, chapter tabs) with heading "What's your brand name?" and a live preview aside showing the placeholder brand name.
3. Type a brand name (e.g. "Verify Flow Studio") — confirm the aside preview updates live as you type.
4. Click Continue — confirm it advances to "Almost there" (name + email fields), aside preview still shows the same brand name.
5. Click Back — confirm it returns to step 1 with the brand name still filled in.
6. Click Continue again, fill name + email, submit — confirm the existing "Check your email" screen appears, and the verification email link still resumes the wizard correctly (fetch it via `curl -s "http://localhost/api/v1/dev/emails/latest/?to=<email>"`, follow the link, confirm `WizardFlow` starts at the niche step as before).

- [ ] **Step 4: Manual verification — taken brand name**

1. Go to `http://localhost/signup` again.
2. Type the brand name of an existing tenant (e.g. `demo-yoga`'s brand name, or reuse the one from Step 3 above before it verifies — note: an unverified signup token doesn't create a Tenant row yet, so it won't register as "taken"; use a tenant that's actually been created, e.g. any `demo-*` tenant's `name` field, or complete Step 3 once first and then retry with that same brand name in a new signup attempt).
3. Click Continue — confirm an inline "Brand name already taken" error appears and the screen stays on step 1 (does NOT advance to step 2).

- [ ] **Step 5: Manual verification — authenticated "create another platform" path unchanged**

Log in as an existing coach, navigate to `/signup`. Confirm it still shows the single-field "Create another platform" form (`AuthShell`, not `WizardShell`) exactly as before this change.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/app/signup/signup-form.tsx
git commit -m "feat(signup): brand name as wizard step 1, name+email as step 2

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Update e2e specs for the two-step flow

**Files:**
- Modify: `e2e/specs/01-signup-onboarding.spec.ts`
- Modify: `e2e/specs/19-wizard-recovery.spec.ts`
- Modify: `e2e/specs/23-wizard-ai-logo.spec.ts`

**Interfaces:**
- Consumes: the new two-screen flow (Task 3) — brand name field + Continue, then name + email fields + Continue.
- Produces: no new exports; these are leaf test files.

- [ ] **Step 1: Update `01-signup-onboarding.spec.ts`**

Read the current `signupThroughVerify` helper (top of the file):

```typescript
async function signupThroughVerify(page: Page, brand: string, email: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });

  const mail = await latestEmail(email);
  const verifyLink = firstLink(mail.html);
  expect(verifyLink, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(verifyLink);
}
```

Replace it with:

```typescript
async function signupThroughVerify(page: Page, brand: string, email: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });

  const mail = await latestEmail(email);
  const verifyLink = firstLink(mail.html);
  expect(verifyLink, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(verifyLink);
}
```

- [ ] **Step 2: Update `19-wizard-recovery.spec.ts`**

This file has its own separate local copy of `signupThroughVerify` (not shared with the file above). Apply the identical change from Step 1 to this file's copy of the function.

- [ ] **Step 3: Update `23-wizard-ai-logo.spec.ts`**

Read the current inline signup steps:

```typescript
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(`E2E Studio ${stamp}ai`);
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(`e2e-coach-${stamp}ai@example.com`);
  await page.getByRole("button", { name: en.signup.submit }).click();
```

Replace with:

```typescript
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(`E2E Studio ${stamp}ai`);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(`e2e-coach-${stamp}ai@example.com`);
  await page.getByRole("button", { name: en.signup.submit }).click();
```

- [ ] **Step 4: Run the affected specs**

Run: `cd e2e && npx playwright test 01-signup-onboarding 19-wizard-recovery --reporter=list`
Expected: all pass.
Run (only if `E2E_BILLING_BYPASS=1` and `BILLING_BYPASS_ENABLED=true` are set — otherwise this spec self-skips, matching its existing gate): `cd e2e && npx playwright test 23-wizard-ai-logo --reporter=list`
Expected: passes if run, skipped otherwise (same as before this change).

- [ ] **Step 5: Full e2e suite**

Run: `cd e2e && npx playwright test --reporter=list`
Expected: same pass/skip/fail counts as the pre-existing baseline (no new failures introduced).

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/01-signup-onboarding.spec.ts e2e/specs/19-wizard-recovery.spec.ts e2e/specs/23-wizard-ai-logo.spec.ts
git commit -m "test(e2e): update signup specs for the two-step brand-name flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
