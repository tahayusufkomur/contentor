// e2e/specs/34-focus-event.spec.ts
//
// Focus mode for a class or event (backend apps/core/focus/kinds/event.py;
// frontend app/admin/live, components/admin/live/event-form.tsx,
// components/focus/schedule-question.tsx). As in 33-focus-course, the focus
// endpoints, the copy run and the event rows are stubbed at the network layer
// (real AI is slow and non-deterministic, and the spec must not depend on the
// FOCUS_KINDS switch); what is under test is the loop on screen.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const CREATION = 88;
const COPY_RUN = 6160;
const ZONE = "Europe/Istanbul";
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const option = (value: string, label: string) => ({ value, label, hint: "" });
const question = (field: string, kind: string, text: string, extra: Body = {}) => ({
  field,
  kind,
  question: text,
  why: "",
  options: [],
  starter: null,
  can_delegate: false,
  specialist: field === "finish" ? "marketing" : "content",
  ...extra,
});
const Q: Record<string, Body> = {
  topic: question("topic", "text", "What's your class or event about?", { starter: "A class on ", can_delegate: true }),
  where: question("where", "choice", "Where will it happen?", {
    options: [
      option("live", "Live online"),
      option("stream", "Live stream"),
      option("zoom", "On Zoom"),
      option("onsite", "In person"),
    ],
  }),
  when: question("when", "schedule", "When is it?", { timezone: ZONE }),
  zoomLink: question("place", "text", "Paste your Zoom link", {
    starter: "https://zoom.us/j/",
    options: [option("later", "Add it later")],
  }),
  review: question("review", "review", "Here's your class. Does it fit?"),
  finish: question("finish", "finish", "Ready. Publish it?", {
    options: [option("publish", "Publish now"), option("draft", "Keep as a draft")],
  }),
};
const STEPS = ["topic", "where", "when", "place", "review", "cover", "access", "finish", "announce"];

const row = (kind: string, id: number, over: Body = {}): Body => ({
  id,
  kind,
  title: "Morning breath",
  description: "",
  status: "draft",
  computed_status: "draft",
  pricing_type: "free",
  price: "0.00",
  scheduled_at: null,
  created_at: new Date().toISOString(),
  duration_minutes: 60,
  cover_design: null,
  thumbnail_signed_url: null,
  filter_options: [],
  tags: [],
  auto_recording: false,
  zoom_link: "",
  location: "",
  address: "",
  max_capacity: null,
  ...over,
});
const API: Record<string, string> = {
  live: "/api/v1/live/",
  zoom: "/api/v1/zoom-classes/",
  onsite: "/api/v1/onsite-events/",
};
const record = (r: Body) => ({ id: r.id, kind: r.kind, title: r.title, path: `/admin/live?event=${r.id}&kind=${r.kind}` });

/** A creation as the backend reports it: `answered` as [field, label] pairs. */
const state = (over: Body & { answered?: [string, string][] }): Body => {
  const answered = (over.answered ?? []).map(([field, label]) => ({ field, label }));
  return {
    id: CREATION,
    kind: "event",
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
 *  returns the last state); `open` is the creation the overview lists first. */
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
          kinds: ["course", "event"],
          first: { event: Q.topic },
          open:
            current && current.status === "active"
              ? [{ id: CREATION, kind: "event", record: current.record, title: "Morning breath" }]
              : [],
        },
      });
    return route.fulfill({ json: current });
  });
  return sent;
}

/** One event row, read and saved by the form. */
async function stubRow(page: Page, initial: Body, onPut?: (body: Body, row: Body) => Body) {
  let current = initial;
  const puts: Body[] = [];
  await page.route(`**${API[initial.kind]}${initial.id}/`, (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      puts.push(body);
      current = onPut ? onPut(body, current) : { ...current, ...body };
    }
    return route.fulfill({ json: current });
  });
  return { puts, set: (next: Body) => (current = next) };
}

