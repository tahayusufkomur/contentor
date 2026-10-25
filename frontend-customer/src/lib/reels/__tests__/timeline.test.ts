import { describe, expect, it } from "vitest";
import {
  captionAt,
  centreAt,
  clock,
  groups,
  nextPlayable,
  onReel,
  phraseAt,
  reelLength,
  toSource,
  upper,
  windowLeft,
  type Span,
} from "../timeline";
import type { Word } from "@/types/reels";

const WORDS: Word[] = [
  [1.0, 1.4, " Hello"],
  [1.4, 1.9, " there."],
  [2.0, 2.3, " Do"],
  [2.3, 2.6, " this"],
  [2.6, 3.0, " now?"],
  [5.0, 5.5, " Yes."],
];

describe("the crop window", () => {
  const keys: [number, number][] = [
    [0, 0.5],
    [2, 0.5],
    [2.5, 0.7],
  ];
  it("moves in a straight line between keys and holds at both ends", () => {
    expect(centreAt(keys, -1)).toBe(0.5);
    expect(centreAt(keys, 1)).toBe(0.5);
    expect(centreAt(keys, 2.25)).toBeCloseTo(0.6);
    expect(centreAt(keys, 9)).toBe(0.7);
    expect(centreAt([], 3)).toBe(0.5);
  });
  it("never leaves the frame", () => {
    expect(windowLeft([[0, 0]], 0, 0.3164)).toBe(0);
    expect(windowLeft([[0, 1]], 0, 0.3164)).toBeCloseTo(1 - 0.3164);
  });
});

describe("the reel's clock", () => {
  const keep: Span[] = [
    [0, 2.25],
    [3.95, 4.9],
  ];
  it("skips the cuts", () => {
    expect(reelLength(keep)).toBeCloseTo(3.2);
    expect(onReel(1.0, 0.9, keep)).toBeCloseTo(0.1);
    expect(onReel(4.0, 0.9, keep)).toBeNull();
    expect(onReel(5.0, 0.9, keep)).toBeCloseTo(2.25 + 4.1 - 3.95);
  });
  it("maps the reel's clock back for scrubbing", () => {
    expect(toSource(0.1, 0.9, keep)).toBeCloseTo(1.0);
    expect(toSource(2.5, 0.9, keep)).toBeCloseTo(0.9 + 3.95 + 0.25);
    expect(toSource(99, 0.9, keep)).toBeCloseTo(0.9 + 4.9);
  });
  it("plays on, jumps a cut, and ends", () => {
    expect(nextPlayable(1.0, 0.9, keep)).toBe(1.0);
    expect(nextPlayable(3.5, 0.9, keep)).toBeCloseTo(0.9 + 3.95);
    expect(nextPlayable(5.9, 0.9, keep)).toBeNull();
  });
});

describe("captions", () => {
  it("groups like the render does", () => {
    expect(groups(WORDS, "bold").map((g) => g.map((w) => w[2]))).toEqual([
      [" Hello", " there."],
      [" Do", " this", " now?"],
      [" Yes."],
    ]);
  });
  it("lights the word being said and clears between groups", () => {
    const runs = groups(WORDS, "bold");
    expect(captionAt(runs, 1.5, 10)).toEqual({
      words: ["Hello", "there."],
      active: 1,
    });
    expect(captionAt(runs, 2.1, 10)?.active).toBe(0);
    expect(captionAt(runs, 4.0, 10)).toBeNull();
    expect(captionAt(runs, 0.5, 10)).toBeNull();
  });
  it("keeps Turkish capitals dotted", () => {
    expect(upper("istanbul ılık", "tr")).toBe("İSTANBUL ILIK");
  });
  it("finds the translated line", () => {
    const phrases = [{ start: 0, end: 1.2, text: "Hallo" }];
    expect(phraseAt(phrases, 0.5)).toBe("Hallo");
    expect(phraseAt(phrases, 2)).toBeNull();
  });
  it("shows time as m:ss", () => {
    expect(clock(75.4)).toBe("1:15");
  });
});
