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

  // Compose: layout + a specific icon
  await page.getByRole("button", { name: "Icon + name" }).click();
  await page.getByRole("button", { name: "flower-2", exact: true }).click();

  // Suggestions work offline via the deterministic fallback
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
  expect(body.logo_recipe.layout).toBe("icon_name");
  expect(body.logo_recipe.mark).toEqual({ type: "icon", icon: "flower-2" });

  // Dialog closes on success
  await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeHidden({ timeout: 15_000 });

  await coach.close();
});
