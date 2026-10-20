// e2e/specs/38-focus-bundle.spec.ts
//
// Focus mode for a bundle (backend apps/core/focus/kinds/bundle.py; frontend
// app/admin/store/bundles/*, components/focus/pick-question.tsx). As in 33-37,
// the focus endpoints, the copy run and the draft bundle are stubbed at the
// network layer (real AI is slow and non-deterministic, and the spec must not
// depend on the FOCUS_KINDS switch); what is under test is the loop on screen.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const CREATION = 95;
const DRAFT = 9802;
const COPY_RUN = 6390;
const PATH = `/admin/store/bundles/${DRAFT}`;

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
// The workbook first: the items her words named come before it.
const ITEMS = [
  { value: "download:13", title: "Morning workbook", hint: "Download", type: "download", model: "downloads.downloadfile", price: "9.00" },
  { value: "course:11", title: "Yoga basics", hint: "Course", type: "course", model: "courses.course", price: "40.00" },
  { value: "course:12", title: "Vinyasa flow", hint: "Course", type: "course", model: "courses.course", price: "60.00" },
];
const Q: Record<string, Body> = {
  items: question("items", "pick", "What goes in the bundle?", {
    options: ITEMS.map((i) => option(i.value, i.title, i.hint)),
    ticked: [],
  }),
  review: question("review", "review", "Here's your bundle. Does it fit?", { specialist: "marketing" }),
  access: question("access", "price", "What should it cost?", {
    can_delegate: true,
    options: [
      option("paid:75", "$75", "$100 bought apart; 25% off"),
      option("paid:100.00", "$100", "the same as buying them apart"),
    ],
    suggested: "paid:75",
    say: "Say an amount",
  }),
  finish: question("finish", "finish", "Ready. Publish it?", {
    options: [option("publish", "Publish now"), option("draft", "Keep as a draft")],
  }),
};
const STEPS = ["items", "review", "access", "finish", "announce"];
const RECORD = { id: DRAFT, kind: "bundle", title: "New bundle", path: PATH };
const CLOSING = "Published. Students can buy it in your store now.";

/** A creation as the backend reports it: `answered` as [field, label] pairs. */
const state = (over: Body & { answered?: [string, string][] }): Body => {
  const answered = (over.answered ?? []).map(([field, label]) => ({ field, label }));
  return {
    id: CREATION,
    kind: "bundle",
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
  first: Body = Q.items,
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
      current = reply(path, body);
      return route.fulfill({ status: path.endsWith("/admin/focus/") ? 201 : 200, json: current });
    }
    if (path.endsWith("/admin/focus/"))
      return route.fulfill({
        json: {
          enabled: true,
          kinds: ["course", "event", "message", "download", "membership", "bundle"],
          first: { bundle: first },
          open:
            current && current.status === "active" && current.id
              ? [{ id: CREATION, kind: "bundle", record: current.record }]
              : [],
        },
      });
    return route.fulfill({ json: current });
  });
  return sent;
}

/** The draft bundle, its items, the products they come from and its price
 *  (the Access section), as the server keeps them: the guide's answers change
 *  them there; the page loads them again. `refuse`: a Publish refused once. */
async function stubBundle(page: Page, log: string[] = [], refuse = "") {
  let gets = 0;
  let linked: string[] = [];
  let bundle: Body = { name: RECORD.title, description: "", price: "0.00", is_published: false };
  const items = () => ITEMS.filter((i) => linked.includes(i.value));
  const json = () => ({
    id: DRAFT,
    currency: "USD",
    thumbnail_url: "",
    is_active: true,
    item_count: linked.length,
    access_info: {},
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
    ...bundle,
    items: items().map((i, n) => ({
      id: n + 1,
      content_type: 0,
      object_id: Number(i.value.split(":")[1]),
      content_type_name: i.model,
    })),
    original_price: items()
      .reduce((sum, i) => sum + Number(i.price), 0)
      .toFixed(2),
    // The server's own count (backend Bundle.not_ready): her page shows it where Publish would be.
    not_ready: linked.length < 2 ? "Add at least two items" : Number(bundle.price) > 0 ? "" : "Set its price first",
  });
  await page.route(`**/api/v1/billing/bundles/${DRAFT}/`, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      log.push(`patch:${JSON.stringify(req.postDataJSON())}`);
      if (refuse) {
        const line = refuse;
        refuse = "";
        return route.fulfill({ status: 400, json: { is_published: [line] } });
      }
      bundle = { ...bundle, ...req.postDataJSON() };
    } else gets += 1;
    return route.fulfill({ json: json() });
  });
  await page.route("**/api/v1/billing/products/", (route) =>
    route.fulfill({
      json: ITEMS.map((i) => ({ id: Number(i.value.split(":")[1]), title: i.title, type: i.type, price: i.price })),
    }),
  );
  await page.route(`**/api/v1/admin/access/bundle/${DRAFT}/`, (route) =>
    route.fulfill({
      json: {
        kind: "bundle",
        id: DRAFT,
        ways: { free: null, buy: { price: bundle.price, window: null }, plans: [] },
        describe: "",
        currency: "USD",
        allowed: ["buy"],
        can_edit_plans: false,
        plans: [],
        bundles: [],
      },
    }),
  );
  return {
    set: (next: Body) => (bundle = { ...bundle, ...next }),
    gets: () => gets,
    link: (values: string[]) => (linked = values),
  };
}

