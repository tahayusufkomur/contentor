// e2e/specs/32-photo-studio.spec.ts
//
// The photo studio (Site -> Photo studio; backend/apps/media/designs.py, frontend components/studio and
// components/covers): a coach designs the cover of a course with the simple controls, keeps it, and takes
// it back. Covers are drawn live by one renderer, whose root carries `data-cover`; a page without a kept
// design shows the course's plain photo.
//
//   list -> "Design a cover" -> words + "Title only" -> Keep -> the cover is on the course page, in the
//   site's courses list and in the studio -> Undo from History -> the plain photo is back -> Keep again,
//   Undo from the toast -> Discard (asks first) -> the course form's door waits for unsaved edits.
//
// The spec makes its own published course with its own photo, so it leans on no demo data, and removes
// both, and every design and History row of the course, when it is done. "Title only" draws no photo,
// and the spec never opens the library or the "New" photo tab: it spends no catalog credits.

import fs from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";

const stamp = Date.now();
const COURSE_TITLE = `E2E Studio ${stamp}`;
// What the cover says is not what the course is called: the page prints both.
const COVER_TITLE = `Calm Mornings ${stamp}`;

// The first visit to a route compiles it in the dev server.
const SLOW = { timeout: 30_000 };

let coach: BrowserContext;
let course: { id: number; slug: string } | undefined;
let photoId = "";

// A course's tile in the studio's list.
const tileOf = (page: Page) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: COURSE_TITLE, level: 3 }) });

// The cover a visitor sees on a page: exactly one, drawn live, with the words she typed (one size shows).
async function expectCover(page: Page) {
  const cover = page.locator("[data-cover]");
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
  await expect(page.locator("[data-cover]")).toHaveCount(0);
  await expect(page.getByRole("img", { name: COURSE_TITLE })).toHaveAttribute("src", /^https?:\/\//);
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
      data: { title: COURSE_TITLE, description: "", pricing_type: "free", price: 0, is_published: true, thumbnail: photoId },
    });
    expect(created.status(), `course create failed: ${await created.text()}`).toBe(201);
    course = await created.json();
  });

  test.afterEach(async () => {
    await Promise.all(coach.pages().map((page) => page.close()));
  });

  test.afterAll(async () => {
    if (!coach) return;
    if (course) await coach.request.delete(`${TENANT}/api/v1/courses/${course.slug}/`);
    if (photoId) await coach.request.delete(`${TENANT}/api/v1/photos/${photoId}/`);
    await coach.close();
    // A design belongs to no row that goes with its course, and History keeps what it recorded: after a
    // clean run there is nothing left to find, after a failed one there may be.
    if (course) {
      manage([
        "shell",
        "-c",
        [
          "from django_tenants.utils import schema_context",
          "from apps.media.models import Design",
          "from apps.tenant_config.models import CopilotAudit",
          "with schema_context('demo_yoga'):",
          `    Design.objects.filter(target_kind='course', target_key='${course.id}').delete()`,
          `    CopilotAudit.objects.filter(summary__contains='${COURSE_TITLE}').delete()`,
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

    // Typing saves itself (a PATCH of the draft), and the preview draws the words as they are typed.
    const autosaved = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && /\/api\/v1\/designs\/[0-9a-f-]{36}\/$/.test(res.url()),
    );
    await page.getByLabel("Title", { exact: true }).fill(COVER_TITLE);
    expect((await autosaved).ok()).toBe(true);
    const preview = page.getByRole("img", { name: "Card preview of the cover" }).locator("[data-cover]");
    await expect(preview).toContainText(COVER_TITLE);

    // "Title only" draws no photo. Keep straight after: it saves what is still waiting before it keeps.
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

    await expectPlainPhoto(page);
    await page.goto(`${TENANT}/`);
    await expect(page.getByRole("link", { name: new RegExp(COURSE_TITLE) }).first()).toBeVisible(SLOW);
    await expect(page.locator("[data-cover]")).toHaveCount(0);

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
    // The edits of the first round came back with the draft.
    await expect(admin.getByLabel("Title", { exact: true })).toHaveValue(COVER_TITLE, SLOW);
    await expect(admin.getByRole("button", { name: "Title only" })).toHaveAttribute("aria-pressed", "true");

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
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(COVER_TITLE);

    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await dialog.getByRole("button", { name: "Discard", exact: true }).click();
    await page.waitForURL(`${TENANT}/admin/studio`);

    const tile = tileOf(page);
    await expect(tile.getByText("Photo", { exact: true })).toBeVisible(SLOW);
    await expect(tile.getByText("Draft waiting")).toHaveCount(0);
    await expect(tile.getByRole("button", { name: "Design a cover" })).toBeVisible();
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
