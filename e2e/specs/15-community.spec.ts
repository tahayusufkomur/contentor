// e2e/specs/15-community.spec.ts
//
// Full community journey: coach enables the module in Settings → student joins
// and posts → coach sees the post in the admin Feed tab and pins it → student
// reports the coach's post → coach resolves it with Remove → post disappears
// from the student feed → coach bans the student → student is blocked.
//
// Idempotency: there is no disable/wipe step before this spec runs — it never
// deletes community rows or turns the module off. Reruns stay safe because
// POST_BODY/COACH_POST are suffixed with Date.now() (so each run's content is
// unique), the enable-switch check only clicks when currently off, and the
// spec unbans the student it banned as its final step.
//
// Deviations from the original plan draft, made during code review against
// the actual components (this spec has not been executed — see task 8
// report):
//   - The admin community tab bar (app/admin/community/page.tsx) uses the
//     house Tabs component (components/ui/tabs.tsx), which is hand-rolled,
//     not Radix — TabsTrigger renders a plain <button> with no role="tab".
//     Selecting by getByRole("tab", ...) would never match. Existing spec
//     09-builder.spec.ts hits the same "styled tab that's actually a button"
//     pattern and selects it via getByRole("button", ...) — followed here.
//   - The Settings tab's enable switch (components/ui/switch.tsx) is also
//     hand-rolled — it sets aria-checked, not Radix's data-state. Checking
//     data-state would never see "checked" and the idempotency check would
//     always click (and the final assertion would always fail).

import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";

const POST_BODY = `E2E community post ${Date.now()}`;
const COACH_POST = `E2E coach post ${Date.now()}`;

test.beforeAll(() => {
  // Self-healing sweep, same idea as 01-signup-onboarding's beforeAll: the
  // unban is this spec's FINAL step, so a failed, interrupted, or
  // silently-unlucky earlier run leaves the seeded student banned — and a
  // banned member dead-ends the student page ("You can't access the
  // community") before the join/composer wait can ever succeed.
  manage([
    "shell",
    "-c",
    "from django_tenants.utils import tenant_context\n" +
      "from apps.core.models import Tenant\n" +
      "t = Tenant.objects.get(slug='demo-yoga')\n" +
      "with tenant_context(t):\n" +
      "    from apps.community.models import CommunityMember\n" +
      "    CommunityMember.objects.filter(is_banned=True).update(is_banned=False)",
  ]);
});

test("community: enable → post → pin → report → remove → ban", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  // ── 0. Coach: reset + enable via the admin UI ────────────────────────────
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();

  await coachPage.goto(`${TENANT}/admin/community`);
  await coachPage.getByRole("button", { name: /settings/i }).click();
  // Idempotent: switch ON if currently off.
  const enableSwitch = coachPage.getByRole("switch").first();
  if ((await enableSwitch.getAttribute("aria-checked")) !== "true") {
    await enableSwitch.click();
  }
  await expect(enableSwitch).toHaveAttribute("aria-checked", "true");

  // ── 1. Student joins and posts ───────────────────────────────────────────
  const student = await studentContext(browser);
  const studentPage = await student.newPage();
  await studentPage.goto(`${TENANT}/community`);

  // Join card may or may not show: ban→unban at the end of a successful run
  // leaves the student a non-member, so the next run must re-join. The page
  // resolves membership client-side after load — an instant isVisible()
  // check races that fetch (and a lost race strands the composer wait until
  // the test times out), so wait for whichever of the two states renders.
  const joinButton = studentPage.getByRole("button", {
    name: /join the community/i,
  });
  const composer = studentPage.getByPlaceholder(/share something/i);
  await expect(joinButton.or(composer).first()).toBeVisible({
    timeout: 15_000,
  });
  if (await joinButton.isVisible()) {
    await joinButton.click();
  }

  await composer.fill(POST_BODY);
  await studentPage.getByRole("button", { name: /^post$/i }).click();
  await expect(studentPage.getByText(POST_BODY)).toBeVisible({
    timeout: 10_000,
  });

  // ── 2. Coach sees it in the admin feed and pins it ───────────────────────
  await coachPage.getByRole("button", { name: /feed/i }).click();
  await expect(coachPage.getByText(POST_BODY)).toBeVisible({ timeout: 10_000 });
  await coachPage
    .locator('[data-testid="post-card"]')
    .filter({ hasText: POST_BODY })
    .getByLabel("Post actions")
    .click();
  await coachPage.getByRole("menuitem", { name: /^pin$/i }).click();
  await expect(coachPage.getByText(/pinned to the top/i)).toBeVisible();

  // ── 3. Coach posts; student reports the coach's post ────────────────────
  await coachPage.getByPlaceholder(/share something/i).fill(COACH_POST);
  await coachPage.getByRole("button", { name: /^post$/i }).click();
  await expect(coachPage.getByText(COACH_POST)).toBeVisible({ timeout: 10_000 });

  await studentPage.reload();
  await expect(studentPage.getByText(COACH_POST)).toBeVisible({
    timeout: 10_000,
  });
  await studentPage
    .locator('[data-testid="post-card"]')
    .filter({ hasText: COACH_POST })
    .getByLabel("Post actions")
    .click();
  await studentPage.getByRole("menuitem", { name: /report/i }).click();
  await studentPage.getByRole("button", { name: /^spam$/i }).click();
  await studentPage.getByRole("button", { name: /^report$/i }).click();
  await expect(studentPage.getByText(/moderator will take a look/i)).toBeVisible();

  // ── 4. Coach resolves the report with Remove ─────────────────────────────
  await coachPage.getByRole("button", { name: /reports/i }).click();
  await expect(coachPage.getByText(COACH_POST)).toBeVisible({ timeout: 10_000 });
  await coachPage.getByRole("button", { name: /^remove$/i }).first().click();
  await expect(coachPage.getByText(/content removed/i)).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByText(COACH_POST)).not.toBeVisible();

  // ── 5. Coach bans the student; student is blocked ────────────────────────
  await coachPage.getByRole("button", { name: /members/i }).click();
  const studentRow = coachPage.getByRole("row").filter({ hasText: "student" });
  await studentRow.getByLabel("Member actions").click();
  coachPage.once("dialog", (d) => void d.accept());
  await coachPage.getByRole("menuitem", { name: /^ban$/i }).click();

  await studentPage.reload();
  await expect(
    studentPage.getByText(/can't access the community/i),
  ).toBeVisible({ timeout: 10_000 });

  // ── 6. Cleanup: unban so reruns start clean ──────────────────────────────
  await coachPage.reload();
  await coachPage.getByRole("button", { name: /members/i }).click();
  const bannedRow = coachPage.getByRole("row").filter({ hasText: /banned/i });
  await bannedRow.getByLabel("Member actions").click();
  await coachPage.getByRole("menuitem", { name: /unban/i }).click();
  // Verify the unban actually landed — an unasserted click here once no-oped
  // silently, leaving the student banned and dead-ending every later run.
  await expect(bannedRow).toHaveCount(0, { timeout: 10_000 });

  await coach.close();
  await student.close();
});
