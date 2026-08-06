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

// The drawer boots from the server-side chats API; stubbed tests mock it to
// empty so every test starts on a fresh thread regardless of prior runs.
async function mockEmptyChats(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/admin/copilot/chats/**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { chats: [] } });
    if (method === "POST")
      return route.fulfill({
        status: 201,
        json: { id: 999, title: "e2e", updated_at: new Date().toISOString(), entries: [] },
      });
    return route.fulfill({ json: { id: 999, title: "e2e", updated_at: new Date().toISOString(), entries: [] } });
  });
  await page.route("**/api/v1/admin/copilot/chats/", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { chats: [] } });
    return route.fulfill({
      status: 201,
      json: { id: 999, title: "e2e", updated_at: new Date().toISOString(), entries: [] },
    });
  });
}

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

  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);

  // Deep link opens the panel.
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();

  await page.getByTestId("copilot-input").fill("add a call to action");
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
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByTestId("copilot-input").fill("create my first course");
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
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByTestId("copilot-input").fill("make my site feel calmer");
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
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);
  await page.getByTestId("copilot-input").fill("how do I get paid?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("You get paid through Stripe payouts.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Payouts" })).toHaveAttribute("href", /\/admin\/payouts/);
  await expect(page.getByText("[Payouts]")).toHaveCount(0);
  await page.close();
});

test("edit_block_fields card shows diff rows and confirms", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Updating the hero.",' +
        '"actions":[{"kind":"edit_block_fields","title":"Update the hero on home",' +
        '"detail":"1 field(s) change",' +
        '"changes":[{"page":"home","block_type":"hero","field":"ctaHref","old":"/courses","new":"/pricing"}],' +
        '"token":"e2e-fields-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "edit_block_fields", page: "home" } } });
  });
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByTestId("copilot-input").fill("change the hero button link");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Update the hero on home")).toBeVisible();
  await expect(page.getByText("/pricing")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);
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
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByTestId("copilot-input").fill("add a hero section photo");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Use the photo 'Sunlit yoga studio'")).toBeVisible();
  await expect(page.getByRole("img", { name: "Use the photo 'Sunlit yoga studio'" })).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);
  await expect(page.getByText("COPILOT SYNCED HERO")).toBeVisible();
  await page.close();
});

test("chats persist server-side: reload resumes, New chat starts fresh, the list reopens old threads", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();
  // Unique per run: the real chats backend accumulates threads across runs,
  // and boot resumes the most recent one — assertions must not collide with
  // residue from an earlier execution.
  const marker = `remember this ${Date.now()}`;

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"answer","text":"Persisted answer."}\n\n',
    });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  // A fresh thread regardless of what boot resumed.
  await page.getByRole("button", { name: "New chat" }).click();
  await page.getByTestId("copilot-input").fill(marker);
  // The server save is best-effort fire-and-forget after the turn — wait for
  // it before reloading, or the reload races the POST and the turn is lost.
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v1/admin/copilot/chats/") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Persisted answer.").first()).toBeVisible();
  await saved;

  // Reload: ?copilot=1 sticks, boot resumes the most recent server chat.
  await page.reload();
  await expect(page.getByText("Persisted answer.").first()).toBeVisible();
  await expect(page.getByText(marker).first()).toBeVisible();

  // New chat empties the view but keeps the old thread on the server…
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByText("Persisted answer.")).toHaveCount(0);

  // …and the chats list reopens it (title derives from the first message).
  await page.getByRole("button", { name: "Chats" }).click();
  await page.getByRole("button", { name: new RegExp(marker) }).click();
  await expect(page.getByText("Persisted answer.").first()).toBeVisible();
  await page.close();
});
