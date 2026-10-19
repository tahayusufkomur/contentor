// e2e/specs/37-focus-membership.spec.ts
//
// Focus mode for a membership (backend apps/core/focus/kinds/membership.py;
// frontend app/admin/store/plans/[id], components/focus/pick-question.tsx).
// As in 33-36, the focus endpoints, the copy run and the draft plan are
// stubbed at the network layer (real AI is slow and non-deterministic, and the
// spec must not depend on the FOCUS_KINDS switch); what is under test is the
// loop on screen.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const CREATION = 94;
const DRAFT = 9801;
const COPY_RUN = 6380;
const PATH = `/admin/store/plans/${DRAFT}`;

const option = (value: string, label: string, hint = "") => ({ value, label, hint });
const question = (field: string, kind: string, text: string, extra: Body = {}) => ({
  field,
  kind,
  question: text,
  why: "",
  options: [],
  starter: null,
  can_delegate: false,
  specialist: "finance",
  ...extra,
});
const ITEMS = [
  { value: "course:11", title: "Yoga basics", hint: "Course", type: "course" },
  { value: "course:12", title: "Pilates for runners", hint: "Course", type: "course" },
  { value: "download:13", title: "Morning workbook", hint: "Download", type: "download" },
];
const Q: Record<string, Body> = {
  topic: question("topic", "text", "What do members get?", {
    starter: "Members get ",
    can_delegate: true,
    options: [
      option("Digital membership", "Digital membership", "Every course and download"),
      option("All-access membership", "All-access membership", "Everything you make"),
    ],
  }),
  included: question("included", "pick", "What's included?", {
    options: ITEMS.map((i) => option(i.value, i.title, i.hint)),
    ticked: [],
  }),
  review: question("review", "review", "Here's your membership. Does it fit?", { specialist: "marketing" }),
  access: question("access", "price", "What should it cost?", {
    can_delegate: true,
    options: [
      option("month:9", "$9 a month", "A digital membership usually starts here"),
      option("year:90", "$90 a year", "Two months free"),
    ],
    suggested: "month:9",
    say: "Say an amount",
  }),
  finish: question("finish", "finish", "Ready. Put it on sale?", {
    options: [option("on_sale", "Put it on sale"), option("off_sale", "Keep it off sale")],
  }),
  // "Just draft it" left the price to her (backend flow.state): not ready, and "Sell it for".
  noPrice: question("finish", "finish", "Your membership is kept off sale.", {
    why: "Set its price first. Until then it stays a hidden draft.",
    options: [
      option("off_sale", "Keep it off sale"),
      option("price:9", "Sell it for $9 a month", "A digital membership usually starts here"),
    ],
  }),
};
const STEPS = ["topic", "included", "review", "access", "finish", "announce"];
const RECORD = { id: DRAFT, kind: "membership", title: "Digital membership", path: PATH };
const TOPIC: [string, string] = ["topic", "Digital membership"];

/** A creation as the backend reports it: `answered` as [field, label] pairs. */
const state = (over: Body & { answered?: [string, string][] }): Body => {
  const answered = (over.answered ?? []).map(([field, label]) => ({ field, label }));
  return {
    id: CREATION,
    kind: "membership",
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
async function stubFocus(
  page: Page,
  reply: (path: string, body: Body) => Body,
  open: Body | null = null,
  log: string[] = [],
) {
  const sent: Body[] = [];
  let current: Body | null = open;
  await page.route(/\/api\/v1\/admin\/focus\/.*/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST") {
      const body = req.postDataJSON() ?? {};
      sent.push({ path, ...body });
      if (path.endsWith("/form-timing/")) return route.fulfill({ status: 201, body: "" });
      log.push(body.field ? `answer:${body.field}` : path.endsWith("/finish/") ? "finish" : "focus");
      current = reply(path, body);
      return route.fulfill({ status: path.endsWith("/admin/focus/") ? 201 : 200, json: current });
    }
    if (path.endsWith("/admin/focus/"))
      return route.fulfill({
        json: {
          enabled: true,
          kinds: ["course", "event", "message", "download", "membership"],
          first: { membership: Q.topic },
          open:
            current && current.status === "active" && current.id
              ? [{ id: CREATION, kind: "membership", record: current.record }]
              : [],
        },
      });
    return route.fulfill({ json: current });
  });
  return sent;
}

