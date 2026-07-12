# Login Code ("Magic PIN") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every login email carries a 6-digit code alongside the magic link, and the login form accepts it — so installed-PWA users (separate cookie jar; links open in the browser) can log in.

**Architecture:** `magic_link_request` stores a hashed 6-digit code in the Redis cache (`login_code:<tenant_schema>:<email>`, TTL = `MAGIC_LINK_EXPIRY_MINUTES` = 15) and passes the code into the email. A new public endpoint `POST /api/v1/auth/magic-link/verify-code/` validates `{email, code}` (5 attempts max, single-use, generic errors) and issues the session exactly like `magic_link_verify` — Django sets the httpOnly cookie itself via `_set_session_cookie`, so the frontend just POSTs and redirects.

**Tech Stack:** Django/DRF + django-redis cache, Next.js (frontend-customer, next-intl), Playwright e2e (existing local suite + dev email sink).

## Global Constraints

- Public endpoints MUST set `@authentication_classes([])` — `AllowAny` alone is not enough (TenantJWTAuthentication is the DRF default).
- Verify-code failures all return the SAME generic 400 (localized via `apps.core.i18n_helpers.msg`, key `token_invalid_or_expired` — reuse, no new oracle-y messages).
- Max 5 attempts per code, then the cache key is deleted; success deletes the key (single-use); new request overwrites (last-wins).
- Cache unavailable → link login must still work: code generation wrapped so failure only omits the code from the email; verify-code returns the generic failure.
- Demo tenants (`tenant.slug.startswith("demo-")`) keep the instant-login bypass — return BEFORE code generation (no code needed/stored).
- Repo: /Users/tahayusufkomur/ws/projects-in-progress/contentor, branch `feat/login-code` off current main. Shared tree: NEVER `git add -A`; `git branch --show-current` before every commit; stage only listed files.
- Backend tests in-container: `docker compose exec -T django pytest apps/accounts/... -v`. TDD RED→GREEN per task.

---

### Task 0: Branch

- [ ] `cd /Users/tahayusufkomur/ws/projects-in-progress/contentor && git checkout -b feat/login-code && git branch --show-current` → `feat/login-code`.

---

### Task 1: Code generation + storage + email copy

**Files:**
- Create: `backend/apps/accounts/login_code.py`
- Modify: `backend/apps/accounts/views.py` (`magic_link_request`, ~lines 34-79)
- Modify: `backend/apps/core/email.py` (`send_magic_link` + `_MAGIC_LINK_COPY`)
- Test: `backend/apps/accounts/tests/test_login_code.py` (create)

**Interfaces:**
- Produces: `login_code.issue(tenant_schema: str, email: str) -> str | None` (6-digit string, or None if cache write failed); `login_code.check(tenant_schema: str, email: str, code: str) -> bool` (True consumes the code; wrong attempt increments counter, 5th deletes key); `send_magic_link(to, link, brand_name="Contentor", locale="en", code: str | None = None)`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/accounts/tests/test_login_code.py
from django.core.cache import cache
from django.test import SimpleTestCase

from apps.accounts import login_code


class LoginCodeTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_issue_returns_6_digits_and_check_consumes(self):
        code = login_code.issue("t1", "a@example.com")
        assert code and len(code) == 6 and code.isdigit()
        assert login_code.check("t1", "a@example.com", code) is True
        # single-use: second check fails
        assert login_code.check("t1", "a@example.com", code) is False

    def test_wrong_code_five_attempts_then_locked(self):
        code = login_code.issue("t1", "a@example.com")
        for _ in range(5):
            assert login_code.check("t1", "a@example.com", "000000") is False
        # even the right code is now dead (key deleted on 5th failure)
        assert login_code.check("t1", "a@example.com", code) is False

    def test_new_request_overwrites_old_code(self):
        old = login_code.issue("t1", "a@example.com")
        new = login_code.issue("t1", "a@example.com")
        assert login_code.check("t1", "a@example.com", old) is False or old == new
        # old attempt consumed nothing; new still works if codes differ
        if old != new:
            assert login_code.check("t1", "a@example.com", new) is True

    def test_tenant_scoping(self):
        code = login_code.issue("t1", "a@example.com")
        assert login_code.check("OTHER", "a@example.com", code) is False
```

- [ ] **Step 2:** Run: `docker compose exec -T django pytest apps/accounts/tests/test_login_code.py -v` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `backend/apps/accounts/login_code.py`**

```python
"""Emailed 6-digit login codes — the PWA-friendly twin of the magic link.

Installed PWAs have their own cookie jar; the emailed LINK opens in the
browser, so its session never reaches the app. The CODE is typed into
whatever context requested it. Stored hashed in the default (Redis) cache,
same TTL as the link, 5 attempts, single-use.
"""
import hashlib
import logging
import secrets

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5


