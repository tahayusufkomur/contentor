// e2e/specs/33-focus-course.spec.ts
//
// Focus mode (backend/apps/core/focus/; frontend components/focus/): "New
// course" asks one question at a time in the docked guide while the course
// page takes shape. The focus endpoints, the outline run and the course are
// stubbed at the network layer (real AI is slow and non-deterministic, and
// the spec must not depend on the FOCUS_MODE_ENABLED switch); what is under
// test is the loop on screen: question -> tap -> next question -> the outline
// typed onto the page -> review -> finish -> the studio is itself again.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const COURSE_ID = 987_001;
const SLUG = "e2e-focus-desk-yoga";
const CREATION = 77;
const RUN = 5150;
const CHAT = 4242;
const RECORD = `course:${COURSE_ID}`;
const DESC_RUN = 5151;
const LESSON_IDS = [9100, 9101];
// Long enough to type for about two seconds each at the replay's 60 characters
// a second, so the count passes "1 of 2" on screen.
const DESCRIPTIONS = [
  "A five minute routine you can do in your chair: sit tall, roll your shoulders back and let your neck soften.",
  "Wrap up by standing, reaching overhead and taking three slow breaths before you head back to your work.",
];

const option = (value: string, label: string, hint = "") => ({ value, label, hint });
const question = (field: string, kind: string, text: string, extra: Body = {}) => ({
  field,
  kind,
  question: text,
  why: "",
  options: [],
  starter: null,
  can_delegate: kind === "text" || kind === "choice",
  specialist: field === "finish" ? "marketing" : "content",
  ...extra,
});
const QUESTIONS: Record<string, Body> = {
  topic: question("topic", "text", "What will your students learn?", { starter: "A course on " }),
  level: question("level", "choice", "Who is it for?", {
    options: [
      option("beginners", "Complete beginners"),
      option("some", "Some experience"),
      option("advanced", "Advanced"),
    ],
  }),
  size: question("size", "choice", "How big should it be?", {
    options: [
      option("quick", "Quick win", "1 module · 3–4 lessons"),
      option("short", "Short course", "3 modules · about 12 lessons"),
      option("full", "Full program", "6 modules"),
    ],
  }),
  outline_review: question("outline_review", "review", "Here's your outline. Does it fit?"),
  finish: question("finish", "finish", "Ready. Publish it now?", {
    options: [option("publish", "Publish now"), option("draft", "Keep as a draft")],
  }),
};
const ORDER = ["topic", "level", "size", "outline_review", "finish"];

const MODULES = [
  { title: "Getting started at your desk", lessons: ["Setting up your chair", "A first stretch"] },
  { title: "Breathing breaks", lessons: ["Box breathing"] },
];

const at = () => new Date().toISOString();
const EVENTS = [
  { type: "step", data: { specialist: "content", label: "Writing your outline", state: "start" } },
  { type: "field", data: { record: RECORD, name: "title", value: "Desk yoga, gently" } },
  { type: "field", data: { record: RECORD, name: "description", value: "For office workers." } },
  ...MODULES.map((value) => ({ type: "row", data: { record: RECORD, kind: "module", value } })),
  { type: "step", data: { specialist: "content", label: "Writing your outline", state: "done" } },
  { type: "done", data: { text: "Your outline is ready: 2 modules, 3 lessons." } },
].map((event, i) => ({ seq: i + 1, at: at(), ...event }));

/** A creation at the outline review, the way the backend reports it after her
 *  details were read: her answers as lines, the outline ready on the page. */
const reviewState = (over: Body = {}): Body => ({
  id: CREATION,
  kind: "course",
  status: "active",
  chat: CHAT,
  record: { id: COURSE_ID, slug: SLUG, path: `/admin/courses/${SLUG}`, title: "Desk yoga, gently" },
  question: QUESTIONS.outline_review,
  answered: [
    { field: "topic", label: "A course on desk yoga" },
    { field: "size", label: "4 modules · 3 lessons each" },
    { field: "access", label: "$49" },
  ],
  outline: { status: "ready", run: RUN },
  reading: null,
  descriptions: null,
  steps: ORDER.map((id) => ({ id, done: id === "topic" })),
  ...over,
});
const READING = reviewState({
  question: null,
  answered: [],
  outline: { status: "idle", run: null },
  reading: { status: "building", run: 6000, specialist: "content" },
});

function courseDetail(written: boolean, described = false): Body {
  return {
    id: COURSE_ID,
    title: written ? "Desk yoga, gently" : "Desk yoga",
    slug: SLUG,
    description: written ? "For office workers." : "",
    instructor: 1,
    instructor_name: "Coach",
    thumbnail_url: "",
    thumbnail_id: null,
    price: "0.00",
    pricing_type: "free",
    is_published: false,
    order: 0,
    created_at: at(),
    updated_at: at(),
    modules: written
      ? MODULES.map((m, i) => ({
          id: 9000 + i,
          course: COURSE_ID,
          title: m.title,
          order: i + 1,
          lessons: m.lessons.map((title, j) => ({
            id: 9100 + i * 10 + j,
            module: 9000 + i,
            title,
            order: j + 1,
            video_id: null,
            video_url: "",
            duration_seconds: 0,
            content_html: described && i === 0 ? `<p>${DESCRIPTIONS[j]}</p>` : "",
            is_free_preview: false,
            video_signed_url: null,
          })),
        }))
      : [],
    is_enrolled: false,
    lesson_count: written ? 3 : 0,
    enrolled_count: 0,
    thumbnail_signed_url: null,
    cover_design: null,
    access_info: { has_access: true, pricing_type: "free", price: 0, currency: "USD", access_reason: "owner", unlock_methods: null },
    unlock_options: {},
    filter_options: [],
    tags: [],
  };
}

/** A small in-memory focus backend: the creation's answers, its outline run
 *  (done at its first poll) and the course behind it. With ``open: false``
 *  no creation is open: the course page is the plain editor. With ``ready:
 *  false`` a lesson is still empty, so the last step offers no publishing. */
