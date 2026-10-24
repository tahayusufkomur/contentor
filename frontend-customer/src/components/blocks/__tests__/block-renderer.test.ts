import { describe, expect, it } from "vitest";
import { limitSlice } from "../block-renderer";

describe("limitSlice", () => {
  const events = Array.from({ length: 9 }, (_, i) => ({ id: i }));

  it("caps events to the block's limit", () => {
    const cap = (limit: string) =>
      limitSlice(
        { type: "section.events", limit } as never,
        events,
      ) as unknown[];
    expect(cap("3").length).toBe(3);
    expect(cap("6").length).toBe(6);
    expect(cap("all").length).toBe(9);
    expect(cap("").length).toBe(9);
  });

  it("leaves other blocks and non-array slices alone", () => {
    expect(limitSlice({ type: "section.hero" } as never, events)).toBe(events);
    expect(
      limitSlice({ type: "section.events", limit: "3" } as never, undefined),
    ).toBeUndefined();
    expect(limitSlice({ type: "section.events" } as never, events)).toBe(
      events,
    );
  });
});