/** The copy run: done, with its title and description for `rec`. */
async function stubCopyRun(page: Page, rec: string, title: string, description: string) {
  const events = [
    { type: "step", data: { specialist: "content", label: "Writing your class", state: "start" } },
    { type: "field", data: { record: rec, name: "title", value: title } },
    { type: "field", data: { record: rec, name: "description", value: description } },
    { type: "step", data: { specialist: "content", label: "Writing your class", state: "done" } },
  ].map((event, i) => ({ seq: i + 1, at: new Date().toISOString(), ...event }));
  await page.route("**/api/v1/admin/copilot/runs/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
    if (!url.pathname.includes(`/runs/${COPY_RUN}/`)) return route.fallback();
    const since = Number(url.searchParams.get("since") ?? 0);
    return route.fulfill({
      json: { id: COPY_RUN, status: "done", specialist: "content", chat: null, seen: false, events: events.filter((e) => e.seq > since) },
    });
  });
}

const guide = (page: Page) => page.getByRole("complementary", { name: "New class or event" });

async function sendFirst(page: Page, text: string) {
  await page.goto(`${TENANT}/admin/live?new=1`);
  await expect(guide(page).getByText("What's your class or event about?")).toBeVisible();
  await guide(page).getByRole("textbox", { name: "Your answer" }).fill(text);
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
}

test("a weekly in-person class from one rich first answer", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  // As the server has it: the copy job saves its title and description before the page replays them.
  const onsite = row("onsite", 555, {
    title: "Yoga in the park",
    description: "Slow flow under the trees, for every level.",
    scheduled_at: future(2),
    address: "Moda Park",
    max_capacity: 12,
  });
  await stubRow(page, onsite);
  await stubCopyRun(page, "onsite:555", "Yoga in the park", "Slow flow under the trees, for every level.");
  const answered: [string, string][] = [
    ["topic", "Yoga in the park"],
    ["where", "In person"],
    ["when", "Tuesdays at 6 PM, for 8 weeks"],
    ["place", "Moda Park"],
  ];
  const sent = await stubFocus(page, (path, body) => {
    if (path.endsWith("/finish/")) return state({ status: "done", record: record(onsite), answered });
    if (body.field === "review")
      return state({ record: record(onsite), question: Q.finish, answered: [...answered, ["review", "Looks good"]], copy: { status: "ready", run: COPY_RUN } });
    // Her first answer said it all: where, when and the place are answered, and the copy is written.
    return state({ record: record(onsite), question: Q.review, answered, copy: { status: "ready", run: COPY_RUN } });
  });

  await sendFirst(page, "Yoga in the park, Tuesdays 18:00 for 8 weeks at Moda Park, 12 places");
  // Straight to its page: the in-person form, the copy typed in, her schedule under the date.
  await expect(page).toHaveURL(/\/admin\/live\?event=555&kind=onsite$/);
  await expect(guide(page).getByText("Here's your class. Does it fit?")).toBeVisible();
  await expect(page.locator("#event-kind")).toHaveValue("onsite");
  await expect(page.locator("#event-description")).toHaveValue("Slow flow under the trees, for every level.");
  await expect(page.locator("#event-title")).toHaveValue("Yoga in the park");
  await expect(page.locator("#event-address")).toHaveValue("Moda Park");
  await expect(page.getByRole("main").getByText("Tuesdays at 6 PM, for 8 weeks")).toBeVisible();
  await expect(page.getByRole("main").getByText(/^Times are in /)).toBeVisible();
  // Filters, tags and places wait behind All details.
  await expect(page.locator("#event-capacity")).toHaveCount(0);
  await page.getByRole("button", { name: "All details" }).click();
  await expect(page.locator("#event-capacity")).toHaveValue("12");

  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await expect(guide(page).getByText("Ready. Publish it?")).toBeVisible();
  await guide(page).getByRole("checkbox").click(); // no announcement this time
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.map((s) => s.field ?? s.path.split("/").filter(Boolean).pop())).toEqual(["topic", "review", "finish"]);
  expect(sent.at(-1)).toMatchObject({ publish: true, announce: false });
  await page.close();
});

