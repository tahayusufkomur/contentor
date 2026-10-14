import { describe, expect, it } from "vitest";
import { readingProgress } from "@/lib/reading-progress";

// top = article's bounding-rect top; the bar starts when the article's top
// reaches `offset` (the 48 px header) and ends when its bottom reaches the
// bottom of the viewport.
describe("readingProgress", () => {
  const vh = 800;
  const header = 48;
  it("is 0 before the article reaches the header", () => {
    expect(readingProgress(600, 3000, vh, header)).toBe(0);
    expect(readingProgress(48, 3000, vh, header)).toBe(0);
  });
  it("is 1 when the article's bottom reaches the viewport bottom, and stays 1 past it", () => {
    // travel = 3000 - (800 - 48) = 2248 → top at 48 - 2248
    expect(readingProgress(48 - 2248, 3000, vh, header)).toBe(1);
    expect(readingProgress(-5000, 3000, vh, header)).toBe(1);
  });
  it("is linear in between", () => {
    expect(readingProgress(48 - 1124, 3000, vh, header)).toBeCloseTo(0.5);
  });
  it("jumps 0 → 1 for an article shorter than the viewport", () => {
    expect(readingProgress(200, 400, vh, header)).toBe(0);
    expect(readingProgress(40, 400, vh, header)).toBe(1);
  });
  it("is 0 for a missing or zero-height article and non-finite input", () => {
    expect(readingProgress(0, 0, vh)).toBe(0);
    expect(readingProgress(Number.NaN, 3000, vh)).toBe(0);
  });
});
