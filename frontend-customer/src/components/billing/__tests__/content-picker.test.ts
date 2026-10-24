import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ clientFetch: vi.fn() }));

import {
  chipsOf,
  type SelectedItem,
} from "@/components/billing/content-picker";

const item = (
  content_type: string,
  object_id: number,
  title: string,
): SelectedItem => ({
  content_type,
  object_id,
  title,
  price: "10.00",
});

describe("chipsOf", () => {
  it("makes a weekly class one chip, and keeps every other item its own", () => {
    const weekly = [1, 2, 3].map((n) => item("live_class", n, "Morning flow"));
    const course = item("course", 9, "Yoga basics");
    const other = item("live_class", 4, "Evening flow");
    expect(chipsOf([weekly[0], course, ...weekly.slice(1), other])).toEqual([
      weekly,
      [course],
      [other],
    ]);
  });

  it("never merges two courses that share a title", () => {
    const a = item("course", 1, "Basics");
    const b = item("course", 2, "Basics");
    expect(chipsOf([a, b])).toEqual([[a], [b]]);
  });
});