/** The draft plan and what it includes, as the server keeps them (the guide's
 *  answers change them there; the page loads them again). */
async function stubPlan(page: Page, log: string[] = []) {
  let gets = 0;
  let plan: Body = {
    id: DRAFT,
    name: RECORD.title,
    description: "",
    price: "0.00",
    currency: "USD",
    billing_interval_months: 1,
    is_active: false,
  };
  let linked: string[] = [];
  await page.route(`**/api/v1/billing/plans/${DRAFT}/`, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      plan = { ...plan, ...req.postDataJSON() };
      log.push(`patch:${JSON.stringify(req.postDataJSON())}`);
    } else gets += 1;
    return route.fulfill({ json: plan });
  });
  const item = (i: (typeof ITEMS)[number]) => ({
    content_type: i.type,
    object_id: Number(i.value.split(":")[1]),
    title: i.title,
    price: "0.00",
    pricing_type: "free",
    window_text: "",
  });
  await page.route(`**/api/v1/billing/plans/${DRAFT}/access/`, (route) =>
    route.fulfill({
      json: { items: ITEMS.filter((i) => linked.includes(i.value)).map(item), available: ITEMS.map(item) },
    }),
  );
  return {
    set: (next: Body) => (plan = { ...plan, ...next }),
    get: () => plan,
    gets: () => gets,
    link: (values: string[]) => (linked = values),
  };
}

/** The copy run on the draft, still working with its name and description
 *  written: it never settles, so no reload of the plan stands in for the live
 *  replay. It is served once `ready` (after the page's own reload of the plan). */
async function stubCopyRun(page: Page, name: string, description: string, ready: () => boolean) {
  const step = (s: string) => ({ type: "step", data: { specialist: "marketing", label: "Writing your membership", state: s } });
  const all = [
    step("start"),
    { type: "field", data: { record: `membership:${DRAFT}`, name: "name", value: name } },
    { type: "field", data: { record: `membership:${DRAFT}`, name: "description", value: description } },
  ].map((event, i) => ({ seq: i + 1, at: new Date().toISOString(), ...event }));
  await page.route("**/api/v1/admin/copilot/runs/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
    if (!url.pathname.includes(`/runs/${COPY_RUN}/`)) return route.fallback();
    while (!ready()) await new Promise((resolve) => setTimeout(resolve, 20));
    const since = Number(url.searchParams.get("since") ?? 0);
    return route.fulfill({
      json: {
        id: COPY_RUN,
        status: "working",
        specialist: "marketing",
        chat: null,
        seen: false,
        events: all.filter((e) => e.seq > since),
      },
    });
  });
}

const guide = (page: Page) => page.getByRole("complementary", { name: "New membership" });
const main = (page: Page) => page.getByRole("main");
const tile = (page: Page, name: string) => guide(page).getByRole("button", { name });

const COPY_NAME = "The Calm Body Club";
const COPY_DESCRIPTION = "Every yoga and pilates course, for students who want one place to keep practising.";
const CLOSING = "Kept off sale. Put it on sale from this page when you're ready.";

