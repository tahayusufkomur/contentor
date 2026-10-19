// e2e/specs/12-downloads.spec.ts
//
// Every download has its own page. "Upload File" opens /admin/downloads/new:
// a PAID download gets its title, description, price and a tag, and picking
// the file creates the record once and uploads it, landing on its page. The
// page then edits it, and its row in the list opens it again. The API
// confirms the persisted values because the row's price rendering is not a
// stable contract.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates, uploads and edits a paid download on its own page", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/downloads`);

  const title = `E2E Paid DL ${Date.now()}`;
  const tagName = `e2e-dl-${Date.now()}`;

  await page.getByRole("link", { name: "Upload File" }).click();
  await expect(page).toHaveURL(/\/admin\/downloads\/new$/);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("A one-page workbook.");
  // Sell it once: one tick and a price (the tick replaces the new item's Free)
  await page.locator("#access-download-buy").click();
  await page.locator("#access-download-price").fill("9.99");

  // Tag created in-place via the TagInput "Create …" row
  await page.getByPlaceholder("Add a tag…").fill(tagName);
  await page.getByRole("button", { name: `Create “${tagName}”` }).click();
  // Wait for the tag pill to appear (exact match excludes the "Create …" dropdown item)
  await expect(page.getByText(tagName, { exact: true })).toBeVisible({ timeout: 10_000 });

  // Picking the file creates the record and uploads it: she lands on its page.
  // The PUT to storage is held so the upload can be seen in flight: the price
  // is locked then (a change made now would not be saved with the new record).
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => !url.pathname.startsWith("/api/"),
    async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await held;
      return route.continue();
    }
  );
  await page.locator('input[type="file"]').setInputFiles("fixtures/pixel.png");
  await expect(page.getByRole("status")).toContainText("uploaded");
  await expect(page.locator("#access-download-price")).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  release();
  await expect(page.getByText("File uploaded")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/admin\/downloads\/\d+$/, { timeout: 10_000 });
  const id = Number(page.url().split("/").pop());

  const one = async () => {
    const res = await coach.request.get(`${TENANT}/api/v1/downloads/${id}/`);
    expect(res.status()).toBe(200);
    return res.json();
  };
  const created = await one();
  expect(created.title).toBe(title);
  expect(created.description).toBe("A one-page workbook.");
  expect(created.pricing_type).toBe("paid");
  expect(parseFloat(created.price)).toBeCloseTo(9.99);
  expect(created.tags.map((t: { name: string }) => t.name)).toContain(tagName);
  expect(created.file_url).not.toBe("");
  expect(created.file_size).toBeGreaterThan(0);

  // Edit it on its page.
  const renamed = `${title} v2`;
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await page.getByLabel("Title").fill(renamed);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Download saved")).toBeVisible({ timeout: 10_000 });
  expect((await one()).title).toBe(renamed);

  // Its row in the list opens its page.
  await page.goto(`${TENANT}/admin/downloads`);
  await page.getByPlaceholder(/Search/).fill(renamed);
  await page.getByRole("link", { name: renamed }).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/downloads/${id}$`));
  await expect(page.getByLabel("Title")).toHaveValue(renamed);

  await coach.close();
});