async function stubFocus(
  page: Page,
  {
    open = true,
    ready = true,
    descriptions = false,
    script,
  }: {
    open?: boolean;
    ready?: boolean;
    /** After "Looks good", the lesson descriptions run (DESC_RUN) writes. */
    descriptions?: boolean;
    /** Answers a focus request itself (a state), or leaves it to the stub. */
    script?: (req: { path: string; method: string; body: Body }) => Body | undefined;
  } = {},
) {
  const answers: Record<string, string> = {};
  let created = false;
  let published = false;
  const saved: Body[] = [];
  let edits: Body = {};
  let runStarted = false;
  let runPolled = false;
  let status = "active";
  const sent: Body[] = [];
  let descStart: number | null = null;
  let descStopped = false;
  const descDone = () => descStopped || (descStart !== null && Date.now() - descStart > 8000);

  const current = () => (status === "active" ? ORDER.find((f) => !(f in answers)) : undefined);
  const outline = () => ({
    status: !runStarted ? "idle" : runPolled ? "ready" : "building",
    run: runStarted ? RUN : null,
  });
  const state = () => {
    const field = current();
    return {
      id: CREATION,
      kind: "course",
      status,
      chat: CHAT,
      record: { id: COURSE_ID, slug: SLUG, path: `/admin/courses/${SLUG}`, title: runPolled ? "Desk yoga, gently" : "Desk yoga" },
      question:
        field === "finish" && !ready
          ? {
              ...QUESTIONS.finish,
              question: "Your outline is saved. Next, your lessons.",
              options: [option("draft", "Keep as a draft")],
              specialist: "content",
            }
          : field
            ? QUESTIONS[field]
            : null,
      answered: ORDER.filter((f) => f in answers).map((f) => ({ field: f, label: answers[f] })),
      outline: outline(),
      reading: null,
      descriptions:
        descriptions && "outline_review" in answers
          ? { status: descStopped ? "failed" : descDone() ? "ready" : "building", run: DESC_RUN }
          : null,
      steps: ORDER.map((id) => ({ id, done: id in answers })),
    };
  };
  const settle = () => {
    if (!runStarted && ["topic", "level", "size"].every((f) => f in answers)) runStarted = true;
  };

  await page.route(/\/api\/v1\/admin\/focus\/.*/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body: Body = req.method() === "POST" ? (req.postDataJSON() ?? {}) : {};
    if (req.method() === "POST") sent.push({ path, ...body });
    const scripted = script?.({ path, method: req.method(), body });
    if (scripted) return route.fulfill({ status: req.method() === "POST" && path.endsWith("/admin/focus/") ? 201 : 200, json: scripted });
    if (path.endsWith("/admin/focus/") && req.method() === "GET")
      return route.fulfill({
        json: {
          enabled: true,
          kinds: ["course"],
          first: { course: QUESTIONS.topic },
          open: created && status === "active" ? [{ id: CREATION, kind: "course", record: state().record }] : [],
        },
      });
    if (path.endsWith("/admin/focus/")) {
      created = true;
      answers.topic = body.text ?? "You decide";
      if (body.rest) for (const f of ["level", "size"]) answers[f] = "You decide";
      settle();
      return route.fulfill({ status: 201, json: state() });
    }
    if (path.endsWith("/answer/")) {
      const field = body.field;
      if (field === current()) {
        if (body.rest) {
          for (const f of ["level", "size"]) if (!(f in answers)) answers[f] = "You decide";
        } else if (field === "outline_review") {
          if (body.value === "ok") answers.outline_review = "Looks good";
        } else {
          const picked = QUESTIONS[field].options.find((o: Body) => o.value === body.value);
          answers[field] = picked?.label ?? body.text ?? "You decide";
        }
        settle();
      }
      return route.fulfill({ json: state() });
    }
    if (path.endsWith("/finish/")) {
      answers.finish = body.publish ? "Publish now" : "Keep as a draft";
      published = !!body.publish;
      status = "done";
      return route.fulfill({ json: state() });
    }
    if (path.endsWith("/leave/")) {
      if (body.abandon) status = "left";
      return route.fulfill({ json: state() });
    }
    return route.fulfill({ json: state() }); // GET /focus/<id>/
  });

  await page.route("**/api/v1/admin/copilot/runs/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
    if (url.pathname.includes(`/runs/${DESC_RUN}/`)) {
      if (url.pathname.endsWith("/stop/")) {
        sent.push({ path: url.pathname });
        descStopped = true;
        return route.fulfill({ json: { status: "stopped" } });
      }
      // Working until it has typed both descriptions, then done.
      descStart ??= Date.now();
      const done = descDone();
      const label = "Writing lesson descriptions";
      const events = [
        { type: "step", data: { specialist: "content", label, state: "start", total: 2 } },
        ...LESSON_IDS.map((id, i) => ({
          type: "field",
          data: { record: `lesson:${id}`, name: "content_html", value: DESCRIPTIONS[i] },
        })),
        ...(done ? [{ type: "step", data: { specialist: "content", label, state: "done" } }] : []),
      ].map((event, i) => ({ seq: i + 1, at: at(), ...event }));
      const since = Number(url.searchParams.get("since") ?? 0);
      return route.fulfill({
        json: {
          id: DESC_RUN,
          status: descStopped ? "stopped" : done ? "done" : "working",
          specialist: "content",
          chat: CHAT,
          seen: false,
          events: events.filter((e) => e.seq > since),
        },
      });
    }
    if (!url.pathname.includes(`/runs/${RUN}/`)) return route.fallback();
    runPolled = true;
    const since = Number(url.searchParams.get("since") ?? 0);
    return route.fulfill({
      json: {
        id: RUN,
        status: "done",
        specialist: "content",
        chat: CHAT,
        seen: false,
        events: EVENTS.filter((e) => e.seq > since),
      },
    });
  });

  await page.route(`**/api/v1/courses/${SLUG}/`, (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      saved.push(body);
      edits = { ...body };
      if (body.is_published !== undefined) published = body.is_published;
      return route.fulfill({ json: { ...courseDetail(runPolled || !open, descDone()), ...edits } });
    }
    return route.fulfill({
      json: { ...courseDetail(runPolled || !open, descDone()), ...edits, is_published: published },
    });
  });

  // How students get the course: free for everyone until she sets otherwise.
  let ways: Body = { free: { window: null }, buy: null, plans: [] };
  await page.route(`**/api/v1/admin/access/course/${COURSE_ID}/`, (route) => {
    const req = route.request();
    if (req.method() === "PUT") ways = req.postDataJSON().ways;
    return route.fulfill({
      json: {
        kind: "course",
        id: COURSE_ID,
        ways,
        describe: ways.buy ? `Sold once for ${ways.buy.price}.` : "Free for everyone.",
        currency: "USD",
        allowed: ["free", "buy", "plans"],
        can_edit_plans: true,
        plans: [],
        bundles: [],
      },
    });
  });

  // The chat the dock opens once focus mode ends: the whole exchange.
  await page.route(/\/api\/v1\/admin\/copilot\/chats\/.*/, (route) => {
    const listing = new URL(route.request().url()).pathname.endsWith("/chats/");
    const chat = {
      id: CHAT,
      title: "New course: Desk yoga",
      updated_at: at(),
      entries: [
        { role: "assistant", text: "Ready. Publish it now?" },
        { role: "coach", text: "Keep as a draft" },
      ],
    };
    return route.fulfill({ json: listing ? { chats: [chat] } : chat });
  });

  return { sent, saved };
}

const guide = (page: Page) => page.getByRole("complementary", { name: "New course" });

async function answerTopic(page: Page) {
  await page.goto(`${TENANT}/admin/courses/new`);
  await expect(guide(page).getByText("What will your students learn?")).toBeVisible();
  await guide(page).getByRole("textbox", { name: "Your answer" }).fill("A course on desk yoga");
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
  await expect(guide(page).getByText("Who is it for?")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/courses/${SLUG}$`));
}

/** Her first answer on the new-course page; the guide then reads it. */
async function answerReadingTopic(page: Page) {
  await page.goto(`${TENANT}/admin/courses/new`);
  await guide(page).getByRole("textbox", { name: "Your answer" }).fill("A course on desk yoga, 4 modules of 3 lessons, $49");
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/courses/${SLUG}$`));
}

