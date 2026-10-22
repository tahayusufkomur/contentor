// e2e/specs/41-email.spec.ts
//
// The native email engine (backend apps/email_campaigns; frontend
// app/admin/messages/email/*, components/admin/email/*, and the shared editor in
// packages/shared/src/email/editor). The coach starts an email from the
// newsletter made for her at setup, gives it a subject, sends herself a test
// (the inbox gets her email drawn by the engine: no merge tag left, her
// unsubscribe link in the footer) and schedules it for tomorrow; Messages lists
// it as scheduled. The Designer (real AI) is not exercised here: it has
// backend tests with the model stubbed.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";
import { latestEmail } from "../helpers/email";

const SUBJECT = `E2E email ${Date.now()}`;

// The demo tenant's one student must still want email for "All students" to reach anyone
// (an unsubscribe clicked while testing by hand would otherwise leave nobody to send to).
test.beforeAll(() => {
  manage([
    "shell",
    "-c",
    "from django_tenants.utils import schema_context\n" +
      "with schema_context('demo_yoga'):\n" +
      "    from apps.notifications.models import EmailOptOut\n" +
      "    EmailOptOut.objects.filter(email='priya@demo.test').delete()",
  ]);
});

test("coach writes an email from her newsletter, tests it and schedules it", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  // ── 1. Start from the newsletter made for her (made on this first visit) ─────
  await page.goto(`${TENANT}/admin/messages/email/new`);
  const newsletter = page.getByRole("button", { name: /Newsletter/ }).first();
  await expect(newsletter).toBeVisible({ timeout: 20_000 });
  await newsletter.click();
  await expect(page).toHaveURL(/\/admin\/messages\/email\/\d+\/edit/, {
    timeout: 15_000,
  });
  const id = Number(page.url().match(/email\/(\d+)\/edit/)![1]);

  // ── 2. Her subject, saved as she types ───────────────────────────────────────
  await page.getByLabel("Subject").fill(SUBJECT);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // ── 3. A test to her own inbox ───────────────────────────────────────────────
  const [response] = await Promise.all([
    page.waitForResponse((r) =>
      r.url().includes(`/api/v1/email/campaigns/${id}/test/`),
    ),
    page.getByRole("button", { name: "Send me a test" }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(200);
  const { sent_to } = (await response.json()) as { sent_to: string };
  const mail = await latestEmail(sent_to);
  expect(mail.subject).toBe(`[Test] ${SUBJECT}`);
  expect(mail.html, "every merge tag is filled").not.toContain("{{");
  expect(mail.html, "no brand token reaches an inbox").not.toContain("brand:");
  expect(mail.html).toContain("Unsubscribe");
  expect(mail.html).toContain('role="presentation"');

  // ── 4. Schedule it for tomorrow ──────────────────────────────────────────────
  await page.getByRole("button", { name: /Next: send/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/messages/email/${id}/send`), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Send at").fill(local);
  await page.getByRole("button", { name: "Schedule", exact: true }).last().click();
  await expect(page).toHaveURL(/\/admin\/messages$/, { timeout: 15_000 });

  const campaign = await page.request.get(`${TENANT}/api/v1/email/campaigns/${id}/`);
  expect((await campaign.json()).status).toBe("scheduled");

  // Leave the shared demo tenant as it was.
  expect((await page.request.delete(`${TENANT}/api/v1/email/campaigns/${id}/`)).status()).toBe(204);
  await coach.close();
});