test("the kind is asked when her first answer does not say it", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const live = row("live", 556);
  await stubRow(page, live);
  const sent = await stubFocus(page, (path, body) => {
    if (body.field === "when") return state({ record: record(live), question: Q.review, answered: [["topic", "A class on morning breath"], ["where", "Live online"], ["when", "Once"]] });
    if (body.field === "where") return state({ record: record(live), question: Q.when, answered: [["topic", "A class on morning breath"], ["where", "Live online"]] });
    return state({ question: Q.where, answered: [["topic", "A class on morning breath"]] }); // no record yet (G10)
  });

  await sendFirst(page, "A class on morning breath");
  await expect(guide(page).getByText("Where will it happen?")).toBeVisible();
  // No draft yet: the empty form with her working title, still on the new page.
  await expect(page).toHaveURL(/\/admin\/live\?new=1$/);
  await expect(page.locator("#event-title")).toHaveValue("Morning breath");

  await guide(page).getByRole("button", { name: "Live online" }).click();
  await expect(page).toHaveURL(/\/admin\/live\?event=556&kind=live$/);
  await expect(guide(page).getByText("When is it?")).toBeVisible();
  await expect(guide(page).getByText(`Times are in your time zone, ${ZONE}.`)).toBeVisible();
  await guide(page).getByRole("button", { name: "Once", exact: true }).click();
  await guide(page).getByLabel("Date and time").fill("2030-01-08T18:30");
  await guide(page).getByRole("button", { name: "Use this time" }).click();
  await expect(guide(page).getByText("Here's your class. Does it fit?")).toBeVisible();

  const when = sent.find((s) => s.field === "when");
  expect(when?.text).toBeUndefined(); // a tap: never read by a model
  expect(JSON.parse(when?.value)).toEqual({ mode: "once", at: "2030-01-08T18:30" });
  await page.close();
});

test("a Zoom class skips the price and asks for the link", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const zoom = row("zoom", 557, { title: "Office hours", scheduled_at: future(3) });
  const { set } = await stubRow(page, zoom);
  const answered: [string, string][] = [
    ["topic", "Office hours"],
    ["where", "On Zoom"],
    ["when", "Thursday 22 October at 18:00"],
    ["access", "Zoom classes are free to join."],
  ];
  const sent = await stubFocus(page, (_path, body) => {
    if (body.field === "place") {
      set({ ...zoom, zoom_link: body.text });
      return state({ record: record(zoom), question: Q.review, answered: [...answered, ["place", body.text]] });
    }
    return state({ record: record(zoom), question: Q.zoomLink, answered });
  });

  await sendFirst(page, "Office hours on Zoom, Thursday at 6pm");
  await expect(page).toHaveURL(/\/admin\/live\?event=557&kind=zoom$/);
  // Free, without a price question; the link is asked with its start written for her.
  await expect(guide(page).getByText("Zoom classes are free to join.")).toBeVisible();
  await expect(guide(page).getByText("Paste your Zoom link")).toBeVisible();
  await guide(page).getByRole("button", { name: "https://zoom.us/j/…" }).click();
  const box = guide(page).getByRole("textbox", { name: "Your answer" });
  await expect(box).toHaveValue("https://zoom.us/j/");
  await box.pressSequentially("8675309");
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();
  await expect(guide(page).getByText("Here's your class. Does it fit?")).toBeVisible();
  await expect(page.locator("#event-zoom")).toHaveValue("https://zoom.us/j/8675309");
  expect(sent.find((s) => s.field === "place")?.text).toBe("https://zoom.us/j/8675309");
  expect(sent.some((s) => s.field === "access")).toBe(false);
  await page.close();
});