test("a new course is built one question at a time", async ({ browser }) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();
  const { sent } = await stubFocus(page);

  await answerTopic(page);
  // The side menu is tucked away while she makes it.
  await expect(page.getByRole("button", { name: "Save & leave" })).toBeVisible();

  await guide(page).getByRole("button", { name: /Complete beginners/ }).click();
  await expect(guide(page).getByText("How big should it be?")).toBeVisible();
  await guide(page).getByRole("button", { name: /Short course/ }).click();

  // The outline is typed onto the page, then the saved modules take over.
  await expect(page.getByRole("main").getByText("Module 1: Getting started at your desk")).toBeVisible();
  await expect(page.getByRole("main").getByText("Module 2: Breathing breaks")).toBeVisible();
  await expect(page.locator("#title")).toHaveValue("Desk yoga, gently");

  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  await guide(page).getByRole("button", { name: "Keep as a draft" }).click();

  // Focus mode ends: no guide, the top bar's search is back, the dock is the chat.
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & leave" })).toHaveCount(0);
  await expect(page.getByText("Edit Course")).toBeVisible();
  await expect(page.getByTestId("copilot-input")).toBeVisible();

  expect(sent.map((s) => s.field ?? s.path.split("/").filter(Boolean).pop())).toEqual([
    "topic",
    "level",
    "size",
    "outline_review",
    "finish",
  ]);
  expect(sent.every((s) => typeof s.active_ms === "number")).toBe(true);
  await page.close();
});

test("just draft it skips to the outline", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await stubFocus(page);

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await expect(guide(page).getByRole("button", { name: "Looks good, continue" })).toBeVisible();
  expect(sent.at(-1)).toMatchObject({ field: "level", rest: true });
  await page.close();
});

test("fill it in myself is today's form", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page);

  await page.goto(`${TENANT}/admin/courses/new`);
  await page.getByRole("link", { name: "Fill it in myself" }).click();
  await expect(page).toHaveURL(/\/admin\/courses\/new\?form=1$/);
  await expect(page.getByRole("heading", { name: "New Course" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Course" })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await page.close();
});

test("fill it in myself on the course page ends focus mode for good", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await stubFocus(page);

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Fill it in myself" }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByText("Edit Course")).toBeVisible();
  expect(sent.at(-1)).toMatchObject({ abandon: true });
  // Reopening the course is the plain editor now.
  await page.reload();
  await expect(page.getByText("Edit Course")).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await page.close();
});

test("an outline with empty lessons cannot be published", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page, { ready: false });

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await expect(guide(page).getByText("Next, your lessons.")).toBeVisible();
  // Not Marketing's step yet: no hand-over line.
  await expect(guide(page).getByText(/here: let's get it out there/)).toHaveCount(0);
  await expect(guide(page).getByRole("button", { name: "Publish now" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Keep as a draft" }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.close();
});

test("publish now leaves the editor showing it published", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { saved } = await stubFocus(page);

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Published", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#published")).toBeChecked();
  // Her next save keeps it published.
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].is_published).toBe(true);
  await page.close();
});

test("on a phone, publishing leaves her on the page, not under the chat", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await stubFocus(page);

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  // The team chat would be a sheet over the whole page: it stays closed (the toast says it).
  await expect(page.getByRole("dialog", { name: "Your team" })).toHaveCount(0);
  await expect(page.locator("#published")).toBeChecked();
  await page.close();
});

test("a title she typed on the page is saved before her Publish tap", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { saved } = await stubFocus(page);
  const order: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "PUT" && req.url().includes(`/courses/${SLUG}/`)) order.push("save");
    if (req.url().endsWith("/finish/")) order.push("finish");
  });

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await page.getByRole("main").locator("#title").fill("Desk yoga, her way");
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  // What the page showed is what went live.
  expect(order).toEqual(["save", "finish"]);
  expect(saved[0]).toMatchObject({ title: "Desk yoga, her way" });
  await page.close();
});

test("save & leave saves what she typed on the page", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { saved } = await stubFocus(page);

  await answerTopic(page);
  await page.locator("#title").fill("My own title");
  await page.getByRole("button", { name: "Save & leave" }).click();
  await expect(page).toHaveURL(/\/admin\/courses$/);
  expect(saved.at(-1)?.title).toBe("My own title");
  await page.close();
});

test("back to the new-course page starts afresh", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page);

  await answerTopic(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/courses\/new$/);
  await expect(guide(page).getByText("What will your students learn?")).toBeVisible();
  await expect(guide(page).getByText("Who is it for?")).toHaveCount(0);
  await page.close();
});

test("a saved setting in the plain editor leaves nothing unsaved", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page, { open: false });

  await page.goto(`${TENANT}/admin/courses/${SLUG}`);
  await page.locator("#access-course-buy").click();
  await page.locator("#access-course-price").fill("19");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.locator("#access-course-price")).toHaveValue("19.00");
  await expect(page.getByRole("button", { name: "Design a cover" })).toBeEnabled();
  await page.close();
});

test("a rich first answer goes straight to the outline", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page, {
    script: ({ path, method }) => {
      if (method === "POST" && path.endsWith("/admin/focus/")) return READING;
      if (method === "GET" && path.endsWith(`/focus/${CREATION}/`)) return reviewState();
    },
  });

  await answerReadingTopic(page);
  await expect(guide(page).getByText("Reading your details…")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Stop" })).toBeVisible();
  // The next read: her details are lines, then the outline is on the page.
  await expect(guide(page).getByText("4 modules · 3 lessons each")).toBeVisible();
  await expect(guide(page).getByText("$49")).toBeVisible();
  await expect(guide(page).getByText("Reading your details…")).toHaveCount(0);
  await expect(guide(page).getByRole("button", { name: "Looks good, continue" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Module 1: Getting started at your desk")).toBeVisible();
  await page.close();
});

test("an unclear detail gets one short question", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const clarify = reviewState({
    question: question("clarify", "choice", "Did you mean 3 lessons in each module?", {
      options: [option("3", "3 lessons each", "12 in all"), option("4", "4 lessons each", "16 in all")],
    }),
    outline: { status: "idle", run: null },
    answered: [{ field: "topic", label: "A course on desk yoga" }],
  });
  const { sent } = await stubFocus(page, {
    script: ({ path, method }) => {
      if (method === "POST" && path.endsWith("/admin/focus/")) return READING;
      if (method === "GET" && path.endsWith(`/focus/${CREATION}/`)) return clarify;
      if (method === "POST" && path.endsWith("/answer/")) return reviewState();
    },
  });

  await answerReadingTopic(page);
  await expect(guide(page).getByText("Did you mean 3 lessons in each module?")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "You decide" })).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Just draft it" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: /3 lessons each/ }).click();
  await expect(guide(page).getByRole("button", { name: "Looks good, continue" })).toBeVisible();
  expect(sent.filter((s) => s.field === "clarify")).toEqual([
    expect.objectContaining({ field: "clarify", value: "3" }),
  ]);
  await page.close();
});

