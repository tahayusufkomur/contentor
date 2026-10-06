import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";

const stamp = Date.now();

async function signupThroughVerify(page: Page, brand: string, email: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });
  const mail = await latestEmail(email);
  const link = firstLink(mail.html);
  expect(link, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(link);
}

test.beforeAll(() => {
  // Self-healing sweep of tenants left by previous runs (raw SQL for the
  // cross-schema PlatformSubscription FK; see git history of this spec).
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-studio-'))\n" +
      "ids = [t.id for t in tenants]\n" +
      "with connection.cursor() as c:\n" +
      "    c.execute('DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)', [ids])\n" +
      "[t.delete(force_drop=True) for t in tenants]",
  ]);
});

test("signup lands in /setup and the interview ends in a published site", async ({ page }) => {
  // Real AI or the pre-written fallback: "You decide" exists in both, so the
  // spec is structurally deterministic. Page builds on the AI hub are slow.
  test.setTimeout(1_200_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}`, `e2e-coach-${stamp}@contentor.test`);

  await page.waitForURL(/e2e-studio-[\w-]+\.localhost\/setup/, { timeout: 120_000 });
  await expect(page.getByText("What do you teach?")).toBeVisible({ timeout: 30_000 });

  // First answer typed, the rest delegated until go-live.
  await page.getByLabel("Your answer").fill("Yoga for people who sit at a desk all day");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const guide = page.getByRole("region", { name: "Your setup guide" });
  const decide = guide.getByRole("button", { name: "You decide", exact: true });
  // A drafted course or class, or a class waiting for a plan with live classes.
  const looksGood = guide.getByRole("button", { name: /^(Looks good, continue|Continue)$/ });
  const goLive = guide.getByRole("button", { name: "Go live", exact: true });
  for (let i = 0; i < 40; i++) {
    // Wait for the turn in flight to finish: the next question's "You
    // decide", a drafted course or class to approve, or go-live.
    await expect(decide.or(looksGood).or(goLive)).toBeVisible({ timeout: 300_000 });
    if (await goLive.isVisible()) break;
    if (await looksGood.isVisible()) {
      // Enabled once the draft is ready (it drafts in the background).
      await looksGood.click({ timeout: 300_000 });
      continue;
    }
    await decide.click();
  }
  await expect(goLive).toBeVisible({ timeout: 600_000 });
  await goLive.click();
  await expect(page.getByRole("button", { name: "Go to dashboard" })).toBeVisible({ timeout: 60_000 });
});