test("keep as a draft holds the series and the form publishes it later", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const onsite = row("onsite", 558, { title: "Park yoga", scheduled_at: future(2), address: "Moda Park" });
  let publishes = 0;
  const { puts } = await stubRow(page, onsite, (body, current) => {
    if (!body.publish_series) return { ...current, ...body };
    publishes += 1;
    // The first press: its date passed meanwhile, so nothing went live. The second: published.
    return publishes === 1
      ? { ...current, ...body, status: "draft", scheduled_at: future(-1) }
      : { ...current, ...body, status: "scheduled", computed_status: "scheduled" };
  });
  const atFinish = state({
    record: record(onsite),
    question: Q.finish,
    answered: [["topic", "Park yoga"], ["where", "In person"], ["when", "Saturdays at 9 AM"], ["review", "Looks good"]],
  });
  const sent = await stubFocus(page, () => ({ ...atFinish, status: "done", question: null }), atFinish);

  // She comes back to its page: focus mode resumes where she stopped.
  await page.goto(`${TENANT}/admin/live?event=558&kind=onsite`);
  await expect(guide(page).getByText("Ready. Publish it?")).toBeVisible();
  await guide(page).getByRole("button", { name: "Keep as a draft" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: false });

  // The plain form: a held draft, with Publish for the whole series.
  await expect(page.getByText("Draft: your students do not see it yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Pick a future date first.").first()).toBeVisible();
  await expect(page.getByText("Published. Your students can see it now.")).toHaveCount(0);
  await page.locator("#event-when").fill("2030-01-08T09:00");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published. Your students can see it now.")).toBeVisible();
  expect(puts.map((p) => p.publish_series)).toEqual([true, true]);
  await page.close();
});

test("fill it in myself opens today's form", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const sent = await stubFocus(page, (path) =>
    path.endsWith("/leave/")
      ? state({ status: "left" })
      : state({ question: Q.where, answered: [["topic", "A class on morning breath"]] }),
  );
  const created = row("zoom", 9001, { title: "Hand made", status: "scheduled" });
  await page.route(`**${API.zoom}`, (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 201, json: created }) : route.fallback(),
  );

  // Her first answer did not say where, so there is no draft yet; then she fills it in herself.
  await sendFirst(page, "A class on morning breath");
  await expect(guide(page).getByText("Where will it happen?")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Fill it in myself" }).click();
  await expect(page).toHaveURL(/\/admin\/live\?new=1&form=1$/);
  // Focus mode ends: no guide, the menu and the chat are back, and no hidden draft is made.
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & leave" })).toHaveCount(0);
  await expect(page.getByTestId("copilot-input")).toBeVisible();
  await expect.poll(() => sent.find((s) => s.path.endsWith("/leave/"))).toMatchObject({ abandon: true });
  expect(sent.filter((s) => s.path.endsWith("/answer/"))).toEqual([]);
  await expect(page.getByText("Describe a class or a series and the assistant schedules it")).toHaveCount(0); // focus mode replaces it

  await page.locator("#event-kind").selectOption("zoom");
  await page.locator("#event-title").fill("Hand made");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Created.")).toBeVisible();
  // Her time to the create click, stamped for the comparison with focus mode.
  await expect.poll(() => sent.find((s) => s.path.endsWith("/form-timing/"))).toMatchObject({
    kind: "event",
    event_kind: "zoom",
    record_id: 9001,
  });
  await page.close();
});

test("her saved title survives a finished copy run on a later visit", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  // She changed the copy and saved it; the run that wrote the first one is long done.
  const onsite = row("onsite", 559, { title: "Breath at dawn", description: "Her own words.", scheduled_at: future(2) });
  await stubRow(page, onsite);
  await stubCopyRun(page, "onsite:559", "Yoga in the park", "Slow flow under the trees, for every level.");
  const atReview = state({
    record: record(onsite),
    question: Q.review,
    answered: [["topic", "Breath at dawn"], ["where", "In person"], ["when", "Saturdays at 9 AM"]],
    copy: { status: "ready", run: COPY_RUN },
  });
  await stubFocus(page, () => atReview, atReview);

  await page.goto(`${TENANT}/admin/live?event=559&kind=onsite`);
  await expect(guide(page).getByText("Here's your class. Does it fit?")).toBeVisible();
  await expect(page.locator("#event-title")).toHaveValue("Breath at dawn");
  await expect(page.locator("#event-description")).toHaveValue("Her own words.");
  await page.close();
});
