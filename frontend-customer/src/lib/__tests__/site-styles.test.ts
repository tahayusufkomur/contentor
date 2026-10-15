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
} from "@/lib/site-styles";
import { contrastRatio } from "@shared/lib/contrast";
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
  it("starts a dark style dark, and emits both schemes", () => {
    expect(styleDefaultTheme(SITE_STYLES.nocturne)).toBe("dark");
    expect(styleDefaultTheme(SITE_STYLES.journal)).toBe("light");
    const css = styleRootCss(SITE_STYLES.journal);
    expect(css).toMatch(/:root \{[\s\S]*\.dark, \.dim \{/);
  });
});

describe("marketing accent", () => {
  it("is the tenant's accent where it reads on muted, her ink where not", () => {
    for (const s of Object.values(SITE_STYLES))
      for (const id of [null, ...(s.palettes ?? []).map((p) => p.id)]) {
        const v = styleVars(s, id);
        const label = `${s.id}/${id ?? "own"}`;
        expect([v.accent, v.foreground], label).toContain(
          v["marketing-accent"],
        );
        expect(
          contrastRatio(v["marketing-accent"], v.muted),
          label,
        ).toBeGreaterThanOrEqual(4.5);
      }
    expect(styleVars(SITE_STYLES.journal)["marketing-accent"]).toBe(
      SITE_STYLES.journal.palette.accent,
    );
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
