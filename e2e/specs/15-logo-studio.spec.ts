// e2e/specs/15-logo-studio.spec.ts
//
// Coach opens the Logo Studio via the setup-assistant deep link, composes a
// logo (icon + name), saves, and the PATCH persists logo/icon/recipe. Also
// exercises the suggestions endpoint (deterministic fallback offline).

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a logo in the Logo Studio", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/design?studio=1`);
  // Not getByText("Logo Studio") — the underlying Branding card (portaled
  // behind the dialog, still mounted in the DOM per ModalPortal) has a
  // "Create a logo in Logo Studio" / "Edit logo in Logo Studio" button whose
  // text also contains the substring "Logo Studio", so a text locator
  // strict-mode-violates with 2 matches. The dialog's <h2> is the only
  // element with role=heading, so scope to that.
  await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeVisible();

  // Compose: v2 layout + a specific icon + a tagline
  await page.getByRole("button", { name: "Mark + name" }).click();
  await page.getByRole("button", { name: "flower-2", exact: true }).click();
  await page.getByPlaceholder("e.g. Yoga for busy mothers").fill("Move every day");

  // Suggestions still work offline via the deterministic fallback (v1
  // recipes, migrated to v2 client-side on receipt)
  await page.getByRole("button", { name: "Suggest ideas" }).click();
  await expect(page.getByTestId("logo-suggestions")).toBeVisible({ timeout: 15_000 });

  // Save → wait for the config PATCH and assert the payload persisted
  // Loose "admin/config" matcher — 09-builder.spec.ts matches the same PATCH
  // without the /v1 segment, so don't assume the exact browser-visible prefix.
  const patchPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("admin/config") &&
      resp.request().method() === "PATCH" &&
      resp.status() === 200,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Use this logo" }).click();
  const patch = await patchPromise;
  const body = patch.request().postDataJSON();
  expect(body.logo_id).toBeTruthy();
  expect(body.icon_id).toBeTruthy();
  expect(body.logo_recipe.version).toBe(2);
  expect(body.logo_recipe.layout).toBe("horizontal");
  expect(body.logo_recipe.tagline).toBe("Move every day");
  expect(body.logo_recipe.mark).toEqual({ type: "icon", icon: "flower-2", style: "outline" });
  expect(body.logo_recipe.badge.shape).toBeTruthy();
  expect(body.logo_recipe.typography.name.weight).toBeGreaterThanOrEqual(400);

  // Dialog closes on success
  await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeHidden({ timeout: 15_000 });

  await coach.close();
});