test("a membership of all her courses at the suggested price, kept off sale", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const plan = await stubPlan(page);
  // The run is served after the page reloads the plan for her answer, and the
  // plan's saved name and description wait for the review: until then only
  // the live replay can put them on the page.
  let mark: number | null = null;
  await stubCopyRun(page, COPY_NAME, COPY_DESCRIPTION, () => mark !== null && plan.gets() > mark);
  const included: [string, string] = ["included", "Yoga basics, Pilates for runners"];
  const reviewed: [string, string][] = [TOPIC, included, ["review", "Looks good"]];
  const sent = await stubFocus(page, (path, body) => {
    if (path.endsWith("/finish/"))
      return {
        ...state({ status: "done", record: RECORD, answered: [...reviewed, ["access", "$9 a month"], ["finish", "Keep it off sale"]] }),
        closing: CLOSING,
      };
    if (body.field === "access") {
      plan.set({ price: "9.00", billing_interval_months: 1 });
      return state({ record: RECORD, question: Q.finish, answered: [...reviewed, ["access", "$9 a month"]] });
    }
    if (body.field === "review") {
      plan.set({ name: COPY_NAME, description: COPY_DESCRIPTION });
      return state({ record: RECORD, question: Q.access, answered: reviewed });
    }
    if (body.field === "included") {
      // The server links the ticks into the plan, and the copy job starts.
      plan.link(["course:11", "course:12"]);
      mark = plan.gets();
      return state({ record: RECORD, question: Q.review, answered: [TOPIC, included], copy: { status: "ready", run: COPY_RUN } });
    }
    return state({ record: RECORD, question: Q.included, answered: [TOPIC] });
  });

  // "New membership" on the store's memberships tab opens focus mode.
  await page.goto(`${TENANT}/admin/store?tab=plans`);
  await main(page).getByRole("link", { name: "New membership" }).first().click();
  await expect(page).toHaveURL(/\/admin\/store\/plans\/new$/);
  await expect(guide(page).getByText("What do members get?")).toBeVisible();
  await tile(page, "Digital membership").click();

  // Her first answer made the plan, off sale: its own page, and what's included.
  await expect(page).toHaveURL(new RegExp(`/admin/store/plans/${DRAFT}$`));
  expect(sent[0]).toMatchObject({ kind: "membership", value: "Digital membership" });
  await expect(guide(page).getByText("What's included?")).toBeVisible();
  await expect(main(page).locator("#plan-name")).toHaveValue(RECORD.title);
  await expect(guide(page).getByRole("button", { name: "Just draft it" })).toHaveCount(0);
  const done = guide(page).getByRole("button", { name: "Pick as many as fit" });
  await expect(done).toBeDisabled();
  await tile(page, "Yoga basics").click();
  await tile(page, "Pilates for runners").click();
  await expect(tile(page, "Yoga basics")).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, "Morning workbook")).toHaveAttribute("aria-pressed", "false");
  await guide(page).getByRole("button", { name: "Continue with 2" }).click();

  // The access card shows her picks as saved; the copy types in.
  await expect(guide(page).getByText("Here's your membership. Does it fit?")).toBeVisible();
  // One answer for every tick, as a tap: never read by a model.
  const ticks = sent.find((s) => s.field === "included");
  expect(ticks).toMatchObject({ value: "course:11,course:12" });
  expect(ticks?.text).toBeUndefined();
  await expect(main(page).getByRole("button", { name: "Remove Yoga basics" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Remove Pilates for runners" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Remove Morning workbook" })).toHaveCount(0);
  await expect(main(page).locator("#plan-name")).toHaveValue(COPY_NAME);
  await expect(main(page).locator("#plan-description")).toHaveValue(COPY_DESCRIPTION);
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();

  // The price: a month at the suggestion, its year, or her own amount in the box.
  await expect(guide(page).getByText("What should it cost?")).toBeVisible();
  await expect(tile(page, "$90 a year")).toBeVisible();
  await guide(page).getByRole("button", { name: "Say an amount" }).click();
  await expect(guide(page).getByRole("textbox", { name: "Your answer" })).toBeFocused();
  await guide(page).getByRole("button", { name: "You decide" }).click();
  await expect(tile(page, "$9 a month")).toHaveAttribute("data-highlighted", "true");
  await tile(page, "$9 a month").click();
  await expect(guide(page).getByText("Ready. Put it on sale?")).toBeVisible();
  expect(sent.find((s) => s.field === "access")).toMatchObject({ value: "month:9" });
  await expect(main(page).locator("#plan-price")).toHaveValue("9.00");
  await expect(main(page).locator("#plan-cycle")).toHaveValue("1");

  await guide(page).getByRole("button", { name: "Keep it off sale" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: false });
  await expect(page.getByText(CLOSING)).toBeVisible();
  // Off sale: nobody can join it until she puts it on sale.
  await expect(main(page).getByRole("switch", { name: "On sale" })).not.toBeChecked();
  await page.close();
});