test("a follow-up is written while she waits, then one tap answers it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const answered = [{ field: "topic", label: "A course on desk yoga" }];
  const thinking = reviewState({
    question: null,
    answered,
    outline: { status: "idle", run: null },
    thinking: { status: "building", run: 6002, specialist: "content" },
  });
  const followup = reviewState({
    question: question("followup", "choice", "Where do your students practise?", {
      options: ["Office", "Home", "Both"].map((o) => option(o, o)),
    }),
    answered,
    outline: { status: "idle", run: null },
  });
  let polls = 0;
  const { sent } = await stubFocus(page, {
    script: ({ path, method }) => {
      if (method === "POST" && path.endsWith("/admin/focus/")) return thinking;
      if (method === "GET" && path.endsWith(`/focus/${CREATION}/`)) return polls++ ? followup : thinking;
      if (method === "POST" && path.endsWith("/answer/")) return reviewState();
    },
  });

  await answerReadingTopic(page);
  await expect(guide(page).getByText("Thinking about your course…")).toBeVisible();
  await expect(guide(page).getByText("Where do your students practise?")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Just draft it" })).toBeVisible();
  await guide(page).getByRole("button", { name: "Office" }).click();
  await expect(guide(page).getByRole("button", { name: "Looks good, continue" })).toBeVisible();
  expect(sent.filter((s) => s.field === "followup")).toEqual([
    expect.objectContaining({ field: "followup", value: "Office" }),
  ]);
  await page.close();
});

test("Stop while a follow-up is written goes on without it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const answered = [{ field: "topic", label: "A course on desk yoga" }];
  const thinking = reviewState({
    question: null,
    answered,
    outline: { status: "idle", run: null },
    thinking: { status: "building", run: 6002, specialist: "content" },
  });
  let stopped = false;
  await stubFocus(page, {
    script: ({ path, method }) => {
      if (method === "POST" && path.endsWith("/admin/focus/")) return thinking;
      if (method === "GET" && path.endsWith(`/focus/${CREATION}/`))
        return stopped ? reviewState({ question: QUESTIONS.level, answered, outline: { status: "idle", run: null } }) : thinking;
    },
  });
  await page.route("**/api/v1/admin/copilot/runs/6002/stop/", (route) => {
    stopped = true;
    return route.fulfill({ json: { status: "stopped" } });
  });

  await answerReadingTopic(page);
  await expect(guide(page).getByText("Thinking about your course…")).toBeVisible();
  await guide(page).getByRole("button", { name: "Stop" }).click();
  await expect(guide(page).getByText("Who is it for?")).toBeVisible();
  await expect(guide(page).getByText("Thinking about your course…")).toHaveCount(0);
  expect(stopped).toBe(true);
  await page.close();
});

test("lesson descriptions type in after Looks good, with a count and Stop", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await stubFocus(page, { descriptions: true });

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();

  const main = page.getByRole("main");
  await expect(guide(page).getByText("Writing a short description for each lesson's video.")).toBeVisible();
  await expect(main.getByText("writing lesson descriptions")).toBeVisible();
  await expect(main.getByText("1 of 2")).toBeVisible();
  // The second lesson is typing now: its pencil waits, the first one is hers.
  await expect(main.getByRole("row", { name: /A first stretch/ }).getByRole("button").first()).toBeDisabled();
  await expect(main.getByRole("row", { name: /Setting up your chair/ }).getByRole("button").first()).toBeEnabled();
  await expect(main.getByText(DESCRIPTIONS[0].slice(0, 20))).toBeVisible();
  await expect(main.getByText("2 of 2")).toBeVisible();
  await expect(main.getByText(DESCRIPTIONS[1].slice(0, 20))).toBeVisible();

  await main.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => sent.some((s) => s.path.endsWith(`/runs/${DESC_RUN}/stop/`))).toBe(true);
  await expect(main.getByText("2 of 2")).toHaveCount(0);
  // The saved text takes over from the typing, and the note leaves the dock.
  await expect(main.getByText(DESCRIPTIONS[0])).toBeVisible();
  await expect(guide(page).getByText("Writing a short description for each lesson's video.")).toHaveCount(0);
  // A stopped run reads as failed: the dock offers Try again, the text stays on the page.
  await expect(guide(page).getByText("Some lesson descriptions didn't come through.")).toBeVisible();
  await expect(main.getByText(DESCRIPTIONS[1])).toBeVisible();
  await page.close();
});

test("saving a lesson without touching its text never sends the text", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page, { open: false });
  const puts: Body[] = [];
  await page.route(`**/api/v1/courses/${SLUG}/lessons/*/`, (route) => {
    puts.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  // The course as loaded again once the descriptions were written.
  let delivered = false;
  await page.route(`**/api/v1/courses/${SLUG}/`, (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: courseDetail(true, delivered) }) : route.fallback(),
  );
  await page.route(`**/api/v1/courses/${SLUG}/modules/`, (route) => route.fulfill({ json: {} }));

  await page.goto(`${TENANT}/admin/courses/${SLUG}`);
  const main = page.getByRole("main");
  // Her lesson panel opens while the lesson has no text...
  await main.getByRole("row", { name: /Setting up your chair/ }).getByRole("button").first().click();
  const panel = main.locator("div.border-t.bg-muted\\/30");
  await expect(panel).toBeVisible();
  // ...then the description arrives and the course reloads (any save does that).
  delivered = true;
  await main.getByPlaceholder("New module title").fill("Closing");
  await main.getByRole("button", { name: "Add Module" }).click();
  await expect(main.getByText(DESCRIPTIONS[0].slice(0, 20))).toBeVisible();
  // She only renames the lesson: the description she never saw is not written over.
  await panel.getByRole("textbox").first().fill("Setting up your desk");
  await main.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0].title).toBe("Setting up your desk");
  expect(puts[0]).not.toHaveProperty("content_html");
  await page.close();
});

test("Stop while a description is typing still lands what was written", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await stubFocus(page, { descriptions: true });

  await answerTopic(page);
  await guide(page).getByRole("button", { name: "Just draft it" }).click();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();

  const main = page.getByRole("main");
  await expect(main.getByText("1 of 2")).toBeVisible();
  await main.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => sent.some((s) => s.path.endsWith(`/runs/${DESC_RUN}/stop/`))).toBe(true);
  // The run reads as failed from the next poll, yet its text is on the page, whole.
  await expect(guide(page).getByText("Some lesson descriptions didn't come through.")).toBeVisible();
  await expect(main.getByText(DESCRIPTIONS[1])).toBeVisible();
  await expect(main.getByText(DESCRIPTIONS[0])).toBeVisible();
  await page.close();
});

// ---- The cover step: the Designer's four drafts on the page, the guide asks.

