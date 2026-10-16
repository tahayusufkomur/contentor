// e2e/specs/31-landing.spec.ts
//
// The marketing landing (frontend-main "/"): the one page a prospective coach
// sees first. Guards the chapters the success-led page is built from, the
// single header, the brand lockup and the share card, at desktop and phone
// width. Copy is asserted by its stable headings, not full sentences.

import { test, expect } from "@playwright/test";
import { MAIN } from "../helpers/auth";

test("the landing carries one header, the brand, every chapter and the share card", async ({
  page,
}) => {
  await page.goto(`${MAIN}/`);

  // One site header (chapters carry their own <header>s, which are not
  // banners): the lockup links home, the nav names the chapters.
  const header = page.getByRole("banner");
  await expect(header).toHaveCount(1);
  await expect(header.getByRole("link", { name: "Contentor" })).toBeVisible();
  for (const name of ["How it works", "Who it's for", "Pricing", "Blog"]) {
    await expect(header.getByRole("link", { name, exact: true })).toBeVisible();
  }

  // The chapters, in the order the page tells the coach's story.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Teach what you love",
  );
  for (const id of ["for", "path", "support", "earnings", "start"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  for (const step of [
    "Launch in an afternoon",
    "Get found",
    "Keep students coming back",
    "Get paid directly",
  ]) {
    await expect(
      page.locator("#path").getByText(step, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator("#earn-students")).toBeAttached();
  await expect(page.locator("#earn-price")).toBeAttached();

  // The share card and the favicon the links carry.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/og\.jpg$/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  const icon = await page.request.get(`${MAIN}/icon.svg`);
  expect(icon.ok()).toBeTruthy();
  const card = await page.request.get(`${MAIN}/og.jpg`);
  expect(card.headers()["content-type"]).toContain("image/jpeg");
});

test("at phone width the page still opens on the hero and the menu reaches the chapters", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  await page.goto(`${MAIN}/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  // The desktop nav stays in the DOM (hidden); the menu's copy renders last.
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "How it works", exact: true })
      .last(),
  ).toBeVisible();
  await context.close();
});
