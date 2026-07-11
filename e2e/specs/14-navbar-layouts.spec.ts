// e2e/specs/14-navbar-layouts.spec.ts
//
// Coach switches the navbar layout preset via the builder (Site tab → Navbar
// section → layout thumbnail), waits for the autosave PATCH to
// /api/admin/config, then confirms the public homepage header carries the
// data-nav-layout attribute. Restore uses a direct API PATCH (not a second UI
// click) — same pattern as 09-builder.spec.ts's brand-name restore — so the
// test does exactly one switch+verify round trip, matching that spec's budget.
//
// Selector contract:
//   - Edit-sidebar entry: button title "Edit your site" (09-builder.spec.ts).
//   - Site tab: role=button name "Site" (edit-sidebar.tsx SITE tab).
//   - Navbar accordion: section label "Navbar" (edit-sidebar.tsx:49).
//   - Layout buttons: aria-label "Layout: Centered" etc. (navbar-tab.tsx).
//   - Public marker: header[data-nav-layout] (public-header.tsx).

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach switches navbar layout; public homepage reflects it", async ({
  browser,
  page,
}) => {
  const coach = await coachContext(browser);
  const edit = await coach.newPage();

  // Capture the original navbar_config so we can restore it verbatim — the
  // field is a single JSONField (whole-object PATCH, not a merge).
  const before = await coach.request.get(`${TENANT}/api/v1/admin/config/`);
  expect(before.ok(), `config GET failed: ${before.status()}`).toBeTruthy();
  const originalNavbar = (await before.json()).navbar_config;

  const autosavePromise = edit.waitForResponse(
    (resp) =>
      resp.url().includes("/api/admin/config") &&
      resp.request().method() === "PATCH" &&
      resp.ok(),
    { timeout: 15_000 },
  );

  await edit.goto(`${TENANT}/`);
  const editBtn = edit.getByTitle("Edit your site");
  await expect(editBtn).toBeVisible({ timeout: 10_000 });
  await editBtn.click();

  const siteTab = edit.getByRole("button", { name: /^Site$/i }).first();
  await expect(siteTab).toBeVisible({ timeout: 5_000 });
  await siteTab.click();

  // Collapse Brand (expanded by default — see edit-sidebar.tsx's initial
  // `expanded` state) so the accordion (a Set, not exclusive-open) doesn't
  // leave both sections' content stacked, which pushes Navbar's content far
  // down the scrollable pane.
  const brandSection = edit.getByRole("button", { name: /^Brand$/i }).first();
  await expect(brandSection).toBeVisible({ timeout: 5_000 });
  await brandSection.click();

  // Open the Navbar accordion (may already be open).
  const navbarSection = edit.getByRole("button", { name: /Navbar/ }).first();
  await expect(navbarSection).toBeVisible({ timeout: 5_000 });
  const centeredBtn = edit.getByLabel("Layout: Centered");
  if (!(await centeredBtn.isVisible().catch(() => false))) {
    await navbarSection.click();
  }
  await expect(centeredBtn).toBeVisible({ timeout: 5_000 });
  // The accordion body sits in a scrollable pane whose CSS grid-rows expand
  // animation confuses Playwright's positional hit-testing (it repeatedly
  // reports the scroll container itself as intercepting the click, even
  // though the button is visible/enabled). Dispatch the click via the DOM
  // directly — this still fires the real React onClick handler, just
  // skips Playwright's screen-coordinate actionability check.
  await centeredBtn.scrollIntoViewIfNeeded();
  await centeredBtn.evaluate((el) => (el as HTMLElement).click());
  await autosavePromise;
  await edit.close();

  try {
    await page.goto(`${TENANT}/`);
    await expect(page.locator('header[data-nav-layout="centered"]')).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    const restoreResp = await coach.request.patch(`${TENANT}/api/v1/admin/config/`, {
      data: { navbar_config: originalNavbar },
    });
    expect(
      restoreResp.ok(),
      `navbar_config restore PATCH failed: ${restoreResp.status()} — ${await restoreResp.text()}`,
    ).toBeTruthy();
    await coach.close();
  }
});

