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

async function clickContinue(page: Page) {
  await page.getByRole("button", { name: W.common.continue, exact: true }).click();
}

async function waitForReady(page: Page) {
  await expect(page.getByText(en.signup.verify.provisioningTitle)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(en.signup.verify.readyTitle)).toBeVisible({ timeout: 120_000 });
  const cta = page.getByRole("link", { name: /localhost/ });
  await expect(cta).toBeVisible();
  expect(await cta.getAttribute("href")).toMatch(/https?:\/\/[a-z0-9-]+\.localhost/);
}

test.beforeAll(() => {
  // Self-healing sweep of tenants left by previous runs.
  manage([
    "shell",
    "-c",
    "from apps.core.models import Tenant\n" +
      "[t.delete(force_drop=True) for t in Tenant.objects.filter(slug__startswith='e2e-studio-')]",
  ]);
});

test("coach walks the full wizard and the tenant provisions", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}a`, `e2e-coach-${stamp}a@example.com`);

  // Chapter 1 — business
  // Accessible name is "<label> <tagline>" (e.g. "Yoga Flows, breathwork, balance"); a bare
  // label substring-matches "Face Yoga" too, so match the full label+tagline text exactly.
  await page
    .getByRole("button", { name: `${W.niches.yoga.label} ${W.niches.yoga.tagline}`, exact: true })
    .click({ timeout: 20_000 });
  await clickContinue(page); // niche
  await clickContinue(page); // describe (optional, left empty)
  await page.getByRole("button", { name: W.goals.items.sell_courses }).click();
  await clickContinue(page); // goals

  // Chapter 2 — look (pick NON-defaults to prove choices stick)
  await page.getByRole("button", { name: W.themes.slate }).click();
  await clickContinue(page);
  await page.getByRole("button", { name: W.fonts.inter.label }).click();
  await clickContinue(page);
  await page.getByRole("button", { name: W.navbarLayouts.minimal }).click();
  await clickContinue(page);
  await page.getByRole("button", { name: W.heroStyles.split.label }).click();
  await clickContinue(page);

  // Chapter 3 — pages (home explicit, rest keep the recommended preselect)
  await page.getByRole("button", { name: W.layouts["home-story"] }).click();
  await clickContinue(page); // home
  await clickContinue(page); // about
  await clickContinue(page); // courses
  await clickContinue(page); // pricing (present because sell_courses picked)
  await clickContinue(page); // faq
  await clickContinue(page); // contact

  // Chapter 4 — logo (wordmark is the preselected default)
  await expect(page.getByText(W.logo.wordmark.title)).toBeVisible();
  await clickContinue(page);

  // Chapter 5 — review + create
  await expect(page.getByText(W.review.heading)).toBeVisible();
  await page.getByRole("button", { name: W.review.create }).click();
  await waitForReady(page);
});

test("finish-the-rest-for-me fast path provisions", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}b`, `e2e-coach-${stamp}b@example.com`);

  await page.getByRole("button", { name: W.niches.general.label }).click({ timeout: 20_000 });
  await clickContinue(page); // niche
  await clickContinue(page); // describe
  await clickContinue(page); // goals (none picked — defaults land at finalize)

  // On the first look step, bail out via the escape hatch.
  await page.getByRole("button", { name: W.common.finishRest }).click();

  // Lands on the logo step; continue to review and create.
  await expect(page.getByText(W.logo.heading)).toBeVisible({ timeout: 10_000 });
  await clickContinue(page);
  await page.getByRole("button", { name: W.review.create }).click();
  await waitForReady(page);
});