def _key(tenant_schema: str, email: str) -> str:
    return f"login_code:{tenant_schema}:{email.lower()}"


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def issue(tenant_schema: str, email: str) -> str | None:
    """Generate, store (hashed), and return a fresh code — or None if the
    cache is unavailable (link login must never depend on the code)."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        cache.set(
            _key(tenant_schema, email),
            {"hash": _hash(code), "attempts": 0},
            timeout=settings.MAGIC_LINK_EXPIRY_MINUTES * 60,
        )
    except Exception:
        logger.exception("login code store failed; email will carry link only")
        return None
    return code


def check(tenant_schema: str, email: str, code: str) -> bool:
    """True consumes the code. Any failure path is indistinguishable to the
    caller; the 5th wrong attempt deletes the key."""
    key = _key(tenant_schema, email)
    try:
        entry = cache.get(key)
    except Exception:
        logger.exception("login code cache read failed")
        return False
    if not entry:
        return False
    if secrets.compare_digest(entry["hash"], _hash(code)):
        cache.delete(key)
        return True
    entry["attempts"] = entry.get("attempts", 0) + 1
    if entry["attempts"] >= MAX_ATTEMPTS:
        cache.delete(key)
    else:
        cache.set(key, entry, timeout=settings.MAGIC_LINK_EXPIRY_MINUTES * 60)
    return False
```

- [ ] **Step 4:** Tests pass: `docker compose exec -T django pytest apps/accounts/tests/test_login_code.py -v` → 4 PASS. (Note: SimpleTestCase + real Redis cache is fine — keys are cleared in setUp; if the suite's cache backend is locmem in tests, same semantics.)
- [ ] **Step 5: Wire into `magic_link_request`** (`backend/apps/accounts/views.py`). After the demo-tenant early return (KEEP it above this), and before `send_magic_link`:

```python
    from apps.accounts import login_code

    code = login_code.issue(tenant.schema_name, email)
```

and change the send call at the end of the view to pass it (read the current call first — it is `send_magic_link(email, link, brand_name=..., locale=...)`-shaped):

```python
    send_magic_link(email, link, brand_name=brand_name, locale=locale, code=code)
```

- [ ] **Step 6: Email copy** in `backend/apps/core/email.py`. Extend `_MAGIC_LINK_COPY` entries:

```python
    "en": {
        ...existing keys...,
        "code_hint": "Using the installed app? Enter this code on the sign-in screen instead:",
    },
    "tr": {
        ...existing keys...,
        "code_hint": "Yüklü uygulamayı mı kullanıyorsunuz? Giriş ekranına bunun yerine bu kodu girin:",
    },
```

And `send_magic_link(to, link, brand_name="Contentor", locale="en", code: str | None = None)` — after the button block in the html, when `code` is truthy insert:

```python
    code_block = ""
    if code:
        spaced = f"{code[:3]} {code[3:]}"
        code_block = f"""
        <p style="color: #444; font-size: 14px; margin-top: 24px;">{copy["code_hint"]}</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e;">{spaced}</p>
        """
```

and interpolate `{code_block}` into the existing html f-string between the button anchor and the "ignore" paragraph.

- [ ] **Step 7: Email test** — append to `backend/apps/accounts/tests/test_login_code.py`:

```python
import pytest
from django.test import override_settings


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=True)
def test_magic_link_email_contains_code(shared_tenant):
    # Request a magic link on a NON-demo tenant and assert the sunk email
    # carries a 6-digit code (spaced 3+3 in the html).
    # Follow apps/core/tests/test_email_sink.py for the shared_tenant fixture +
    # APIClient(HTTP_HOST=...) tenant-routing pattern used across this repo.
    import re

    from rest_framework.test import APIClient

    from apps.core.models import DevOutboundEmail

    res = APIClient().post(
        "/api/v1/auth/magic-link/",
        {"email": "pin@example.com"},
        format="json",
        HTTP_HOST=shared_tenant.primary_domain,  # adjust to the fixture's real attribute
    )
    assert res.status_code == 200, res.content
    row = DevOutboundEmail.objects.filter(to="pin@example.com").first()
    assert row and re.search(r"\d{3} \d{3}", row.html)
```

(The implementer MUST reconcile the fixture/host details against the existing sink tests — the pattern exists, follow it; if `shared_tenant` is a public-schema-only fixture, use whatever fixture existing accounts tests use to hit a tenant host.)

- [ ] **Step 8:** All green: `docker compose exec -T django pytest apps/accounts/tests/test_login_code.py apps/core/tests/test_email.py -v`.
- [ ] **Step 9: Commit** — `git add backend/apps/accounts/login_code.py backend/apps/accounts/views.py backend/apps/core/email.py backend/apps/accounts/tests/test_login_code.py && git commit -m "feat(auth): 6-digit login code issued with every magic link"`

---

### Task 2: verify-code endpoint

**Files:**
- Modify: `backend/apps/accounts/views.py`, `backend/apps/accounts/serializers.py`, `backend/apps/accounts/urls.py`
- Test: `backend/apps/accounts/tests/test_verify_code.py` (create)

**Interfaces:**
- Consumes: `login_code.check(tenant_schema, email, code) -> bool` (Task 1).
- Produces: `POST /api/v1/auth/magic-link/verify-code/` `{email, code}` → 200 `{"user": {...}}` + session cookie (same `_set_session_cookie`/`_set_locale_cookie` as `magic_link_verify`); any failure → 400 `{"detail": msg(request, "token_invalid_or_expired")}`.

- [ ] **Step 1: Failing tests** (`backend/apps/accounts/tests/test_verify_code.py`) — follow the request/host pattern of the EXISTING `magic_link_verify` tests in `apps/accounts/tests/test_auth.py` (read it first; reuse its fixtures/host setup):
  - success: issue code via `login_code.issue(tenant.schema_name, email)` then POST → 200, `contentor_access_token` cookie present, user created with role student
  - wrong code → 400 generic detail; right code after 5 wrong → 400
  - reuse after success → 400
  - unknown email + any code → 400 (same message)
  Write real code for these tests in the style of test_auth.py — assert the cookie via `res.cookies`.
- [ ] **Step 2:** RED run.
- [ ] **Step 3: Implement.** Serializer:

```python
class MagicLinkVerifyCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
```

View (in views.py, next to `magic_link_verify`; factor the shared user+session issuance out of `magic_link_verify` into a module-private helper `_login_user_response(request, tenant, email)` and call it from BOTH views — do not duplicate the get_or_create block):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def magic_link_verify_code(request):
    from apps.core.i18n_helpers import msg

    serializer = MagicLinkVerifyCodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tenant = connection.tenant
    email = serializer.validated_data["email"]
    if not login_code.check(tenant.schema_name, email, serializer.validated_data["code"]):
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=status.HTTP_400_BAD_REQUEST)
    logger.info("login via code email=%s tenant=%s", email, tenant.slug)
    return _login_user_response(request, tenant, email)
```

CHECK the decorators on the existing `magic_link_verify` and copy them exactly (it may use `@authentication_classes([])` already — match; the repo rule requires it). URL: `path("magic-link/verify-code/", views.magic_link_verify_code, name="magic-link-verify-code"),` after the verify route.
- [ ] **Step 4:** GREEN: `docker compose exec -T django pytest apps/accounts/tests/ -v` (whole app — the refactor touches `magic_link_verify`).
- [ ] **Step 5: Commit** — `git add backend/apps/accounts/views.py backend/apps/accounts/serializers.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_verify_code.py && git commit -m "feat(auth): verify-code endpoint — PWA login via emailed code"`

---

### Task 3: Login form code entry + i18n

**Files:**
- Modify: `frontend-customer/src/components/auth/magic-link-form.tsx`
- Modify: `frontend-customer/messages/en/student.json`, `frontend-customer/messages/tr/student.json` (namespace `student.auth`)

**Interfaces:**
- Consumes: `POST /api/v1/auth/magic-link/verify-code/` `{email, code}` → 200 sets cookie; 400 `{detail}`.

- [ ] **Step 1: i18n keys** (add inside the `auth` object of each file; TR translations shown):

```json
"codeHint": "Or enter the 6-digit code from the email:",
"codePlaceholder": "123456",
"codeSubmit": "Sign in with code",
"codeSubmitting": "Checking…",
"codeError": "That code didn’t work. Check it or request a new link."
```

```json
"codeHint": "Veya e-postadaki 6 haneli kodu girin:",
"codePlaceholder": "123456",
"codeSubmit": "Kodla giriş yap",
"codeSubmitting": "Kontrol ediliyor…",
"codeError": "Kod çalışmadı. Kontrol edin veya yeni bağlantı isteyin."
```

- [ ] **Step 2: Extend the `sent` state of `MagicLinkForm`** — replace the current `if (sent)` block with a version that keeps the existing copy AND adds a code form beneath (state: `code`, `codeLoading`, `codeError`; keep `email` from the outer scope):

```tsx
  if (sent) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">{t('magicLinkSentTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.rich('magicLinkSentBody', {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <form onSubmit={handleCodeSubmit} className="mt-6 space-y-3 text-left">
          <Label htmlFor="login-code">{t('codeHint')}</Label>
          <Input
            id="login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder={t('codePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-xl tracking-[0.5em]"
          />
          {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          <Button type="submit" className="w-full" disabled={codeLoading || code.length !== 6}>
            {codeLoading ? t('codeSubmitting') : t('codeSubmit')}
          </Button>
        </form>
      </div>
    )
  }
```

with the handler (mirrors `handleSubmit`'s fetch conventions):

```tsx
  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCodeLoading(true)
    setCodeError('')
    try {
      const res = await fetch('/api/v1/auth/magic-link/verify-code/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setCodeError(t('codeError'))
        return
      }
      window.location.href = '/dashboard'
    } catch {
      setCodeError(t('networkError'))
    } finally {
      setCodeLoading(false)
    }
  }
```

(`autoComplete="one-time-code"` gives iOS the from-Mail code suggestion. Confirm `/dashboard` is the post-login landing by checking where the existing `/callback` flow redirects — `frontend-customer/src/app/(auth)/callback` — and use the same target.)
- [ ] **Step 3:** `cd frontend-customer && npx tsc --noEmit` clean; visually verify against the running dev stack: `http://demo-yoga.localhost/login` → submit email → demo tenants redirect instantly, so use a NON-demo local tenant if one exists, else rely on the e2e task for behavioral proof and just verify the sent-state renders (storybook-less repo — a quick `npx playwright` one-liner or the Task 4 spec covers it).
- [ ] **Step 4: Commit** — `git add frontend-customer/src/components/auth/magic-link-form.tsx frontend-customer/messages/en/student.json frontend-customer/messages/tr/student.json && git commit -m "feat(auth): login-code entry on the tenant login form"`

---

### Task 4: E2E spec + suite green

**Files:**
- Create: `e2e/specs/11-login-code.spec.ts`

**Interfaces:**
- Consumes: dev email sink helper `latestEmail(to)` (e2e/helpers/email.ts), `TENANT` const. NOTE: demo tenants bypass emails — this spec must run against a NON-demo tenant. The signup spec (01) creates one per run; simplest deterministic source: create a tenant via the same onboarding API the signup spec uses, or reuse the tenant created by spec 01 in the same suite run — DO NOT rely on demo-yoga. Read e2e/specs/01-signup-onboarding.spec.ts first and mirror its tenant-creation approach (API-driven is fine).

- [ ] **Step 1: Write the spec**

```typescript
// e2e/specs/11-login-code.spec.ts
// PWA users can't use the emailed LINK (separate cookie jar) — they type the
// emailed CODE instead. This proves the code path end-to-end via the dev sink.
import { test, expect } from "@playwright/test";
import { latestEmail } from "../helpers/email";

const stamp = Date.now();
const EMAIL = `e2e-pin-${stamp}@example.com`;

test("student logs in with the emailed 6-digit code", async ({ page, request }) => {
  // Arrange: a non-demo tenant host (see interface note — mirror spec 01's approach)
  const HOST = await ensureNonDemoTenant(request); // implementer: real helper per note above

  await page.goto(`http://${HOST}/login`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByRole("button", { name: /sign in|send|magic/i }).click();

  const mail = await latestEmail(EMAIL);
  const code = mail.html.match(/(\d{3}) (\d{3})/);
  expect(code, `no code in email: ${mail.subject}`).toBeTruthy();

  await page.getByPlaceholder("123456").fill(`${code![1]}${code![2]}`);
  await page.getByRole("button", { name: /sign in with code/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
});
```

(The `ensureNonDemoTenant` helper is the implementer's to write per the interface note — real, asserted, no placeholders in the committed spec. Selector texts must be reconciled against the real rendered form.)
- [ ] **Step 2:** `cd e2e && npx playwright test specs/11` green (headed while iterating), then `make e2e` full suite green, `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** — `git add e2e/specs/11-login-code.spec.ts && git commit -m "test(e2e): login-code path via email sink"`

---

### Task 5: Verification gate + merge readiness

- [ ] `docker compose exec -T django pytest -q` → whole backend green (was 603+; now more).
- [ ] `make e2e` → previous counts + 1 new pass.
- [ ] `pre-commit run --files <all files touched on this branch>` clean; `cd frontend-customer && npx tsc --noEmit` clean.
- [ ] Report; controller handles review + merge + (later) deploy.
