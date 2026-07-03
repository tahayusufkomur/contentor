// e2e/specs/12-downloads.spec.ts
//
// One-step download creation: a PAID download gets its price and a tag at
// creation time (no follow-up edit). UI drives the form; the API confirms
// the persisted values because the list row's price rendering is not a
// stable contract.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a paid download with price and tag in one submit", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/downloads`);

  const title = `E2E Paid DL ${Date.now()}`;
  const tagName = `e2e-dl-${Date.now()}`;

  await page.getByRole("button", { name: "Upload File" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Access Type").selectOption("paid");
  await page.getByLabel("Price").fill("9.99");

  // Tag created in-place via the TagInput "Create …" row
  await page.getByPlaceholder("Add a tag…").fill(tagName);
  await page.getByRole("button", { name: /Create/ }).click();
  // Wait for the tag pill to appear (exact match excludes the "Create …" dropdown item)
  await expect(page.getByText(tagName, { exact: true })).toBeVisible({ timeout: 5_000 });

  await page.locator('input[type="file"]').setInputFiles("fixtures/pixel.png");
  await expect(page.getByText("File uploaded")).toBeVisible({ timeout: 20_000 });

  // Confirm persisted values via the API (single-submit, no edit happened)
  const res = await coach.request.get(
    `${TENANT}/api/v1/downloads/?search=${encodeURIComponent(title)}&limit=5&offset=0&ordering=-created_at`
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  const created = body.results.find((d: { title: string }) => d.title === title);
  expect(created, `created download not in list: ${JSON.stringify(body)}`).toBeTruthy();
  expect(created.pricing_type).toBe("paid");
  expect(parseFloat(created.price)).toBeCloseTo(9.99);
  expect(created.tags.map((t: { name: string }) => t.name)).toContain(tagName);

  await coach.close();
});
