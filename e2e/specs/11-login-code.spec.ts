// e2e/specs/11-login-code.spec.ts
//
// PWA users can't use the emailed LINK (separate cookie jar) — they type the
// emailed CODE instead. This proves the code path end-to-end via the dev sink.
//
// Tenant strategy: we spin up a fresh non-demo tenant via Django ORM (manage shell)
// in beforeAll. Creating the schema takes ~5 s; the spec is standalone-safe and
// doesn't depend on spec 01 running first.

import { test, expect, APIRequestContext } from "@playwright/test";
import { manage } from "../helpers/compose";
import { latestEmail } from "../helpers/email";

const stamp = Date.now();
const SLUG = `e2e-code`;
const HOST = `${SLUG}.localhost`;
const BASE_URL = `http://${HOST}`;
// no pre-registration needed — magic-link/code login auto-registers students on first login
const STUDENT_EMAIL = `e2e-code-student-${stamp}@example.com`;

// ---------------------------------------------------------------------------
// Tenant bootstrap (non-demo, schema present)
// ---------------------------------------------------------------------------

function ensureNonDemoTenant(): void {
  // Create tenant + domain + schema in one shell call.
  // PlatformPlan is optional; the magic-link flow doesn't gate on it.
  manage([
    "shell",
    "-c",
    `
from apps.core.models import Tenant, Domain
slug = "${SLUG}"
if not Tenant.objects.filter(slug=slug).exists():
    t = Tenant.objects.create(
        name="E2E Code Test ${stamp}",
        slug=slug,
        subdomain=slug,
        schema_name=slug.replace("-", "_"),
        owner_email="owner-${stamp}@example.com",
        provisioning_status="ready",
        is_demo=False,
    )
    Domain.objects.create(domain="${HOST}", tenant=t, is_primary=True)
    t.create_schema(check_if_exists=True, verbosity=0)
`.trim(),
  ]);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  ensureNonDemoTenant();
  // Clear any throttle cache entries from previous runs so back-to-back
  // executions don't accumulate toward the 5/min limit.
  manage([
    "shell",
    "-c",
    `
import django_redis
r = django_redis.get_redis_connection('default')
for key in r.keys('*throttle_magic_link*'):
    r.delete(key)
`.trim(),
  ]);
});

test("student logs in with the emailed 6-digit code", async ({ page }) => {
  // ── 1. Navigate to login ─────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/login`);
  await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15_000 });

  // ── 2. Request magic link (triggers code email too) ──────────────────────
  await page.getByLabel(/email/i).fill(STUDENT_EMAIL);
  await page.getByRole("button", { name: /send magic link/i }).click();

  // Sent-state UI appears
  await expect(
    page.getByRole("heading", { name: /check your email/i }),
  ).toBeVisible({ timeout: 10_000 });

  // ── 3. Pull the 6-digit code from the email sink ─────────────────────────
  const mail = await latestEmail(STUDENT_EMAIL);
  const codeMatch = mail.html.match(/(\d{3}) (\d{3})/);
  expect(codeMatch, `no 6-digit code found in email: ${mail.subject}`).toBeTruthy();
  const correctCode = `${codeMatch![1]}${codeMatch![2]}`;

  // ── 4. Negative: wrong code → error message ──────────────────────────────
  const codeInput = page.getByPlaceholder("123456");
  await codeInput.fill("000000");
  await page.getByRole("button", { name: /sign in with code/i }).click();
  await expect(
    page.getByText(/didn't work|invalid|expired/i),
  ).toBeVisible({ timeout: 10_000 });

  // ── 5. Positive: correct code → redirect to '/' → session established ───────
  await codeInput.fill(correctCode);
  await page.getByRole("button", { name: /sign in with code/i }).click();

  // The form POSTs /api/v1/auth/magic-link/verify-code/ which on success sets
  // the session cookie and the JS does window.location.href = '/'.
  // For a fresh tenant with no configured redirect the landing is '/'.
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20_000 });

  // Session-backed signal: the PublicHeader renders "Sign Out" only when the
  // server-side layout.tsx resolves the JWT cookie via getAuthUser().
  // This proves the cookie was set and the server accepted it.
  await expect(
    page.getByRole("button", { name: /sign out/i }),
  ).toBeVisible({ timeout: 10_000 });
});
