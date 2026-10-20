// e2e/specs/39-focus-post.spec.ts
//
// Focus mode for a blog post (backend apps/core/focus/kinds/post.py and
// focus/post.py; frontend app/admin/blog/*, components/focus/cover-step.tsx).
// As in 33-38, the focus endpoints, the post job's run and the draft post are
// stubbed at the network layer (real AI is slow and non-deterministic, and the
// spec must not depend on the FOCUS_KINDS switch); what is under test is the
// loop on screen.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const CREATION = 96;
const DRAFT = 9803;
const POST_RUN = 6400;
const PATH = `/admin/blog/${DRAFT}`;
const IDEA = "Breathing before class";
const URL_A = "https://images.test/my-studio.jpg";
const URL_B = "https://images.test/standing-desk.jpg";
const PHOTOS = [
  { asset_id: "own:photo-a", url: URL_A, title: "My studio", mine: true },
  { asset_id: "lib-standing-desk", url: URL_B, title: "Standing desk", mine: false },
];

const option = (value: string, label: string, hint = "") => ({ value, label, hint });
const question = (field: string, kind: string, text: string, extra: Body = {}) => ({
  field,
  kind,
  question: text,
  why: "",
  options: [],
  starter: null,
  can_delegate: false,
  specialist: "marketing",
  ...extra,
});
const Q: Record<string, Body> = {
  // Her topic ideas (the blog's queue) are the tiles.
  topic: question("topic", "text", "What's your post about?", {
    starter: "A post on ",
    can_delegate: true,
    options: [option(IDEA, IDEA, "Three breaths that settle a room")],
  }),
  length: question("length", "choice", "How long?", {
    can_delegate: true,
    options: [
      option("short", "Short read", "About 500 words"),
      option("standard", "Standard", "About 1,000 words"),
      option("long", "Long guide", "About 1,400 words"),
    ],
  }),
  review: question("review", "review", "Here's your post. Does it fit?"),
  cover: question("cover", "cover", "Pick a cover photo", { specialist: "designer" }),
  finish: question("finish", "finish", "Ready. Publish it?", {
    options: [option("publish", "Publish now"), option("draft", "Keep as a draft")],
  }),
  // Not ready (backend flow.state): only Keep as a draft, and why.
  empty: question("finish", "finish", "Your post is saved as a draft.", {
    why: "Write something first. Until then it stays a hidden draft.",
    options: [option("draft", "Keep as a draft")],
  }),
};
const STEPS = ["topic", "length", "review", "cover", "finish", "announce"];
const RECORD = { id: DRAFT, kind: "post", title: IDEA, path: PATH };
const COVER = { status: "ready", run: null, round: 0, drafts: [], photo: null, query: "" };
const CLOSING = "Published. Students can read it on your blog now.";
const KEPT = "Saved as a draft. Publish it from this page when you're ready.";
const REFUSED = "You're out of AI posts for this month. Write it yourself, or upgrade for more.";
const JOB = {
  title: "Three breaths before class",
  excerpt: "A calmer start in three slow breaths.",
  // Long enough to type for ~40 s at the usual 60 a second: the page caps the replay at 5 s.
  body_html: `<p>Three slow breaths change a class.</p>${"<p>Breathe in for four, out for six.</p>".repeat(60)}<p>Then begin.</p>`,
  meta_description: "A short breath routine before class.",
  tags: ["Breath", "classes"],
};

/** A creation as the backend reports it: `answered` as [field, label] pairs. */
const state = (over: Body & { answered?: [string, string][] }): Body => {
  const answered = (over.answered ?? []).map(([field, label]) => ({ field, label }));
  return {
    id: CREATION,
    kind: "post",
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
 *  returns the last state); `open` is the creation the overview lists. With
 *  `on` false, focus mode is on but not for posts. */
async function stubFocus(page: Page, reply: (path: string, body: Body) => Body, open: Body | null = null, on = true) {
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
          kinds: on ? ["course", "post"] : ["course"],
          first: on ? { post: Q.topic } : {},
          open:
            current && current.status === "active" && current.id
              ? [{ id: CREATION, kind: "post", record: current.record }]
              : [],
        },
      });
    return route.fulfill({ json: current });
  });
  return sent;
}

