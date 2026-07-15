// e2e/specs/18-curated-library-admin.spec.ts
//
// Superadmin curates the logo library through the adminkit GALLERY mode:
// drop/pick a PNG -> prefilled JSON modal -> save (trace-on-save runs
// server-side); a coach then sees the new logo in the Logo Studio's Ideas
// gallery; the superadmin deletes it again via the card's JSON modal
// (idempotent re-runs). Assumes the dev stack is seeded (make seed).

import path from "node:path";
import { test, expect } from "@playwright/test";
import { coachContext, superadminContext, MAIN, TENANT } from "../helpers/auth";

const FIXTURE_PNG = path.resolve(
  __dirname,
  "../../frontend-customer/public/logos/colorful_lotus_meditation_logo.png",
);
const TITLE = "E2E Curated Logo";

test("superadmin adds a curated logo via the gallery; coach sees it", async ({
  browser,
}) => {
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
  record.tags = "e2e, yoga";
  await textarea.fill(JSON.stringify(record, null, 2));
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 10_000 });

  // The new card is findable via search (seeded catalog spans pages).
  const searchBox = adminPage.getByPlaceholder(/search curated logos/i);
  await searchBox.fill(TITLE);
  await expect(adminPage.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

  // --- coach: the new logo appears in the Ideas gallery ------------------
  const coach = await coachContext(browser);
  const coachPage = await coach.newPage();
  await coachPage.goto(`${TENANT}/admin/design?studio=1`);
  const dialog = coachPage.getByRole("dialog");
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 15_000 });
  await coach.close();

  // --- superadmin: delete via the card's JSON modal (idempotent re-runs) --
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
