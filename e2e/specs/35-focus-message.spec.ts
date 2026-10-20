// e2e/specs/35-focus-message.spec.ts
//
// Focus mode for a message to her students (backend apps/core/focus/kinds/message.py;
// frontend app/admin/messages/new, components/admin/announcement-compose.tsx).
// As in 34-focus-event, the focus endpoints, the copy run and the draft row are
// stubbed at the network layer (real AI is slow and non-deterministic, and the
// spec must not depend on the FOCUS_KINDS switch); what is under test is the
// loop on screen.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const CREATION = 89;
const DRAFT = 701;
const COPY_RUN = 6170;
const PATH = `/admin/messages/new?draft=${DRAFT}`;
const DRAFT_API = `**/api/v1/admin/notifications/announcements/${DRAFT}/`;

const option = (value: string, label: string, hint = "") => ({ value, label, hint });
const question = (field: string, kind: string, text: string, extra: Body = {}) => ({
  field,
  kind,
  question: text,
  why: "",
  options: [],
  starter: null,
  can_delegate: false,
  specialist: "community",
  ...extra,
});
const Q: Record<string, Body> = {
  topic: question("topic", "text", "What do you want to tell your students?", { starter: "Tell them " }),
  audience: question("audience", "choice", "Who should get it?", {
    can_delegate: true,
    options: [option("all", "All my students (5 students)"), option("course:3", "Students of Desk Yoga", "2 students")],
  }),
  review: question("review", "review", "Here's your message. Does it fit?"),
  finish: question("finish", "finish", "Ready. Send it?", {
    options: [option("send", "Send"), option("draft", "Keep as a draft")],
    tick: false,
  }),
  // Not ready (backend flow.state): only Keep as a draft, and why.
  nobody: question("finish", "finish", "Your message is saved as a draft.", {
    why: "Nobody would receive it yet. Until then it stays a hidden draft.",
    options: [option("draft", "Keep as a draft")],
    tick: true, // she said "by email too": the kept draft keeps it
  }),
};
const STEPS = ["topic", "audience", "review", "when", "finish"];
const RECORD = { id: DRAFT, kind: "message", title: "Closed on Friday", path: PATH };

/** A creation as the backend reports it: `answered` as [field, label] pairs. */
const state = (over: Body & { answered?: [string, string][] }): Body => {
  const answered = (over.answered ?? []).map(([field, label]) => ({ field, label }));
  return {
    id: CREATION,
    kind: "message",
    status: "active",
    chat: null,
    record: null,
    question: null,
    outline: { status: "idle", run: null, drafted: false },
    reading: null,
    thinking: null,
    descriptions: null,
    copy: null,
    cover: null,
    announcement: null,
    steps: STEPS.map((id) => ({ id, done: answered.some((a) => a.field === id) })),
    ...over,
    answered,
  };
};

/** The focus endpoints: `reply` answers every POST (and the creation's GET
 *  returns the last state); `open` is the creation the overview lists. */
async function stubFocus(page: Page, reply: (path: string, body: Body) => Body, open: Body | null = null) {
  const sent: Body[] = [];
  let current: Body | null = open;
  await page.route(/\/api\/v1\/admin\/focus\/.*/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST") {
      const body = req.postDataJSON() ?? {};
      sent.push({ path, ...body });
      if (path.endsWith("/form-timing/")) return route.fulfill({ status: 201, body: "" });
      current = reply(path, body);
      return route.fulfill({ status: path.endsWith("/admin/focus/") ? 201 : 200, json: current });
    }
    if (path.endsWith("/admin/focus/"))
      return route.fulfill({
        json: {
          enabled: true,
          kinds: ["course", "event", "message"],
          first: { message: Q.topic },
          open:
            current && current.status === "active" && current.id
              ? [{ id: CREATION, kind: "message", record: current.record, title: "Closed on Friday" }]
              : [],
        },
      });
    return route.fulfill({ json: current });
  });
  return sent;
}

