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

function courseDetail(written: boolean): Body {
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
            content_html: "",
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
 *  (done at its first poll) and the course behind it. */
async function stubFocus(page: Page) {
  const answers: Record<string, string> = {};
  let created = false;
  let runStarted = false;
  let runPolled = false;
  let status = "active";
  const sent: Body[] = [];

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
      record: { id: COURSE_ID, slug: SLUG, title: runPolled ? "Desk yoga, gently" : "Desk yoga" },
      question: field ? QUESTIONS[field] : null,
      answered: ORDER.filter((f) => f in answers).map((f) => ({ field: f, label: answers[f] })),
      outline: outline(),
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
    if (path.endsWith("/admin/focus/") && req.method() === "GET")
      return route.fulfill({
        json: {
          enabled: true,
          first: { course: QUESTIONS.topic },
          open: created && status === "active" ? [{ id: CREATION, kind: "course", record: state().record }] : [],
        },
      });
    if (path.endsWith("/admin/focus/")) {
      created = true;
      answers.topic = body.text ?? "You decide";
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
      status = "done";
      return route.fulfill({ json: state() });
    }
    if (path.endsWith("/leave/")) return route.fulfill({ json: state() });
    return route.fulfill({ json: state() }); // GET /focus/<id>/
  });

  await page.route("**/api/v1/admin/copilot/runs/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
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

  await page.route(`**/api/v1/courses/${SLUG}/`, (route) =>
    route.fulfill({ json: courseDetail(runPolled) }),
  );

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

  return { sent };
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
