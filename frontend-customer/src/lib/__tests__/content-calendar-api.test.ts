import { describe, expect, it } from "vitest";

import { mapContentCalendarItem } from "@/lib/content-calendar-api";

// The backend feed is snake_case; the calendar component consumes camelCase
// UnifiedCalendarItem. The mapper is the seam between the two.
describe("mapContentCalendarItem", () => {
  const apiItem = {
    id: "live_class-12",
    category: "live" as const,
    source: "live_class",
    title: "Live Pilates",
    scheduled_at: "2026-07-21T18:00:00Z",
    status: "scheduled",
    subtitle: "60 min • Live class",
    href: "/admin/live",
  };

  it("maps snake_case scheduled_at to camelCase scheduledAt", () => {
    const mapped = mapContentCalendarItem(apiItem);
    expect(mapped.scheduledAt).toBe("2026-07-21T18:00:00Z");
  });

  it("carries id, category, title, status and href through unchanged", () => {
    const mapped = mapContentCalendarItem(apiItem);
    expect(mapped).toMatchObject({
      id: "live_class-12",
      category: "live",
      title: "Live Pilates",
      status: "scheduled",
      href: "/admin/live",
      subtitle: "60 min • Live class",
    });
  });

  it("treats an empty subtitle as undefined", () => {
    const mapped = mapContentCalendarItem({ ...apiItem, subtitle: "" });
    expect(mapped.subtitle).toBeUndefined();
  });
});
