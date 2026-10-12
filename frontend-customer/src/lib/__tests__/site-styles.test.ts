import { describe, expect, it } from "vitest";
import {
  SITE_STYLES,
  isDarkPalette,
  modePalette,
  oklchToHex,
  paletteOf,
  styleDefaultTheme,
  styleRootCss,
  styleVars,
  themeModes,
  themeStorageKey,
} from "@/lib/site-styles";
import { rankStylesForNiche } from "@shared/sections/styles";

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
  it("swaps an ink primary with the paper instead of greying it", () => {
    const dark = modePalette(SITE_STYLES.journal.palette, "dark");
    expect(dark.primary).toBe(dark.foreground);
    expect(dark.primaryForeground).toBe(dark.background);
    const noir = paletteOf(SITE_STYLES.maison, "noir");
    const light = modePalette(noir, "light");
    expect(light.primary).toBe(light.foreground);
    // A primary with a hue of its own is lifted, not swapped.
    const sprout = modePalette(SITE_STYLES.sprout.palette, "dark");
    expect(sprout.primary).toContain(SITE_STYLES.sprout.palette.primary);
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

describe("themeStorageKey", () => {
  it("is per look and colourway on a styled site, plain otherwise", () => {
    expect(themeStorageKey("journal", "sage")).toBe("theme:journal:sage");
    expect(themeStorageKey("journal")).toBe("theme:journal:");
    expect(themeStorageKey("journal", "sage")).not.toBe(
      themeStorageKey("journal", ""),
    );
    expect(themeStorageKey("")).toBe("theme");
    expect(themeStorageKey(undefined)).toBe("theme");
    expect(themeStorageKey("no-such-style")).toBe("theme");
  });
});

describe("oklchToHex", () => {
  it("converts oklch to sRGB hex", () => {
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
    expect(oklchToHex("oklch(0.628 0.2577 29.23)")).toBe("#ff0000");
  });
  it("is undefined for non-oklch strings", () => {
    expect(oklchToHex("#ff0000")).toBeUndefined();
  });
  it("converts every shipped primary", () => {
    for (const s of Object.values(SITE_STYLES))
      expect(oklchToHex(s.palette.primary)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("rankStylesForNiche", () => {
  it("lets a mood tag outweigh a niche made for another tone (mirrors rank_styles)", () => {
    expect(rankStylesForNiche("pole_dance", ["sexy", "sensual"])[0].id).toBe(
      "velvet",
    );
    expect(rankStylesForNiche("dance", ["sexy", "sensual"])[0].id).toBe(
      "studiofloor",
    );
    expect(rankStylesForNiche("pole_dance", [])[0].id).not.toBe("velvet");
    expect(rankStylesForNiche("yoga", "Sensual")[0].id).toBe("nocturne");
    expect(rankStylesForNiche("yoga", "Warm, Calm")[0].id).toBe("journal");
  });
});
