// e2e/specs/28-admin-site-ai.spec.ts
//
// Site AI panel (backend/apps/core/site_ai_admin.py +
// backend/apps/core/onboarding/site_ai.py; frontend
// app/admin/site-ai/page.tsx + lib/site-ai-api.ts): a coach describes a
// change in a sentence, previews it, and applies it against a monthly
// metered allowance. A coach with no allowance sees an upgrade surface that
// is never a dead end — manual editing stays one click away.
//
// The real AI call (site_ai.preview_edit) is slow and non-deterministic, so
// every test here stubs the preview endpoint at the network layer with a
// canned SSE body (phase "thinking" -> done with an empty page tree) — see
// lib/ai-stream.ts's streamAi() for the frame format this satisfies. Status
// and apply are stubbed too, on purpose:
//   - demo-yoga's real /status/ and /apply/ are live, metered endpoints.
//     Driving this spec off the real ones would spend the tenant's actual
//     monthly allowance (already partially spent by earlier manual
//     verification on a sibling tenant), making the spec order-dependent and
//     non-idempotent across reruns.
//   - The panel's own behaviour (copy, gating, decrement rendering) is what's
//     under test here, not the billing plumbing behind
//     availability()/apply_edit(), which Task 1's unit tests already cover
//     directly.
//
// The first test's status stub tracks whether /apply/ has actually been
// called yet — not a raw request count — because Next dev's React Strict
// Mode double-invokes the page's on-mount effect, firing GET /status/ twice
// before any user action. A call-counted stub (1st call = pre-apply, 2nd+ =
// post-apply) desyncs against that extra poll and flips the "remaining"
// line early; keying off "has apply happened" instead is correct regardless
// of how many times status is polled before or after it.

import { test, expect, type Page } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

const INSTRUCTION = "Make the homepage warmer and shorten the intro";
const PLACEHOLDER = "e.g. make the homepage warmer and shorten the intro";

async function stubPreview(page: Page) {
  await page.route("**/api/v1/admin/site-ai/preview/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","pages":{"home":{"blocks":[]}},' +
        '"changes":[{"page":"home","block_type":"hero","field":"heading",' +
        '"old":"Find your inner strength","new":"Welcome home"}]}\n\n',
    });
  });
}

test("a paid coach previews an edit, applies it, and the allowance decrements", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  // Every GET reports the full allowance until /apply/ has actually been
  // called, then the post-apply number ever after — see file header re:
  // Strict Mode's extra pre-apply poll.
  let applied = false;
  await page.route("**/api/v1/admin/site-ai/status/", async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        remaining: applied ? 2 : 3,
        limit: 3,
        reason: null,
      },
    });
  });
  await stubPreview(page);
  await page.route("**/api/v1/admin/site-ai/apply/", async (route) => {
    applied = true;
    await route.fulfill({ json: { remaining: 2 } });
  });

  await page.goto(`${TENANT}/admin/site-ai`);

  await expect(page.getByRole("heading", { name: "Site AI" })).toBeVisible();
  await expect(
    page.getByText("Describe a change and I'll redesign your site."),
  ).toBeVisible();
  await expect(
    page.getByText("3 of 3 AI edits left this month"),
  ).toBeVisible();

  await page.getByPlaceholder(PLACEHOLDER).fill(INSTRUCTION);
  await page.getByRole("button", { name: "Preview change" }).click();

  await expect(page.getByText("Here's the proposed change.")).toBeVisible();
  // The change summary renders before → after rows from the done frame's
  // `changes` — the coach reviews what changed, not a blind Apply.
  await expect(page.getByText("Home › Heading")).toBeVisible();
  await expect(page.getByText("Find your inner strength")).toBeVisible();
  await expect(page.getByText("Welcome home")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discard", exact: true }),
  ).toBeVisible();
  const applyButton = page.getByRole("button", { name: "Apply", exact: true });
  await expect(applyButton).toBeEnabled();

  await applyButton.click();

  await expect(page.getByText("Your site has been updated")).toBeVisible();
  await expect(
    page.getByText("2 of 3 AI edits left this month"),
  ).toBeVisible();

  await page.close();
});

test("a free coach sees the upgrade surface with a working manual-edit escape hatch, and Apply stays blocked", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  await page.route("**/api/v1/admin/site-ai/status/", async (route) => {
    await route.fulfill({
      json: {
        enabled: false,
        remaining: 0,
        limit: 0,
        reason: "upgrade_required",
      },
    });
  });
  await stubPreview(page);

  await page.goto(`${TENANT}/admin/site-ai`);

  await expect(page.getByText("AI editing is a paid feature")).toBeVisible();
  await expect(page.getByRole("link", { name: "See plans" })).toHaveAttribute(
    "href",
    "/admin/billing/subscription",
  );
  // Never a wall: the manual-edit escape hatch is present alongside the
  // upsell, not instead of some other blocked state.
  await expect(
    page.getByRole("link", { name: "Edit manually instead" }),
  ).toHaveAttribute("href", "/?edit=1");

  // No allowance -> no "N of M" line at all (limit is 0).
  await expect(page.getByText(/AI edits left this month/)).toHaveCount(0);

  // Previewing stays free even with zero allowance, so the coach can see
  // what AI would do before deciding whether to upgrade.
  await page.getByPlaceholder(PLACEHOLDER).fill(INSTRUCTION);
  await page.getByRole("button", { name: "Preview change" }).click();
  await expect(page.getByText("Here's the proposed change.")).toBeVisible();

  // ...but Apply itself is refused client-side without an allowance.
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();

  await page.close();
});