/** The draft post as the server keeps it: the guide's answers change it
 *  there, the page loads it again; each PATCH is logged with what it sent. */
async function stubPost(page: Page, log: string[] = [], start: Body = {}) {
  let gets = 0;
  let post: Body = {
    id: DRAFT,
    slug: "breathing-before-class",
    title: IDEA,
    excerpt: "",
    meta_description: "",
    tags: [],
    body_html: "",
    status: "draft",
    source: "ai",
    published_at: null,
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
    cover_photo: null,
    cover_photo_url: null,
    image_placements: [],
    image_placements_resolved: [],
    ...start,
  };
  await page.route(`**/api/v1/admin/blog/posts/${DRAFT}/`, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      log.push(`patch:${JSON.stringify(req.postDataJSON())}`);
      post = { ...post, ...req.postDataJSON() };
    } else gets += 1;
    return route.fulfill({ json: post });
  });
  return { set: (next: Body) => (post = { ...post, ...next }), gets: () => gets };
}

/** The post job's run, still working with every field written: it never
 *  settles, so no reload of the post stands in for the live replay. It is
 *  served once `ready` (after the page's own reload). */
async function stubPostRun(page: Page, ready: () => boolean) {
  const step = (s: string) => ({ type: "step", data: { specialist: "marketing", label: "Writing your post", state: s } });
  const field = (name: string, value: unknown) => ({ type: "field", data: { record: `post:${DRAFT}`, name, value } });
  const all = [step("start"), ...Object.entries(JOB).map(([name, value]) => field(name, value))].map((event, i) => ({
    seq: i + 1,
    at: new Date().toISOString(),
    ...event,
  }));
  await page.route("**/api/v1/admin/copilot/runs/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
    if (!url.pathname.includes(`/runs/${POST_RUN}/`)) return route.fallback();
    while (!ready()) await new Promise((resolve) => setTimeout(resolve, 20));
    const since = Number(url.searchParams.get("since") ?? 0);
    return route.fulfill({
      json: {
        id: POST_RUN,
        status: "working",
        specialist: "marketing",
        chat: null,
        seen: false,
        events: all.filter((e) => e.seq > since),
      },
    });
  });
}

/** The cover step's photo row: hers first, then the library; never a real photo generation. */
async function stubPhotos(page: Page) {
  await page.route(`**/api/v1/admin/focus/${CREATION}/photos/**`, (route) =>
    route.fulfill({ json: { results: PHOTOS, has_next: false } }),
  );
  await page.route("**/api/v1/curated-images/generate/**", (route) =>
    route.fulfill({ json: { limit: 0, used: 0, left: 0 } }),
  );
}

const guide = (page: Page) => page.getByRole("complementary", { name: "New post" });
const main = (page: Page) => page.getByRole("main");

