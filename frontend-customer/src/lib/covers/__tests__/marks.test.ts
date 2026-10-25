import { describe, expect, it } from "vitest";
import {
  markedWord,
  markedWords,
  markWord,
  plainWords,
  wordsOf,
} from "@/lib/covers/marks";
import { qrPath } from "@/components/covers/cover-qr";

describe("marked words", () => {
  it("splits her words where she marked them, and a lone star stays a star", () => {
    expect(markedWords("Find your *calm* today")).toEqual([
      { text: "Find your ", marked: false },
      { text: "calm", marked: true },
      { text: " today", marked: false },
    ]);
    expect(markedWords("5* retreat")).toEqual([
      { text: "5* retreat", marked: false },
    ]);
    expect(plainWords("*Slow* down, *breathe*")).toBe("Slow down, breathe");
    expect(markedWord("Slow *down*")).toBe("down");
    expect(markedWord("Slow down")).toBe("");
  });

  it("lists each word once, in order, Turkish letters and apostrophes kept", () => {
    expect(wordsOf("Yoga, nefes ve *yoga* için İstanbul'da")).toEqual([
      "Yoga",
      "nefes",
      "ve",
      "yoga",
      "için",
      "İstanbul'da",
    ]);
  });

  it("marks a word where it stands on its own, one at a time, and unmarks with none", () => {
    expect(markWord("Pilates at home", "home", 90)).toBe("Pilates at *home*");
    // not the "at" inside another word, and the earlier mark goes
    expect(markWord("Flat *at* home", "at", 90)).toBe("Flat *at* home");
    expect(markWord("*Pilates* at home", "home", 90)).toBe("Pilates at *home*");
    expect(markWord("*Pilates* at home", "", 90)).toBe("Pilates at home");
    expect(markWord("Pilates", "yoga", 90)).toBe("Pilates");
    // the stars would take it past what the server keeps: refused, not cut
    expect(markWord("x".repeat(89) + " a", "a", 90)).toBeNull();
  });
});

describe("qrPath", () => {
  it("draws a code with its quiet border, larger for a longer link", () => {
    const short = qrPath("https://yoga.test");
    const long = qrPath(`https://yoga.test/courses/${"a".repeat(120)}`);
    expect(short.d).toMatch(/^M\d+ \d+h1v1h-1z/);
    // version 2 at least (25 squares) and the border of two on each side
    expect(short.size).toBeGreaterThanOrEqual(25 + 4);
    expect(long.size).toBeGreaterThan(short.size);
  });
});
