// e2e/specs/03-calendar.spec.ts
//
// Covers the public calendar feature:
//   1. Calendar API is non-empty (demo-yoga seeds publish live classes).
//   2. /calendar renders (main landmark visible).
//   3. View-toggle switches between Month and Agenda — asserted via URL ?view= param.
//   4. /calendar/[type]/[id] detail page renders the event title.
//
// The API field confirming the URL shape: events use "type" (not "event_type"),
// confirmed against _to_calendar_event in backend/apps/live/views.py:413.
// View-toggle labels confirmed against view-toggle.tsx: "Month" / "Agenda".
// URL update confirmed against calendar-client.tsx handleViewChange → updateURL.

import { test, expect } from "@playwright/test";
import { TENANT } from "../helpers/auth";

test("public calendar: API non-empty, page renders, view-toggle works, event detail opens", async ({
  page,
  request,
}) => {
  // ── Step 1: confirm the calendar API is non-empty ──────────────────────────
  const api = await request.get(`${TENANT}/api/v1/calendar/`);
  expect(api.ok(), `Calendar API status ${api.status()}`).toBeTruthy();
  const events = await api.json();
  const list: Array<{ id: number; type: string; title: string }> = Array.isArray(events)
    ? events
    : (events.results ?? []);
  expect(list.length, "Calendar API returned 0 events — seed data missing").toBeGreaterThan(0);

  // ── Step 2: public /calendar page renders ─────────────────────────────────
  await page.goto(`${TENANT}/calendar`);
  await expect(page.getByRole("main")).toBeVisible();

  // The ViewToggle renders two buttons: "Month" and "Agenda".
  // Default view is "month" on desktop (1440 px viewport set in playwright.config.ts).
  // Clicking "Agenda" updates the URL to ?view=agenda via router.replace.
  const agendaBtn = page.getByRole("button", { name: "Agenda", exact: true });
  await expect(agendaBtn).toBeVisible({ timeout: 10_000 });

  // ── Step 3: view-toggle has an asserted effect (URL param changes) ─────────
  await agendaBtn.click();
  // calendar-client.tsx updateURL: router.replace(`/calendar?view=${v}&date=...`)
  await expect(page).toHaveURL(/[?&]view=agenda/, { timeout: 10_000 });

  // Switch back to Month and confirm the URL reflects it too.
  const monthBtn = page.getByRole("button", { name: "Month", exact: true });
  await monthBtn.click();
  await expect(page).toHaveURL(/[?&]view=month/, { timeout: 10_000 });

  // ── Step 4: event detail page renders the event title ─────────────────────
  // NOTE on type mapping: the list endpoint returns both LiveClass and ZoomClass
  // with type="live_class", but the detail endpoint's MODEL_MAP for "live_class"
  // only looks up LiveClass (not ZoomClass). ZoomClass uses the "zoom_class" key.
  // To guarantee a match, prefer a live_stream event (1:1 mapping); fall back to
  // the first event of any type that isn't a ZoomClass ambiguity.
  // live_stream is the safest choice — LiveStream has a unique pk namespace.
  const ev =
    list.find((e: { id: number; type: string; title: string }) => e.type === "live_stream") ??
    list.find((e: { id: number; type: string; title: string }) => e.type === "onsite_event") ??
    list[0];
  await page.goto(`${TENANT}/calendar/${ev.type}/${ev.id}`);
  await expect(page.getByRole("main")).toBeVisible();
  // EventDetailClient renders the title as an h1 (font-display text-3xl …).
  await expect(
    page.getByRole("heading", { name: ev.title, level: 1 }),
    `Event title "${ev.title}" not found as h1 on detail page`
  ).toBeVisible({ timeout: 15_000 });
});
