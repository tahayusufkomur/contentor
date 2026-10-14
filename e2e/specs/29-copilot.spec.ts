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

test("an edit-style card confirms and applies", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Switching it up.",' +
        '"actions":[{"kind":"edit_style","title":"Switch the site style to Nocturne",' +
        '"detail":"Every section keeps its content and takes the new layout — you can switch back anytime.","token":"e2e-style-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "edit_style", style: "nocturne" } } });
  });
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByTestId("copilot-input").fill("make my site feel calmer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Switch the site style to Nocturne")).toBeVisible();
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

test("the copilot rides along into /admin: stays open, keeps the chat, hides Select", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  // Hermetic chats: one server thread the drawer should reopen everywhere.
  const row = { id: 7, title: "carry me", updated_at: new Date().toISOString() };
  await page.route("**/api/v1/admin/copilot/chats/", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { chats: [row] } });
    return route.fulfill({ status: 201, json: { ...row, entries: [] } });
  });
  await page.route("**/api/v1/admin/copilot/chats/7/", async (route) => {
    await route.fulfill({
      json: {
        ...row,
        entries: [
          { role: "coach", text: "carry me" },
          { role: "assistant", text: "Carried answer." },
        ],
      },
    });
  });

  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Carried answer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select" })).toBeVisible();

  // Hard navigation into the admin: the drawer reopens itself (stored UI
  // state) with the same server chat, minus the site-only Select button.
  await page.goto(`${TENANT}/admin`);
  await expect(page.getByText("Carried answer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0);
  await page.close();
});

// ── The admin's assistant panel (phase 2 of the admin refactor) ─────────────
// Converse and execute stay stubbed; what is under test is what the admin
// sends (the page she is on, the intent of a "Describe it" line) and shows.

function sse(done: Record<string, unknown>) {
  return {
    status: 200,
    contentType: "text/event-stream",
    body: 'data: {"type":"phase","phase":"thinking"}\n\n' + `data: ${JSON.stringify({ type: "done", ...done })}\n\n`,
  };
}

test("in the admin the assistant knows the page, offers its starters, and takes a question from search", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();
  const sent: Record<string, any>[] = [];
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill(sse({ kind: "answer", text: `Answer ${sent.length}.` }));
  });
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/admin/courses?assistant=assistant`);

  // The page's own starters, no model call to show them.
  const starters = page.getByTestId("copilot-starters");
  await expect(starters.getByRole("button")).toHaveCount(3);
  expect(sent).toHaveLength(0);
  await starters.getByRole("button", { name: "Which courses are still drafts?" }).click();
  await expect(page.getByText("Answer 1.")).toBeVisible();
  expect(sent[0].message).toBe("Which courses are still drafts?");
  expect(sent[0].context).toEqual({ path: "/admin/courses" });
  // Asked from this page: its starters step aside until she moves on.
  await expect(starters).toHaveCount(0);

  // Search: a page name still jumps there; anything else can be asked.
  await page.getByRole("button", { name: /Search pages/ }).click();
  await page.getByPlaceholder("Search pages…").fill("how do I get paid");
  await expect(page.getByRole("button", { name: "Ask the assistant: “how do I get paid”" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Answer 2.")).toBeVisible();
  expect(sent[1].message).toBe("how do I get paid");
  expect(sent[1].transcript).toEqual([]); // its own conversation
  await page.close();
});

test("a question from search opens the panel when it was closed, and is sent once", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();
  const sent: Record<string, any>[] = [];
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill(sse({ kind: "answer", text: "From a closed panel." }));
  });
  await mockEmptyChats(page);
  await page.goto(`${TENANT}/admin/courses`);
  await expect(page.getByRole("complementary", { name: "Assistant" })).toHaveCount(0);

  await page.getByRole("button", { name: /Search pages/ }).click();
  await page.getByPlaceholder("Search pages…").fill("what should I do next");
  await page.keyboard.press("Enter");
  // The chat mounts with the question already waiting (the dev server
  // double-runs mount effects: it must neither drop nor repeat it).
  await expect(page.getByText("From a closed panel.")).toBeVisible();
  expect(sent.map((body) => body.message)).toEqual(["what should I do next"]);
  await page.close();
});

test("Describe it drafts a class series beside the manual form: cards, Apply all", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();
  const sent: Record<string, any>[] = [];
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill(
      sse({
        kind: "actions",
        text: "Two Tuesdays.",
        actions: [1, 2].map((n) => ({
          kind: "create_event",
          title: `Schedule Zoom class: Office hour ${n}`,
          detail: "Tue — visible to students once confirmed",
          token: `e2e-series-${n}`,
        })),
      }),
    );
  });
  const executed: string[] = [];
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed.push(route.request().postDataJSON().token);
    await route.fulfill({
      json: { result: { kind: "create_event", id: executed.length, title: "Office hour" }, audit_id: null },
    });
  });
  await page.goto(`${TENANT}/admin/live`);

  await page.getByTestId("describe-event").fill("a Zoom office hour on the next two Tuesdays at 18:00");
  await page.getByRole("button", { name: "Draft it" }).click();
  await expect(page.getByText("Schedule Zoom class: Office hour 2")).toBeVisible();
  expect(sent[0].context).toEqual({ path: "/admin/live", intent: "draft_event" });
  // The manual way is still on the page.
  await expect(page.getByRole("button", { name: "New class or event" })).toBeVisible();

  await page.getByRole("button", { name: "Apply all" }).click();
  await expect(page.getByText("Created", { exact: true })).toHaveCount(2);
  expect(executed).toEqual(["e2e-series-1", "e2e-series-2"]);
  await page.close();
});

test("History offers Undo only where the server says it still works", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();
  const row = (id: number, summary: string, undoable: boolean, undone = false) => ({
    id,
    kind: "create_course",
    summary,
    created_at: new Date().toISOString(),
    undoable,
    undone,
  });
  let entries = [row(2, "Created draft course 'Flow'", true), row(1, "Published course 'Basics'", false)];
  await page.route("**/api/v1/admin/copilot/audit/", (route) => route.fulfill({ json: { entries } }));
  const undone: number[] = [];
  await page.route("**/api/v1/admin/copilot/undo/", async (route) => {
    undone.push(route.request().postDataJSON().audit_id);
    entries = [row(2, "Created draft course 'Flow'", false, true), entries[1]];
    await route.fulfill({ json: { undone: "create_course", id: 2 } });
  });
  await page.goto(`${TENANT}/admin/courses?assistant=history`);

  const panel = page.getByRole("complementary", { name: "Assistant" });
  await expect(panel.getByText("Published course 'Basics'")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Undo" })).toHaveCount(1);
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(panel.getByText(/Undone/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Undo" })).toHaveCount(0);
  expect(undone).toEqual([2]);
  await page.close();
});
