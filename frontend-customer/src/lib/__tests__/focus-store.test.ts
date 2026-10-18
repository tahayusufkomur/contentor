import { describe, expect, it, vi } from "vitest";
import type { FocusOverview, FocusState } from "@/lib/focus/api";
import { focusProgress, openCreationFor } from "@/lib/focus/store";

vi.mock("@/lib/api-client", () => ({ clientFetch: vi.fn() }));

const overview = (open: FocusOverview["open"]): FocusOverview => ({
  enabled: true,
  first: {},
  open,
});

const record = (id: number) => ({ id, slug: `c-${id}`, title: "C" });

describe("openCreationFor", () => {
  it("finds her open creation for this record", () => {
    const o = overview([
      { id: 4, kind: "course", record: record(10) },
      { id: 5, kind: "course", record: record(11) },
    ]);
    expect(openCreationFor(o, "course", 11)).toBe(5);
  });

  it("is null for another record, another kind, or no overview", () => {
    const o = overview([{ id: 4, kind: "course", record: record(10) }]);
    expect(openCreationFor(o, "course", 99)).toBeNull();
    expect(openCreationFor(o, "class", 10)).toBeNull();
    expect(openCreationFor(null, "course", 10)).toBeNull();
  });
});

describe("focusProgress", () => {
  it("counts the steps done", () => {
    const state = {
      steps: [
        { id: "topic", done: true },
        { id: "level", done: true },
        { id: "size", done: false },
      ],
    } as FocusState;
    expect(focusProgress(state)).toEqual({ done: 2, total: 3 });
  });
});