test("a post from a topic idea, with a photo, published", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const log: string[] = [];
  const post = await stubPost(page, log);
  let mark: number | null = null;
  await stubPostRun(page, () => mark !== null && post.gets() > mark);
  const topic: [string, string] = ["topic", IDEA];
  const reviewed: [string, string][] = [topic, ["length", "Short read"], ["review", "Looks good"]];
  const sent = await stubFocus(page, (path, body) => {
    if (path.endsWith("/finish/")) {
      log.push(`finish:${body.publish}`);
      post.set({ status: "published", published_at: "2026-10-20T11:00:00Z" });
      return { ...state({ status: "done", record: RECORD, answered: [...reviewed, ["cover", "Cover chosen"]] }), closing: CLOSING };
    }
    if (path.endsWith("/cover/") && body.action === "use") {
      post.set({ cover_photo: "photo-b", cover_photo_url: URL_B });
      return state({ record: RECORD, question: Q.finish, answered: [...reviewed, ["cover", "Cover chosen"]] });
    }
    if (body.field === "review") {
      // The job saved what it wrote before the page replays it.
      post.set(JOB);
      return state({ record: RECORD, question: Q.cover, answered: reviewed, cover: COVER, copy: { status: "ready", run: POST_RUN } });
    }
    if (body.field === "length") {
      mark = post.gets();
      return state({ record: RECORD, question: Q.review, answered: reviewed.slice(0, 2), copy: { status: "ready", run: POST_RUN } });
    }
    if (path.endsWith("/admin/focus/")) return state({ record: RECORD, question: Q.length, answered: [topic] });
    throw new Error(`unexpected ${path}`);
  });
  await stubPhotos(page); // after the focus stub: the later route answers first

  // "New post" on the blog list opens focus mode: her topic ideas are the tiles.
  await page.goto(`${TENANT}/admin/blog`);
  await main(page).getByRole("link", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/admin\/blog\/new$/);
  await expect(guide(page).getByText("What's your post about?")).toBeVisible();
  for (const name of ["A post on…", "You decide"])
    await expect(guide(page).getByRole("button", { name, exact: true })).toBeVisible();
  await guide(page).getByRole("button", { name: new RegExp(IDEA) }).click();

  // Her first answer made the hidden draft: its own page, titled with her idea.
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  expect(sent[0]).toMatchObject({ kind: "post", value: IDEA });
  await expect(main(page).getByPlaceholder("Untitled post")).toHaveValue(IDEA);
  await expect(guide(page).getByText("How long?")).toBeVisible();
  await guide(page).getByRole("button", { name: /Short read/ }).click();

  // The post job's title, summary, text, description and tags type in, within seconds however long;
  // the toolbar is off while the text is being written, so nothing she taps cuts it short.
  await expect(guide(page).getByText("Here's your post. Does it fit?")).toBeVisible();
  const bold = main(page).getByRole("button", { name: "Bold" });
  await expect(bold).toBeDisabled();
  await expect(main(page).locator(".ProseMirror")).toContainText("Then begin.");
  await expect(bold).toBeEnabled();
  await expect(main(page).getByPlaceholder("Untitled post")).toHaveValue(JOB.title);
  await expect(main(page).getByPlaceholder("Excerpt")).toHaveValue(JOB.excerpt);
  await expect(main(page).locator(".ProseMirror")).toContainText("Three slow breaths change a class.");
  await expect(main(page).getByPlaceholder("Meta description")).toHaveValue(JOB.meta_description);
  await expect(main(page).getByPlaceholder("Tags")).toHaveValue("Breath, classes");
  // The guide's finish publishes: the page has no Publish of its own meanwhile.
  await expect(main(page).getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();

  // The cover is a photo only: her photos first, then the library; no styles.
  await expect(guide(page).getByText("Pick a cover photo")).toBeVisible();
  for (const name of ["Use this cover", "Four more styles", "Edit cover"])
    await expect(guide(page).getByRole("button", { name })).toHaveCount(0);
  await expect(guide(page).getByRole("button", { name: "Later" })).toBeVisible();
  const cover = main(page).getByRole("group", { name: "Cover" });
  await expect(cover.getByRole("button", { name: /My studio/ })).toContainText("Yours");
  // She changes the summary on the page meanwhile: not saved yet.
  const mine = "My own summary of the breaths.";
  await main(page).getByPlaceholder("Excerpt").fill(mine);
  await cover.getByRole("button", { name: /Standing desk/ }).click();
  await expect.poll(() => sent.find((s) => s.path.endsWith("/cover/"))).toMatchObject({
    action: "use",
    asset_id: "lib-standing-desk",
  });

  // The pick is the post's cover; the reload never takes her summary back.
  await expect(guide(page).getByText("Ready. Publish it?")).toBeVisible();
  await expect(main(page).locator(`img[src="${URL_B}"]`)).toBeVisible();
  await expect(main(page).getByPlaceholder("Excerpt")).toHaveValue(mine);
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByText(CLOSING)).toBeVisible();
  // What she changed on the page went first, and nothing else (the job's fields are the server's).
  expect(log).toEqual([`patch:${JSON.stringify({ excerpt: mine })}`, "finish:true"]);
  await expect(main(page).getByRole("button", { name: "Unpublish" })).toBeVisible();
  await page.close();
});

