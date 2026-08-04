import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import { bucketedEmail } from "../helpers/holdout";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();

// The holdout bucket is a pure function of `${email}:${region}`, so landing in
// the content-first flow means choosing an email that hashes into "treatment" —
// there is deliberately no way to force a bucket over the wire (that would be a
// production surface). See e2e/helpers/holdout.ts.
const email = bucketedEmail(`e2e-content-${stamp}-`, "treatment");

async function signupThroughVerify(page: Page, brand: string, to: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(to);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });

  const mail = await latestEmail(to);
  const verifyLink = firstLink(mail.html);
  expect(verifyLink, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(verifyLink);
}

// Two different Continue buttons exist in this flow: the shell's footer one
// (classic steps) and the content steps' own, which POSTs before advancing.
// During a slide transition the outgoing step is still mounted, so an
// unscoped query can resolve to both — always say which one you mean.
async function clickFooterContinue(page: Page) {
  await page.getByRole("contentinfo").getByRole("button", { name: W.common.continue, exact: true }).click();
}

/** The content step's own Continue, scoped to the step body (not the footer). */
async function clickStepContinue(page: Page, heading: string) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 60_000 });
  const button = page
    .getByRole("button", { name: W.common.continue, exact: true })
    .filter({ hasNot: page.getByRole("contentinfo") });
  await button.first().click();
}

test.beforeAll(() => {
  // Same self-healing sweep as 01-signup-onboarding (raw SQL for
  // PlatformSubscription — the cross-schema FK breaks the ORM cascade).
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-content-'))\n" +
      "ids = [t.id for t in tenants]\n" +
      "with connection.cursor() as c:\n" +
      "    c.execute('DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)', [ids])\n" +
      "[t.delete(force_drop=True) for t in tenants]",
  ]);
});

test("treatment coach creates a real course during signup", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Content ${stamp}`, email);

  // Chapter 1 — business (identical to the classic flow).
  await page
    .getByRole("button", { name: `${W.niches.yoga.label} ${W.niches.yoga.tagline}`, exact: true })
    .click({ timeout: 20_000 });
  await clickFooterContinue(page); // describe (left empty)
  await page.getByRole("button", { name: W.goals.items.sell_courses }).click();
  await clickFooterContinue(page); // goals

  // Chapter 2 — content. Proves the flow branched: the classic wizard's next
  // step here is the theme picker, which the content flow does not have.
  await expect(page.getByRole("heading", { name: W.content.courseTitle })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: W.theme.heading })).toHaveCount(0);

  // The provisioning gate resolves on its own (it triggers early provisioning
  // and polls); the outline cards only render once the schema exists.
  const outlineCards = page.locator("button").filter({ hasText: /.+/ });
  await expect(outlineCards.first()).toBeVisible({ timeout: 60_000 });

  // Pick the first suggested outline, then save the real course.
  await page.getByRole("button", { name: new RegExp(W.content.free) }).first().click();
  await clickStepContinue(page, W.content.courseTitle);

  // Chapter 3 — logo, then the domain upsell (skipped), then review. Reaching
  // the logo step proves the course POST succeeded: the step only advances
  // after createWizardCourse resolves.
  await expect(page.getByText(W.logo.wordmark.title)).toBeVisible({ timeout: 60_000 });
  await clickFooterContinue(page);
  await expect(page.getByRole("heading", { name: W.domain.heading })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: W.domain.keepFree }).click();
  await expect(page.getByText(W.review.heading)).toBeVisible({ timeout: 30_000 });
});

test("the coach's wizard-created course exists in their tenant schema", async () => {
  // The whole point of the content flow: a real, published, owner-authored row
  // — not a seeded demo — so the publish gate is satisfied at reveal.
  const out = manage([
    "shell",
    "-c",
    "from django_tenants.utils import tenant_context\n" +
      "from apps.core.models import Tenant\n" +
      "t = Tenant.objects.filter(slug__startswith='e2e-content-').order_by('-id').first()\n" +
      "print('BUCKET:', t.wizard_bucket)\n" +
      "with tenant_context(t):\n" +
      "    from apps.courses.models import Course\n" +
      "    c = Course.objects.order_by('-id').first()\n" +
      "    print('COURSE:', bool(c), c and c.is_published, c and c.instructor.role)",
  ]);
  expect(out).toContain("BUCKET: treatment");
  expect(out).toContain("COURSE: True True owner");
});
