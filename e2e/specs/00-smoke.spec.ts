import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("http://localhost/api/health/");
  expect(res.ok()).toBeTruthy();
});

test("coach jwt reaches tenant admin", async ({ browser }) => {
  const ctx = await coachContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${TENANT}/admin`);
  await expect(page).not.toHaveURL(/login/);
  await ctx.close();
});

test("student jwt reaches student dashboard", async ({ browser }) => {
  const ctx = await studentContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${TENANT}/dashboard`);
  await expect(page).not.toHaveURL(/login/);
  await ctx.close();
});
