// e2e/specs/25-navigation-feedback.spec.ts
//
// The invariant this whole feature exists for: clicking a nav item produces
// visible feedback BEFORE the destination's content arrives, and that
// feedback clears once the navigation actually settles (no stranding).
//
// Determinism comes from injecting delays ourselves via route interception on
// the specific request that gates each window — never from racing the real
// dev server or asserting on wall-clock timings.
//
// Two different windows exist and need different stalls:
//   - Pre-commit (click → route commits): gated by Next's RSC payload
//     request, issued as the destination URL with a `_rsc` query param. This
//     is what the top progress bar and the optimistic highlight cover.
//   - Post-commit (page mounted → its own clientFetch resolves): gated by the
//     API request. This is what a page's own stale-list skeleton covers.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("sidebar navigation highlights the target and shows a loading state before content arrives, then clears", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/calendar`);
  await expect(
    page.getByRole("link", { name: /^calendar$/i }),
  ).toHaveAttribute("aria-current", "page");

  // Stall the RSC payload request for the destination route — this widens the
  // pre-commit window without touching any API call.
  await page.route(
    (url) => url.searchParams.has("_rsc"),
    async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    },
  );

  const students = page.getByRole("link", { name: /^students$/i });
  await students.click();

  // 1. Optimistic highlight: the clicked item owns the active state
  // immediately, well before the stalled RSC request resolves.
  await expect(students).toHaveAttribute("aria-current", "page", {
    timeout: 1000,
  });
  await expect(
    page.getByRole("link", { name: /^calendar$/i }),
  ).not.toHaveAttribute("aria-current", "page");

  // 2. The top progress bar appears while the navigation is in flight. This
  // is the regression net for a real Task 8 bug: `isPending` ended the
  // pending window 51ms into a ~1000ms navigation, so the bar never rendered
  // at all. Without this assertion that bug could silently return.
  await expect(page.getByRole("progressbar").first()).toBeVisible({
    timeout: 2000,
  });

  // 3. No stranding: once the stalled request resolves and the route
  // commits, the bar must clear — this is what the provider's 15s watchdog
  // protects against in real failure modes.
  await expect(page.getByRole("progressbar")).toHaveCount(0, {
    timeout: 5000,
  });

  await page.close();
});

test("a stalled list refinement dims rows instead of blanking them", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/students`);
  const rows = page.getByRole("row");
  await expect(rows.first()).toBeVisible();

  // Stall the students list API — this is the post-commit window, covered by
  // the page's own stale-list skeleton (StaleContainer), not the RSC bar.
  await page.route("**/api/v1/auth/students/**", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  await page.getByPlaceholder("Search...").fill("zzz");

  // Rows must still be on screen — dimmed and marked busy, never unmounted.
  await expect(page.locator("[aria-busy='true']").first()).toBeVisible({
    timeout: 2000,
  });
  await expect(rows.first()).toBeVisible();

  await page.close();
});