const COVER_Q = question("cover", "cover", "Which cover fits your course?", {
  specialist: "designer",
  can_delegate: false,
});
const DESIGN = "33333333-3333-4333-8333-333333333333";
const PHOTO_A = "11111111-1111-4111-8111-111111111111";
const PHOTO_B = "22222222-2222-4222-8222-222222222222";
// Tiny images, distinct per photo: the drafts redraw with the photo she tapped.
const pixel = (rgb: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#${rgb}"/></svg>`)}`;
const URL_A = pixel("aa7744");
const URL_B = pixel("3366aa");
const LAYOUTS = ["full", "panel", "title", "band"];
const coverRecipe = (layout: string, photo: string | null) => ({
  version: 1,
  layout,
  photo: { id: layout === "title" ? null : photo, focus: [0.5, 0.5], zoom: 1, brightness: 1, contrast: 1, saturation: 1, darken: 0 },
  words: { label: "", title: null, subtitle: "Five minutes at your desk" },
  badge: { kind: "none", text: "", fill: "accent" },
  logo: false,
  panel: "primary",
  styles: {},
  extras: [],
  overrides: {},
});
const coverPayload = (photo: { id: string; url: string } = { id: PHOTO_A, url: URL_A }, over: Body = {}) => ({
  status: "ready",
  run: 7100,
  round: 1,
  drafts: LAYOUTS.map((layout, i) => ({
    id: `d${i}`,
    recipe: coverRecipe(layout, photo.id),
    photos: { [photo.id]: photo.url },
    logo_url: null,
    look: "journal",
  })),
  photo,
  query: "",
  ...over,
});
const COVER_ORDER = ["topic", "level", "size", "outline_review", "cover", "finish"];
const coverState = (over: Body = {}): Body =>
  reviewState({
    question: COVER_Q,
    answered: [
      { field: "topic", label: "A course on desk yoga" },
      { field: "outline_review", label: "Looks good, continue" },
    ],
    cover: coverPayload(),
    steps: COVER_ORDER.map((id) => ({ id, done: COVER_ORDER.indexOf(id) < 4 })),
    ...over,
  });
const finishState = () =>
  coverState({
    question: QUESTIONS.finish,
    answered: [
      { field: "topic", label: "A course on desk yoga" },
      { field: "outline_review", label: "Looks good, continue" },
      { field: "cover", label: "Cover chosen" },
    ],
    steps: COVER_ORDER.map((id) => ({ id, done: id !== "finish" })),
  });
const PHOTOS = [
  { asset_id: `own:${PHOTO_A}`, url: URL_A, title: "My studio", mine: true },
  { asset_id: "lib-standing-desk", url: URL_B, title: "Standing desk", mine: false },
];

/** The course page at the cover step. ``onFocus`` answers the creation's
 *  requests (the state, the cover taps); ``photos`` collects the row's searches. */
async function openAtCover(page: Page, onFocus: (req: { path: string; method: string; body: Body }) => Body | undefined) {
  const tracked = await stubFocus(page, {
    open: false, // the course as written
    script: (req) => {
      if (req.method === "GET" && req.path.endsWith("/admin/focus/"))
        return { enabled: true, kinds: ["course"], first: { course: QUESTIONS.topic }, open: [{ id: CREATION, kind: "course", record: coverState().record }] };
      if (req.path.includes("/photos/")) return undefined;
      return onFocus(req);
    },
  });
  const searches: string[] = [];
  await page.route(`**/api/v1/admin/focus/${CREATION}/photos/**`, (route) => {
    const url = new URL(route.request().url());
    searches.push(url.searchParams.get("q") ?? "");
    return route.fulfill({ json: { results: PHOTOS, has_next: false } });
  });
  // Never a real photo generation from a spec.
  const allowances: string[] = [];
  await page.route("**/api/v1/curated-images/generate/**", (route) => {
    allowances.push(route.request().method());
    return route.fulfill({ json: { limit: 0, used: 0, left: 0 } });
  });
  await page.goto(`${TENANT}/admin/courses/${SLUG}`);
  await expect(guide(page).getByText("Which cover fits your course?")).toBeVisible();
  return { ...tracked, searches, allowances };
}

const coverStep = (page: Page) => page.getByRole("main").getByRole("group", { name: "Cover" });

test("the cover step offers four styles and the photo they share", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  let photo = { id: PHOTO_A, url: URL_A };
  const { sent } = await openAtCover(page, ({ path, method, body }) => {
    if (method === "POST" && path.endsWith("/cover/") && body.action === "photo") photo = { id: PHOTO_B, url: URL_B };
    if (path.endsWith(`/focus/${CREATION}/`) || path.endsWith("/cover/")) return coverState({ cover: coverPayload(photo) });
  });

  // The Designer takes over, in one line.
  await expect(guide(page).getByText("Designer here: let's make your cover.")).toBeVisible();
  const step = coverStep(page);
  await expect(step.locator("[data-cover]")).toHaveCount(4);
  for (const caption of ["Photo, title over it", "Photo and colour panel", "Title only", "Photo, band across it"])
    await expect(step.getByText(caption, { exact: true })).toBeVisible();
  await expect(step.locator(`[data-cover] img[src="${URL_A}"]`)).toHaveCount(3);
  // Her photo first, labelled; the library's after it; and Upload.
  await expect(step.getByRole("button", { name: /My studio/ })).toContainText("Yours");
  await expect(step.getByText("Upload")).toBeVisible();
  // The row has no next page: More photos has nothing to fetch.
  await expect(guide(page).getByRole("button", { name: "More photos" })).toBeDisabled();

  await step.getByRole("button", { name: /Standing desk/ }).click();
  await expect.poll(() => sent.find((s) => s.action === "photo")).toMatchObject({ action: "photo", asset_id: "lib-standing-desk" });
  // Every photo style wears it now.
  await expect(step.locator(`[data-cover] img[src="${URL_B}"]`)).toHaveCount(3);
  await page.close();
});

test("use this cover keeps it and moves on to finish", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  let kept = false;
  const { sent } = await openAtCover(page, ({ path, method, body }) => {
    if (method === "POST" && path.endsWith("/cover/") && body.action === "keep") kept = true;
    if (path.endsWith(`/focus/${CREATION}/`) || path.endsWith("/cover/")) return kept ? finishState() : coverState();
  });

  const use = guide(page).getByRole("button", { name: "Use this cover" });
  await expect(use).toBeDisabled();
  await expect(guide(page).getByRole("button", { name: "I'll edit it" })).toBeDisabled();
  await coverStep(page).getByRole("button", { name: /Photo and colour panel/ }).click();
  await expect(coverStep(page).getByRole("button", { name: /Photo and colour panel/ })).toHaveAttribute("aria-pressed", "true");
  await use.click();

  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  await expect(guide(page).getByText("Cover chosen")).toBeVisible();
  await expect(coverStep(page)).toHaveCount(0);
  expect(sent.filter((s) => s.action === "keep")).toEqual([expect.objectContaining({ action: "keep", index: 1 })]);
  await page.close();
});