// Brand-name visibility + logo size presets. Both are navbar_config fields
// (show_brand_name, logo_size — see lib/navbar.ts's showBrandName /
// logoSizeClass) that only matter once a logo is saved, so this test seeds
// one directly via the config API if the tenant doesn't already have one
// (spec files aren't guaranteed to run in an order where 15-logo-studio's
// save has landed first) — same restore-by-PATCH pattern as the layout test
// above, no UI driven for the seed/restore, only for the toggle + size pick.
test("saved logo: brand name hidden by default, toggle reveals it, size XL sizes the logo", async ({
  browser,
  page,
}) => {
  const coach = await coachContext(browser);
  const edit = await coach.newPage();

  const before = await coach.request.get(`${TENANT}/api/v1/admin/config/`);
  expect(before.ok(), `config GET failed: ${before.status()}`).toBeTruthy();
  const beforeJson = await before.json();
  const original = {
    logo_url: beforeJson.logo_url,
    logo_id: beforeJson.logo_id,
    logo_recipe: beforeJson.logo_recipe,
    navbar_config: beforeJson.navbar_config,
  };

  if (!beforeJson.logo_url) {
    // Only send logo_url — omitting logo_recipe skips validate_logo_recipe
    // entirely (partial PATCH), so this doesn't need to construct a full
    // schema-v2 recipe just to make the header render an <img>.
    const seedResp = await coach.request.patch(`${TENANT}/api/v1/admin/config/`, {
      data: { logo_url: "https://placehold.co/240x60.png" },
    });
    expect(
      seedResp.ok(),
      `logo seed PATCH failed: ${seedResp.status()} — ${await seedResp.text()}`,
    ).toBeTruthy();
  }

  try {
    // Brand name absent by default next to a saved logo (showBrandName()
    // only shows it once the coach explicitly re-enables it).
    await page.goto(`${TENANT}/`);
    await expect(page.locator("header img")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("header .font-display")).toHaveCount(0);

    await edit.goto(`${TENANT}/`);
    const editBtn = edit.getByTitle("Edit your site");
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const siteTab = edit.getByRole("button", { name: /^Site$/i }).first();
    await expect(siteTab).toBeVisible({ timeout: 5_000 });
    await siteTab.click();

    const brandSection = edit.getByRole("button", { name: /^Brand$/i }).first();
    await expect(brandSection).toBeVisible({ timeout: 5_000 });
    await brandSection.click();

    const navbarSection = edit.getByRole("button", { name: /Navbar/ }).first();
    await expect(navbarSection).toBeVisible({ timeout: 5_000 });
    const showBrandNameSwitch = edit.getByLabel(
      "Show brand name next to logo",
    );
    if (!(await showBrandNameSwitch.isVisible().catch(() => false))) {
      await navbarSection.click();
    }
    await expect(showBrandNameSwitch).toBeVisible({ timeout: 5_000 });

    // Same DOM-click workaround as the layout picker above — the accordion's
    // expand animation confuses Playwright's actionability check.
    const brandNameAutosave = edit.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/config") &&
        resp.request().method() === "PATCH" &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await showBrandNameSwitch.scrollIntoViewIfNeeded();
    await showBrandNameSwitch.evaluate((el) => (el as HTMLElement).click());
    await brandNameAutosave;

    await page.goto(`${TENANT}/`);
    await expect(page.locator("header .font-display")).toHaveCount(1, {
      timeout: 10_000,
    });

    // Logo size XL -> h-12 on the header logo (lib/navbar.ts logoSizeClass).
    const xlBtn = edit.getByRole("button", { name: "xl", exact: true });
    await expect(xlBtn).toBeVisible({ timeout: 5_000 });
    const sizeAutosave = edit.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/config") &&
        resp.request().method() === "PATCH" &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await xlBtn.scrollIntoViewIfNeeded();
    await xlBtn.evaluate((el) => (el as HTMLElement).click());
    await sizeAutosave;
    await edit.close();

    await page.goto(`${TENANT}/`);
    await expect(page.locator("header img.h-12")).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    const restoreResp = await coach.request.patch(`${TENANT}/api/v1/admin/config/`, {
      data: original,
    });
    expect(
      restoreResp.ok(),
      `config restore PATCH failed: ${restoreResp.status()} — ${await restoreResp.text()}`,
    ).toBeTruthy();
    await coach.close();
  }
});
