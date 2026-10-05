// e2e/specs/18-curated-library-admin.spec.ts
//
// Superadmin curates the logo library through the adminkit GALLERY mode:
// drop/pick a PNG -> prefilled JSON modal -> save (trace-on-save runs
// server-side); a coach then sees the new logo in the Logo Studio's Ideas
// gallery; the superadmin deletes it again via the card's JSON modal.
// Assumes the dev stack is seeded (make seed).

import path from "node:path";
import { test, expect } from "@playwright/test";
import { coachContext, superadminContext, MAIN, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";

const FIXTURE_PNG = path.resolve(
  __dirname,
  "../../frontend-customer/public/logos/colorful_lotus_meditation_logo.png",
);
const TITLE = "E2E Curated Logo";
// The Ideas wall shows only the top 20 of the whole catalog, keyword-ranked
// against the coach's brief (rankCuratedLogos) — a plain "yoga" logo ranks
// below hundreds of seeded yoga marks. A first tag no real catalog row
// carries, typed as the coach's niche, makes ours the only match: rank #1.
const NICHE = "e2ecurated";

// The upload's filename, once known: a passing run deletes the row through
// the UI, so afterAll can't find it by title any more.
let uploadedPng = "";

// Runs before AND after the test (pass or fail): one leftover row turns every
// later getByText(TITLE) into a strict-mode violation, and the dev mirror
// (CURATED_LOGO_SYNC_DIR) writes the upload into the git-tracked
// public/logos/ — deleting the row rewrites logo_meta.json, but the mirror
// never deletes files, so the PNG goes here.
function sweep() {
  manage([
    "shell",
    "-c",
    [
      "from pathlib import Path",
      "from django.conf import settings",
      "from apps.core.models import CuratedLogo",
      `names = {"${uploadedPng}"} - {""}`,
      `for row in CuratedLogo.objects.filter(title="${TITLE}"):`,
      "    names.add(row.image_key.rsplit('/', 1)[-1])",
      "    row.delete()",
      "for name in names if settings.CURATED_LOGO_SYNC_DIR else ():",
      "    Path(settings.CURATED_LOGO_SYNC_DIR, name).unlink(missing_ok=True)",
    ].join("\n"),
  ]);
}

test.beforeAll(sweep);
test.afterAll(sweep);

test("superadmin adds a curated logo via the gallery; coach sees it", async ({
  browser,
}) => {
  test.slow(); // see the catalog wait below
  // --- superadmin: create via drop -> JSON modal -------------------------
  const admin = await superadminContext(browser);
  const adminPage = await admin.newPage();
  await adminPage.goto(`${MAIN}/admin/m/curated-logos`);

  // Gallery mode: the hidden file input behind the "Add PNG" button is the
  // accessible/e2e path for the drop zone.
  await expect(
    adminPage.getByRole("button", { name: "Add PNG" }),
  ).toBeVisible();
  await adminPage.locator('input[type="file"]').setInputFiles(FIXTURE_PNG);

  // Upload finished -> JSON modal opens with the image preview and the
  // prefilled record template.
  const modal = adminPage.locator("div.fixed.inset-0.z-50");
  const textarea = modal.getByLabel("Record JSON");
  await expect(textarea).toBeVisible({ timeout: 15_000 });

  const record = JSON.parse(await textarea.inputValue());
  record.title = TITLE;
  record.prompt = "an e2e test logo prompt";
  record.tags = `${NICHE}, yoga`;
  await textarea.fill(JSON.stringify(record, null, 2));
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
  uploadedPng = manage([
    "shell",
    "-c",
    `from apps.core.models import CuratedLogo\nprint(CuratedLogo.objects.get(title="${TITLE}").image_key.rsplit("/", 1)[-1])`,
  ]);

  // The new card is findable via search (seeded catalog spans pages).
  const searchBox = adminPage.getByPlaceholder(/search curated logos/i);
  await searchBox.fill(TITLE);
  await expect(adminPage.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

  // --- coach: the new logo appears in the Ideas gallery ------------------
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();
  await coachPage.goto(`${TENANT}/?edit=1&studio=1`);
  const dialog = coachPage.getByRole("dialog");
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  // No style chip: an "elegant"-tagged seeded mark could outscore ours.
  await dialog.getByLabel("What do you teach?").fill(NICHE);
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  // The wall renders only after GET /api/v1/logos/curated/ — the whole
  // catalog with one presigned URL per row: 5-10s at ~800 rows, and dev
  // StrictMode fetches it twice concurrently.
  await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 45_000 });
  await coach.close();

  // --- superadmin: delete via the card's JSON modal -----------------------
  await adminPage.getByText(TITLE).first().click();
  await expect(textarea).toBeVisible();
  adminPage.once("dialog", (d) => d.accept()); // window.confirm on delete
  await modal.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
  await expect(adminPage.getByText(TITLE, { exact: true })).toBeHidden({
    timeout: 10_000,
  });
  await admin.close();
});