test("I'll edit it opens the photo studio and Keep brings her back", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  let kept = false;
  await openAtCover(page, ({ path, method, body }) => {
    if (method === "POST" && path.endsWith("/cover/") && body.action === "edit") return { ...coverState(), design_id: DESIGN };
    if (path.endsWith(`/focus/${CREATION}/`) || path.endsWith("/cover/")) return kept ? finishState() : coverState();
  });
  // The photo studio on that draft: the design, her covers, and Keep.
  const record = {
    ...coverPayload().drafts[0],
    id: DESIGN,
    kind: "cover",
    target_kind: "course",
    target_key: String(COURSE_ID),
    state: "draft",
    made_by: "designer",
    run_id: "",
    created_at: at(),
    updated_at: at(),
    kept_at: null,
    title: "Desk yoga, gently",
  };
  await page.route(`**/api/v1/designs/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/targets/"))
      return route.fulfill({
        json: {
          targets: [
            { target_kind: "course", target_key: String(COURSE_ID), title: "Desk yoga, gently", sessions: null, next_at: null, status: "draft", created_at: at(), photo_url: null, cover: null, draft_id: DESIGN },
          ],
          in_use: {},
          look: "journal",
          logo_url: null,
          generations_left: 0,
        },
      });
    if (url.pathname.endsWith("/keep/")) {
      kept = true;
      return route.fulfill({
        json: { result: { id: COURSE_ID, design_id: DESIGN, title: "Desk yoga, gently", target_kind: "course", target_key: String(COURSE_ID) }, audit_id: null },
      });
    }
    if (url.pathname.endsWith(`/designs/${DESIGN}/`)) return route.fulfill({ json: record });
    return route.fulfill({ json: [] }); // her kept designs
  });

  await coverStep(page).getByRole("button", { name: /Photo, title over it/ }).click();
  await guide(page).getByRole("button", { name: "I'll edit it" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/studio/${DESIGN}\\?back=/admin/courses/${SLUG}$`), { timeout: 30_000 });
  await page.getByRole("button", { name: "Keep on course" }).first().click({ timeout: 30_000 });
  // Back on the course, at the next step.
  await expect(page).toHaveURL(new RegExp(`/admin/courses/${SLUG}$`));
  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  await page.close();
});

test("saying a photo searches the row", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const WORDS = "a man at a standing desk";
  let said = false;
  let reads = 0;
  const { sent, searches } = await openAtCover(page, ({ path, method }) => {
    if (method === "POST" && path.endsWith("/answer/")) {
      said = true;
      return coverState({ question: null, reading: { status: "building", run: 6001, specialist: "designer" } });
    }
    if (path.endsWith(`/focus/${CREATION}/`)) {
      if (!said) return coverState();
      // One read while the analysis runs, then her words are the photo's.
      reads += 1;
      return reads < 2
        ? coverState({ question: null, reading: { status: "building", run: 6001, specialist: "designer" } })
        : coverState({ cover: coverPayload(undefined, { query: WORDS }) });
    }
  });

  await expect.poll(() => searches.length).toBeGreaterThan(0);
  await guide(page).getByRole("textbox", { name: "Your answer" }).fill(WORDS);
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
  await expect(guide(page).getByText("Reading your details…")).toBeVisible();
  // Her words about the photo are the Designer's to read.
  await expect(guide(page).getByText("Designer", { exact: true })).toBeVisible();
  // The drafts stay on the page while she waits.
  await expect(coverStep(page).locator("[data-cover]")).toHaveCount(4);
  await expect.poll(() => searches).toContain(WORDS);
  await expect(guide(page).getByText("Which cover fits your course?")).toBeVisible();
  expect(sent.filter((s) => s.field === "cover")).toEqual([expect.objectContaining({ field: "cover", text: WORDS })]);
  await page.close();
});

test("a failed photo search never makes a photo; an empty one asks the allowance", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  let fail = true;
  const { searches, allowances } = await openAtCover(page, ({ path }) => {
    if (path.endsWith(`/focus/${CREATION}/`)) return coverState({ cover: coverPayload(undefined, { query: fail ? "a red bicycle" : "a blue kite" }) });
  });
  await page.route(`**/api/v1/admin/focus/${CREATION}/photos/**`, (route) => {
    searches.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: { results: [], has_next: false } });
  });
  await page.reload();
  await expect.poll(() => searches).toContain("a red bicycle");
  await page.waitForTimeout(1000);
  expect(allowances).toEqual([]);

  // The search works and finds nothing: only then is a photo considered (none left here).
  fail = false;
  await page.reload();
  await expect.poll(() => searches).toContain("a blue kite");
  await expect.poll(() => allowances).toEqual(["GET"]);
  await page.close();
});

const ACCESS_Q = question("access", "price", "How will students get it?", {
  specialist: "finance",
  why: "You can change it any time.",
  options: [
    option("free", "Free"),
    option("paid:39", "One-time price: $39", "Your other courses sell for $29–$49"),
    option("plan:3", "In Gold"),
  ],
  suggested: "paid:39",
  multi: true,
  ticked: ["paid:39"],
  can_delegate: false,
});

/** The course page with the creation at ``at()``'s step; ``onFocus`` sees each request first. */
async function openAt(page: Page, at: () => Body, onFocus: (req: { path: string; method: string; body: Body }) => void = () => {}) {
  const tracked = await stubFocus(page, {
    open: false,
    script: (req) => {
      if (req.method === "GET" && req.path.endsWith("/admin/focus/"))
        return { enabled: true, kinds: ["course"], first: { course: QUESTIONS.topic }, open: [{ id: CREATION, kind: "course", record: coverState().record }] };
      onFocus(req);
      if (req.path.endsWith(`/focus/${CREATION}/`) || req.path.endsWith("/answer/")) return at();
    },
  });
  await page.goto(`${TENANT}/admin/courses/${SLUG}`);
  return tracked;
}

/** The course page at the access step; ``sent`` is every request the guide made. */
async function atAccess(page: Page) {
  let priced = false;
  return openAt(
    page,
    () => (priced ? finishState() : coverState({ question: ACCESS_Q, cover: null })),
    ({ path, body }) => {
      if (path.endsWith("/answer/") && body.field === "access" && body.value) priced = true;
    },
  );
}

test("the access step: she ticks every way in, the suggestion ticked to start", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await atAccess(page);

  await expect(guide(page).getByText("How will students get it?")).toBeVisible();
  await expect(guide(page).getByText("Financial Strategist here: let's decide how students get it.")).toBeVisible();
  // Named once: the hand-over line, not the question's byline under it too.
  await expect(guide(page).getByText("Financial Strategist", { exact: true })).toBeHidden();
  const paid = guide(page).getByRole("button", { name: /One-time price: \$39/ });
  await expect(paid).toContainText("Your other courses sell for $29–$49");
  await expect(paid).toHaveAttribute("aria-pressed", "true");
  await expect(guide(page).getByRole("button", { name: "You decide" })).toBeHidden();

  await guide(page).getByRole("button", { name: "In Gold" }).click();
  await guide(page).getByRole("button", { name: "Continue with 2" }).click();
  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  expect(sent.filter((s) => s.field === "access")).toEqual([
    expect.objectContaining({ field: "access", value: "paid:39,plan:3" }),
  ]);
  await page.close();
});

