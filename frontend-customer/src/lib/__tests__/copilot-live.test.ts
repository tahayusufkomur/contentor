import { describe, expect, it, vi } from "vitest";
import { liveFrame } from "@/lib/copilot/live";
import { applyRun } from "@/lib/copilot/runs";
import type { RunDetail, RunEvent } from "@/lib/copilot/types";

vi.mock("@/lib/copilot/api", () => ({
  fetchRun: vi.fn(),
  markRunSeen: vi.fn(),
}));

const ev = (
  seq: number,
  type: string,
  data: Record<string, unknown> = {},
): RunEvent => ({ seq, type, data, at: "2026-10-18T00:00:00Z" });

const R = "course:1";
const outline = (done = true): RunEvent[] => [
  ev(1, "step", { specialist: "content", label: "Writing", state: "start" }),
  ev(2, "field", { record: R, name: "title", value: "Desk yoga" }),
  ev(3, "field", { record: R, name: "description", value: "Ten minutes." }),
  ev(4, "row", {
    record: R,
    kind: "module",
    value: { title: "Basics", lessons: ["Neck", "Back"] },
  }),
  ...(done
    ? [
        ev(5, "step", {
          specialist: "content",
          label: "Writing",
          state: "done",
        }),
        ev(6, "done"),
      ]
    : []),
];

const detail = (events: RunEvent[]): RunDetail => ({
  id: 7,
  status: "working",
  specialist: "content",
  chat: null,
  seen: false,
  events,
});

describe("applyRun keeps the reveal events", () => {
  it("keeps step, field and row events in order, once", () => {
    const first = applyRun(undefined, detail(outline(false).slice(0, 2)));
    const next = applyRun(first, detail(outline(false)));
    expect(next.events?.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it("leaves out the other events", () => {
    const run = applyRun(undefined, detail(outline()));
    expect(run.events?.map((e) => e.type)).toEqual([
      "step",
      "field",
      "field",
      "row",
      "step",
    ]);
  });
});

describe("liveFrame", () => {
  it("starts with the first field empty and typing", () => {
    const frame = liveFrame(outline(), R, 0);
    expect(frame.fields.title).toEqual({ value: "", typing: true });
    expect(frame.fields.description).toBeUndefined();
    expect(frame.rows).toEqual([]);
    expect(frame.working).toEqual({ specialist: "content", label: "Writing" });
    expect(frame.settled).toBe(false);
    // What a save sends: every written field whole, before it shows.
    expect(frame.written).toEqual({
      title: "Desk yoga",
      description: "Ten minutes.",
    });
  });

  it("types the title in at the given speed", () => {
    // 60 characters a second: 4 characters after 70 ms... of "Desk yoga".
    const frame = liveFrame(outline(), R, 70, 60);
    expect(frame.fields.title).toEqual({ value: "Desk", typing: true });
  });

  it("moves on to the rows once the fields are written", () => {
    const chars = "Desk yoga".length + "Ten minutes.".length + "Basics".length;
    const frame = liveFrame(outline(), R, ((chars + 2) * 1000) / 60);
    expect(frame.fields.description).toEqual({
      value: "Ten minutes.",
      typing: false,
    });
    expect(frame.rows).toEqual([
      { title: "Basics", lessons: ["Ne"], typing: true },
    ]);
  });

  it("is complete and settled at Infinity once the step is done", () => {
    const frame = liveFrame(outline(), R, Infinity);
    expect(frame.fields.title).toEqual({ value: "Desk yoga", typing: false });
    expect(frame.rows).toEqual([
      { title: "Basics", lessons: ["Neck", "Back"], typing: false },
    ]);
    expect(frame.working).toBeNull();
    expect(frame.settled).toBe(true);
  });

  it("is not settled while the step is still going", () => {
    const frame = liveFrame(outline(false), R, Infinity);
    expect(frame.settled).toBe(false);
    expect(frame.working).not.toBeNull();
  });

  it("ignores another record's events", () => {
    const frame = liveFrame(outline(), "course:2", Infinity);
    expect(frame.fields).toEqual({});
    expect(frame.rows).toEqual([]);
  });
});
