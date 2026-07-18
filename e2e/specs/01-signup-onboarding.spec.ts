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

async function clickContinue(page: Page) {
  await page.getByRole("button", { name: W.common.continue, exact: true }).click();
}

// Auto-advance card steps save-then-advance: while the PATCH is in flight the
// OLD step stays mounted with enabled cards, and a click there is silently
// swallowed by WizardFlow's busy guard. Adjacent steps share card labels
// (navbar/hero both have "Split" and "Minimal"; "Story" substring-matches
// home's "Storyteller"), so a bare name query can resolve to the outgoing
// step's card and the pick is lost — the wizard then waits forever. Waiting
// for the step's unique heading first proves the step we mean is the one on
// screen. (Continue-style steps don't race: their button is disabled while
// busy, which Playwright's actionability wait already handles.)
async function pickCard(page: Page, heading: string, card: string) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: card }).click();
}

async function waitForReady(page: Page) {
  await expect(page.getByText(en.signup.verify.provisioningTitle)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(en.signup.verify.readyTitle)).toBeVisible({ timeout: 120_000 });
  const cta = page.getByRole("link", { name: /localhost/ });
  await expect(cta).toBeVisible();
  expect(await cta.getAttribute("href")).toMatch(/https?:\/\/[a-z0-9-]+\.localhost/);
}

test.beforeAll(() => {
  // Self-healing sweep of tenants left by previous runs. PlatformSubscription
  // rows (created by the bypass-checkout path, spec 23) must be deleted via
  // raw SQL, not the ORM's .delete() — Payment.platform_subscription is a
  // cross-schema FK (db_constraint=False), so Django's cascade collector
  // still tries to touch the tenant-schema-only billing_payment table from
  // the public-schema shell context and fails with "relation does not
  // exist" regardless of delete order, unless the ORM cascade is bypassed
  // entirely.
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

test("coach walks the full wizard and the tenant provisions", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}a`, `e2e-coach-${stamp}a@example.com`);

  // Chapter 1 — business
  // Accessible name is "<label> <tagline>" (e.g. "Yoga Flows, breathwork, balance"); a bare
  // label substring-matches "Face Yoga" too, so match the full label+tagline text exactly.
  await page
    .getByRole("button", { name: `${W.niches.yoga.label} ${W.niches.yoga.tagline}`, exact: true })
    .click({ timeout: 20_000 }); // niche (single-select — auto-advances)
  await clickContinue(page); // describe (optional, left empty)
  await page.getByRole("button", { name: W.goals.items.sell_courses }).click();
  await clickContinue(page); // goals

  // Chapter 2 — look (pick NON-defaults to prove choices stick; each is
  // single-select and auto-advances on click — no Continue needed).
  await pickCard(page, W.theme.heading, W.themes.slate);
  await pickCard(page, W.font.heading, W.fonts.inter.label);
  await pickCard(page, W.navbar.heading, W.navbarLayouts.minimal);
  await pickCard(page, W.hero.heading, W.heroStyles.split.label);

  // Chapter 3 — pages (single-select, auto-advance: nothing is preselected,
  // so each page needs its own pick — home takes the non-default to prove the
  // choice sticks, the rest take the recommended card).
  await pickCard(page, W.pages.titles.home, W.layouts["home-story"]);
  await pickCard(page, W.pages.titles.about, W.layouts["about-story"]);
  await pickCard(page, W.pages.titles.courses, W.layouts["courses-grid"]);
  await pickCard(page, W.pages.titles.pricing, W.layouts["pricing-simple"]); // present because sell_courses picked
  await pickCard(page, W.pages.titles.faq, W.layouts["faq-list"]);
  await pickCard(page, W.pages.titles.contact, W.layouts["contact-form"]);

  // Chapter 4 — logo (wordmark is the preselected default)
  await expect(page.getByText(W.logo.wordmark.title)).toBeVisible();
  // AI door present but gated for free signups.
  await expect(page.getByText(W.upgrade.title)).toBeVisible();
  await clickContinue(page);

  // Chapter 5 — review + create
  await expect(page.getByText(W.review.heading)).toBeVisible();
  await page.getByRole("button", { name: W.review.create }).click();
  await waitForReady(page);
});

test("auto-advance cards disable while a pick is saving", async ({ page }) => {
  test.setTimeout(120_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}c`, `e2e-coach-${stamp}c@example.com`);

  await page
    .getByRole("button", { name: `${W.niches.yoga.label} ${W.niches.yoga.tagline}`, exact: true })
    .click({ timeout: 20_000 }); // niche (auto-advances)
  await clickContinue(page); // describe
  await clickContinue(page); // goals (none picked)

  // Hold the next save so the in-flight window is observable instead of a
  // ~100-300ms blink.
  await page.route("**/api/v1/onboarding/wizard/state/", async (route) => {
    if (route.request().method() === "PATCH") {
      await new Promise((r) => setTimeout(r, 1_500));
    }
    await route.continue();
  });

  await pickCard(page, W.theme.heading, W.themes.slate);
  // While the save is in flight the step's cards are disabled (same idiom as
  // the Continue button) — a second click must not be silently swallowed by
  // WizardFlow's busy guard.
  await expect(page.getByRole("button", { name: W.themes.slate })).toBeDisabled();
  // Once the save lands, the wizard advances normally.
  await expect(page.getByRole("heading", { name: W.font.heading })).toBeVisible({ timeout: 15_000 });
  await page.unroute("**/api/v1/onboarding/wizard/state/");
});

test("finish-the-rest-for-me fast path provisions", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}b`, `e2e-coach-${stamp}b@example.com`);

  await page.getByRole("button", { name: W.niches.general.label }).click({ timeout: 20_000 }); // niche (auto-advances)
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
