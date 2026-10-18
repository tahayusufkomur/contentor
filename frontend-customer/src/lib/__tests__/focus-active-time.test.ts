import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accumulate,
  startActiveTime,
  stopActiveTime,
  takeActiveMs,
} from "@/lib/focus/active-time";

afterEach(() => {
  vi.restoreAllMocks();
  stopActiveTime("k");
});

describe("accumulate", () => {
  it("adds only the visible spans", () => {
    let span = { total: 0, since: null as number | null };
    span = accumulate(span, "visible", 0);
    span = accumulate(span, "hidden", 1000);
    span = accumulate(span, "visible", 5000);
    span = accumulate(span, "hidden", 5500);
    expect(span.total).toBe(1500);
    expect(span.since).toBeNull();
  });

  it("ignores a repeated event", () => {
    let span = accumulate({ total: 0, since: null }, "visible", 0);
    span = accumulate(span, "visible", 400);
    span = accumulate(span, "hidden", 1000);
    span = accumulate(span, "hidden", 3000);
    expect(span.total).toBe(1000);
  });
});

describe("takeActiveMs", () => {
  it("returns the time since the last take, once", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    startActiveTime("k");
    now.mockReturnValue(4000);
    expect(takeActiveMs("k")).toBe(3000);
    expect(takeActiveMs("k")).toBe(0);
  });

  it("keeps counting across a second start, and restarts when asked", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    startActiveTime("k");
    now.mockReturnValue(2000);
    startActiveTime("k"); // the course page after the new-course page
    now.mockReturnValue(3000);
    expect(takeActiveMs("k")).toBe(3000);
    startActiveTime("k", true);
    now.mockReturnValue(3500);
    expect(takeActiveMs("k")).toBe(500);
  });

  it("is 0 for a key never started", () => {
    expect(takeActiveMs("nobody")).toBe(0);
  });
});
