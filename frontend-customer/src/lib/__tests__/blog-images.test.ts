import { describe, expect, it } from "vitest";
import { extractHeadings, upsertPlacement } from "@/lib/blog-images";

describe("extractHeadings", () => {
  it("returns each <h2> text in order", () => {
    const html = "<h2>Intro</h2><p>hi</p><h2>Stretch first</h2><p>bend</p>";
    expect(extractHeadings(html)).toEqual(["Intro", "Stretch first"]);
  });

  it("returns an empty array when there are no headings", () => {
    expect(extractHeadings("<p>just text</p>")).toEqual([]);
  });
});

describe("upsertPlacement", () => {
  it("adds a new placement", () => {
    const result = upsertPlacement([], { heading: "A", photo_id: "p1" });
    expect(result).toEqual([{ heading: "A", photo_id: "p1" }]);
  });

  it("replaces the placement for the same heading rather than duplicating", () => {
    const existing = [{ heading: "A", photo_id: "p1" }];
    const result = upsertPlacement(existing, { heading: "A", photo_id: "p2" });
    expect(result).toEqual([{ heading: "A", photo_id: "p2" }]);
  });

  it("caps at 2 placements, dropping the oldest", () => {
    const existing = [
      { heading: "A", photo_id: "p1" },
      { heading: "B", photo_id: "p2" },
    ];
    const result = upsertPlacement(existing, { heading: "C", photo_id: "p3" });
    expect(result).toEqual([
      { heading: "B", photo_id: "p2" },
      { heading: "C", photo_id: "p3" },
    ]);
  });
});
