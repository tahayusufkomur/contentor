import { describe, expect, it } from "vitest";
import {
  firstOccurrence,
  scheduleSummary,
  scheduleValid,
} from "@/lib/interview";

describe("class schedules", () => {
  const weekly = {
    start: "2026-10-12",
    end: "2026-12-07",
    days: [4, 2],
    times: ["18:30"],
  };

  it("reads a weekly timetable back, Monday first", () => {
    expect(scheduleSummary("recurring", weekly)).toBe(
      "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026",
    );
    expect(scheduleSummary("recurring", { ...weekly, end: undefined })).toBe(
      "Tuesdays and Thursdays at 6:30 PM, from 12 Oct 2026",
    );
    expect(scheduleSummary("once", { at: "2026-10-13T18:30" })).toBe(
      "Tuesday 13 Oct 2026 at 6:30 PM",
    );
  });

  it("finds the first class on or after the start date", () => {
    // 12 Oct 2026 is a Monday: the first Tuesday is the 13th.
    expect(firstOccurrence("recurring", weekly)).toBe(
      new Date("2026-10-13T18:30").toISOString(),
    );
    expect(firstOccurrence("once", { at: "2026-10-13T18:30" })).toBe(
      new Date("2026-10-13T18:30").toISOString(),
    );
    expect(firstOccurrence("recurring", { ...weekly, days: [] })).toBeNull();
  });

  it("needs the days and a time, or the one date", () => {
    expect(scheduleValid("recurring", weekly)).toBe(true);
    expect(scheduleValid("recurring", { ...weekly, times: [""] })).toBe(false);
    expect(scheduleValid("once", {})).toBe(false);
  });
});