/** The draft row: read by the composer, PATCHed as she types. */
async function stubDraft(page: Page, over: Body = {}) {
  let current: Body = {
    id: DRAFT,
    title: "Closed on Friday",
    body: "",
    link: "",
    status: "draft",
    scheduled_at: null,
    created_at: new Date().toISOString(),
    recipient_count: 0,
    push_sent_count: 0,
    read_count: 0,
    filters: {},
    recipients: [],
    ...over,
  };
  const patches: Body[] = [];
  await page.route(DRAFT_API, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      patches.push(body);
      current = { ...current, ...body };
    }
    return route.fulfill({ json: current });
  });
  return { patches, set: (next: Body) => (current = { ...current, ...next }) };
}

/** The copy run on the draft. Held (`release` not yet called), it is working
 *  and has written nothing; released, it is done with its title and body. */
async function stubCopyRun(page: Page, title: string, body: string, held = false) {
  let done = !held;
  const step = (state: string) => ({
    type: "step",
    data: { specialist: "community", label: "Writing your message", state },
  });
  const all = [
    step("start"),
    { type: "field", data: { record: `message:${DRAFT}`, name: "title", value: title } },
    { type: "field", data: { record: `message:${DRAFT}`, name: "body", value: body } },
    step("done"),
  ].map((event, i) => ({ seq: i + 1, at: new Date().toISOString(), ...event }));
  await page.route("**/api/v1/admin/copilot/runs/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
    if (!url.pathname.includes(`/runs/${COPY_RUN}/`)) return route.fallback();
    const since = Number(url.searchParams.get("since") ?? 0);
    const events = done ? all : all.slice(0, 1);
    return route.fulfill({
      json: {
        id: COPY_RUN,
        status: done ? "done" : "working",
        specialist: "community",
        chat: null,
        seen: false,
        events: events.filter((e) => e.seq > since),
      },
    });
  });
  return { release: () => (done = true) };
}

const guide = (page: Page) => page.getByRole("complementary", { name: "New message" });
const titleBox = (page: Page) => page.getByRole("main").getByPlaceholder("Title");

async function sendFirst(page: Page, words: string) {
  await page.goto(`${TENANT}/admin/messages/new`);
  await expect(guide(page).getByText("What do you want to tell your students?")).toBeVisible();
  // What she tells them is hers: nothing drafts it for her.
  await expect(guide(page).getByRole("button", { name: "Just draft it" })).toHaveCount(0);
  // Her sentence goes on from the starter.
  await guide(page).getByRole("button", { name: "Tell them…" }).click();
  const box = guide(page).getByRole("textbox", { name: "Your answer" });
  await expect(box).toHaveValue("Tell them ");
  await box.pressSequentially(words);
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
}

test("a message from one sentence, scheduled for tomorrow 10:00", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  // As the server has it: the copy job saved its title and body before the page replays them.
  const { set } = await stubDraft(page, { title: "Closed on Friday", body: "<p>The studio is closed this Friday.</p>" });
  await stubCopyRun(page, "Closed on Friday", "<p>The studio is closed this Friday.</p>");
  const answered: [string, string][] = [
    ["topic", "Tell them the studio is closed on Friday"],
    ["audience", "All my students"],
    ["when", "Tuesday 20 October at 10:00"],
  ];
  const sent = await stubFocus(page, (path, body) => {
    if (path.endsWith("/finish/")) {
      set({ status: "scheduled", scheduled_at: "2026-10-20T08:00:00Z" });
      return { ...state({ status: "done", record: RECORD, answered }), closing: "Scheduled for Tuesday 20 October at 10:00." };
    }
    if (body.field === "review")
      return state({ record: RECORD, question: Q.finish, answered: [...answered, ["review", "Looks good"]], copy: { status: "ready", run: COPY_RUN } });
    // Her one sentence said who and when: the copy is written and the review is next.
    return state({ record: RECORD, question: Q.review, answered, copy: { status: "ready", run: COPY_RUN } });
  });

  await sendFirst(page, "the studio is closed on Friday, all my students, tomorrow at 10:00");
  await expect(page).toHaveURL(new RegExp(`/admin/messages/new\\?draft=${DRAFT}$`));
  await expect(guide(page).getByText("Here's your message. Does it fit?")).toBeVisible();
  await expect(guide(page).getByText("Tuesday 20 October at 10:00")).toBeVisible();
  // The copy typed in; nothing here sends, schedules or picks who gets it.
  await expect(titleBox(page)).toHaveValue("Closed on Friday");
  await expect(titleBox(page)).toHaveAttribute("maxlength", "200"); // Announcement.title
  await expect(page.getByRole("main").getByText("The studio is closed this Friday.")).toBeVisible();
  await expect(page.getByRole("button", { name: /send now|schedule/i })).toHaveCount(0);

  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await expect(guide(page).getByText("Ready. Send it?")).toBeVisible();
  // She did not say "by email too": the tick starts off.
  const email = guide(page).getByRole("checkbox", { name: "Also by email" });
  await expect(email).not.toBeChecked();
  await expect(guide(page).getByText("Tell my students")).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: true, announce: false });
  // The toast says when it goes out, not "Published".
  await expect(page.getByText("Scheduled for Tuesday 20 October at 10:00.")).toBeVisible();
  await expect(page.getByText("Published.", { exact: false })).toHaveCount(0);
  expect(sent[0]).toMatchObject({ kind: "message", text: "Tell them the studio is closed on Friday, all my students, tomorrow at 10:00" });
  // Sent: its own page.
  await expect(page).toHaveURL(new RegExp(`/admin/messages/${DRAFT}$`));
  await page.close();
});