test("the access step: Add a time limit sends her ticks and brings up Access on the page", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await atAccess(page);

  await guide(page).getByRole("button", { name: "Add a time limit" }).click();
  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  expect(sent.filter((s) => s.field === "access")).toEqual([
    expect.objectContaining({ field: "access", value: "paid:39" }),
  ]);
  await expect(page.locator("[data-access-section]")).toBeInViewport();
  await page.close();
});

test("after a change that didn't come through, Looks good goes on with the outline on the page", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  let confirmed = false;
  const { sent } = await openAt(
    page,
    () => (confirmed ? finishState() : reviewState({ outline: { status: "failed", run: RUN, drafted: true } })),
    ({ path, body }) => {
      if (path.endsWith("/answer/") && body.value === "ok") confirmed = true;
    },
  );

  await expect(guide(page).getByText("The outline didn't come through.")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Try again" })).toBeVisible();
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  expect(sent.filter((s) => s.field === "outline_review")).toEqual([
    expect.objectContaining({ field: "outline_review", value: "ok" }),
  ]);
  await page.close();
});

test("a paid course she cannot sell yet: start selling keeps it a draft and opens her plan", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await openAt(page, () => ({
    ...finishState(),
    question: {
      ...QUESTIONS.finish,
      options: [option("start_selling", "Start selling", "your plan, then payouts"), option("draft", "Keep as a draft")],
      paid_active: false,
    },
  }));

  await expect(guide(page).getByRole("button", { name: "Publish now" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Start selling" }).click();
  await expect(page).toHaveURL(new RegExp("/admin/billing"));
  expect(sent.find((s) => s.path.endsWith("/finish/"))).toMatchObject({ publish: false });
  await page.close();
});

test("publish now, then schedule the announcement", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const ANNOUNCE_Q = question("announce", "announce", "Tell your students?", { specialist: "marketing" });
  let step: "finish" | "writing" | "ready" | "done" = "finish";
  let reads = 0;
  const now = (): Body => {
    if (step === "finish") return finishState();
    if (step === "done") return { ...finishState(), status: "done", question: null };
    return {
      ...finishState(),
      question: ANNOUNCE_Q,
      announcement: {
        status: step === "writing" ? "building" : "ready",
        run: 7300,
        id: step === "writing" ? null : 31,
        title: step === "writing" ? "" : "Desk yoga, gently is live",
        body: step === "writing" ? "" : "A short course for office workers, in five minute breaks.",
        send_at: step === "writing" ? null : "2026-10-20T10:00:00-04:00",
        zone: step === "writing" ? null : "America/New_York",
      },
    };
  };
  const { sent } = await stubFocus(page, {
    open: false,
    script: ({ path, method }) => {
      if (method === "GET" && path.endsWith("/admin/focus/"))
        return { enabled: true, kinds: ["course"], first: { course: QUESTIONS.topic }, open: step === "done" ? [] : [{ id: CREATION, kind: "course", record: coverState().record }] };
      if (path.endsWith("/finish/")) step = "writing";
      else if (path.endsWith("/announce/")) step = "done";
      else if (step === "writing" && ++reads > 1) step = "ready"; // a poll: written on the second
      return now();
    },
  });
  await page.goto(`${TENANT}/admin/courses/${SLUG}`);

  await expect(guide(page).getByText("Ready. Publish it now?")).toBeVisible();
  const tell = guide(page).getByRole("checkbox", { name: "Tell my students" });
  await expect(tell).toBeChecked();
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  // Marketing writes while she waits, then shows the draft and when it would go out.
  await expect(guide(page).getByText("Writing your announcement…")).toBeVisible();
  await expect(guide(page).getByText("Desk yoga, gently is live")).toBeVisible();
  await expect(guide(page).getByText("A short course for office workers, in five minute breaks.")).toBeVisible();
  // On her site's clock, as the closing line says it (the browser here may be elsewhere).
  await expect(guide(page).getByText(/^Sends .*2026.*10[:.]00/)).toBeVisible();
  await guide(page).getByRole("button", { name: "Schedule" }).click();
  // Focus mode ends.
  await expect(guide(page)).toHaveCount(0);
  expect(sent.find((s) => s.path.endsWith("/finish/"))).toMatchObject({ publish: true, announce: true });
  expect(sent.filter((s) => s.path.endsWith("/announce/"))).toEqual([expect.objectContaining({ schedule: true })]);
  await page.close();
});

// --- Getting in from the assistant (F7), and "Continue your course" ---

const ASKED = "make me a course about desk yoga";
const COURSE_CARD = {
  kind: "create_course",
  title: "Create draft course: Desk yoga",
  detail: "2 module(s), 3 lesson(s) — free",
  token: "e2e-focus-card",
};

/** The assistant answers every message with a create_course card. Registered
 *  after stubFocus, so its chat and run routes win; anything else falls back. */
async function stubAssistantCard(page: Page) {
  let chat: Body | null = null;
  const executed: Body[] = [];
  await page.route(/\/api\/v1\/admin\/copilot\/chats\//, async (route) => {
    const req = route.request();
    const listing = new URL(req.url()).pathname.endsWith("/chats/");
    const stamp = { id: 999, title: "e2e", updated_at: at() };
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
      return route.fulfill({
        status: 201,
        json: { id: 4241, status: "queued", specialist: "content" },
      });
    if (path.endsWith("/runs/open/"))
      return route.fulfill({ json: { runs: [] } });
    if (path.endsWith("/runs/4241/seen/"))
      return route.fulfill({ status: 204, body: "" });
    if (!path.endsWith("/runs/4241/")) return route.fallback();
    const events = [
      { seq: 1, type: "thinking", data: {}, at: at() },
      {
        seq: 2,
        type: "reply",
        data: {
          payload: {
            kind: "actions",
            text: "Lovely, let's make it.",
            actions: [COURSE_CARD],
          },
        },
        at: at(),
      },
      { seq: 3, type: "done", data: {}, at: at() },
    ];
    return route.fulfill({
      json: {
        id: 4241,
        status: "done",
        specialist: "content",
        chat: 999,
        seen: false,
        events,
      },
    });
  });
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        result: {
          kind: "create_course",
          id: 1,
          title: "x",
          url: "/admin/courses/x",
        },
      },
    });
  });
  return { executed };
}

const askAssistant = async (page: Page, words = ASKED) => {
  await page.getByTestId("copilot-input").fill(words);
  await page.getByTestId("copilot-send").click();
};

test("asking the assistant for a course on the courses list opens focus mode with her words", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await stubFocus(page);
  const { executed } = await stubAssistantCard(page);

  await page.goto(`${TENANT}/admin/courses?assistant=assistant`);
  await askAssistant(page);

  // Her words are the first answer, and focus mode is on without another tap.
  await expect(page).toHaveURL(new RegExp(`/admin/courses/${SLUG}$`));
  await expect(guide(page).getByText("Who is it for?")).toBeVisible();
  expect(sent.filter((s) => s.path.endsWith("/admin/focus/"))).toEqual([
    expect.objectContaining({ kind: "course", text: ASKED }),
  ]);
  // The assistant's own create token stays unused.
  expect(executed).toEqual([]);
  await page.close();
});

