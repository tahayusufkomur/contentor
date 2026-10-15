import { describe, expect, it } from "vitest";
import { bandOpacity, scrubTime } from "@/lib/scrub-bands";

describe("bandOpacity", () => {
  const band = { from: 0.3, to: 0.6 };
  it("is 0 outside the band", () => {
    expect(bandOpacity(0.1, band)).toBe(0);
    expect(bandOpacity(0.9, band)).toBe(0);
  });
  it("ramps in over `fade`, holds at 1, ramps out", () => {
    expect(bandOpacity(0.34, band)).toBeCloseTo(0.5);
    expect(bandOpacity(0.45, band)).toBe(1);
    expect(bandOpacity(0.56, band)).toBeCloseTo(0.5);
  });
  it("shows the first band before any scroll and the last band at the end", () => {
    expect(bandOpacity(0, { from: 0, to: 0.3 })).toBe(1);
    expect(bandOpacity(1, { from: 0.7, to: 1 })).toBe(1);
  });
});

describe("scrubTime", () => {
  it("maps progress to seconds on a frame grid", () => {
    expect(scrubTime(0.5, 10)).toBe(5);
    expect(scrubTime(0.333, 10, 30)).toBeCloseTo(3.3333, 3);
    // The scrub clips are 10 fps (encode.sh SCRUB_FPS): a 0.1 s grid.
    expect(scrubTime(0.333, 10, 10)).toBeCloseTo(3.3, 5);
  });
  it("clamps progress reported outside 0–1", () => {
    expect(scrubTime(-0.02, 10)).toBe(0);
    expect(scrubTime(1.03, 10)).toBe(10);
  });
});