test("students of one course: the tile shows how many", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubDraft(page);
  const sent = await stubFocus(page, (_path, body) =>
    body.field === "audience"
      ? state({ record: RECORD, question: Q.review, answered: [["topic", "Tell them the studio is closed"], ["audience", "Students of Desk Yoga"]], copy: { status: "ready", run: COPY_RUN } })
      : state({ record: RECORD, question: Q.audience, answered: [["topic", "Tell them the studio is closed"]] }),
  );
  await stubCopyRun(page, "Closed on Friday", "<p>Closed.</p>");

  await sendFirst(page, "the studio is closed");
  await expect(guide(page).getByText("Who should get it?")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "All my students (5 students)" })).toBeVisible();
  const tile = guide(page).getByRole("button", { name: /Students of Desk Yoga/ });
  await expect(tile).toContainText("2 students");
  await tile.click();
  await expect(guide(page).getByText("Here's your message. Does it fit?")).toBeVisible();
  const picked = sent.find((s) => s.field === "audience");
  expect(picked?.value).toBe("course:3");
  expect(picked?.text).toBeUndefined(); // a tap: never read by a model
  await page.close();
});

test("send is not offered with nobody to receive it", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const { set } = await stubDraft(page, { body: "<p>Closed.</p>" });
  const atFinish = state({
    record: RECORD,
    question: Q.nobody,
    answered: [["topic", "Tell them the studio is closed"], ["audience", "Students of Desk Yoga"], ["review", "Looks good"], ["when", "Now"]],
  });
  // Keep writes who, when and the email tick onto the draft (backend message.keep): a time still to come.
  const at = new Date(Date.now() + 3 * 86_400_000);
  at.setSeconds(0, 0);
  const sent = await stubFocus(
    page,
    (path) => {
      if (path.endsWith("/finish/"))
        set({ also_email: true, scheduled_at: at.toISOString(), filters: { content_type: "course", content_id: 3 } });
      return { ...atFinish, status: "done", question: null };
    },
    atFinish,
  );

  // She comes back to its page: focus mode resumes where she stopped.
  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Nobody would receive it yet.", { exact: false })).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(guide(page).getByRole("checkbox")).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Keep as a draft" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: false, announce: true });
  // The plain composer opens with what Keep wrote: by email, and her time on this browser's clock.
  const main = page.getByRole("main");
  await expect(main.getByText("Reviewing draft", { exact: false })).toBeVisible();
  await expect(main.getByRole("checkbox", { name: /also send it as an email/i })).toBeChecked();
  const local = await page.evaluate((iso) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, at.toISOString());
  await expect(main.locator('input[type="datetime-local"]')).toHaveValue(local);
  await page.close();
});

