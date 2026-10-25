// e2e/specs/32-photo-studio.spec.ts
//
// The photo studio (Site -> Photo studio; backend/apps/media/designs.py, frontend components/studio and
// components/covers): a coach designs the cover of a course, keeps it, and takes it back. Covers are
// drawn live by one renderer, whose root carries `data-cover`; a page without a kept design shows the
// course's plain photo.
//
//   list -> "Design a cover" -> words + "Title only" -> Keep -> the cover is on the course page, in the
//   site's courses list and in the studio -> Undo from History -> the plain photo is back -> Keep again,
//   Undo from the toast -> Discard (asks first) -> the desktop editor's own tests (below) -> the course
//   form's door waits for unsaved edits.
//
// The Canva-style tools have tests of their own: a filter and a frame from Edit photo, an icon and a QR code
// from Elements, the Story size, and a real download of it (drawn by the browser sidecar). They spend nothing:
// the paid photo tools (extend, take out, change) and the background remover are left to the unit tests.
//
// The editor has two faces. From 1024 px (the coach context is 1440x900) it is a rail of tools with a
// drawer each and a canvas the cover is edited on: the flow above goes through it (the title is typed in
// the Text drawer), and then tests of its own measure the first screen, drag a layer and undo it with
// Cmd-Z, add a badge from Elements, nudge a layer at Banner, type in place on the canvas, and check that
// Cmd-Z in a field is the field's own. Below 1024 px the simple controls are the whole editor: one test at
// 390x844 types the title there and waits for it to save.
//
// The spec makes its own published course with its own photo, and a second, unpublished one with a kept
// cover (the editor lists it under "Your other covers"), so it leans on no demo data, and removes both
// courses, and every design and History row of them, when it is done. "Title only" draws no photo, and the
// spec never opens the library or the "New" photo tab: it spends no catalog credits.

import fs from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";

const stamp = Date.now();
const COURSE_TITLE = `E2E Studio ${stamp}`;
// What the cover says is not what the course is called: the page prints both.
const COVER_TITLE = `Calm Mornings ${stamp}`;
// The second course, which has to be named nothing like the first: a tile is found by part of its name.
const NEIGHBOUR_TITLE = `E2E Neighbour ${stamp}`;
// What she types on the canvas, and on the phone.
const TYPED_TITLE = `Evening Flow ${stamp}`;
const PHONE_TITLE = `Pocket Practice ${stamp}`;

// The first visit to a route compiles it in the dev server.
const SLOW = { timeout: 30_000 };

let coach: BrowserContext;
let course: { id: number; slug: string } | undefined;
let neighbour: { id: number; slug: string } | undefined;
let photoId = "";

// A course's tile in the studio's list.
const tileOf = (page: Page) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: COURSE_TITLE, level: 3 }) });

// This course's cover on a page: the one that says what she typed. Other courses may wear covers of their
// own (a page holds as many `[data-cover]` as it has designed courses), and the stamp makes these words
// this run's alone.
const coverOf = (page: Page) => page.locator("[data-cover]").filter({ hasText: COVER_TITLE });

// The cover a visitor sees on a page: exactly one, drawn live, with the words she typed (one size shows).
async function expectCover(page: Page) {
  const cover = coverOf(page);
  await expect(cover).toHaveCount(1, SLOW);
  await expect(cover).toContainText(COVER_TITLE);
  await expect(cover.getByText(COVER_TITLE).filter({ visible: true })).toHaveCount(1);
  // "Title only": no photo layer in any size
  await expect(cover.locator('[data-layer="photo"]')).toHaveCount(0);
}

