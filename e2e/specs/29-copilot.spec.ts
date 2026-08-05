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

test("a create-course card confirms and links to the new draft", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Course plan ready.",' +
        '"actions":[{"kind":"create_course","title":"Create draft course: Yoga 101",' +
        '"detail":"2 module(s), 6 lesson(s) — free","token":"e2e-course-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({
      json: { result: { kind: "create_course", id: 1, title: "Yoga 101", url: "/admin/courses/yoga-101" } },
    });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByPlaceholder("e.g. make this section warmer").fill("create my first course");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Create draft course: Yoga 101")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("CreatedOpen")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open" })).toHaveAttribute("href", /\/admin\/courses\/yoga-101/);
  expect(executed).toBe(true);
  await page.close();
});

test("an edit-theme card confirms and applies", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Switching it up.",' +
        '"actions":[{"kind":"edit_theme","title":"Switch theme to Forest",' +
        '"detail":"Colors change across the whole site — you can switch back anytime.","token":"e2e-theme-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "edit_theme", theme: "forest" } } });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByPlaceholder("e.g. make this section warmer").fill("make my site feel calmer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Switch theme to Forest")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);
  await page.close();
});

test("a KB-grounded answer renders admin links as buttons, not raw paths", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"answer","text":"You get paid through Stripe payouts. [Payouts](/admin/payouts)"}\n\n',
    });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await page.getByPlaceholder("e.g. make this section warmer").fill("how do I get paid?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("You get paid through Stripe payouts.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Payouts" })).toHaveAttribute("href", /\/admin\/payouts/);
  await expect(page.getByText("[Payouts]")).toHaveCount(0);
  await page.close();
});

test("a set-block-image card shows the photo preview and applies", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Here is a photo that fits.",' +
        '"actions":[{"kind":"set_block_image","title":"Use the photo \'Sunlit yoga studio\'",' +
        '"detail":"Ask for a different style anytime — nothing changes until you apply.",' +
        '"image_url":"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",' +
        '"token":"e2e-photo-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "set_block_image", page: "home" } } });
  });
  // The coach's canvas renders from the editor store, not server props — on
  // apply the sidebar re-pulls config and syncs the store so the page
  // repaints in place. Serve a marker heading from the refetch to prove the
  // element updated without any page reload.
  await page.route("**/api/admin/config", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    const json = await res.json();
    json.pages.home.blocks[0].heading = "COPILOT SYNCED HERO";
    await route.fulfill({ json });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByPlaceholder("e.g. make this section warmer").fill("add a hero section photo");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Use the photo 'Sunlit yoga studio'")).toBeVisible();
  await expect(page.getByRole("img", { name: "Use the photo 'Sunlit yoga studio'" })).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);
  await expect(page.getByText("COPILOT SYNCED HERO")).toBeVisible();
  await page.close();
});