test("a follow-up being written says it is about her message", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubDraft(page);
  const thinking = state({
    record: RECORD,
    answered: [["topic", "A reminder about tomorrow"], ["audience", "All my students"]],
    thinking: { status: "building", run: COPY_RUN, specialist: "community" },
  });
  await stubFocus(page, () => thinking, thinking);

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Thinking about your message…")).toBeVisible();
  await expect(guide(page).getByText("Thinking about your course…")).toHaveCount(0);
  await page.close();
});

// --- Getting in from the assistant (G23) ---

const ASKED = "tell my students the studio is closed on Friday";

/** The assistant answers every message with a draft_announcement card. */
async function stubAssistantCard(page: Page) {
  let chat: Body | null = null;
  const executed: Body[] = [];
  const at = () => new Date().toISOString();
  await page.route(/\/api\/v1\/admin\/copilot\/chats\//, async (route) => {
    const req = route.request();
    const listing = new URL(req.url()).pathname.endsWith("/chats/");
    const stamp = { id: 998, title: "e2e", updated_at: at() };
    if (req.method() === "POST") {
      chat = { ...stamp, entries: req.postDataJSON().entries ?? [] };
      return route.fulfill({ status: 201, json: chat });
    }
    if (req.method() === "PATCH" && chat) {
      chat = { ...chat, entries: req.postDataJSON().entries ?? chat.entries };
      return route.fulfill({ json: chat });
    }
    if (listing) return route.fulfill({ json: { chats: chat ? [chat] : [] } });
    return route.fulfill({ json: chat ?? { ...stamp, entries: [] } });
  });
  await page.route("**/api/v1/admin/copilot/runs/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith("/runs/") && req.method() === "POST")
      return route.fulfill({ status: 201, json: { id: 4242, status: "queued", specialist: "community" } });
    if (path.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (path.endsWith("/runs/4242/seen/")) return route.fulfill({ status: 204, body: "" });
    if (!path.endsWith("/runs/4242/")) return route.fallback();
    const card = { kind: "draft_announcement", title: "Draft message: Closed on Friday", detail: "", token: "e2e-focus-message-card" };
    const events = [
      { seq: 1, type: "thinking", data: {}, at: at() },
      { seq: 2, type: "reply", data: { payload: { kind: "actions", text: "Let's write it.", actions: [card] } }, at: at() },
      { seq: 3, type: "done", data: {}, at: at() },
    ];
    return route.fulfill({ json: { id: 4242, status: "done", specialist: "community", chat: 998, seen: false, events } });
  });
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed.push(route.request().postDataJSON());
    await route.fulfill({ json: { result: { kind: "draft_announcement", id: 1, title: "x", url: "/admin/messages" } } });
  });
  return { executed };
}

