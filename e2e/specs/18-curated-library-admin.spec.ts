// e2e/specs/18-curated-library-admin.spec.ts
//
// Phase 2 loop: superadmin creates a curated logo through the generic
// adminkit page (including a real PNG upload through /api/v1/platform/upload/),
// a coach then sees it in the Logo Studio's Browse entrance, and the
// superadmin deletes it again (idempotent re-runs). Assumes the dev stack is
// seeded (make seed).

import path from "node:path";
import { test, expect } from "@playwright/test";
import { coachContext, superadminContext, MAIN, TENANT } from "../helpers/auth";

const FIXTURE_PNG = path.resolve(
  __dirname,
  "../../frontend-customer/public/logos/colorful_lotus_meditation_logo.png",
);
const TITLE = "E2E Curated Logo";

test("superadmin adds a curated logo; coach sees it in the studio", async ({
  browser,
}) => {
  // --- superadmin: create via the adminkit page -------------------------
  const admin = await superadminContext(browser);
  const adminPage = await admin.newPage();
  await adminPage.goto(`${MAIN}/admin/m/curated-logos`);
  await adminPage.getByRole("button", { name: /New Curated Logo/i }).click();

  // The form renders as a fixed overlay that does NOT unmount the page
  // behind it (the list's own search textbox stays in the DOM) — scope
  // field lookups to the overlay panel, not the whole page.
  const panel = adminPage.locator("div.fixed.inset-0.z-50");
  await expect(panel.getByRole("heading", { name: "New Curated Logo" })).toBeVisible();

  // Adminkit form fields render in declared order: title, prompt, tags,
  // position, enabled, image. Labels aren't programmatically associated
  // (kit-wide), so address the text controls by order within the panel.
  const boxes = panel.getByRole("textbox");
  await boxes.nth(0).fill(TITLE); // title
  await boxes.nth(1).fill("an e2e test logo prompt"); // prompt (textarea)
  await boxes.nth(2).fill("e2e, yoga"); // tags

  await panel.locator('input[type="file"]').setInputFiles(FIXTURE_PNG);
  // Upload finished when the thumbnail preview appears.
  await expect(panel.getByAltText("Image key")).toBeVisible({
    timeout: 15_000,
  });

  await panel.getByRole("button", { name: "Create", exact: true }).click();
  await expect(panel).toBeHidden({ timeout: 10_000 });

  // The catalog already has 20+ seeded rows (default page size 20, sorted by
  // position) — the new row lands past page 1. Filter via the list's own
  // search box instead of assuming default pagination shows it.
  const searchBox = adminPage.getByPlaceholder(/search curated logos/i);
  await searchBox.fill(TITLE);
  await expect(adminPage.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

  // --- coach: the new logo appears in the Browse entrance ---------------
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

  // --- superadmin: clean up so re-runs stay idempotent -------------------
  // (still filtered to TITLE from the search above)
  await adminPage.getByText(TITLE).first().click();
  await expect(
    panel.getByRole("heading", { name: "Edit Curated Logo" }),
  ).toBeVisible();
  adminPage.once("dialog", (d) => d.accept()); // window.confirm on delete
  await panel.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(adminPage.getByText(TITLE, { exact: true })).toBeHidden({
    timeout: 10_000,
  });
  await admin.close();
});