// A page of the site as it is with no kept design: no cover, the course's own photo.
async function expectPlainPhoto(page: Page) {
  await page.goto(`${TENANT}/courses/${course!.slug}`);
  await expect(page.getByRole("heading", { name: COURSE_TITLE, level: 1 })).toBeVisible(SLOW);
  await expect(coverOf(page)).toHaveCount(0);
  await expect(page.getByRole("img", { name: COURSE_TITLE })).toHaveAttribute("src", /^https?:\/\//);
}

// The desktop editor's rail ("Studio tools"): a button for each drawer.
const tool = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Studio tools" }).getByRole("button", { name, exact: true });

// The canvas the cover is drawn and edited on (one size of it), and one layer of the cover on it.
const canvasOf = (page: Page) => page.getByTestId("studio-canvas");
const layerOn = (page: Page, id: string) => canvasOf(page).locator(`[data-layer="${id}"]`);

// The draft's autosave is a PATCH of the draft, and the editor says "Saved" once the last edit has landed.
const isAutosave = (res: Response) =>
  res.request().method() === "PATCH" && /\/api\/v1\/designs\/[0-9a-f-]{36}\/$/.test(res.url());
const saveStatus = (page: Page) => page.getByRole("status").filter({ hasText: /Sav|Couldn/ });

// Does `edit`, and waits until the draft has saved it: the PATCH answered, and the editor reads "Saved".
async function savedAfter(page: Page, edit: () => Promise<unknown>) {
  const autosaved = page.waitForResponse(isAutosave);
  await edit();
  expect((await autosaved).ok()).toBe(true);
  await expect(saveStatus(page)).toHaveText("Saved");
}

async function boxOf(el: Locator) {
  const box = await el.boundingBox();
  if (!box) throw new Error("not on the page: it has no box");
  return box;
}

// Where a layer sits on the canvas, in px from the canvas's top left corner and as fractions of the canvas.
// Never on the screen: for a moment after a page loads the canvas can still be a pixel or two off its place,
// and the layer with it.
async function placeOf(page: Page, id: string) {
  const canvas = await boxOf(canvasOf(page));
  const box = await boxOf(layerOn(page, id));
  const [x, y] = [box.x - canvas.x, box.y - canvas.y];
  return { x: x / canvas.width, y: y / canvas.height, px: { x, y } };
}

// The middle of a box, where a pointer grabs it.
const middle = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

// Her drafts of this course are thrown away, so that a test starts from the course's own photo and nothing
// another test edited (a draft keeps its edits).
async function dropDrafts() {
  const drafts = await coach.request.get(`${TENANT}/api/v1/designs/?state=draft`);
  expect(drafts.ok(), `listing the drafts failed: ${await drafts.text()}`).toBeTruthy();
  for (const draft of (await drafts.json()) as { id: string; target_kind: string; target_key: string }[]) {
    if (draft.target_kind === "course" && draft.target_key === String(course!.id)) {
      const gone = await coach.request.delete(`${TENANT}/api/v1/designs/${draft.id}/`);
      expect(gone.ok(), `discarding a draft failed: ${await gone.text()}`).toBeTruthy();
    }
  }
}

// The editor on a new draft of the course, opened the way she opens it: the course's tile in the studio.
async function openEditor(page: Page) {
  await dropDrafts();
  await page.goto(`${TENANT}/admin/studio`);
  await tileOf(page).getByRole("button", { name: "Design a cover" }).click(SLOW);
  await page.waitForURL(/\/admin\/studio\/[0-9a-f-]{36}$/);
}

test.describe.serial("photo studio: design a cover, keep it, take it back", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async ({ browser }) => {
    coach = await coachContext(browser); // demo-yoga's owner
    const api = coach.request;

    // A photo, uploaded the way the course form uploads one: presign, PUT to storage, complete.
    const png = fs.readFileSync(path.join(__dirname, "..", "fixtures", "pixel.png"));
    const presign = await api.post(`${TENANT}/api/v1/upload/presign/`, {
      data: { filename: "pixel.png", content_type: "image/png", category: "photo" },
    });
    expect(presign.status(), `presign failed: ${await presign.text()}`).toBe(200);
    const { upload_url, s3_key } = await presign.json();
    const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png });
    expect(put.ok, `storage PUT failed: ${put.status} ${put.statusText}`).toBeTruthy();
    const complete = await api.post(`${TENANT}/api/v1/upload/complete/`, {
      data: { s3_key, category: "photo", file_size: png.byteLength },
    });
    expect(complete.status(), `upload/complete failed: ${await complete.text()}`).toBe(200);
    photoId = (await complete.json()).photo_id;

    // A public course page 404s for an unpublished course, so publish it.
    const created = await api.post(`${TENANT}/api/v1/courses/`, {
      data: {
        title: COURSE_TITLE,
        description: "",
        pricing_type: "free",
        price: 0,
        is_published: true,
        thumbnail: photoId,
        // A course goes live only once every lesson has a video or text.
        modules: [{ title: "Start", lessons: [{ title: "Welcome", content_html: "<p>Welcome.</p>" }] }],
      },
    });
    expect(created.status(), `course create failed: ${await created.text()}`).toBe(201);
    course = await created.json();

    // A neighbour: a second course, unpublished (no page of the site changes) and wearing a kept cover, which
    // the editor lists under "Your other covers". Without one that strip is not there to be measured.
    const next = await api.post(`${TENANT}/api/v1/courses/`, {
      data: { title: NEIGHBOUR_TITLE, description: "", pricing_type: "free", price: 0, is_published: false, thumbnail: photoId },
    });
    expect(next.status(), `neighbour create failed: ${await next.text()}`).toBe(201);
    neighbour = await next.json();
    const draft = await api.post(`${TENANT}/api/v1/designs/`, {
      data: { target_kind: "course", target_key: String(neighbour!.id) },
    });
    expect(draft.ok(), `neighbour draft failed: ${await draft.text()}`).toBeTruthy();
    const kept = await api.post(`${TENANT}/api/v1/designs/${(await draft.json()).id}/keep/`);
    expect(kept.ok(), `neighbour keep failed: ${await kept.text()}`).toBeTruthy();
  });

  test.afterEach(async () => {
    await Promise.all(coach.pages().map((page) => page.close()));
  });

  test.afterAll(async () => {
    if (!coach) return;
    if (course) await coach.request.delete(`${TENANT}/api/v1/courses/${course.slug}/`);
    if (neighbour) await coach.request.delete(`${TENANT}/api/v1/courses/${neighbour.slug}/`);
    if (photoId) await coach.request.delete(`${TENANT}/api/v1/photos/${photoId}/`);
    await coach.close();
    // A design belongs to no row that goes with its course, and History keeps what it recorded: after a
    // clean run there is nothing left to find, after a failed one there may be.
    const keys = [course, neighbour].flatMap((one) => (one ? [`'${one.id}'`] : []));
    if (keys.length) {
      manage([
        "shell",
        "-c",
        [
          "from django_tenants.utils import schema_context",
          "from apps.media.models import Design",
          "from apps.tenant_config.models import CopilotAudit",
          "with schema_context('demo_yoga'):",
          `    Design.objects.filter(target_kind='course', target_key__in=[${keys.join(", ")}]).delete()`,
          `    CopilotAudit.objects.filter(summary__contains='${COURSE_TITLE}').delete()`,
          `    CopilotAudit.objects.filter(summary__contains='${NEIGHBOUR_TITLE}').delete()`,
        ].join("\n"),
      ]);
    }
  });

  test("before any design the course page shows its photo, and the studio lists it with one way in", async ({
    page: visitor,
  }) => {
    // Before any design the course page shows the course's own photo.
    await expectPlainPhoto(visitor);

    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/studio`);

    await expect(page.getByRole("heading", { name: "Photo studio", level: 1 })).toBeVisible(SLOW);
    // It sits in Site, and that section is lit.
    await expect(
      page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Photo studio" }),
    ).toHaveAttribute("aria-current", "page");

    const tile = tileOf(page);
    await expect(tile.getByText("Photo", { exact: true })).toBeVisible(SLOW);
    await expect(tile.getByRole("button", { name: "Design a cover" })).toBeEnabled();
  });

  test("design a cover: the words and 'Title only' draw in the preview, and Keep puts it on the course", async () => {
    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/studio`);
    await tileOf(page).getByRole("button", { name: "Design a cover" }).click({ timeout: 30_000 });

    // The editor opens on a new draft of this course.
    await page.waitForURL(/\/admin\/studio\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: COURSE_TITLE, level: 1 })).toBeVisible(SLOW);
    await expect(page.getByRole("button", { name: "Keep on course" })).toBeVisible();

    // The cover's words are typed in the rail's Text drawer. Typing saves itself (a PATCH of the draft), and
    // the canvas draws the words as they are typed.
    await tool(page, "Text").click();
    const autosaved = page.waitForResponse(isAutosave);
    await page.getByLabel("Title", { exact: true }).fill(COVER_TITLE);
    expect((await autosaved).ok()).toBe(true);
    const preview = page.getByRole("img", { name: "Card preview of the cover" }).locator("[data-cover]");
    await expect(preview).toContainText(COVER_TITLE);

    // "Title only" (in the Layouts drawer) draws no photo. Keep straight after: it saves what is still
    // waiting before it keeps.
    await tool(page, "Layouts").click();
    const layout = page.getByRole("button", { name: "Title only" });
    await expect(preview.locator('[data-layer="photo"]')).not.toHaveCount(0);
    await layout.click();
    await expect(layout).toHaveAttribute("aria-pressed", "true");
    await expect(preview.locator('[data-layer="photo"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Keep on course" }).click();

    await expect(page.getByText(`Kept. ${COURSE_TITLE} now uses this cover.`)).toBeVisible(SLOW);
    // The editor shows the kept cover, to be copied, not edited.
    await expect(page.getByRole("button", { name: "Edit a copy" })).toBeVisible(SLOW);
    await expect(page.getByRole("button", { name: "Keep on course" })).toHaveCount(0);
  });

  test("the kept cover is drawn on the course page, in the courses list and in the studio", async ({ page }) => {
    // As a visitor: nothing here needs a login.
    await page.goto(`${TENANT}/courses/${course!.slug}`);
    await expect(page.getByRole("heading", { name: COURSE_TITLE, level: 1 })).toBeVisible(SLOW);
    await expectCover(page);
    await expect(page.getByRole("img", { name: COURSE_TITLE })).toHaveCount(0);

    // The newest course leads the site's course list, on the home page and on /courses.
    for (const url of [`${TENANT}/`, `${TENANT}/courses`]) {
      await page.goto(url);
      await expect(page.getByRole("link", { name: new RegExp(COURSE_TITLE) }).first()).toBeVisible(SLOW);
      await expectCover(page);
    }

    // And the studio's own tile, which says what the course wears now.
    const studio = await coach.newPage();
    await studio.goto(`${TENANT}/admin/studio`);
    const tile = tileOf(studio);
    await expect(tile.getByText("Designed", { exact: true })).toBeVisible(SLOW);
    await expect(tile.locator("[data-cover]")).toContainText(COVER_TITLE);
    await expect(tile.getByRole("button", { name: "Edit a copy" })).toBeVisible();
  });

  test("History takes the Keep back, and the course wears its photo again", async ({ page }) => {
    const admin = await coach.newPage();
    await admin.goto(`${TENANT}/admin/courses?assistant=history`);
    const panel = admin.getByRole("complementary", { name: "Your team" });
    const row = panel.getByRole("listitem").filter({ hasText: `Kept a new cover for '${COURSE_TITLE}'` });
    await expect(row).toHaveCount(1, SLOW);
    await row.getByRole("button", { name: "Undo" }).click();
    await expect(row).toContainText("Undone");
    await expect(row.getByRole("button", { name: "Undo" })).toHaveCount(0);
    // Its open state stays in the browser, and the later tests (a phone's 390 px most of all, where the panel
    // is a sheet over the page) want the page to themselves: shut it.
    await panel.getByRole("button", { name: "Close the assistant" }).click();
    await expect(panel).toHaveCount(0);

    await expectPlainPhoto(page);
    await page.goto(`${TENANT}/`);
    await expect(page.getByRole("link", { name: new RegExp(COURSE_TITLE) }).first()).toBeVisible(SLOW);
    await expect(coverOf(page)).toHaveCount(0);

    // The design is a draft again, waiting where she left it.
    const studio = await coach.newPage();
    await studio.goto(`${TENANT}/admin/studio`);
    await expect(tileOf(studio).getByText("Draft waiting")).toBeVisible(SLOW);
  });

  test("keep it again and Undo in the toast: the draft comes back as she left it", async ({ page }) => {
    const admin = await coach.newPage();
    await admin.goto(`${TENANT}/admin/studio`);
    await tileOf(admin).getByRole("button", { name: "Continue" }).click({ timeout: 30_000 });
    await admin.waitForURL(/\/admin\/studio\/[0-9a-f-]{36}$/);
    // The edits of the first round came back with the draft: the layout in the Layouts drawer the editor opens
    // on, the title in the Text drawer.
    await expect(admin.getByRole("button", { name: "Title only" })).toHaveAttribute("aria-pressed", "true", SLOW);
    await tool(admin, "Text").click();
    await expect(admin.getByLabel("Title", { exact: true })).toHaveValue(COVER_TITLE);

    await admin.getByRole("button", { name: "Keep on course" }).click();
    const kept = admin.locator("[data-sonner-toast]", { hasText: "now uses this cover" });
    await expect(kept).toBeVisible(SLOW);
    await expect(admin.getByRole("button", { name: "Edit a copy" })).toBeVisible(SLOW);
    await kept.getByRole("button", { name: "Undo" }).click();

    await expect(admin.getByText("Taken back")).toBeVisible(SLOW);
    // The editor reloads on the draft: it can be kept again.
    await expect(admin.getByRole("button", { name: "Keep on course" })).toBeVisible(SLOW);
    await expect(admin.getByRole("button", { name: "Edit a copy" })).toHaveCount(0);
    await expectPlainPhoto(page);
  });

  test("Discard asks first; the draft is gone and the course keeps its photo", async () => {
    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/studio`);
    await expect(tileOf(page).getByText("Draft waiting")).toBeVisible(SLOW);
    await tileOf(page).getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/admin\/studio\/[0-9a-f-]{36}$/);

    // "Keep editing" throws nothing away.
    const dialog = page.getByRole("alertdialog", { name: "Discard this draft?" });
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(dialog).toBeVisible(SLOW);
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toHaveCount(0);
    await tool(page, "Text").click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(COVER_TITLE);

    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await dialog.getByRole("button", { name: "Discard", exact: true }).click();
    await page.waitForURL(`${TENANT}/admin/studio`);

    const tile = tileOf(page);
    await expect(tile.getByText("Photo", { exact: true })).toBeVisible(SLOW);
    await expect(tile.getByText("Draft waiting")).toHaveCount(0);
    await expect(tile.getByRole("button", { name: "Design a cover" })).toBeVisible();
  });

  // ---- The desktop editor, from 1024 px. Each of these starts on a new draft of the course. ----

  test("desktop: the canvas, the rail and the whole of 'Your other covers' fit the first screen", async () => {
    const page = await coach.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEditor(page);

    // From 1024 px the editor is a rail of tools beside a canvas; the phone's controls are not there.
    await expect(canvasOf(page)).toBeVisible(SLOW);
    await expect(page.getByRole("navigation", { name: "Studio tools" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Words" })).toHaveCount(0);

    // Her other covers (the neighbour's) are one row under the canvas.
    const tiles = page.getByRole("region", { name: "Your other covers" }).getByRole("listitem");
    await expect(tiles.first()).toBeVisible(SLOW);

    // All of it is on the first screen: the canvas (never under 320 px tall) and every tile, name and all.
    const { height } = page.viewportSize()!;
    const inside = async (el: Locator) => {
      const box = await boxOf(el);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      return box;
    };
    expect((await inside(canvasOf(page))).height).toBeGreaterThanOrEqual(320);
    for (const tile of await tiles.all()) await inside(tile);

    // And nothing scrolls: not the page, not the column the canvas sits in (a pixel is rounding).
    const overflow = await canvasOf(page).evaluate((canvas) => {
      let column = canvas.parentElement;
      while (column && !/auto|scroll/.test(getComputedStyle(column).overflowY)) column = column.parentElement;
      const root = document.scrollingElement!;
      return {
        page: root.scrollHeight - root.clientHeight,
        column: column ? column.scrollHeight - column.clientHeight : 0,
      };
    });
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.column).toBeLessThanOrEqual(1);
  });

  test("desktop: drag the title 40 px, and Cmd-Z puts it back where it was", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    const title = layerOn(page, "title");
    await expect(title).toBeVisible(SLOW);
    const first = (await placeOf(page, "title")).px;

    // Pointer down on the title, 40 px to the right, up: one edit, and the draft saves it. (A layer that lands
    // within 1.2% of a guide on the canvas snaps to it, so the distance is to a few pixels.)
    const grab = middle(await boxOf(title));
    await savedAfter(page, async () => {
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(grab.x + 40, grab.y, { steps: 8 });
      await page.mouse.up();
    });
    const dragged = (await placeOf(page, "title")).px;
    expect(dragged.x - first.x).toBeGreaterThan(32);
    expect(dragged.x - first.x).toBeLessThan(48);
    expect(Math.abs(dragged.y - first.y)).toBeLessThan(8);

    // She is not typing in a field (the press focused the canvas), so Cmd-Z (Ctrl-Z elsewhere) steps the
    // history: the title is back, and the draft saves that too.
    await savedAfter(page, () => page.keyboard.press("ControlOrMeta+z"));
    const back = (await placeOf(page, "title")).px;
    expect(Math.abs(back.x - first.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.y - first.y)).toBeLessThanOrEqual(2);
  });

  test("desktop: 'New' in the Elements drawer puts the badge on the canvas", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    await expect(canvasOf(page)).toBeVisible(SLOW);
    const badge = canvasOf(page).locator("[data-badge]");
    await expect(badge).toHaveCount(0);

    // The drawer's badges set what the cover's own badge says; "New" reads for a course made in the last
    // 30 days, which this one is.
    await tool(page, "Elements").click();
    const kind = page.getByRole("region", { name: "Elements" }).getByRole("button", { name: "New", exact: true });
    await savedAfter(page, () => kind.click());
    await expect(kind).toHaveAttribute("aria-pressed", "true");
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText("New");
  });

  test("desktop: a nudge at Banner leaves the Card where it was", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    await expect(layerOn(page, "title")).toBeVisible(SLOW);

    // The logo, where the site has one on its covers: the frame the layouts give it is wider than the mark, so
    // what she grabs is the mark. Else the title. Either way it is a layer whose frame a nudge writes.
    const id = (await layerOn(page, "logo").count()) > 0 ? "logo" : "title";
    test.info().annotations.push({ type: "layer", description: id });
    const grabPoint = async () => {
      if (id === "title") return middle(await boxOf(layerOn(page, id)));
      const mark = layerOn(page, id).locator("img");
      await expect.poll(() => mark.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      return mark.evaluate((img: HTMLImageElement) => {
        // the image is contained in its frame, from the side object-position names
        const frame = img.getBoundingClientRect();
        const scale = Math.min(frame.width / img.naturalWidth, frame.height / img.naturalHeight);
        const [side = 0.5] = getComputedStyle(img).objectPosition.split(" ").map((v) => parseFloat(v) / 100);
        const width = img.naturalWidth * scale;
        return { x: frame.left + (frame.width - width) * side + width / 2, y: frame.top + frame.height / 2 };
      });
    };
    // The size switcher is pressed from the keyboard: a toast (the agent team's "done" notes) can cover the top
    // centre of the page, and the buttons with it, for several seconds after it loads.
    const sizes = page.getByRole("group", { name: "Cover size" });
    const switchTo = async (name: RegExp) => {
      await sizes.getByRole("button", { name }).press("Enter");
      await expect(sizes.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    };
    const card = await placeOf(page, id);

    await switchTo(/^Banner/);
    await expect(layerOn(page, id)).toBeVisible();
    const banner = await placeOf(page, id);
    const grab = await grabPoint();
    await page.mouse.click(grab.x, grab.y);
    await expect(page.getByTestId("selection-box")).toHaveAttribute("data-layer-id", id);
    // Shift-Right is 2% of the canvas.
    await savedAfter(page, () => page.keyboard.press("Shift+ArrowRight"));
    expect((await placeOf(page, id)).x - banner.x).toBeGreaterThan(0.01);

    // Back at Card, the layer is where it was...
    await switchTo(/^Card/);
    const again = await placeOf(page, id);
    expect(Math.abs(again.x - card.x)).toBeLessThan(0.003);
    expect(Math.abs(again.y - card.y)).toBeLessThan(0.003);

    // ...and Banner kept the nudge.
    await switchTo(/^Banner/);
    expect((await placeOf(page, id)).x - banner.x).toBeGreaterThan(0.01);
  });

  test("desktop: double-click the title, type, press Enter: the words change, and Cmd-Z gives them back", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    const title = layerOn(page, "title");
    // The cover says what the course is called until she types other words.
    await expect(title).toHaveText(COURSE_TITLE, SLOW);

    const at = middle(await boxOf(title));
    await page.mouse.dblclick(at.x, at.y);
    const field = page.getByRole("textbox", { name: "Words on the cover" });
    await expect(field).toBeFocused();
    await page.keyboard.type(TYPED_TITLE); // the words are all selected: this replaces them
    await savedAfter(page, () => page.keyboard.press("Enter"));
    await expect(field).toHaveCount(0);
    await expect(title).toHaveText(TYPED_TITLE);

    // Enter gave the focus back to the canvas, so Cmd-Z steps the history: the course's own title again.
    await savedAfter(page, () => page.keyboard.press("ControlOrMeta+z"));
    await expect(title).toHaveText(COURSE_TITLE);
  });

  test("desktop: Cmd-Z in a field is the field's own, and leaves the editor's history alone", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    const photo = layerOn(page, "photo");
    await expect(photo).toHaveCount(1, SLOW);

    // One edit to step back: "Title only" draws no photo.
    await savedAfter(page, () => page.getByRole("button", { name: "Title only" }).click());
    await expect(photo).toHaveCount(0);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeEnabled();

    // In the Title field of the Text drawer...
    await tool(page, "Text").click();
    await page.getByLabel("Title", { exact: true }).click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(photo).toHaveCount(0);
    await expect(undo).toBeEnabled();

    // ...and in the field that types in place on the canvas.
    const at = middle(await boxOf(layerOn(page, "title")));
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.getByRole("textbox", { name: "Words on the cover" })).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(photo).toHaveCount(0);
    await expect(undo).toBeEnabled();

    // Escape drops what was typed (nothing) and gives the canvas the focus: now Cmd-Z is the editor's.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Words on the cover" })).toHaveCount(0);
    await savedAfter(page, () => page.keyboard.press("ControlOrMeta+z"));
    await expect(photo).toHaveCount(1);
    await expect(undo).toBeDisabled();
  });

  // ---- Below 1024 px the simple controls are the whole editor. ----

  // The draft as the server keeps it, for what an edit wrote.
  async function draftRecipe(page: Page) {
    const id = page.url().split("/").pop();
    const res = await coach.request.get(`${TENANT}/api/v1/designs/${id}/`);
    expect(res.ok(), `reading the draft failed: ${await res.text()}`).toBeTruthy();
    return (await res.json()).recipe;
  }

  test("desktop: Edit photo grades the photo and cuts its frame; Elements adds an icon and a QR code of the page", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    await expect(layerOn(page, "photo")).toBeVisible(SLOW);

    await tool(page, "Edit photo").click();
    const drawer = page.getByRole("region", { name: "Edit photo" });
    await savedAfter(page, () => drawer.getByRole("button", { name: "Black and white" }).click());
    await savedAfter(page, () => drawer.getByRole("button", { name: "Circle", exact: true }).click());
    expect((await draftRecipe(page)).photo).toMatchObject({ grade: "mono", mask: "circle" });
    await expect(layerOn(page, "photo")).toHaveCSS("clip-path", /circle/);

    await tool(page, "Elements").click();
    const elements = page.getByRole("region", { name: "Elements" });
    await savedAfter(page, () => elements.getByRole("button", { name: "Calendar" }).click());
    await savedAfter(page, () => elements.getByRole("button", { name: /Add a QR code of this page/ }).click());
    const extras = (await draftRecipe(page)).extras as { type: string; text?: string; icon?: string }[];
    expect(extras.map((extra) => extra.type)).toEqual(["icon", "qr"]);
    expect(extras[0].icon).toBe("calendar");
    expect(extras[1].text).toMatch(new RegExp(`/courses/${course!.slug}$`));
    // both drawn on the canvas, as pictures of their own
    await expect(canvasOf(page).locator('[data-layer^="x"] svg')).toHaveCount(2);
  });

  test("desktop: Story draws the cover 9:16, and Download makes a file of it", async () => {
    const page = await coach.newPage();
    await openEditor(page);
    await expect(layerOn(page, "title")).toBeVisible(SLOW);
    const story = page.getByRole("group", { name: "Social size" }).getByRole("button", { name: /^Story/ });
    await story.press("Enter");
    await expect(story).toHaveAttribute("aria-pressed", "true");
    const box = await boxOf(canvasOf(page));
    expect(box.width / box.height).toBeCloseTo(9 / 16, 2);

    const targets = await (await coach.request.get(`${TENANT}/api/v1/designs/targets/`)).json();
    test.skip(!targets.export, "this stack has no browser sidecar to draw files with");
    await page.getByRole("button", { name: "Download" }).click();
    const sizes = page.getByRole("menuitem");
    await expect(sizes).toHaveCount(7); // six sizes and the JPG choice
    const download = page.waitForEvent("download", SLOW);
    await page.getByRole("menuitem", { name: /^Story/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/-story\.png$/);
    const saved = await file.path();
    const head = fs.readFileSync(saved).subarray(0, 24);
    // a PNG, 1080 wide and 1920 high
    expect(head.subarray(1, 4).toString()).toBe("PNG");
    expect(head.readUInt32BE(16)).toBe(1080);
    expect(head.readUInt32BE(20)).toBe(1920);
  });

  test("phone: the title is typed in the simple controls, and saves itself", async () => {
    const page = await coach.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page);

    // There is no canvas on a phone: the controls are the editor, with the cover in its preview.
    const title = page.getByLabel("Title", { exact: true });
    await expect(title).toBeVisible(SLOW);
    await expect(canvasOf(page)).toHaveCount(0);
    await savedAfter(page, () => title.fill(PHONE_TITLE));
    const preview = page.getByRole("img", { name: "Card preview of the cover" }).locator("[data-cover]");
    await expect(preview).toContainText(PHONE_TITLE);

    // What the draft saved is what comes back.
    await page.reload();
    await expect(title).toHaveValue(PHONE_TITLE, SLOW);
  });

  test("the course form's door waits until her edits are saved", async () => {
    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/courses/${course!.slug}`);
    const door = page.getByRole("button", { name: "Design a cover", exact: true });
    const hint = page.getByText("Save your changes first.");
    await expect(door).toBeEnabled(SLOW);
    await expect(hint).toHaveCount(0);

    await page.getByLabel("Title", { exact: true }).fill(`${COURSE_TITLE} (edited)`);
    await expect(door).toBeDisabled();
    await expect(hint).toBeVisible();

    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Course saved")).toBeVisible(SLOW);
    await expect(door).toBeEnabled();
    await expect(hint).toHaveCount(0);
  });
});
