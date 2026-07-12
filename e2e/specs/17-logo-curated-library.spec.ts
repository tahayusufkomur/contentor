// e2e/specs/17-logo-curated-library.spec.ts
//
// Coach reaches the Browse entrance (Ideas step) of the Logo Studio, picks a
// curated ready-made logo, and saves it. Files-first: the catalog is the
// committed `public/logos/logo_meta.json` + PNGs — no backend involved on
// the read side. See 15-logo-studio.spec.ts for the deterministic-wall /
// Design-with-AI coverage this spec doesn't repeat.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach uses a curated logo and saves it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/design?studio=1`);
  await expect(
    page.getByRole("heading", { name: "Logo Studio" }),
  ).toBeVisible();

  const dialog = page.getByRole("dialog");

  // Fresh tenants land on the Brief step; tenants with a saved design land
  // in the Editor — normalize by navigating to the Brief either way.
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  await expect(briefHeading).toBeVisible();

  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  // Browse entrance: curated PNG gallery visible (niche-first for "yoga").
  const useButton = dialog.getByRole("button", { name: /use this/i }).first();
  await expect(useButton).toBeVisible({ timeout: 15_000 });
  await useButton.click();

  // Uploading + composing the picked illustration lands in the Editor.
  const save = dialog.getByRole("button", { name: "Use this logo" });
  await expect(save).toBeVisible({ timeout: 15_000 });

  const patchPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("admin/config") &&
      resp.request().method() === "PATCH" &&
      resp.status() === 200,
    { timeout: 30_000 },
  );
  await save.click();
  const patch = await patchPromise;
  const body = patch.request().postDataJSON();
  expect(body.logo_id).toBeTruthy();
  expect(body.icon_id).toBeTruthy();
  expect(body.logo_recipe.mark.type).toBe("image");

  await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeHidden({
    timeout: 15_000,
  });

  await coach.close();
});
