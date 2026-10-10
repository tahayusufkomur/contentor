import { describe, expect, it } from "vitest";
import {
  SITE_STYLES,
  isDarkPalette,
  modePalette,
  paletteOf,
  styleDefaultTheme,
  styleRootCss,
  styleVars,
  themeModes,
} from "@/lib/site-styles";

describe("paletteOf", () => {
  const journal = SITE_STYLES.journal;
  it("is the style's own palette by default and for an unknown id", () => {
    expect(paletteOf(journal)).toBe(journal.palette);
    expect(paletteOf(journal, "")).toBe(journal.palette);
    expect(paletteOf(journal, "mint")).toBe(journal.palette);
  });
  it("swaps in an alternative colourway, keeping the style's type", () => {
    const sage = journal.palettes.find((p) => p.id === "sage")!;
    expect(paletteOf(journal, "sage")).toBe(sage.palette);
    const vars = styleVars(journal, "sage");
    expect(vars.primary).toBe(sage.palette.primary);
    expect(vars.inverse).toBe(sage.palette.inverse);
    expect(vars["font-display"]).toBe(styleVars(journal)["font-display"]);
  });
});

describe("modePalette", () => {
  it("keeps a palette's own scheme and derives the other", () => {
    const journal = SITE_STYLES.journal.palette;
    expect(isDarkPalette(journal)).toBe(false);
    expect(modePalette(journal, "light")).toBe(journal);
    const dark = modePalette(journal, "dark");
    expect(isDarkPalette(dark)).toBe(true);
    expect(dark.foreground).not.toBe(journal.foreground);
    const nocturne = SITE_STYLES.nocturne.palette;
    expect(isDarkPalette(nocturne)).toBe(true);
    expect(isDarkPalette(modePalette(nocturne, "light"))).toBe(false);
  });
  it("starts a dark style dark, and emits both schemes", () => {
    expect(styleDefaultTheme(SITE_STYLES.nocturne)).toBe("dark");
    expect(styleDefaultTheme(SITE_STYLES.journal)).toBe("light");
    const css = styleRootCss(SITE_STYLES.journal);
    expect(css).toMatch(/:root \{[\s\S]*\.dark, \.dim \{/);
  });
  it("styled sites toggle light and dark only", () => {
    expect(themeModes(true)).toEqual(["light", "dark"]);
    expect(themeModes(false)).toContain("dim");
  });
});
