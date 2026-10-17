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

test("the coach admin wears the app's own look, not the site's", async ({
  browser,
}) => {
  const ctx = await coachContext(browser);
  const page = await ctx.newPage();
  // The tenant's look is one sheet; under /admin it is switched off.
  const sheet = () =>
    page.evaluate(
      () => (document.getElementById("tenant-theme") as HTMLStyleElement).media,
    );
  await page.goto(`${TENANT}/`);
  expect(await sheet()).toBe("");
  // An in-app move does not re-render the root layout: the provider flips it.
  await page.getByRole("link", { name: "Creator studio", exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect.poll(sheet).toBe("not all");
  await page.reload();
  expect(await sheet()).toBe("not all");
  await ctx.close();
});
