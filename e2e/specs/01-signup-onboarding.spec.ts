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
  // Real AI or the pre-written fallback: the tiles exist in both, so the
  // spec is structurally deterministic. Page builds on the AI hub are slow.
  test.setTimeout(1_200_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}`, `e2e-coach-${stamp}@contentor.test`);

  await page.waitForURL(/e2e-studio-[\w-]+\.localhost\/setup/, { timeout: 120_000 });
  await expect(page.getByText("What do you teach?")).toBeVisible({ timeout: 30_000 });

  // First answer typed; then "You decide" where the guide may decide, the
  // first tile (and Continue) where only the coach knows, a typed answer
  // when a fallback question has neither, until go-live.
  const answer = page.getByLabel("Your answer");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await answer.fill("Yoga for people who sit at a desk all day");
  await send.click();

  const guide = page.getByRole("region", { name: "Your setup guide" });
  // What the guide shows while a turn, an edit or a page build is in flight.
  const busy = guide.getByText(/Thinking|Making that change|Finishing your pages|Confirming your plan/);
  const decide = guide.getByRole("button", { name: "You decide", exact: true });
  const tile = guide.locator("h1 ~ div.grid > button").first();
  const cont = guide.getByRole("button", { name: /^Continue/ });
  // A drafted course or class to approve.
  const looksGood = guide.getByRole("button", { name: "Looks good, continue" });
  const goLive = guide.getByRole("button", { name: "Go live", exact: true });
  // The first payments tile is a paid one, so go-live offers the plan; the
  // spec takes the free way out instead of Stripe.
  const makeFree = guide.getByRole("button", { name: "Make it free and go live now" });
  const action = decide.or(looksGood).or(goLive).or(makeFree).or(tile);
  for (let i = 0; i < 40; i++) {
    // Wait for the work in flight to finish, then for the next screen's controls.
    await busy.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
    await expect(busy).toBeHidden({ timeout: 300_000 });
    await action.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    if (await goLive.isVisible()) break;
    if (await makeFree.isVisible()) {
      await makeFree.click();
      await expect(goLive).toBeVisible({ timeout: 600_000 });
      break;
    }
    if (await looksGood.isVisible()) {
      // Enabled once the draft is ready (it drafts in the background).
      await looksGood.click({ timeout: 300_000 });
      continue;
    }
    if (await decide.isVisible()) {
      await decide.click();
      continue;
    }
    if (await tile.isVisible()) {
      await tile.click();
      await cont.click();
      continue;
    }
    await answer.fill("Whatever you think fits best");
    await send.click();
  }
  await expect(goLive).toBeVisible({ timeout: 600_000 });
  await goLive.click();
  await expect(page.getByRole("button", { name: "Go to dashboard" })).toBeVisible({ timeout: 60_000 });
});
