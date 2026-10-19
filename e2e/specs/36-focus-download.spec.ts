// e2e/specs/36-focus-download.spec.ts
//
// Focus mode for a download (backend apps/core/focus/kinds/download.py;
// frontend app/admin/downloads/new + [id], components/admin/download-form.tsx,
// components/focus/upload-question.tsx). As in 34/35, the focus endpoints, the
// copy run, the draft row and the upload chain are stubbed at the network
// layer (real AI is slow and non-deterministic, and the spec must not depend
// on the FOCUS_KINDS switch); what is under test is the loop on screen.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

type Body = Record<string, any>;

const CREATION = 93;
const DRAFT = 9701;
const COPY_RUN = 6370;
const PATH = `/admin/downloads/${DRAFT}`;
const FILE = { name: "runner-workbook.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") };

const option = (value: string, label: string, hint = "") => ({ value, label, hint });
const question = (field: string, kind: string, text: string, extra: Body = {}) => ({
  field,
  kind,
  question: text,
  why: "",
  options: [],
  starter: null,
  can_delegate: false,
  specialist: "content",
  ...extra,
});
const Q: Record<string, Body> = {
  topic: question("topic", "text", "What are you sharing?", { starter: "A ", can_delegate: true }),
  file: question("file", "upload", "Add the file", { options: [option("later", "Add it later")] }),
  review: question("review", "review", "Here's your download. Does it fit?"),
  finish: question("finish", "finish", "Ready. Publish it?", {
    options: [option("publish", "Publish now"), option("draft", "Keep as a draft")],
  }),
  // Not ready (backend flow.state): only Keep as a draft, and why.
  noFile: question("finish", "finish", "Your download is saved as a draft.", {
    why: "Add the file first. Until then it stays a hidden draft.",
    options: [option("draft", "Keep as a draft")],
  }),
};
const STEPS = ["topic", "file", "review", "cover", "access", "finish", "announce"];
const RECORD = { id: DRAFT, kind: "download", title: "Workbook for new runners", path: PATH };
const TOPIC: [string, string] = ["topic", "A workbook for new runners"];

/** A creation as the backend reports it: `answered` as [field, label] pairs. */
const state = (over: Body & { answered?: [string, string][] }): Body => {
  const answered = (over.answered ?? []).map(([field, label]) => ({ field, label }));
  return {
    id: CREATION,
    kind: "download",
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
          kinds: ["course", "event", "message", "download"],
          first: { download: Q.topic },
          open:
            current && current.status === "active" && current.id
              ? [{ id: CREATION, kind: "download", record: current.record, title: RECORD.title }]
              : [],
        },
      });
    return route.fulfill({ json: current });
  });
  return sent;
}

/** The draft row: read by the page, PATCHed as she types. */
async function stubDraft(page: Page, over: Body = {}) {
  let current: Body = {
    id: DRAFT,
    title: RECORD.title,
    description: "",
    thumbnail_id: null,
    thumbnail_signed_url: "",
    cover_design: null,
    is_published: false,
    file_url: "",
    file_size: 0,
    download_count: 0,
    pricing_type: "free",
    price: "0.00",
    created_at: new Date().toISOString(),
    access_info: null,
    tags: [],
    ...over,
  };
  await page.route(`**/api/v1/downloads/${DRAFT}/`, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") current = { ...current, ...req.postDataJSON() };
    return route.fulfill({ json: current });
  });
  return { set: (next: Body) => (current = { ...current, ...next }) };
}

/** The upload chain (lib/downloads/upload.ts): presign, the PUT to storage, complete. */
async function stubUpload(page: Page, onComplete: () => void) {
  const steps: string[] = [];
  await page.route("**/api/v1/upload/presign/", (route) => {
    steps.push("presign");
    return route.fulfill({ json: { upload_url: `${TENANT}/e2e-storage/${FILE.name}`, s3_key: `k/${FILE.name}` } });
  });
  await page.route("**/e2e-storage/**", (route) => {
    steps.push("put");
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/v1/upload/complete/", (route) => {
    steps.push("complete");
    onComplete();
    return route.fulfill({ json: {} });
  });
  return steps;
}

/** The copy run on the draft: done with its title and description. */
async function stubCopyRun(page: Page, title: string, description: string) {
  const step = (s: string) => ({ type: "step", data: { specialist: "content", label: "Writing your download", state: s } });
  const all = [
    step("start"),
    { type: "field", data: { record: `download:${DRAFT}`, name: "title", value: title } },
    { type: "field", data: { record: `download:${DRAFT}`, name: "description", value: description } },
    step("done"),
  ].map((event, i) => ({ seq: i + 1, at: new Date().toISOString(), ...event }));
  await page.route("**/api/v1/admin/copilot/runs/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runs/open/")) return route.fulfill({ json: { runs: [] } });
    if (url.pathname.endsWith("/seen/")) return route.fulfill({ status: 204, body: "" });
    if (!url.pathname.includes(`/runs/${COPY_RUN}/`)) return route.fallback();
    const since = Number(url.searchParams.get("since") ?? 0);
    return route.fulfill({
      json: {
        id: COPY_RUN,
        status: "done",
        specialist: "content",
        chat: null,
        seen: false,
        events: all.filter((e) => e.seq > since),
      },
    });
  });
}

const guide = (page: Page) => page.getByRole("complementary", { name: "New download" });
const titleBox = (page: Page) => page.getByRole("main").locator("#download-title");

const COPY_TITLE = "Your First Month of Running";
const COPY_DESCRIPTION = "A workbook for new runners, with a page for each week of your first month.";

