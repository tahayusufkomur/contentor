import { describe, expect, it } from "vitest";
import {
  CLAMP_FONTS,
  CLAMP_PAD,
  clampClip,
  clampEdge,
} from "@/lib/covers/clamp";
import type { ClampWord } from "@/lib/covers/clamp";
import { LEADING } from "@/lib/covers/layouts";
import { SITE_STYLES } from "@/lib/site-styles";

const PLAIN =
  "Introduction to Mindful Movement and Breathing for Complete Beginners 2026";
const TURKISH = "Sabah Yogası ile Güne Başla: İleri Seviye Akış Çalışması 2026";
// Turkish with a dotted capital and no cedilla: only the dot is in the way.
const DOTTED = "Güne İleri Seviye Yoga Programı";

const word = (edit: Partial<ClampWord> = {}): ClampWord => ({
  family: "Newsreader",
  text: PLAIN,
  upper: false,
  leading: LEADING.title,
  ...edit,
});

describe("clampEdge", () => {
  it("has numbers for the fonts the looks set words in, and for no others", () => {
    const used = new Set(
      Object.values(SITE_STYLES).flatMap((look) => [
        look.fonts.display,
        look.fonts.body,
      ]),
    );
    expect([...CLAMP_FONTS].sort()).toEqual([...used].sort());
  });

  it("leaves a gap between a line and the next in every font, at each default line height", () => {
    // Plain Latin text: the descenders of one line end above where the ink of the next begins, give or
    // take a hair, so the clip has somewhere to fall.
    for (const family of CLAMP_FONTS) {
      for (const leading of Object.values(LEADING)) {
        const { lo, hi } = clampEdge(word({ family, leading }));
        expect(hi - lo, `${family} at ${leading}`).toBeGreaterThan(-0.05);
      }
    }
  });

  it("moves with the line height: a looser one lifts where the next line's ink begins", () => {
    const tight = clampEdge(word({ leading: 0.9 }));
    const loose = clampEdge(word({ leading: 1.6 }));
    expect(loose.hi - tight.hi).toBeCloseTo(0.35, 9);
    expect(tight.lo - loose.lo).toBeCloseTo(0.35, 9);
    expect(tight.mid).toBeCloseTo((tight.lo + tight.hi) / 2, 9);
  });

  it("hides the mark of a tall capital only where there is room for it under the descenders", () => {
    // The dot of İ rises above the other ink. At a loose line height there is room under it...
    const loose = { family: "Albert Sans", leading: LEADING.subtitle };
    expect(clampEdge(word({ ...loose, text: DOTTED })).hi).toBeLessThan(
      clampEdge(word({ ...loose, text: DOTTED.replace("İ", "I") })).hi,
    );
    // ...and at a tight one there is none: the clip would have to cut the cedillas and the tails off,
    // so it stays under the dot.
    const tight = { family: "Newsreader", leading: LEADING.title };
    expect(clampEdge(word({ ...tight, text: DOTTED })).hi).toBe(
      clampEdge(word({ ...tight, text: DOTTED.replace("İ", "I") })).hi,
    );
    // A capital with no mark is no taller than the rest, and nor is a small letter with one.
    expect(clampEdge(word({ ...loose, text: DOTTED.toLowerCase() })).hi).toBe(
      clampEdge(word({ ...loose, text: DOTTED.replace("İ", "I") })).hi,
    );
  });

  it("takes a letter set in capitals for one that may carry a mark, if it has one", () => {
    const loose = { family: "Albert Sans", leading: LEADING.subtitle };
    const text = "Yeni ürünler öğren";
    expect(clampEdge(word({ ...loose, text, upper: true })).hi).toBeLessThan(
      clampEdge(word({ ...loose, text })).hi,
    );
    expect(clampEdge(word({ ...loose, upper: true })).hi).toBe(
      clampEdge(word({ ...loose })).hi,
    );
  });

  it("counts a cedilla in the lines that are shown, since it hangs below them", () => {
    const withCedilla = clampEdge(
      word({ family: "Albert Sans", text: "Başla" }),
    );
    const without = clampEdge(word({ family: "Albert Sans", text: "Basla" }));
    expect(withCedilla.lo).toBeGreaterThan(without.lo);
    expect(withCedilla.hi).toBe(without.hi);
  });

  it("counts the signs that stand taller than the capitals, and hang lower", () => {
    const sign = (family: string) =>
      clampEdge(
        word({ family, text: `${PLAIN} $99`, leading: LEADING.subtitle }),
      );
    const plain = (family: string) =>
      clampEdge(
        word({ family, text: `${PLAIN} 99`, leading: LEADING.subtitle }),
      );
    expect(sign("Cormorant").hi).toBeLessThan(plain("Cormorant").hi);
    expect(sign("Albert Sans").lo).toBeGreaterThan(plain("Albert Sans").lo);
  });

  it("uses a middling font for one it has no numbers for", () => {
    const unknown = clampEdge(word({ family: "Papyrus" }));
    expect(Number.isFinite(unknown.lo) && Number.isFinite(unknown.hi)).toBe(
      true,
    );
    expect(unknown.hi).toBeGreaterThan(unknown.lo);
  });
});

describe("clampClip", () => {
  it("draws the clip half way between the two lines' ink", () => {
    const w = word({ family: "Newsreader", text: PLAIN });
    const { mid } = clampEdge(w);
    expect(clampClip(w)).toBe(
      `inset(0 0 calc(${CLAMP_PAD}em - ${+mid.toFixed(3)}em) 0)`,
    );
  });

  it("writes only numbers a browser reads", () => {
    for (const family of [...CLAMP_FONTS, "Papyrus"]) {
      for (const text of [PLAIN, TURKISH, "€99 İçin"]) {
        expect(clampClip(word({ family, text })), `${family} ${text}`).toMatch(
          /^inset\(0 0 calc\(0\.3em - -?\d+(\.\d+)?em\) 0\)$/,
        );
      }
    }
  });
});
