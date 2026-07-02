// e2e/specs/10-impersonation.spec.ts
//
// Verifies the coach→student impersonation flow:
//
//   1. Coach visits /admin/m/users (studio admin-kit model page for tenant users).
//   2. Coach clicks the "Log in as" row action on the first student row.
//      - The admin-kit action calls POST /api/v1/studio-admin/users/<pk>/actions/login_as/
//      - Django issues a one-time signed token and returns {"redirect": "…/impersonate?token=…"}
//      - model-page.tsx does window.location.href = result.redirect (same-tab navigation).
//   3. The /impersonate page redeems the token (POST /api/auth/impersonate/verify),
//      then window.location.replace() forwards to /dashboard.
//   4. The impersonation banner ("Viewing as … impersonated by …") appears.
//   5. Coach clicks "Exit" in the banner — POSTs /api/auth/impersonate/stop,
//      which restores the coach session and redirects to /admin.
//   6. The coach is back at /admin without the banner.
//
// The flow is SAME-TAB throughout (window.location.href, not window.open).
// A confirm() dialog fires before the action (the model-page intercepts it with
// window.confirm()) — we accept it via Playwright's dialog handler.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach impersonates a student and exits via banner", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  // ── 1. Open the studio admin-kit users page ────────────────────────────────
  await page.goto(`${TENANT}/admin/m/users`);

  // Wait for the table to load by checking that the "Log in as" button is
  // visible — it's a row action rendered only once the metadata + first page loads.
  const loginAsBtn = page.getByRole("button", { name: "Log in as" }).first();
  await expect(loginAsBtn, "'Log in as' button must appear in the users table").toBeVisible({
    timeout: 15_000,
  });

  // ── 2. Accept the confirm dialog and click "Log in as" ────────────────────
  // The model-page shows window.confirm() with the action's confirm text before
  // firing the action. Accept it so the request goes through.
  page.once("dialog", (dialog) => dialog.accept());
  await loginAsBtn.click();

  // ── 3. Wait for same-tab navigation to /dashboard ─────────────────────────
  // model-page sets window.location.href = redirect URL
  // → /impersonate?token=… → verifies token → window.location.replace("/dashboard")
  await page.waitForURL(`${TENANT}/dashboard`, { timeout: 20_000 });

  // ── 4. Assert the impersonation banner is visible ─────────────────────────
  const banner = page.getByText(/viewing as/i);
  await expect(banner, "Impersonation banner must be visible on student dashboard").toBeVisible({
    timeout: 8_000,
  });

  // ── 5. Click "Exit" in the banner to restore the coach session ────────────
  const exitBtn = page.getByRole("button", { name: "Exit" });
  await expect(exitBtn, "Exit button must be visible in impersonation banner").toBeVisible();

  // The exit POST fires; Django restores the coach's session and the banner's
  // JS does window.location.assign('/admin').
  await exitBtn.click();
  await page.waitForURL(`${TENANT}/admin`, { timeout: 15_000 });

  // ── 6. Verify the coach is back without the banner ────────────────────────
  await expect(
    page.getByText(/viewing as/i),
    "Impersonation banner must NOT be visible after exit",
  ).not.toBeVisible({ timeout: 5_000 });

  await coach.close();
});
