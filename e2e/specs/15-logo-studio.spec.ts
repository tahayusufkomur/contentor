// e2e/specs/15-logo-studio.spec.ts
//
// Coach opens the Logo Studio via the setup-assistant deep link and walks the
// curated-first flow: Brief (name + niche + tagline + a style chip) -> Ideas
// (the curated gallery; the deterministic wall is gone) -> Use a ready-made
// logo -> fine-tune in the Editor -> save. The PATCH must persist a schema-v3
// recipe carrying the brand name + tagline. The Ideas step also surfaces the
// staged "Design with AI" chat as a paid-tier upsell — this spec only confirms
// the door renders correctly (chat opens for eligible tenants, the upgrade
// copy shows otherwise) without ever driving a real AI turn; see
// 90-logo-eval.spec.ts for that.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a logo through brief, curated ideas, and editor", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/design?studio=1`);
  await expect(
    page.getByRole("heading", { name: "Logo Studio" }),
  ).toBeVisible();

  const dialog = page.getByRole("dialog");

  // Normalize onto the Brief step (a saved-design tenant lands in the Editor).
  const briefHeading = dialog.getByText("Tell us about your brand");
  if (!(await briefHeading.isVisible())) {
    await dialog.getByRole("button", { name: "Get new ideas" }).click();
  }
  await expect(briefHeading).toBeVisible();

  const nameInput = dialog.getByLabel("Brand name");
  if (!(await nameInput.inputValue())) await nameInput.fill("Demo Yoga");
  await dialog.getByLabel("What do you teach?").fill("yoga");
  await dialog.getByLabel("Tagline (optional)").fill("Move every day");
  await dialog.getByRole("button", { name: "Elegant" }).click();
  await dialog.getByRole("button", { name: "Show my logo ideas" }).click();

  // Ideas: the curated gallery is the only Browse surface now. Exact match —
  // a substring match also resolves the transient "Loading ready-made
  // logos…" placeholder text, strict-mode-violating while the catalog fetch
  // is in flight.
  await expect(
    dialog.getByText("Ready-made logos", { exact: true }),
  ).toBeVisible();

  // Design with AI: the door button always renders (no isVisible gate needed
  // — unlike the old wall-era banner). For an ineligible tenant it navigates
  // straight to the upgrade page on click (`window.location.href`), so a
  // blind click would away-navigate this test; the two states are only
  // distinguishable by the door's copy. Read that first, then act.
  const aiDoor = dialog.getByRole("button", { name: "Design with AI" });
  await expect(aiDoor).toBeVisible();
  const aiDoorText = (await aiDoor.innerText()).toLowerCase();
  if (aiDoorText.includes("upgrade to design")) {
    // Free-tier upsell — confirm the copy, don't click (it would navigate
    // away to /admin/billing/subscription).
    await expect(aiDoor).toContainText("Upgrade to design a bespoke logo");
  } else {
    // Eligible tenant — clicking opens the staged chat panel inline.
    await aiDoor.click();
    const chat = dialog.getByTestId("studio-chat");
    await expect(chat).toBeVisible();
    await expect(chat.getByRole("textbox")).toBeVisible();
    await dialog.getByRole("button", { name: "Ideas" }).click();
    await expect(chat).toBeHidden();
  }

  // Use the first ready-made logo -> Editor.
  await dialog.getByRole("button", { name: "Use this" }).first().click();
  await expect(
    dialog.getByRole("button", { name: "Use this logo" }),
  ).toBeVisible({ timeout: 15_000 });

  // Fine-tune: force a known layout + confirm the tagline seeded from the Brief.
  await dialog.getByRole("button", { name: "Mark + name" }).click();

  // Save -> assert the persisted v3 recipe carries name + tagline.
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
  expect(body.logo_recipe.version).toBe(3);
  expect(body.logo_recipe.layout).toBe("horizontal");
  expect(body.logo_recipe.tagline).toBe("Move every day");
  expect(body.logo_recipe.name).toBeTruthy();

  await expect(page.getByRole("heading", { name: "Logo Studio" })).toBeHidden({
    timeout: 15_000,
  });

  await coach.close();
});