test("select all ticks every item", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const plan = await stubPlan(page);
  // Her first answer named the pilates course: it comes ticked.
  const atIncluded = state({
    record: RECORD,
    question: { ...Q.included, ticked: ["course:12"] },
    answered: [TOPIC],
  });
  const sent = await stubFocus(
    page,
    () => {
      plan.link(ITEMS.map((i) => i.value));
      return state({ record: RECORD, question: Q.review, answered: [TOPIC, ["included", "3 items"]] });
    },
    atIncluded,
  );

  // She comes back to its page: focus mode resumes where she stopped.
  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("What's included?")).toBeVisible();
  await expect(tile(page, "Pilates for runners")).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, "Yoga basics")).toHaveAttribute("aria-pressed", "false");

  await guide(page).getByRole("button", { name: "Select all" }).click();
  for (const item of ITEMS) await expect(tile(page, item.title)).toHaveAttribute("aria-pressed", "true");
  await guide(page).getByRole("button", { name: "Deselect all" }).click();
  for (const item of ITEMS) await expect(tile(page, item.title)).toHaveAttribute("aria-pressed", "false");
  await expect(guide(page).getByRole("button", { name: "Pick as many as fit" })).toBeDisabled();

  await guide(page).getByRole("button", { name: "Select all" }).click();
  await guide(page).getByRole("button", { name: "Continue with 3" }).click();
  await expect(guide(page).getByText("3 items")).toBeVisible();
  expect(sent.filter((s) => s.field === "included")).toEqual([
    expect.objectContaining({ field: "included", value: "all" }),
  ]);
  for (const item of ITEMS)
    await expect(main(page).getByRole("button", { name: `Remove ${item.title}` })).toBeVisible();
  await page.close();
});

test("a price she types on the page is saved before her finish tap, and stands", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const log: string[] = [];
  const plan = await stubPlan(page, log);
  plan.link(["course:11"]);
  // "Just draft it" left the price to her: the finish step offers "Sell it for".
  const answered: [string, string][] = [TOPIC, ["included", "Yoga basics"], ["review", "Looks good"], ["access", "You decide"]];
  const sent = await stubFocus(
    page,
    (path) => {
      if (path.endsWith("/finish/")) {
        plan.set({ is_active: true });
        return {
          ...state({ status: "done", record: RECORD, answered: [...answered, ["finish", "Put it on sale"]] }),
          closing: "On sale. Students can join it from your pricing page.",
        };
      }
      // "Sell it for" (backend flow): refused once the plan has her price, which stands.
      if (Number(plan.get().price) > 0) return state({ record: RECORD, question: Q.finish, answered });
      plan.set({ price: "9.00" });
      return state({ record: RECORD, question: Q.finish, answered: [...answered.slice(0, -1), ["access", "$9 a month"]] });
    },
    state({ record: RECORD, question: Q.noPrice, answered }),
    log,
  );

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Your membership is kept off sale.")).toBeVisible();
  await main(page).locator("#plan-price").fill("12");
  await guide(page).getByRole("button", { name: "Sell it for $9 a month" }).click();
  await expect(guide(page).getByText("Ready. Put it on sale?")).toBeVisible();
  // Her page's price went first, so the tap found it priced.
  expect(log).toEqual(['patch:{"price":"12"}', "answer:finish"]);

  await guide(page).getByRole("button", { name: "Put it on sale" }).click();
  await expect(page.getByText("On sale. Students can join it from your pricing page.")).toBeVisible();
  expect(sent.at(-1)).toMatchObject({ publish: true });
  expect(log.filter((entry) => entry.startsWith("patch:"))).toHaveLength(1);
  // On sale at the price the page shows.
  await expect(main(page).locator("#plan-price")).toHaveValue("12");
  await expect(main(page).getByRole("switch", { name: "On sale" })).toBeChecked();
  await page.close();
});
