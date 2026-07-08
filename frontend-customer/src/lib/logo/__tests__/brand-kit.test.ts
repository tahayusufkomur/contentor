import { describe, expect, it } from "vitest";
import { darkVariant, fontsourceUrl, luminance } from "@/lib/logo/brand-kit";
import { defaultRecipe } from "@/lib/logo/catalog";

describe("luminance", () => {
  it("orders black < mid < white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBe(1);
    expect(luminance("#111827")).toBeLessThan(0.4);
    expect(luminance("#f59e0b")).toBeGreaterThan(0.4); // amber stays on dark
  });
});

describe("darkVariant", () => {
  it("lightens dark text/tagline, keeps light ones", () => {
    const base = defaultRecipe("Zeynep Yoga", "#1a56db"); // text #111827 (dark)
    const dark = darkVariant(base);
    expect(dark.colors.text).toBe("#ffffff");
    expect(dark.colors.tagline).toBe("#cbd5e1");
    // badge is filled circle -> its fill stays (it's its own background)
    expect(dark.colors.badge).toEqual(base.colors.badge);

    const lightText = {
      ...base,
      colors: { ...base.colors, text: "#f9fafb", tagline: "#e5e7eb" },
    };
    const kept = darkVariant(lightText);
    expect(kept.colors.text).toBe("#f9fafb");
    expect(kept.colors.tagline).toBe("#e5e7eb");
  });

  it("lightens a dark solid fill when it paints the mark (badge none/outline)", () => {
    const base = defaultRecipe("Z", "#111827");
    const noBadge = {
      ...base,
      badge: { shape: "none" as const, outline: false },
    };
    expect(darkVariant(noBadge).colors.badge).toEqual({
      type: "solid",
      color: "#e5e7eb",
    });
    const outlined = {
      ...base,
      badge: { shape: "circle" as const, outline: true },
    };
    expect(darkVariant(outlined).colors.badge).toEqual({
      type: "solid",
      color: "#e5e7eb",
    });
  });
});

describe("fontsourceUrl", () => {
  it("slugs families and inlines the weight", () => {
    expect(fontsourceUrl("Playfair Display", 700)).toBe(
      "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf",
    );
    expect(fontsourceUrl("Baloo 2", 500)).toBe(
      "https://cdn.jsdelivr.net/fontsource/fonts/baloo-2@latest/latin-500-normal.ttf",
    );
  });
});
