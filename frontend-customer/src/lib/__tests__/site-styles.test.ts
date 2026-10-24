import fs from "node:fs";
import path from "node:path";
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

describe("section tokens", () => {
  it("sections read only tokens styleVars emits or they define themselves", () => {
    const dir = path.resolve(__dirname, "../../components/sections");
    const src = (fs.readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => /\.(css|tsx?)$/.test(f))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    const names = (re: RegExp) =>
      new Set([...src.matchAll(re)].map((m) => m[1]));
    const defined = names(/(?<!var\()--([a-zA-Z][\w-]*)/g);
    const emitted = styleVars(SITE_STYLES.journal);
    const undefinedTokens = [...names(/var\(--([\w-]+)/g)].filter(
      (n) => !defined.has(n) && !(n in emitted),
    );
    expect(undefinedTokens).toEqual([]);
  });
  it("emits every surface, own or derived, as an oklch literal with its hue", () => {
    for (const s of Object.values(SITE_STYLES))
      for (const mode of ["light", "dark"] as const)
        expect(styleVars(s, null, mode).surface).toMatch(
          /^oklch\([\d.]+ [\d.]+ [\d.]+\)$/,
        );
  });
  it("emits the palette's surface as --surface", () => {
    const { palette } = SITE_STYLES.studiofloor;
    expect(styleVars(SITE_STYLES.studiofloor).surface).toBe(palette.surface);
    expect(styleRootCss(SITE_STYLES.studiofloor)).toContain(
      `--surface: ${palette.surface};`,
    );
  });
});

describe("photo treatment", () => {
  it("every enabled style declares a photo treatment", () => {
    for (const s of Object.values(SITE_STYLES))
      expect(["none", "mono", "soft", "tint", "vivid"]).toContain(
        s.photoTreatment,
      );
  });
  it("mono greys photos without a tint", () => {
    const v = styleVars(SITE_STYLES.kinetic);
    expect(v["photo-filter"]).toBe("grayscale(1) contrast(1.08)");
    expect(v["photo-tint-opacity"]).toBe("0");
  });
  it("tint washes photos in the palette's primary", () => {
    const v = styleVars(SITE_STYLES.velvet);
    expect(v["photo-tint"]).toBe("var(--primary)");
    expect(v["photo-tint-blend"]).toBe("color");
  });
});
