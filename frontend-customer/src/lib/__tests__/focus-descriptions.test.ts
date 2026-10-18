import { describe, expect, it, vi } from "vitest";
import { lessonsFrame } from "@/lib/focus/descriptions";
import type { RunEvent } from "@/lib/copilot/types";

vi.mock("@/lib/copilot/api", () => ({
  fetchRun: vi.fn(),
  markRunSeen: vi.fn(),
}));

const ev = (seq: number, type: string, data: object) =>
  ({ seq, at: "", type, data }) as RunEvent;
const EVENTS = [
  ev(1, "step", {
    specialist: "content",
    label: "Writing lesson descriptions",
    state: "start",
    total: 2,
  }),
  ev(2, "field", {
    record: "lesson:7",
    name: "content_html",
    value: "Sit tall.",
  }),
  ev(3, "field", {
    record: "lesson:8",
    name: "content_html",
    value: "Breathe out.",
  }),
  ev(4, "step", {
    specialist: "content",
    label: "Writing lesson descriptions",
    state: "done",
  }),
];

describe("lessonsFrame", () => {
  it("types lessons one after another and counts them", () => {
    const mid = lessonsFrame(EVENTS, 200, 60); // 12 chars of budget
    expect(mid.texts[7]).toEqual({ value: "Sit tall.", typing: false });
    expect(mid.texts[8].typing).toBe(true);
    expect([mid.done, mid.total]).toEqual([1, 2]);
    expect(mid.working?.specialist).toBe("content");
  });

  it("settles once everything is shown and the step is done", () => {
    const end = lessonsFrame(EVENTS, Infinity);
    expect(end.settled).toBe(true);
    expect(end.working).toBeNull();
    expect([end.done, end.total]).toEqual([2, 2]);
  });

  it("ignores fields of other records", () => {
    const other = ev(2, "field", {
      record: "course:1",
      name: "title",
      value: "Desk yoga",
    });
    const frame = lessonsFrame([EVENTS[0], other, EVENTS[3]], Infinity);
    expect(frame.texts).toEqual({});
    expect(frame.done).toBe(0);
  });

  it("settles a run that ends without a done step only when ended", () => {
    const events = EVENTS.slice(0, 3); // stopped or failed: no done step
    const live = lessonsFrame(events, Infinity, 60, false);
    expect(live.settled).toBe(false);
    expect(live.working).not.toBeNull();
    const over = lessonsFrame(events, Infinity, 60, true);
    expect(over.settled).toBe(true);
    expect(over.working).toBeNull();
    expect(over.done).toBe(2);
  });

  it("keeps typing what arrived before an ended run settles", () => {
    const mid = lessonsFrame(EVENTS.slice(0, 3), 200, 60, true);
    expect(mid.settled).toBe(false);
    expect(mid.texts[8].typing).toBe(true);
  });
});