/** The copy run on the draft, still working with its name and description
 *  written: it never settles, so no reload of the bundle stands in for the
 *  live replay. It is served once `ready` (after the page's own reload). */
async function stubCopyRun(page: Page, name: string, description: string, ready: () => boolean) {
  const step = (s: string) => ({ type: "step", data: { specialist: "marketing", label: "Writing your bundle", state: s } });
  const all = [
    step("start"),
    { type: "field", data: { record: `bundle:${DRAFT}`, name: "name", value: name } },
    { type: "field", data: { record: `bundle:${DRAFT}`, name: "description", value: description } },
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

const guide = (page: Page) => page.getByRole("complementary", { name: "New bundle" });
const main = (page: Page) => page.getByRole("main");
const tile = (page: Page, name: string) => guide(page).getByRole("button", { name });

const COPY_NAME = "The Yoga Starter Pack";
const COPY_DESCRIPTION = "Yoga basics and Vinyasa flow together, for students starting a home practice.";

test("a bundle of two courses at the suggested price", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const log: string[] = [];
  const bundle = await stubBundle(page, log);
  let mark: number | null = null;
  await stubCopyRun(page, COPY_NAME, COPY_DESCRIPTION, () => mark !== null && bundle.gets() > mark);
  const words = "Yoga basics and Vinyasa flow";
  const items: [string, string] = ["items", "Yoga basics, Vinyasa flow"];
  const reviewed: [string, string][] = [items, ["review", "Looks good"]];
  const sent = await stubFocus(page, (path, body) => {
    if (path.endsWith("/finish/")) {
      bundle.set({ is_published: true });
      return {
        ...state({ status: "done", record: RECORD, answered: [...reviewed, ["access", "$75"], ["finish", "Publish now"]] }),
        closing: CLOSING,
      };
    }
    if (body.field === "access") {
      bundle.set({ price: "75.00" });
      return state({ record: RECORD, question: Q.finish, answered: [...reviewed, ["access", "$75"]] });
    }
    if (body.field === "review") {
      bundle.set({ name: COPY_NAME, description: COPY_DESCRIPTION });
      return state({ record: RECORD, question: Q.access, answered: reviewed });
    }
    if (path.endsWith("/admin/focus/"))
      // Her words, read: the two courses she named come ticked, and first.
      return state({ record: RECORD, question: { ...Q.items, ticked: ["course:11", "course:12"] } });
    if (body.field === "items") {
      // The server puts the ticks in the bundle, and the copy job starts.
      bundle.link(["course:11", "course:12"]);
      mark = bundle.gets();
      return state({ record: RECORD, question: Q.review, answered: [items], copy: { status: "ready", run: COPY_RUN } });
    }
    throw new Error(`unexpected ${path}`);
  });

  // "New bundle" on the store's bundles tab opens focus mode.
  await page.goto(`${TENANT}/admin/store?tab=bundles`);
  await main(page).getByRole("link", { name: "New bundle" }).first().click();
  await expect(page).toHaveURL(/\/admin\/store\/bundles\/new$/);
  await expect(guide(page).getByText("What goes in the bundle?")).toBeVisible();
  const box = guide(page).getByRole("textbox", { name: "Your answer" });
  await box.fill(words);
  await box.press("Enter");

  // Her first answer made the draft: its own page, her named items ticked and first.
  await expect(page).toHaveURL(new RegExp(`/admin/store/bundles/${DRAFT}$`));
  expect(sent[0]).toMatchObject({ kind: "bundle", text: words });
  const tiles = guide(page).locator("button[aria-pressed]", { hasText: /Morning workbook|Yoga basics|Vinyasa flow/ });
  await expect(tiles.first()).toContainText("Yoga basics");
  await expect(tile(page, "Yoga basics")).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, "Vinyasa flow")).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, "Morning workbook")).toHaveAttribute("aria-pressed", "false");
  await expect(guide(page).getByRole("button", { name: "Just draft it" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Continue with 2" }).click();

  // The items show as saved; the copy types in.
  await expect(guide(page).getByText("Here's your bundle. Does it fit?")).toBeVisible();
  const ticks = sent.find((s) => s.path.endsWith("/answer/") && s.field === "items");
  expect(ticks).toMatchObject({ value: "course:11,course:12" });
  expect(ticks?.text).toBeUndefined();
  await expect(main(page).getByRole("button", { name: "Remove Yoga basics" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Remove Vinyasa flow" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Remove Morning workbook" })).toHaveCount(0);
  await expect(main(page).locator("#name")).toHaveValue(COPY_NAME);
  await expect(main(page).locator("#description")).toHaveValue(COPY_DESCRIPTION);
  // The guide asks the price: while it holds the page, 0 is not shown as an error.
  const price = main(page).locator("#access-bundle-price");
  await expect(price).toHaveValue("0.00");
  await expect(main(page).getByText("Add a price above 0.")).toHaveCount(0);
  await expect(price).not.toHaveAttribute("aria-invalid", "true");
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();

  // The price: a quarter off what they cost bought apart, the sum, or her own amount.
  await expect(guide(page).getByText("What should it cost?")).toBeVisible();
  await expect(guide(page).getByText("$100 bought apart; 25% off")).toBeVisible();
  await expect(guide(page).getByText("the same as buying them apart")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Say an amount" })).toBeVisible();
  await guide(page).getByRole("button", { name: /^\$75/ }).click();
  await expect(guide(page).getByText("Ready. Publish it?")).toBeVisible();
  expect(sent.find((s) => s.field === "access")).toMatchObject({ value: "paid:75" });
  await expect(main(page).locator("#access-bundle-price")).toHaveValue(/^75/);

  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: true });
  await expect(page.getByText(CLOSING)).toBeVisible();
  // Nothing she typed on the page was waiting: no save went before the finish.
  expect(log).toEqual([]);
  await page.close();
});

