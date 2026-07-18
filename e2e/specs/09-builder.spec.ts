// e2e/specs/09-builder.spec.ts
//
// Verifies the website builder: a coach edits the site's brand name via the
// floating "Edit site" sidebar, waits for the deterministic autosave PATCH to
// /api/admin/config, then confirms the change is visible on the public homepage.
//
// Edit surface: the brand-name <input> in the "Brand" section of the sidebar
// (Site mode). This is always present regardless of whether any page blocks
// have been seeded, making it a stable target.
//
// Autosave signal: the PATCH to /api/admin/config returns 200 JSON after the
// 800ms debounce fires. We intercept the response in the coach's page context
// rather than using a blind wait.
//
// Restore: after the public-page assertion the spec restores the original brand
// name via PATCH /api/admin/config so subsequent runs start from clean state.
// The restore runs in a try/finally so it executes even if the public assert fails.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

const BRAND = `E2E Brand ${Date.now()}`;

test("coach edits brand name via builder; public homepage reflects it", async ({
  browser,
  page,
}) => {
  // ── 1. Coach opens the public home page (they see the "Edit site" button) ──
  const coach = await coachContext(browser);
  const edit = await coach.newPage();

  // Arm the autosave intercept BEFORE navigating so we don't miss it.
  const autosavePromise = edit.waitForResponse(
    (resp) =>
      resp.url().includes("/api/admin/config") && resp.request().method() === "PATCH",
    { timeout: 15_000 },
  );

  await edit.goto(`${TENANT}/`);

  // The floating "Edit site" pencil button appears for coaches.
  const editBtn = edit.getByTitle("Edit your site");
  await expect(editBtn, "Edit site button must be visible for coach").toBeVisible({
    timeout: 10_000,
  });
  await editBtn.click();

  // The sidebar opens. Switch to the "Site" tab which holds Brand/Navbar settings.
  // (The coach's localStorage may have the last-used tab set to "Pages".)
  const siteTab = edit.getByRole("button", { name: /^Site$/i }).first();
  await expect(siteTab, "Site tab must be visible in sidebar").toBeVisible({
    timeout: 5_000,
  });
  await siteTab.click();

  // The "Brand" accordion is expanded by default (initial state includes "brand").
  // Wait for the brand name input to become visible. If the accordion happens to
  // be collapsed, click the section header to expand it first.
  // exact: once the tenant has a saved logo the sidebar also renders the
  // "Show brand name next to logo" switch, which a substring getByLabel
  // resolves too — strict-mode violation.
  const brandInput = edit.getByLabel("Brand name", { exact: true });
  const brandVisible = await brandInput.isVisible().catch(() => false);
  if (!brandVisible) {
    await edit.getByRole("button", { name: /^Brand$/i }).click();
  }
  await expect(brandInput, "Brand name input must be visible in sidebar").toBeVisible({
    timeout: 5_000,
  });

  // Capture the current brand name so we can restore it after the test.
  const originalBrand = await brandInput.inputValue();

  // Clear and type the new unique brand name — triggers the debounced autosave.
  await brandInput.fill(BRAND);

  // ── 2. Wait for the deterministic autosave network response ────────────────
  const autosaveResp = await autosavePromise;
  expect(
    autosaveResp.ok(),
    `autosave PATCH /api/admin/config failed: ${autosaveResp.status()}`,
  ).toBeTruthy();

  await coach.close();

  try {
    // ── 3. Verify the public homepage (unauthenticated request) reflects the change
    await page.goto(`${TENANT}/`);
    // The brand lands in the header's home link: as visible text when the
    // tenant has no saved logo, as the logo <img>'s alt (with the text hidden
    // by default) once one is saved — the link's accessible name covers both.
    await expect(
      page.getByRole("banner").getByRole("link", { name: BRAND }),
      "Updated brand name must appear in the public header after autosave",
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    // ── 4. Restore the original brand name so subsequent runs start clean ─────
    // Use a fresh coach context to issue the PATCH (the previous one was closed).
    const restoreCtx = await coachContext(browser);
    const restoreResp = await restoreCtx.request.patch(
      `${TENANT}/api/v1/admin/config/`,
      {
        data: { brand_name: originalBrand },
      },
    );
    expect(
      restoreResp.ok(),
      `brand restore PATCH failed: ${restoreResp.status()} — ${await restoreResp.text()}`,
    ).toBeTruthy();
    await restoreCtx.close();
  }
});
