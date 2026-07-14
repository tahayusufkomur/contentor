import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();

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

test.beforeAll(() => {
  // Same self-healing sweep as 01-signup-onboarding (raw SQL for
  // PlatformSubscription — cross-schema FK breaks the ORM cascade).
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-recovery-'))\n" +
      "ids = [t.id for t in tenants]\n" +
      "with connection.cursor() as c:\n" +
      "    c.execute('DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)', [ids])\n" +
      "[t.delete(force_drop=True) for t in tenants]",
  ]);
});

test("recovery email resumes the wizard where the coach left off", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-recovery-${stamp}@example.com`;
  await signupThroughVerify(page, `E2E Recovery ${stamp}`, email);

  // Advance one step so there's real progress to resume to.
  await page
    .getByRole("button", { name: `${W.niches.yoga.label} ${W.niches.yoga.tagline}`, exact: true })
    .click({ timeout: 20_000 });
  await page.getByRole("button", { name: W.common.continue, exact: true }).click();
  await expect(page.getByText(W.describe.heading)).toBeVisible();

  // Simulate "came back later on another device": take the token, wipe local
  // state, and ask for a recovery email (endpoint accepts valid AND expired).
  const token = await page.evaluate(() => localStorage.getItem("contentor_wizard_token"));
  expect(token).toBeTruthy();
  await page.evaluate(() => localStorage.removeItem("contentor_wizard_token"));

  const resp = await page.request.post("http://localhost/api/v1/onboarding/wizard/recover/", {
    data: { token },
  });
  expect(resp.status()).toBe(200);

  const mail = await latestEmail(email);
  expect(mail.subject).toContain("left off");
  const resumeLink = firstLink(mail.html);
  expect(resumeLink).toMatch(/signup\/verify\?token=/);

  await page.goto(resumeLink);
  // Resumes at the saved step (business.describe), not the start.
  await expect(page.getByText(W.describe.heading)).toBeVisible({ timeout: 20_000 });
});

test("a dead link with no local state shows the resume screen", async ({ page }) => {
  // Fresh Playwright context -> empty localStorage.
  await page.goto("http://localhost/signup/verify?token=garbage");
  await expect(page.getByRole("heading", { name: W.resume.title })).toBeVisible({ timeout: 20_000 });
  // Garbage token -> recover 400s -> failed state with a start-over path.
  await page.getByRole("button", { name: W.resume.resend }).click();
  await expect(page.getByText(W.resume.failed)).toBeVisible();
});
