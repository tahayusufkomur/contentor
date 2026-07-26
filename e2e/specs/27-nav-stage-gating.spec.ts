// e2e/specs/27-nav-stage-gating.spec.ts
//
// Proves the admin nav's stage-gating end to end (see admin-nav-gate.ts):
//   - Marketing renders locked (greyed, but reachable — never a dead end)
//     until the tenant is published.
//   - Content hides module-gated/disclosure-only items behind a "+ N more"
//     row, which reveals them on click.
//   - Once published, Marketing's items render as normal nav links.
//
// Both tests drive the same tenant, `demo-yoga` (published, canonical seed —
// the one tenant every e2e spec can already assume exists and is reachable).
// There is no reproducible *unpublished* seeded tenant — seed_dev_tenants.py
// creates every dev tenant with is_published=True — so the locked case is
// produced by intercepting demo-yoga's own /api/v1/admin/setup-status/
// response rather than depending on a tenant's real DB state:
//
//   - It's seed-independent: a fresh `make dev-reset && make seed` can never
//     break this test the way pinning it to an ad hoc, non-seeded tenant
//     would (that was this spec's first draft — see git history — and it
//     depended on a hand-created tenant that isn't part of the reproducible
//     fixture set).
//   - It's a more precise regression guard. admin-shell.tsx derives
//     `published` from the `publish` item's `source === "auto"`, NOT its
//     `done` flag — specifically so a coach manually ticking `publish` in the
//     Setup Assistant (source: "manual") can never fake their way past the
//     gate (compute_setup_state in setup_items.py: `source = "auto" if auto
//     else ("manual" if manual.get(key) is True else None)`). The stub below
//     forges exactly that forgeable signal (done: true, source: "manual")
//     and asserts Marketing stays locked anyway — a real unpublished tenant
//     (done: false) can't exercise this distinction at all, since both
//     `done` and `source` would be falsy/auto together.
//
// The real, non-stubbed `source: "auto"` unlock path still gets a genuine
// end-to-end check in the second test below, against demo-yoga's real,
// seeded is_published=True state — nothing here is stubbed for that one.
//
// Selector note: the admin dashboard (app/admin/page.tsx) has its own
// unrelated "Blog" quick-action link in <main>, always present regardless of
// publish state, and the sidebar's own Blog item appends AI/Paid badge text
// to its accessible name (e.g. "BlogAIPaid" once Marketing unlocks — the
// item is `ai: true, requiresEntitlement: "ai_blog"`). Both were confirmed
// against the live DOM. So every assertion here is scoped to the sidebar's
// <nav> landmark (there is exactly one on /admin at desktop viewport — the
// mobile drawer's duplicate nav isn't mounted until its hamburger is
// opened), and the "Blog" match is prefix-anchored rather than exact.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("a manually-ticked (non-auto) publish signal still leaves Marketing locked and Content collapsed behind + N more", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga
  const page = await coach.newPage();

  // Forge a MANUAL tick on the `publish` item: done stays true, but source
  // becomes "manual" instead of the real "auto". Fetch the real response
  // first so the rest of the payload shape (progress, blockers, every other
  // item) stays honest — only `publish` is touched.
  await page.route("**/api/v1/admin/setup-status/", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const item of body.items ?? []) {
      if (item.key === "publish") {
        item.done = true;
        item.source = "manual";
      }
    }
    await route.fulfill({ response: res, json: body });
  });

  await page.goto(`${TENANT}/admin`);

  const nav = page.getByRole("navigation");

  // Marketing is greyed but still a real, reachable link to the milestone
  // that unlocks it — never disabled, never removed.
  const explainer = nav.getByRole("link", {
    name: /publish your site to open marketing/i,
  });
  await expect(explainer).toBeVisible();
  await expect(explainer).toHaveAttribute("href", "/admin#publish-card");

  // Content hides at least one item behind "+ N more" (demo-yoga has the
  // `live` and `downloads` modules enabled, so only the always-disclosure-only
  // Library item is hidden — hence "+ 1 more").
  const moreButton = nav.getByRole("button", { name: /\+ \d+ more/i });
  await expect(moreButton).toBeVisible();

  const libraryLink = nav.getByRole("link", { name: /^library$/i });
  await expect(libraryLink).toHaveCount(0);

  await moreButton.click();
  await expect(libraryLink).toBeVisible();

  await page.close();
});

test("a published tenant sees Marketing unlocked with its items as normal nav links", async ({
  browser,
}) => {
  const coach = await coachContext(browser); // demo-yoga — seeded is_published=True
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin`);

  const nav = page.getByRole("navigation");

  // The lock explainer is gone entirely, not just hidden.
  await expect(
    nav.getByRole("link", { name: /publish your site to open marketing/i }),
  ).toHaveCount(0);

  // Blog renders as a normal nav link (icon + label, not the locked-section
  // explainer). Prefix-matched — see the file header re: the AI/Paid badge
  // suffix on this item's accessible name.
  await expect(nav.getByRole("link", { name: /^blog/i })).toBeVisible();

  await page.close();
});
