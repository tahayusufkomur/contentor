// e2e/specs/29-copilot.spec.ts
//
// Coach Copilot (backend/apps/core/copilot/; frontend
// components/copilot/): the floating coach-only assistant on the tenant
// site. Converse is stubbed at the network layer (real AI is slow and
// non-deterministic); execute is stubbed so the spec never mutates
// demo-yoga's real pages. What's under test is the widget loop: open via
// deep link -> chat -> action card -> confirm -> executed.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach opens the copilot, gets an action card, and confirms it", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Here is my plan.",' +
        '"actions":[{"kind":"add_block","title":"Add cta to home",' +
        '"detail":"heading: Join us","token":"e2e-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "add_block", page: "home" } } });
  });

  await page.goto(`${TENANT}/?copilot=1`);

  // Deep link opens the panel.
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();

  await page.getByPlaceholder("e.g. make this section warmer").fill("add a call to action");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Here is my plan.")).toBeVisible();
  await expect(page.getByText("Add cta to home")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);

  await page.close();
});

test("the bubble does not render for anonymous visitors", async ({ page }) => {
  await page.goto(`${TENANT}/`);
  await expect(page.getByRole("heading").first()).toBeVisible(); // page loaded
  await expect(page.getByText("Your AI assistant")).toHaveCount(0);
});