test("an empty post cannot be published", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubPost(page);
  const sent = await stubFocus(
    page,
    () => ({ ...state({ status: "done", record: RECORD }), closing: KEPT }),
    state({
      record: RECORD,
      question: Q.empty,
      answered: [["topic", IDEA], ["length", "Short read"], ["review", "Looks good"], ["cover", "Later"]],
    }),
  );

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Your post is saved as a draft.")).toBeVisible();
  await expect(guide(page).getByText("Write something first. Until then it stays a hidden draft.")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Publish now" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Keep as a draft" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: false });
  await expect(page.getByText(KEPT)).toBeVisible();
  // The plain editor from here: still no Publish while it has no text.
  await expect(main(page).getByText("Write something first.")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await page.close();
});

test("fill it in myself makes today's untitled draft", async ({ browser }) => {
  const coach = await coachContext(browser);
  const created: Body[] = [];
  const untitled = async (page: Page, id: number) => {
    await page.route("**/api/v1/admin/blog/posts/", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      created.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id } });
    });
    await page.route(`**/api/v1/admin/blog/posts/${id}/`, (route) =>
      route.fulfill({
        json: {
          id,
          slug: `untitled-post-${id}`,
          title: "Untitled post",
          excerpt: "",
          meta_description: "",
          tags: [],
          body_html: "",
          status: "draft",
          source: "manual",
          published_at: null,
          created_at: "2026-10-20T10:00:00Z",
          updated_at: "2026-10-20T10:00:00Z",
          cover_photo: null,
          cover_photo_url: null,
          image_placements: [],
          image_placements_resolved: [],
        },
      }),
    );
  };

  // From focus mode's first screen: "Write it myself" is the plain editor on an untitled draft.
  const page = await coach.newPage();
  await untitled(page, 9811);
  const sent = await stubFocus(page, () => state({}));
  await page.goto(`${TENANT}/admin/blog/new`);
  await expect(guide(page).getByText("What's your post about?")).toBeVisible();
  await main(page).getByRole("link", { name: "Write it myself" }).click();
  await expect(page).toHaveURL(/\/admin\/blog\/9811$/);
  await expect(main(page).getByPlaceholder("Untitled post")).toHaveValue("Untitled post");
  await expect(guide(page)).toHaveCount(0);
  expect(created).toEqual([{ title: "Untitled post" }]);
  expect(sent).toEqual([]);
  await page.close();

  // Focus mode off for posts: "New post" on the list makes it at once, and Back is the list again.
  const plain = await coach.newPage();
  await untitled(plain, 9812);
  await stubFocus(plain, () => state({}), null, false);
  await plain.goto(`${TENANT}/admin/blog`);
  await main(plain).getByRole("link", { name: "New post" }).click();
  await expect(plain).toHaveURL(/\/admin\/blog\/9812$/);
  await expect(main(plain).getByPlaceholder("Untitled post")).toHaveValue("Untitled post");
  await plain.goBack();
  await expect(plain).toHaveURL(/\/admin\/blog$/);
  expect(created).toHaveLength(2);
  await plain.close();
});

test("a refused blog writer is said, with Upgrade, and Try again asks again", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubPost(page);
  // The post job's run failed at once: the blog gate refused it (her quota).
  const refused = state({
    record: RECORD,
    question: Q.review,
    answered: [["topic", IDEA], ["length", "Short read"]],
    copy: { status: "failed", run: POST_RUN, reason: "quota_exhausted" },
  });
  // Still refused when asked again: the same state, no run started.
  const sent = await stubFocus(page, () => refused, refused);

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText(REFUSED)).toBeVisible();
  await expect(guide(page).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/admin/billing");
  await expect(guide(page).getByRole("button", { name: "Write it myself" })).toBeVisible();
  // Her words would only ask the refused writer again: no box for them.
  await expect(guide(page).getByRole("textbox", { name: "Your answer" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => sent.filter((s) => s.value === "retry")).toHaveLength(1);
  // Never the plain failure and its Try again: the refusal stands.
  await expect(guide(page).getByText(REFUSED)).toBeVisible();
  await expect(guide(page).getByText("didn't come through")).toHaveCount(0);
  await page.close();
});
