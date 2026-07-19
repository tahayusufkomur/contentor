import { describe, expect, it } from "vitest";

import { parseH2Headings } from "@/lib/html-headings";

describe("parseH2Headings", () => {
  it("extracts h2 text in document order", () => {
    expect(
      parseH2Headings("<p>i</p><h2>First</h2><p>x</p><h2>Second</h2>"),
    ).toEqual(["First", "Second"]);
  });

  it("decodes entities and strips inner tags", () => {
    expect(parseH2Headings("<h2>A &amp; <em>B</em></h2>")).toEqual(["A & B"]);
  });

  it("returns empty for no headings or empty input", () => {
    expect(parseH2Headings("<p>none</p>")).toEqual([]);
    expect(parseH2Headings("")).toEqual([]);
  });
});
