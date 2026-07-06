// e2e/specs/13-events-page.spec.ts
//
// Covers the public /events listing page:
//   1. Upcoming-events API window (today → +90d) drives the page, so the spec
//      first reads the API to learn what SHOULD render.
//   2. If upcoming events exist: each API title appears as a card linking to
//      /calendar/[type]/[id].
//   3. If none exist: the empty state renders.
//   4. Cross-links: /events → "View as calendar" → /calendar, and back via
//      "List view".

import { test, expect } from "@playwright/test";
import { TENANT } from "../helpers/auth";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

test("public /events lists upcoming events and cross-links with /calendar", async ({
  page,
  request,
}) => {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);
  const api = await request.get(
    `${TENANT}/api/v1/calendar/?from=${isoDate(from)}&to=${isoDate(to)}`,
  );
  expect(api.ok(), `Calendar API status ${api.status()}`).toBeTruthy();
  const upcoming: Array<{ id: number; type: string; title: string }> = await api.json();

  await page.goto(`${TENANT}/events`);
  await expect(
    page.getByRole("heading", { name: "Upcoming events" }),
  ).toBeVisible({ timeout: 10_000 });

  if (upcoming.length > 0) {
    const first = upcoming[0];
    const card = page.locator(`a[href="/calendar/${first.type}/${first.id}"]`);
    await expect(card, `card for "${first.title}" must render`).toBeVisible();
    await expect(card).toContainText(first.title);
  } else {
    await expect(page.getByText("No upcoming events scheduled.")).toBeVisible();
  }

  // Cross-link: /events → /calendar
  await page.getByRole("link", { name: /View as calendar/ }).click();
  await expect(page).toHaveURL(/\/calendar/);

  // Cross-link back: /calendar → /events
  await page.getByRole("link", { name: /List view/ }).click();
  await expect(page).toHaveURL(/\/events/);
});
