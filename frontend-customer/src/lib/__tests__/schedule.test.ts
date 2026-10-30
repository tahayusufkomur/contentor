import { describe, expect, it } from "vitest";
import pl from "../../../messages/pl/admin.json";
import de from "../../../messages/de/admin.json";
import { setupT, tEn } from "./setup-t";
import {
  firstOccurrence,
  scheduleSummary,
  scheduleValid,
} from "@/lib/interview";

describe("class schedules", () => {
  const weekly = {
    start: "2026-10-12",
    end: "2026-12-07",
    slots: [{ days: [4, 2], times: ["18:30"] }],
  };

  it("reads a weekly timetable back, Monday first", () => {
    expect(scheduleSummary("recurring", weekly, "en", tEn)).toBe(
      "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026",
    );
    expect(
      scheduleSummary("recurring", { ...weekly, end: undefined }, "en", tEn),
    ).toBe("Tuesdays and Thursdays at 6:30 PM, from 12 Oct 2026");
    expect(scheduleSummary("once", { at: "2026-10-13T18:30" }, "en", tEn)).toBe(
      "Tuesday 13 Oct 2026 at 6:30 PM",
    );
  });

  it("reads a second day and time as its own clause", () => {
    const twice = {
      ...weekly,
      slots: [
        { days: [4, 2], times: ["18:30"] },
        { days: [6], times: ["09:00"] },
      ],
    };
    expect(scheduleSummary("recurring", twice, "en", tEn)).toBe(
      "Tuesdays and Thursdays at 6:30 PM; Saturdays at 9:00 AM, from 12 Oct to 7 Dec 2026",
    );
  });

  it("lists three days the way it always read, without an Oxford comma", () => {
    const three = { ...weekly, slots: [{ days: [5, 1, 3], times: ["18:30"] }] };
    expect(scheduleSummary("recurring", three, "en", tEn)).toBe(
      "Mondays, Wednesdays and Fridays at 6:30 PM, from 12 Oct to 7 Dec 2026",
    );
  });

  it("reads in the creator's language: its own days, times and dates, no English left", () => {
    const polish = scheduleSummary("recurring", weekly, "pl", setupT("pl", pl));
    expect(polish).toContain("18:30");
    expect(polish).not.toMatch(/Tuesdays|Thursdays| at | from | to /);
    const german = scheduleSummary(
      "once",
      { at: "2026-10-13T18:30" },
      "de",
      setupT("de", de),
    );
    expect(german).toContain("Dienstag");
    expect(german).toContain("18:30");
    expect(german).not.toContain(" at ");
  });

  it("finds the first class on or after the start date", () => {
    // 12 Oct 2026 is a Monday: the first Tuesday is the 13th.
    expect(firstOccurrence("recurring", weekly)).toBe(
      new Date("2026-10-13T18:30").toISOString(),
    );
    expect(firstOccurrence("once", { at: "2026-10-13T18:30" })).toBe(
      new Date("2026-10-13T18:30").toISOString(),
    );
    expect(
      firstOccurrence("recurring", {
        ...weekly,
        slots: [{ days: [], times: ["18:30"] }],
      }),
    ).toBeNull();
  });

  it("takes the earliest slot for the first class", () => {
    // Tuesday 13 Oct comes before Saturday 17 Oct, whatever the slot order.
    expect(
      firstOccurrence("recurring", {
        ...weekly,
        slots: [
          { days: [2], times: ["18:30"] },
          { days: [6], times: ["09:00"] },
        ],
      }),
    ).toBe(new Date("2026-10-13T18:30").toISOString());
  });

  it("needs the days and a time for every slot, or the one date", () => {
    expect(scheduleValid("recurring", weekly)).toBe(true);
    expect(
      scheduleValid("recurring", {
        ...weekly,
        slots: [{ days: [4], times: [""] }],
      }),
    ).toBe(false);
    expect(
      scheduleValid("recurring", {
        ...weekly,
        slots: [...(weekly.slots ?? []), { days: [], times: ["09:00"] }],
      }),
    ).toBe(false);
    expect(scheduleValid("once", {})).toBe(false);
  });
});
