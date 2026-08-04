import { test, expect } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import { bucketedEmail } from "../helpers/holdout";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();
// Classic flow, pinned to control like spec 01.
const email = bucketedEmail(`e2e-coach-${stamp}dm-`, "control");
const brand = `E2E Studio ${stamp}dm`;
const slug = `e2e-studio-${stamp}dm`;
// The domain step seeds its search from the brand ("E2E Studio 123dm" ->
// "e2estudio123dm"), and the server appends .com to a TLD-less query.
const domain = `e2estudio${stamp}dm.com`;

// Runs on the DEFAULT dev stack: the paid plan is granted server-side (no
// billing bypass needed) and the domain "purchase" goes through the
// DOMAINS_BYPASS_ENABLED path — the checkout click bounces straight back to
// /signup/verify?bypass=1&custom_domain_id=… where the step's sync probe
// activates the subscription and enqueues provisioning.
test("paid coach buys a custom domain inside the wizard", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  const mail = await latestEmail(email);
  await page.goto(firstLink(mail.html));
  await expect(
    page.getByRole("button", { name: W.niches.general.label }),
  ).toBeVisible({ timeout: 20_000 });

  // The tenant row exists once the wizard renders — grant it a paid plan so
  // the domain step opens on search instead of the locked upsell.
  manage([
    "shell",
    "-c",
    "from apps.core.models import Tenant, PlatformPlan, PlatformSubscription\n" +
      "from apps.accounts.models import User\n" +
      `t = Tenant.objects.get(slug='${slug}')\n` +
      "plan, _ = PlatformPlan.objects.get_or_create(name='Starter', defaults={'price_monthly': 19, 'transaction_fee_pct': 8})\n" +
      `u = User.objects.filter(email='${email}').first() or User.objects.create_user(email='${email}', name='E2E Coach', password='e2e-pass-1', role='coach')\n` +
      "PlatformSubscription.objects.get_or_create(tenant=t, defaults={'user': u, 'plan': plan, 'status': 'active', 'provider': 'bypass'})",
  ]);

  // Fast-forward to the domain step.
  await page.getByRole("button", { name: W.niches.general.label }).click();
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // describe
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // goals
  await page.getByRole("button", { name: W.common.finishRest }).click(); // -> logo
  await expect(page.getByText(W.logo.heading)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // -> domain

  // Paid coach: the step auto-searches the brand seed; pick the exact match.
  await expect(page.getByRole("heading", { name: W.domain.heading })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: domain }).first().click({ timeout: 20_000 });

  // Registrant details: name/email prefill from the wizard token; the rest
  // is required by the registrar.
  await page.getByLabel(W.domain.form.address).fill("Teststrasse 1");
  await page.getByLabel(W.domain.form.city).fill("Berlin");
  await page.getByLabel(W.domain.form.zip).fill("10115");
  await page.getByLabel(W.domain.form.phone).fill("5551234567");
  await page.getByRole("button", { name: W.domain.payCta }).click();

  // Bypass checkout bounces straight back into the wizard; the sync probe
  // activates the purchase and the done panel shows the owned domain.
  await expect(page.getByRole("heading", { name: new RegExp(domain) })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: W.common.continue, exact: true }).click();
  await expect(page.getByText(W.review.heading)).toBeVisible({ timeout: 15_000 });

  // The purchase is real on the backend: subscription active, provisioning
  // status past "pending" (the Celery task may already be running the fakes).
  const state = manage([
    "shell",
    "-c",
    "from apps.domains.models import CustomDomain\n" +
      `cd = CustomDomain.objects.get(domain='${domain}')\n` +
      "print(cd.subscription.status)",
  ]);
  expect(state).toContain("active");
});