test("asked elsewhere, the assistant offers Start it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const { sent } = await stubFocus(page);
  const { executed } = await stubAssistantCard(page);

  await page.goto(`${TENANT}/admin/blog?assistant=assistant`);
  await askAssistant(page);

  await expect(
    page.getByText("Let's make it together, one question at a time."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toHaveCount(0);
  // Her screen does not move on its own.
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/admin\/blog\?assistant=assistant$/);
  expect(sent).toEqual([]);

  await page.getByRole("button", { name: "Start it" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/courses/${SLUG}$`));
  await expect(guide(page).getByText("Who is it for?")).toBeVisible();
  expect(sent.filter((s) => s.path.endsWith("/admin/focus/"))).toEqual([
    expect.objectContaining({ kind: "course", text: ASKED }),
  ]);
  expect(executed).toEqual([]);
  await page.close();
});

test("home shows Continue your course for one in progress", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await stubFocus(page, {
    script: ({ path, method }) => {
      if (method === "GET" && path.endsWith("/admin/focus/"))
        return {
          enabled: true,
          kinds: ["course"],
          first: { course: QUESTIONS.topic },
          open: [
            {
              id: CREATION,
              kind: "course",
              record: { id: COURSE_ID, slug: SLUG, path: `/admin/courses/${SLUG}`, title: "Desk yoga, gently" },
            },
          ],
        };
    },
  });

  await page.goto(`${TENANT}/admin`);
  const link = page.getByRole("link", {
    name: "Continue your course: Desk yoga, gently",
  });
  await expect(link).toHaveAttribute("href", `/admin/courses/${SLUG}`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/admin/courses/${SLUG}$`));
  await page.close();
});

test("asking for a small change at outline review keeps unchanged parts in place and only highlights the change", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  const REDRAFT_RUN = 5160;
  let redraftPhase: "idle" | "working" | "done" = "idle";
  const REDRAFT_MODULES = [
    MODULES[0],
    {
      title: MODULES[1].title,
      lessons: [...MODULES[1].lessons, "Day 21: Closing flow"],
    },
  ];
  const REDRAFT_EVENTS = [
    {
      type: "step",
      data: {
        specialist: "content",
        label: "Writing your outline",
        state: "start",
      },
    },
    ...REDRAFT_MODULES.map((value) => ({
      type: "row",
      data: { record: RECORD, kind: "module", value },
    })),
    {
      type: "step",
      data: {
        specialist: "content",
        label: "Writing your outline",
        state: "done",
      },
    },
    {
      type: "done",
      data: { text: "Your outline is ready: 2 modules, 4 lessons." },
    },
  ].map((event, i) => ({ seq: i + 1, at: at(), ...event }));

  await stubFocus(page, {
    open: false,
    script: ({ path, method, body }) => {
      if (method === "GET" && path.endsWith("/admin/focus/"))
        return {
          enabled: true,
          kinds: ["course"],
          first: { course: QUESTIONS.topic },
          open: [
            {
              id: CREATION,
              kind: "course",
              record: reviewState().record,
            },
          ],
        };
      if (method === "POST" && path.endsWith("/answer/") && body.field === "outline_review") {
        redraftPhase = "working";
        return reviewState({
          outline: { status: "building", run: REDRAFT_RUN, drafted: true },
        });
      }
      if (method === "GET" && path.endsWith(`/focus/${CREATION}/`)) {
        if (redraftPhase === "working")
          return reviewState({
            outline: { status: "building", run: REDRAFT_RUN, drafted: true },
          });
        if (redraftPhase === "done")
          return reviewState({
            outline: { status: "ready", run: REDRAFT_RUN, drafted: true },
          });
        return reviewState();
      }
    },
  });

  await page.route(`**/api/v1/admin/copilot/runs/${REDRAFT_RUN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/seen/"))
      return route.fulfill({ status: 204, body: "" });
    const since = Number(url.searchParams.get("since") ?? 0);
    const events =
      redraftPhase === "working" ? REDRAFT_EVENTS.slice(0, 1) : REDRAFT_EVENTS;
    return route.fulfill({
      json: {
        id: REDRAFT_RUN,
        status: redraftPhase === "done" ? "done" : "working",
        specialist: "content",
        chat: CHAT,
        seen: false,
        events: events.filter((e) => e.seq > since),
      },
    });
  });

  await page.route(`**/api/v1/courses/${SLUG}/`, (route) => {
    const base = courseDetail(true);
    if (redraftPhase === "done") {
      base.modules = REDRAFT_MODULES.map((m, i) => ({
        id: 9000 + i,
        course: COURSE_ID,
        title: m.title,
        order: i + 1,
        lessons: m.lessons.map((title, j) => ({
          id: 9100 + i * 10 + j,
          module: 9000 + i,
          title,
          order: j + 1,
          video_id: null,
          video_url: "",
          duration_seconds: 0,
          content_html: "",
          is_free_preview: false,
          video_signed_url: null,
        })),
      }));
      base.lesson_count = 4;
    }
    return route.fulfill({ json: base });
  });

  await page.goto(`${TENANT}/admin/courses/${SLUG}`);
  const main = page.getByRole("main");
  await expect(guide(page).getByText("Here's your outline. Does it fit?")).toBeVisible();
  await expect(main.getByText("Module 1: Getting started at your desk")).toBeVisible();
  await expect(main.getByText("Module 2: Breathing breaks")).toBeVisible();

  await guide(page).getByRole("textbox", { name: "Your answer" }).fill("You forgot the 21st day");
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();

  // 1. While the redraft runs, existing title, description, modules, and lessons stay visible in place.
  await expect(guide(page).getByText("Writing your outline…")).toBeVisible();
  await expect(page.locator("#title")).toHaveValue("Desk yoga, gently");
  await expect(page.locator("#description")).toHaveValue("For office workers.");
  await expect(main.getByText("Module 1: Getting started at your desk")).toBeVisible();
  await expect(main.getByText("Setting up your chair")).toBeVisible();
  await expect(main.getByText("A first stretch")).toBeVisible();
  await expect(main.getByText("Module 2: Breathing breaks")).toBeVisible();
  await expect(main.getByText("Box breathing")).toBeVisible();

  // 2. When the redraft finishes, only the added lesson and its module are highlighted as changed.
  redraftPhase = "done";
  await expect(main.getByText("Day 21: Closing flow")).toBeVisible();
  await expect(
    main.getByRole("row", { name: /Day 21: Closing flow/ }),
  ).toHaveAttribute("data-changed", "true");
  await expect(
    main.getByRole("row", { name: /Setting up your chair/ }),
  ).not.toHaveAttribute("data-changed", "true");
  await expect(
    main.getByRole("row", { name: /Box breathing/ }),
  ).not.toHaveAttribute("data-changed", "true");
  await expect(page.locator("#title")).not.toHaveAttribute("data-changed", "true");
  await expect(page.locator("#description")).not.toHaveAttribute("data-changed", "true");

  await page.close();
});
