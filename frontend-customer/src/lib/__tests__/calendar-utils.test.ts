import { describe, expect, it } from "vitest";

import { formatEventWhen } from "@/lib/calendar-utils";

// The event catalog renders inside server-rendered public pages: the exact
// same string must come out regardless of the machine's TZ/locale, or React
// logs a hydration mismatch (server UTC vs browser local time).
describe("formatEventWhen", () => {
  const instant = "2026-07-18T09:00:00Z";

  it("formats in the tenant timezone, not the process timezone", () => {
    expect(formatEventWhen(instant, "en", "Europe/Istanbul")).toBe(
      "Jul 18, 12:00 PM",
    );
    expect(formatEventWhen(instant, "en", "UTC")).toBe("Jul 18, 09:00 AM");
  });

  it("respects the active locale", () => {
    expect(formatEventWhen(instant, "tr", "Europe/Istanbul")).toBe(
      "18 Tem 12:00",
    );
  });

  it("defaults to UTC when the tenant has no timezone", () => {
    expect(formatEventWhen(instant, "en")).toBe("Jul 18, 09:00 AM");
  });
});
