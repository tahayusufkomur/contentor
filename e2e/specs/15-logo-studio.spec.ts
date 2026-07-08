// e2e/specs/15-logo-studio.spec.ts
//
// Coach opens the Logo Studio via the setup-assistant deep link and walks the
// AI-first flow: Brief -> wall of 24 composed ideas (deterministic, offline)
// -> Shuffle -> Customize one -> fine-tune in the editor -> save. The PATCH
// must persist a schema-v2 recipe. Offline the AI top-up is a no-op (the
// suggestions endpoint returns source=fallback, which the wall ignores).

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a logo through brief, wall, and editor", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/design?studio=1`);
  // Not getByText("Logo Studio") — the underlying Branding card (portaled
  // behind the dialog, still mounted in the DOM per ModalPortal) has a
  // "Create a logo in Logo Studio" / "Edit logo in Logo Studio" button whose
  // text also contains the substring "Logo Studio", so a text locator
  // strict-mode-violates with 2 matches. The dialog's <h2> is the only
  // element with role=heading, so scope to that.
  await expect(
    page.getByRole("heading", { name: "Logo Studio" }),
  ).toBeVisible();

  // Everything below is scoped to the dialog: the Branding page behind the
  // modal stays mounted (ModalPortal) and has its own "Brand Name" input,
  // buttons, etc. — unscoped locators strict-mode-violate.
  const dialog = page.getByRole("dialog");

  // Fresh tenants land on the Brief step; tenants with a saved design land
  // in the Editor — normalize by navigating to the Brief either way.
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  await expect(briefHeading).toBeVisible();

  // Brief: name (prefilled from config; ensure non-empty), niche, a chip.
  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  // Wall: 24 cards, instantly (no network dependency).
  await expect(dialog.getByTestId("logo-wall")).toBeVisible();
  await expect(dialog.getByTestId("wall-card")).toHaveCount(24);

  // Shuffle regenerates the wall (new seed -> first card changes).
  const firstCardBefore = await dialog
    .getByTestId("wall-card")
    .first()
    .innerHTML();
  await dialog.getByRole("button", { name: "Shuffle" }).click();
  await expect(async () => {
    const after = await dialog.getByTestId("wall-card").first().innerHTML();
    expect(after).not.toBe(firstCardBefore);
  }).toPass({ timeout: 5_000 });

  // Customize the first card -> Editor step.
  await dialog
    .getByTestId("wall-card")
    .first()
    .getByRole("button", { name: /Customize this/ })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Use this logo" }),
  ).toBeVisible();

  // Fine-tune: force a known layout + icon + tagline so the PATCH assertions
  // are deterministic regardless of which card was picked.
  await dialog.getByRole("button", { name: "Mark + name" }).click();
  await dialog.getByRole("button", { name: "flower-2", exact: true }).click();
  await dialog
    .getByPlaceholder("e.g. Yoga for busy mothers")
    .fill("Move every day");

  // Save → wait for the config PATCH and assert the payload persisted.
  // Loose "admin/config" matcher — 09-builder.spec.ts matches the same PATCH
  // without the /v1 segment, so don't assume the exact browser-visible prefix.
  const patchPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("admin/config") &&
      resp.request().method() === "PATCH" &&
      resp.status() === 200,
    { timeout: 30_000 },
  );
  await dialog.getByRole("button", { name: "Use this logo" }).click();
  const patch = await patchPromise;
  const body = patch.request().postDataJSON();
  expect(body.logo_id).toBeTruthy();
  expect(body.icon_id).toBeTruthy();
  expect(body.logo_recipe.version).toBe(2);
  expect(body.logo_recipe.layout).toBe("horizontal");
  expect(body.logo_recipe.tagline).toBe("Move every day");
  expect(body.logo_recipe.mark).toEqual({
    type: "icon",
    icon: "flower-2",
    style: "outline",
  });
  expect(body.logo_recipe.badge.shape).toBeTruthy();
  expect(body.logo_recipe.typography.name.weight).toBeGreaterThanOrEqual(400);

  // Dialog closes on success
  await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeHidden({
    timeout: 15_000,
  });

  await coach.close();
});
