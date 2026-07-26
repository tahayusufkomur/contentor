import { test, expect } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { bucketedEmail } from "../helpers/holdout";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();
// The wizard bucket is a pure function of the email; this spec walks the
// CLASSIC flow, so pin it to control rather than coin-flipping per run.
const email = bucketedEmail(`e2e-coach-${stamp}ai-`, "control");

// Needs BILLING_BYPASS_ENABLED=true in the stack (offline instant
// subscriptions). Skipped otherwise — mirrors how Stripe specs gate.
test.skip(
  process.env.E2E_BILLING_BYPASS !== "1",
  "set E2E_BILLING_BYPASS=1 (and BILLING_BYPASS_ENABLED=true in .env) to run",
);

test("AI logo door unlocks through bypass checkout", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(`E2E Studio ${stamp}ai`);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  const mail = await latestEmail(email);
  await page.goto(firstLink(mail.html));

  await page.getByRole("button", { name: W.niches.general.label }).click({ timeout: 20_000 }); // niche (auto-advances)
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // describe
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // goals
  await page.getByRole("button", { name: W.common.finishRest }).click();            // -> logo

  await expect(page.getByText(W.upgrade.title)).toBeVisible({ timeout: 10_000 });
  // Bypass provider: the "checkout" click activates the subscription and
  // bounces straight back to /signup/verify?upgraded=1.
  await page.getByRole("button", { name: W.upgrade.cta }).first().click();
  await expect(page.getByPlaceholder(W.aiChat.placeholder)).toBeVisible({ timeout: 30_000 });
});
