// e2e/specs/27-nav-stage-gating.spec.ts
//
// Proves the admin nav's stage-gating end to end (see admin-nav-gate.ts):
//   - Marketing renders locked (greyed, but reachable — never a dead end)
//     until the tenant is published.
//   - Content hides module-gated/disclosure-only items behind a "+ N more"
//     row, which reveals them on click.
//   - Once published, Marketing's items render as normal nav links.
//
// Two tenants, not one transitioning: `elvins-pole` (unpublished — an ad hoc
// coach signup used for this feature's manual verification) proves the
// locked/collapsed state; `demo-yoga` (published — the canonical seeded
// tenant every other e2e spec already assumes is live) proves the unlocked
// state. Flipping either tenant's publish flag mid-test was considered and
// rejected:
//   - `elvins-pole` doesn't satisfy the backend's publish_blockers (no
//     course/download yet — confirmed live: its "Publish your app" card
//     lists "Create your first course or download" as unmet), so a real
//     PATCH would 400.
//   - `demo-yoga` is the default tenant `coachContext` and most other specs
//     assume is published; mutating it here — even with a restore-after —
//     risks leaving shared dev state dirty for the rest of the suite if this
//     spec fails mid-run.
// Both tenants' states were confirmed live via `manage.py issue_login_token`
// + a manual admin visit before writing the assertions below.
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
import { coachContext, coachContextForTenant, TENANT } from "../helpers/auth";

const UNPUBLISHED_TENANT_SLUG = "elvins-pole";
const UNPUBLISHED_HOST = "elvins-pole.localhost";
const UNPUBLISHED_TENANT = `http://${UNPUBLISHED_HOST}`;

test("an unpublished tenant sees Marketing locked (reachable, not a dead end) and Content collapsed behind + N more", async ({
  browser,
}) => {
  const coach = await coachContextForTenant(
    browser,
    UNPUBLISHED_TENANT_SLUG,
    UNPUBLISHED_HOST,
  );
  const page = await coach.newPage();
  await page.goto(`${UNPUBLISHED_TENANT}/admin`);

  const nav = page.getByRole("navigation");

  // Marketing is greyed but still a real, reachable link to the milestone
  // that unlocks it — never disabled, never removed.
  const explainer = nav.getByRole("link", {
    name: /publish your site to open marketing/i,
  });
  await expect(explainer).toBeVisible();
  await expect(explainer).toHaveAttribute("href", "/admin#publish-card");

  // Content hides at least one item behind "+ N more" (elvins-pole has the
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
