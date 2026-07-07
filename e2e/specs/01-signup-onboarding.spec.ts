import { test, expect } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";

const stamp = Date.now();
const EMAIL = `e2e-coach-${stamp}@example.com`;
const BRAND = `E2E Studio ${stamp}`;

test("coach signs up, verifies via sink email link, tenant gets provisioned", async ({
  page,
}) => {
  // ── Step 0: Sweep e2e-studio-* tenants left by previous runs ─────────────
  // Self-healing: leftover schemas (esp. from failed runs) make the celery
  // periodic tasks error forever and would accumulate without this.
  manage([
    "shell",
    "-c",
    "from apps.core.models import Tenant\n" +
      "[t.delete(force_drop=True) for t in Tenant.objects.filter(slug__startswith='e2e-studio-')]",
  ]);

  // ── Step 1: Fill signup form ─────────────────────────────────────────────
  await page.goto("http://localhost/signup");

  await page
    .getByPlaceholder(en.signup.brandNamePlaceholder)
    .fill(BRAND);
  await page
    .getByPlaceholder(en.signup.namePlaceholder)
    .fill("E2E Coach");
  await page
    .getByPlaceholder(en.signup.emailPlaceholder)
    .fill(EMAIL);

  await page
    .getByRole("button", { name: en.signup.submit })
    .click();

  // ── Step 2: Wait for "Check your email" confirmation state ───────────────
  // The form stays on /signup but transitions to "email-sent" state.
  // The text appears in both an eyebrow <p> and a heading <h1>; target the heading.
  await expect(
    page.getByRole("heading", { name: en.signup.verifyTitle }),
  ).toBeVisible({ timeout: 10_000 });

  // ── Step 3: Pull verification link from email sink ───────────────────────
  const mail = await latestEmail(EMAIL);
  const verifyLink = firstLink(mail.html);
  expect(verifyLink, `no link found in email: ${mail.subject}`).toMatch(
    /signup\/verify\?token=/,
  );

  // ── Step 4: Navigate to the verify link (token-based, not a code) ────────
  await page.goto(verifyLink);

  // The page briefly shows "verifying", then transitions to "questionnaire".
  // The "verifying" state is too transient to reliably catch; wait for the
  // niche cards which appear after verification succeeds.

  // ── Step 5: Questionnaire — pick a niche, then craft the platform ────────
  // The niche-onboarding redesign removed the header "Skip"; the flow is now
  // slide 1 (pick niche → Next) then slide 2 (goals optional → Continue).
  await page
    .getByRole("button", { name: en.signup.questionnaire.niches.general.label })
    .click({ timeout: 20_000 });
  await page
    .getByRole("button", { name: en.signup.questionnaire.next })
    .click();
  await page
    .getByRole("button", { name: en.signup.questionnaire.continue })
    .click();

  // ── Step 6: Provisioning screen appears ──────────────────────────────────
  await expect(
    page.getByText(en.signup.verify.provisioningTitle),
  ).toBeVisible({ timeout: 15_000 });

  // ── Step 7: Wait for tenant to reach "ready" state (up to 90s) ───────────
  await expect(
    page.getByText(en.signup.verify.readyTitle),
  ).toBeVisible({ timeout: 90_000 });

  // ── Step 8: CTA button visible with the new tenant domain ────────────────
  const cta = page.getByRole("link", { name: /localhost/ });
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  expect(href).toMatch(/https?:\/\/[a-z0-9-]+\.localhost/);
});