test("the assistant's draft_announcement card offers Start it", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubDraft(page);
  const sent = await stubFocus(page, () =>
    state({ record: RECORD, question: Q.audience, answered: [["topic", "Tell them the studio is closed on Friday"]] }),
  );
  const { executed } = await stubAssistantCard(page);

  await page.goto(`${TENANT}/admin/blog?assistant=assistant`);
  await page.getByTestId("copilot-input").fill(ASKED);
  await page.getByTestId("copilot-send").click();
  await expect(page.getByText("Let's make it together, one question at a time.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Start it" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/messages/new\\?draft=${DRAFT}$`));
  await expect(guide(page).getByText("Who should get it?")).toBeVisible();
  expect(sent.filter((s) => s.path.endsWith("/admin/focus/"))).toEqual([
    expect.objectContaining({ kind: "message", text: ASKED }),
  ]);
  // The assistant's own draft token stays unused.
  expect(executed).toEqual([]);
  await page.close();
});

// --- Her typing (G5) ---

test("her title is kept when the copy types after she changed it", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const { patches, set } = await stubDraft(page, { title: "Closed on Friday" });
  const run = await stubCopyRun(page, "The studio is closed Friday", "<p>No classes this Friday.</p>", true);
  const atReview = state({
    record: RECORD,
    question: Q.review,
    answered: [["topic", "Tell them the studio is closed on Friday"], ["audience", "All my students"]],
    copy: { status: "building", run: COPY_RUN },
  });
  await stubFocus(page, () => atReview, atReview);

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Writing your message…")).toBeVisible();
  await expect(titleBox(page)).toHaveValue("Closed on Friday");
  await titleBox(page).fill("No yoga this Friday");
  await expect.poll(() => patches.at(-1)?.title).toBe("No yoga this Friday");
  // Then the copy is written: the body types in, her title stays.
  set({ body: "<p>No classes this Friday.</p>" });
  run.release();
  await expect(page.getByRole("main").getByText("No classes this Friday.")).toBeVisible();
  await expect(titleBox(page)).toHaveValue("No yoga this Friday");
  await page.waitForTimeout(1500); // the replay has settled and the draft was loaded again
  await expect(titleBox(page)).toHaveValue("No yoga this Friday");
  expect(patches.every((p) => p.title === undefined || p.title === "No yoga this Friday")).toBe(true);
  await page.close();
});

test("typing then leaving saves her text", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const { patches } = await stubDraft(page, { title: "Closed on Friday", body: "<p>Closed.</p>" });
  const atReview = state({
    record: RECORD,
    question: Q.review,
    answered: [["topic", "Tell them the studio is closed on Friday"], ["audience", "All my students"]],
  });
  const sent = await stubFocus(page, (path) => (path.endsWith("/leave/") ? { ...atReview } : atReview), atReview);

  await page.goto(`${TENANT}${PATH}`);
  await expect(titleBox(page)).toHaveValue("Closed on Friday");
  // She types and leaves at once, before the save a moment later.
  await titleBox(page).fill("Closed all weekend");
  await page.getByRole("button", { name: "Save & leave" }).click();
  await expect(page).toHaveURL(/\/admin\/messages$/);
  expect(patches.map((p) => p.title)).toContain("Closed all weekend");
  // Save & leave: it stays open to resume.
  const leave = sent.find((s) => s.path.endsWith("/leave/"));
  expect(leave).toBeDefined();
  expect(leave?.abandon).toBeUndefined();
  await page.close();
});

test("Write it myself after her first answer ends focus mode and makes no hidden draft", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubDraft(page, { title: "Closed on Friday" });
  const sent = await stubFocus(page, (path) =>
    path.endsWith("/leave/")
      ? state({ record: RECORD, status: "left" })
      : state({ record: RECORD, question: Q.audience, answered: [["topic", "Tell them the studio is closed"]] }),
  );
  const created: Body[] = [];
  await page.route("**/api/v1/admin/notifications/announcements/", (route) => {
    if (route.request().method() === "POST") created.push(route.request().postDataJSON());
    return route.fallback();
  });

  await sendFirst(page, "the studio is closed");
  await expect(page).toHaveURL(new RegExp(`/admin/messages/new\\?draft=${DRAFT}$`));
  await expect(guide(page).getByText("Who should get it?")).toBeVisible();
  await guide(page).getByRole("button", { name: "Write it myself" }).click();
  // Focus mode ends: no guide, the chat is back, and she writes this draft herself.
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & leave" })).toHaveCount(0);
  await expect(page.getByTestId("copilot-input")).toBeVisible();
  await expect.poll(() => sent.find((s) => s.path.endsWith("/leave/"))).toMatchObject({ abandon: true });
  await expect(page.getByText("Reviewing draft", { exact: false })).toBeVisible();
  await expect(titleBox(page)).toHaveValue("Closed on Friday");
  await expect(page.getByRole("button", { name: /send now/i })).toBeVisible();
  expect(sent.filter((s) => s.path.endsWith("/answer/"))).toEqual([]);
  expect(created).toEqual([]);
  await page.close();
});

test("write it myself before her first answer opens today's composer", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const sent = await stubFocus(page, () => state({}));

  await page.goto(`${TENANT}/admin/messages/new`);
  await expect(guide(page).getByText("What do you want to tell your students?")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Write it myself" }).click();
  await expect(page).toHaveURL(/\/admin\/messages\/new\?form=1$/);
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByTestId("copilot-input")).toBeVisible();
  await expect(titleBox(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /send now/i })).toBeVisible();
  expect(sent).toEqual([]);
  await page.close();
});
