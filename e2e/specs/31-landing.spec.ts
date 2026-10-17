// e2e/specs/31-landing.spec.ts
//
// The marketing landing (frontend-main "/"): the one page a prospective coach
// sees first. Guards the chapters the team-led page is built from, the hero's
// links into the team chapter, the single header, the brand lockup and the
// share card, at desktop and phone width. Copy is asserted by its stable
// headings, not full sentences.

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
    "You're the expert",
  );
  for (const id of ["for", "team", "earnings", "founding", "start"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  const roles = [
    "Designer",
    "Marketing Specialist",
    "Content Creating Specialist",
    "Community manager",
    "Assistant",
    "Financial Strategist",
  ];
  for (const name of roles) {
    await expect(
      page.locator("#team").getByRole("tab", { name, exact: true }),
    ).toBeVisible();
  }
  // A role in the hero opens that role in the team chapter.
  await page.locator('#hero a[href="#team-cashier"]').click();
  await expect(
    page
      .locator("#team")
      .getByRole("tab", { name: "Financial Strategist", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#team-panel")).toContainText(
    "Prices that sell, paid straight to you.",
  );
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
