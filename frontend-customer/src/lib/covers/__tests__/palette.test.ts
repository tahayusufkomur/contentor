import { describe, expect, it } from "vitest";
import { contrastRatio, parseOklch } from "@shared/lib/contrast";
import type { SiteStyle } from "@shared/sections/types";
import {
  coverPalette,
  paintColor,
  parseLook,
  readableOn,
} from "@/lib/covers/palette";
import { oklchToHex, paletteOf, SITE_STYLES } from "@/lib/site-styles";
import { PAINT_ROLES } from "@/types/design";
import type { Paint } from "@/types/design";

const LOOKS = Object.values(SITE_STYLES);
/** Every palette a look ships: its own, then its alternatives. */
const palettesOf = (style: SiteStyle) => [
  null,
  ...(style.palettes ?? []).map((p) => p.id),
];
const lightness = (color: string) => parseOklch(color)!.l;
/** The shared contrast helper reads oklch only. */
const asOklch = (color: string) => (color === "#fff" ? "oklch(1 0 0)" : color);

/** A look with one primary colour and nothing else to read. */
const withPrimary = (primary: string): SiteStyle => ({
  ...SITE_STYLES.atelier,
  palette: { ...SITE_STYLES.atelier.palette, primary },
  palettes: [],
});

describe("coverPalette", () => {
  it("has every role, for every look and every palette of it", () => {
    for (const style of LOOKS) {
      for (const paletteId of palettesOf(style)) {
        const palette = coverPalette(style, paletteId);
        for (const role of PAINT_ROLES) {
          expect(
            palette[role],
            `${style.id}:${paletteId} ${role}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("maps the look's own colours and never derives the other scheme", () => {
    for (const style of LOOKS) {
      const own = paletteOf(style, null);
      const palette = coverPalette(style, null);
      expect(palette.primary).toBe(own.primary);
      expect(palette.accent).toBe(own.accent);
      expect(palette.ink).toBe(own.foreground);
      expect(palette.paper).toBe(own.background);
      expect(palette.surface).toBe(own.surface);
      expect(palette.inverse).toBe(own.inverse);
      expect(palette["inverse-ink"]).toBe(own.inverseForeground);
      expect(palette.white).toBe("#fff");
      expect(palette.black).toBe("#000");
    }
  });

  it("follows the palette id, and falls back to the look's own for an unknown one", () => {
    const style = LOOKS.find((s) => (s.palettes ?? []).length > 0)!;
    const variant = style.palettes[0];
    expect(coverPalette(style, variant.id).primary).toBe(
      variant.palette.primary,
    );
    expect(coverPalette(style, "no-such-palette").primary).toBe(
      style.palette.primary,
    );
  });

  it("moves lightness by 0.16 and keeps chroma and hue, on every look", () => {
    for (const style of LOOKS) {
      for (const paletteId of palettesOf(style)) {
        const palette = coverPalette(style, paletteId);
        for (const role of ["primary", "accent"] as const) {
          const base = parseOklch(palette[role])!;
          const light = parseOklch(palette[`${role}-light`])!;
          const dark = parseOklch(palette[`${role}-dark`])!;
          const label = `${style.id}:${paletteId} ${role}`;
          expect(dark.l, label).toBeLessThan(base.l);
          // A near-white brand colour has nowhere lighter to go: the clamp stops at 0.96.
          if (base.l < 0.96) expect(light.l, label).toBeGreaterThan(base.l);
          for (const tone of [light, dark]) {
            expect(tone.c, label).toBeCloseTo(base.c, 6);
            expect(tone.h, label).toBeCloseTo(base.h, 6);
            expect(tone.l).toBeGreaterThanOrEqual(0.08);
            expect(tone.l).toBeLessThanOrEqual(0.96);
          }
        }
      }
    }
  });

  it("writes the tones as oklch() strings, clamped to 0.08-0.96", () => {
    const mid = coverPalette(withPrimary("oklch(0.5 0.1 200)"), null);
    expect(mid["primary-light"]).toBe("oklch(0.66 0.1 200)");
    expect(mid["primary-dark"]).toBe("oklch(0.34 0.1 200)");
    expect(
      coverPalette(withPrimary("oklch(0.95 0.02 30)"), null)["primary-light"],
    ).toBe("oklch(0.96 0.02 30)");
    expect(
      coverPalette(withPrimary("oklch(0.1 0.02 30)"), null)["primary-dark"],
    ).toBe("oklch(0.08 0.02 30)");
  });
});

describe("parseLook", () => {
  it("splits a look on its first colon into a style and a palette id", () => {
    const style = LOOKS.find((s) => (s.palettes ?? []).length > 0)!;
    expect(parseLook(style.id)).toEqual({ style, paletteId: null });
    expect(parseLook(`${style.id}:${style.palettes[0].id}`)).toEqual({
      style,
      paletteId: style.palettes[0].id,
    });
    // Only the first colon splits; an empty palette id means the look's own.
    expect(parseLook("atelier:a:b").paletteId).toBe("a:b");
    expect(parseLook("atelier:").paletteId).toBeNull();
  });

  it("falls back to the default look for an unknown style or none", () => {
    expect(parseLook("no-such-look").style.id).toBe(parseLook("").style.id);
    expect(parseLook("no-such-look").style.id).toBeTruthy();
  });
});

describe("paintColor", () => {
  const palette = coverPalette(SITE_STYLES.atelier, null);

  it("resolves a role from the palette", () => {
    expect(paintColor("accent", palette)).toBe(palette.accent);
    expect(paintColor("inverse-ink", palette)).toBe(palette["inverse-ink"]);
  });

  it("passes a hex through unchanged, case kept", () => {
    expect(paintColor("#1E5AA8", palette)).toBe("#1E5AA8");
    expect(paintColor("#ffffff", palette)).toBe("#ffffff");
  });

  it("falls back to primary for an unknown role", () => {
    expect(paintColor("nonsense" as Paint, palette)).toBe(palette.primary);
    expect(paintColor("toString" as Paint, palette)).toBe(palette.primary);
    expect(paintColor("#12" as Paint, palette)).toBe(palette.primary);
  });
});

describe("readableOn", () => {
  const light = coverPalette(SITE_STYLES.atelier, null);

  it("gives the look's ink on a light paint and white on a dark one", () => {
    expect(readableOn("white", light)).toBe(light.ink);
    expect(readableOn("paper", light)).toBe(light.ink);
    expect(readableOn("black", light)).toBe("#fff");
    expect(readableOn("ink", light)).toBe("#fff");
  });

  it("reads the lightness of a hex paint", () => {
    expect(readableOn("#ffffff", light)).toBe(light.ink);
    expect(readableOn("#f2e8a0", light)).toBe(light.ink);
    expect(readableOn("#1E5AA8", light)).toBe("#fff");
    expect(readableOn("#000000", light)).toBe("#fff");
  });

  it("switches at an oklch lightness of 0.62", () => {
    expect(
      readableOn(
        "primary",
        coverPalette(withPrimary("oklch(0.63 0.1 200)"), null),
      ),
    ).not.toBe("#fff");
    expect(
      readableOn(
        "primary",
        coverPalette(withPrimary("oklch(0.61 0.1 200)"), null),
      ),
    ).toBe("#fff");
  });

  it("agrees with oklchToHex, so a hex paint and its oklch twin read the same", () => {
    for (const l of [0.3, 0.5, 0.6, 0.7, 0.9]) {
      const twin = `oklch(${l} 0.08 250)`;
      const hex = oklchToHex(twin)!;
      const style = withPrimary(twin);
      const palette = coverPalette(style, null);
      expect(readableOn(hex as Paint, palette), `L ${l}`).toBe(
        readableOn("primary", palette),
      );
    }
  });

  it("stays readable on a dark look: its dark colour on a light paint, not its light ink", () => {
    const dark = SITE_STYLES.nocturne;
    const palette = coverPalette(dark, null);
    expect(lightness(palette.ink)).toBeGreaterThan(lightness(palette.paper));
    // A light paint on a dark look would otherwise get light text on light.
    expect(readableOn("white", palette)).toBe(palette.paper);
    expect(readableOn("black", palette)).toBe("#fff");
  });

  it("has 3:1 contrast on every look's brand and ground colours", () => {
    for (const style of LOOKS) {
      for (const paletteId of palettesOf(style)) {
        const palette = coverPalette(style, paletteId);
        for (const role of [
          "primary",
          "accent",
          "inverse",
          "surface",
          "paper",
          "ink",
        ] as const) {
          const text = readableOn(role, palette);
          const ratio = contrastRatio(asOklch(text), palette[role]);
          expect(
            ratio,
            `${style.id}:${paletteId} ${role}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