test("a download from one sentence and a file", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const { set } = await stubDraft(page);
  await stubCopyRun(page, COPY_TITLE, COPY_DESCRIPTION);
  const steps = await stubUpload(page, () => set({ file_url: `tenants/demo/downloads/${FILE.name}`, file_size: 2_400_000 }));
  const filed: [string, string][] = [TOPIC, ["file", "File added"]];
  const sent = await stubFocus(page, (path, body) => {
    if (path.endsWith("/finish/")) {
      set({ is_published: true });
      return state({ status: "done", record: RECORD, answered: [...filed, ["finish", "Publish now"]] });
    }
    if (body.field === "review")
      return state({
        record: RECORD,
        question: Q.finish,
        answered: [...filed, ["review", "Looks good"], ["cover", "Later"], ["access", "Free"]],
      });
    if (body.field === "file") {
      // The copy job saved its title and description before the page replays them.
      set({ title: COPY_TITLE, description: COPY_DESCRIPTION });
      return state({ record: RECORD, question: Q.review, answered: filed, copy: { status: "ready", run: COPY_RUN } });
    }
    return state({ record: RECORD, question: Q.file, answered: [TOPIC] });
  });

  await page.goto(`${TENANT}/admin/downloads/new`);
  await expect(guide(page).getByText("What are you sharing?")).toBeVisible();
  await guide(page).getByRole("button", { name: "A…" }).click();
  const box = guide(page).getByRole("textbox", { name: "Your answer" });
  await expect(box).toHaveValue("A ");
  await box.pressSequentially("workbook for new runners");
  await guide(page).getByRole("button", { name: "Send", exact: true }).click();

  // Her first answer made the hidden draft: its own page, and the file question.
  await expect(page).toHaveURL(new RegExp(`/admin/downloads/${DRAFT}$`));
  await expect(guide(page).getByText("Add the file")).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Add it later" })).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Just draft it" })).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Draft", { exact: true })).toBeVisible();

  await guide(page).locator('input[type="file"]').setInputFiles(FILE);
  await expect(guide(page).getByText("Here's your download. Does it fit?")).toBeVisible();
  expect(steps).toEqual(["presign", "put", "complete"]);
  // The upload answered it: a tap, never read by a model.
  const answered = sent.find((s) => s.field === "file");
  expect(answered).toMatchObject({ value: "uploaded" });
  expect(answered?.text).toBeUndefined();
  // The file row fills in and the copy types in.
  await expect(page.getByRole("main").getByText(FILE.name, { exact: false })).toBeVisible();
  await expect(titleBox(page)).toHaveValue(COPY_TITLE);
  await expect(page.getByRole("main").locator("#download-description")).toHaveValue(COPY_DESCRIPTION);

  await guide(page).getByRole("button", { name: "Looks good, continue" }).click();
  await expect(guide(page).getByText("Ready. Publish it?")).toBeVisible();
  await guide(page).getByRole("button", { name: "Publish now" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: true });
  expect(sent[0]).toMatchObject({ kind: "download", text: "A workbook for new runners" });
  await expect(page.getByText("Published. Students can find it on your site now.")).toBeVisible();
  await page.close();
});

test("add it later keeps it a draft", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  await stubDraft(page);
  const atFile = state({ record: RECORD, question: Q.file, answered: [TOPIC] });
  const later: [string, string][] = [TOPIC, ["file", "Add it later"], ["review", "Looks good"], ["access", "Free"]];
  const sent = await stubFocus(
    page,
    (path) =>
      path.endsWith("/finish/")
        ? state({ status: "done", record: RECORD, answered: [...later, ["finish", "Keep as a draft"]] })
        : state({ record: RECORD, question: Q.noFile, answered: later }),
    atFile,
  );

  // She comes back to its page: focus mode resumes where she stopped.
  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Add the file")).toBeVisible();
  await guide(page).getByRole("button", { name: "Add it later" }).click();
  expect(sent.find((s) => s.field === "file")).toMatchObject({ value: "later" });

  // Without a file, Publish is never offered: it stays a hidden draft.
  await expect(guide(page).getByText("Add the file first.", { exact: false })).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Publish now" })).toHaveCount(0);
  await guide(page).getByRole("button", { name: "Keep as a draft" }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ publish: false });
  await expect(page.getByText("Saved as a draft.", { exact: false })).toBeVisible();
  await expect(page.getByRole("main").getByText("Draft", { exact: true })).toBeVisible();
  await page.close();
});

test("a file dropped on the page answers the file question", async ({ browser }) => {
  const page = await (await coachContext(browser)).newPage();
  const { set } = await stubDraft(page);
  await stubCopyRun(page, COPY_TITLE, COPY_DESCRIPTION);
  await stubUpload(page, () => set({ file_url: `tenants/demo/downloads/${FILE.name}`, file_size: 2_400_000 }));
  const atFile = state({ record: RECORD, question: Q.file, answered: [TOPIC] });
  const sent = await stubFocus(
    page,
    () => state({ record: RECORD, question: Q.review, answered: [TOPIC, ["file", "File added"]] }),
    atFile,
  );

  await page.goto(`${TENANT}${PATH}`);
  await expect(guide(page).getByText("Add the file")).toBeVisible();
  // Not in the guide: on the page's own file row.
  await page.getByRole("main").locator("#download-file").setInputFiles(FILE);
  await expect(guide(page).getByText("Here's your download. Does it fit?")).toBeVisible();
  expect(sent.filter((s) => s.field === "file")).toEqual([
    expect.objectContaining({ field: "file", value: "uploaded" }),
  ]);
  await expect(page.getByRole("main").getByText(FILE.name, { exact: false })).toBeVisible();
  await page.close();
});
