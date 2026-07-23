import { describe, expect, it } from "vitest";

import { deriveDim, generateThemeCSS, THEME_MAP } from "@/lib/themes";

// ─── WCAG contrast helpers ──────────────────────────────────────────────────
// OKLCH → linear sRGB (Björn Ottosson) → relative luminance → WCAG 2.1 ratio.
// Sanity-anchored: white oklch(1 0 0) on black oklch(0 0 0) === 21.
function oklchToLinearSrgb(
  L: number,
  C: number,
  h: number,
): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function relLuminance(oklch: string): number {
  const m = oklch.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s*\)$/);
  if (!m) throw new Error(`unparseable oklch: ${oklch}`);
  const [r, g, b] = oklchToLinearSrgb(+m[1], +m[2], +m[3]).map((v) =>
    Math.max(0, Math.min(1, v)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string): number {
  const lf = relLuminance(fg);
  const lb = relLuminance(bg);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

// Foreground/background token pairs that render together in the UI, with the
// WCAG minimum each must meet: 4.5 for normal text, 3.0 for UI component
// boundaries (borders/inputs, WCAG 1.4.11) and icon-sized accents.
const CONTRAST_PAIRS: Array<[fg: string, bg: string, min: number]> = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "card", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["border", "background", 3.0],
  ["border", "card", 3.0],
  ["input", "background", 3.0],
];
const MODES = ["light", "dark", "dim"] as const;

describe("deriveDim", () => {
  it("lifts surface lightness by 0.06, preserving chroma and hue", () => {
    // ocean dark: background oklch(0.16 0.015 240), card oklch(0.2 0.015 240),
    // border oklch(0.505 0.015 240) → dim lifts each surface +0.06.
    const dim = deriveDim(THEME_MAP.ocean.dark);
    expect(dim.background).toBe("oklch(0.22 0.015 240)");
    expect(dim.card).toBe("oklch(0.26 0.015 240)");
    expect(dim.border).toBe("oklch(0.565 0.015 240)");
    expect(dim["brand-surface"]).toBe("oklch(0.28 0.015 240)");
  });

  it("keeps non-surface tokens identical to dark", () => {
    const dark = THEME_MAP.ocean.dark;
    const dim = deriveDim(dark);
    expect(dim.foreground).toBe(dark.foreground);
    expect(dim.primary).toBe(dark.primary);
    expect(dim["primary-foreground"]).toBe(dark["primary-foreground"]);
    expect(dim["chart-1"]).toBe(dark["chart-1"]);
  });
});

describe("theme contrast (WCAG)", () => {
  it("sanity: contrast helper anchors white-on-black at 21", () => {
    expect(contrast("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 1);
  });

  for (const theme of Object.values(THEME_MAP)) {
    const palettes = {
      light: theme.light,
      dark: theme.dark,
      dim: deriveDim(theme.dark),
    };
    for (const mode of MODES) {
      const map = palettes[mode];
      for (const [fg, bg, min] of CONTRAST_PAIRS) {
        if (!(fg in map) || !(bg in map)) continue;
        it(`${theme.id} ${mode}: ${fg} on ${bg} ≥ ${min}:1`, () => {
          const ratio = contrast(map[fg], map[bg]);
          expect(
            ratio,
            `${theme.id}/${mode} ${fg} on ${bg} = ${ratio.toFixed(2)} (need ${min})`,
          ).toBeGreaterThanOrEqual(min);
        });
      }
    }
  }
});

describe("generateThemeCSS", () => {
  it("emits a .dim block with lifted surfaces and the dark cinematic", () => {
    const css = generateThemeCSS("ocean");
    expect(css).toContain(".dim {");
    const dimBlock = css.slice(css.indexOf(".dim {"));
    expect(dimBlock).toContain("--background: oklch(0.22 0.015 240)");
    expect(dimBlock).toContain(
      `--cinematic-bg: ${THEME_MAP.ocean.cinematic.dark}`,
    );
  });
});
