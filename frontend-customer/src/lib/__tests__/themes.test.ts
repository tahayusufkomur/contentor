import { describe, expect, it } from "vitest";

import { deriveDim, generateThemeCSS, THEME_MAP } from "@/lib/themes";

describe("deriveDim", () => {
  it("lifts surface lightness by 0.06, preserving chroma and hue", () => {
    // ocean dark: background oklch(0.16 0.015 240), card oklch(0.2 0.015 240)
    const dim = deriveDim(THEME_MAP.ocean.dark);
    expect(dim.background).toBe("oklch(0.22 0.015 240)");
    expect(dim.card).toBe("oklch(0.26 0.015 240)");
    expect(dim.border).toBe("oklch(0.34 0.015 240)");
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
