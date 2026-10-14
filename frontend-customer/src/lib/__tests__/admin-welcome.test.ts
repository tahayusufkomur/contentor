import { describe, expect, it } from "vitest";
import { SITE_STYLES } from "@shared/sections/styles";
import { firstName, greetingKey, lookSummary } from "@/lib/admin-welcome";
import { siteLook } from "@/lib/site-styles";

describe("greetingKey", () => {
  it("follows the hour: 5–11 morning, 12–17 afternoon, otherwise evening", () => {
    expect(greetingKey(5)).toBe("morning");
    expect(greetingKey(11)).toBe("morning");
    expect(greetingKey(12)).toBe("afternoon");
    expect(greetingKey(17)).toBe("afternoon");
    expect(greetingKey(18)).toBe("evening");
    expect(greetingKey(23)).toBe("evening");
    expect(greetingKey(0)).toBe("evening");
    expect(greetingKey(4)).toBe("evening");
  });
  it("is a plain hello until the client clock is read, or for a bad hour", () => {
    expect(greetingKey(null)).toBe("hello");
    expect(greetingKey(24)).toBe("hello");
    expect(greetingKey(-1)).toBe("hello");
    expect(greetingKey(Number.NaN)).toBe("hello");
    expect(greetingKey(9.5)).toBe("hello");
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Maya Lindqvist")).toBe("Maya");
    expect(firstName("  Maya   Lindqvist ")).toBe("Maya");
    expect(firstName("Maya")).toBe("Maya");
  });
  it("is empty when there is nothing to greet by — never 'undefined' or an e-mail", () => {
    expect(firstName(undefined)).toBe("");
    expect(firstName(null)).toBe("");
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
    expect(firstName("coach@demo-yoga.test")).toBe("");
  });
});

describe("lookSummary", () => {
  const journal = SITE_STYLES.journal;

  it("names the style and its own palette, with four swatches", () => {
    const s = lookSummary("journal", "");
    expect(s.label).toBe(journal.label);
    expect(s.palette).toBe(journal.paletteLabel);
    expect(s.colors).toEqual([
      journal.palette.background,
      journal.palette.foreground,
      journal.palette.primary,
      journal.palette.accent,
    ]);
  });

  it("names an alternative colourway and takes its colours", () => {
    const sage = journal.palettes.find((p) => p.id === "sage")!;
    const s = lookSummary("journal", "sage");
    expect(s.palette).toBe(sage.label);
    expect(s.colors[2]).toBe(sage.palette.primary);
  });

  it("falls back to the style's own palette for an unknown id, and to the default look for no style", () => {
    expect(lookSummary("journal", "mint").palette).toBe(journal.paletteLabel);
    expect(lookSummary(undefined, undefined).label).toBe(siteLook(undefined).label);
    expect(lookSummary(null, null).colors).toHaveLength(4);
  });
});