test("a kept draft is published from its page once selling is open", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const log: string[] = [];
  const line = "Start selling first: your plan, then payouts.";
  const bundle = await stubBundle(page, log, line);
  bundle.link(["course:11"]);
  bundle.set({ name: COPY_NAME });
  await stubFocus(page, () => state({}));

  // Not ready: what it still needs, where Publish would be. Out of focus mode, price 0 is an error again.
  await page.goto(`${TENANT}${PATH}`);
  await expect(main(page).getByText("Add at least two items.")).toBeVisible();
  const publish = main(page).getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toHaveCount(0);
  await expect(main(page).getByText("Add a price above 0.")).toBeVisible();
  await expect(main(page).locator("#access-bundle-price")).toHaveAttribute("aria-invalid", "true");
  bundle.link(["course:11", "course:12"]);
  bundle.set({ price: "75.00" });
  await page.reload();
  await expect(main(page).getByText("Draft", { exact: true })).toBeVisible();
  await publish.click();
  // The server refuses it as the finish would: she is told why, and it stays a draft.
  await expect(page.getByText(line)).toBeVisible();
  await expect(main(page).getByText("Draft", { exact: true })).toBeVisible();
  // A name she changed on the page goes live with it: saved first.
  await main(page).locator("#name").fill("Yoga pair");
  await publish.click();
  await expect(page.getByText(CLOSING)).toBeVisible();
  await expect(main(page).getByText("Draft", { exact: true })).toHaveCount(0);
  expect(log).toEqual([
    'patch:{"is_published":true}',
    'patch:{"name":"Yoga pair"}',
    'patch:{"is_published":true}',
  ]);
  await page.close();
});

test("with fewer than two items to sell, the guide says so and the page offers the plain form", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const one = { ...Q.items, options: Q.items.options.slice(0, 1) };
  const sent = await stubFocus(page, () => state({}), null, one);

  await page.goto(`${TENANT}/admin/store/bundles/new`);
  await expect(
    guide(page).getByText("A bundle needs at least two items you sell. Give two of them a price first."),
  ).toBeVisible();
  // Nothing to tick and no box to type in: no draft that could never be published.
  await expect(guide(page).getByRole("textbox", { name: "Your answer" })).toHaveCount(0);
  await expect(guide(page).locator("button[aria-pressed]", { hasText: "Morning workbook" })).toHaveCount(0);
  // One way forward, on the page: the guide does not repeat it.
  await expect(page.getByRole("link", { name: "Fill it in myself" })).toHaveCount(1);
  await main(page).getByRole("link", { name: "Fill it in myself" }).click();
  await expect(page).toHaveURL(/\/admin\/store\/bundles\/new\?form=1$/);
  await expect(main(page).getByRole("heading", { name: "Create Bundle" })).toBeVisible();
  expect(sent).toEqual([]);
  await page.close();
});

test("what she changed on the page is saved when she closes the tab", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const log: string[] = [];
  const bundle = await stubBundle(page, log);
  bundle.link(["course:11", "course:12"]);
  const atPrice = state({ record: RECORD, question: Q.access, answered: [["items", "Yoga basics, Pilates"], ["review", "Looks good"]] });
  await stubFocus(page, () => atPrice, atPrice);

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("What should it cost?")).toBeVisible();
  await main(page).locator("#name").fill("Yoga pair");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await expect.poll(() => log).toContain('patch:{"name":"Yoga pair"}');
  await page.close();
});
