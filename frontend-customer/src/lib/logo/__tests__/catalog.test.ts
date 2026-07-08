import { describe, expect, it } from "vitest";
import {
  LOGO_FONTS,
  LOGO_FONT_FAMILIES,
  PALETTES,
  defaultRecipe,
  fontEntry,
} from "@/lib/logo/catalog";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("font catalog", () => {
  it("has 20 fonts across 5 vibes with legal weights", () => {
    expect(LOGO_FONTS).toHaveLength(20);
    expect(new Set(LOGO_FONTS.map((f) => f.vibe)).size).toBe(5);
    for (const f of LOGO_FONTS) {
      expect(f.weights.length).toBeGreaterThanOrEqual(4);
      for (const w of f.weights) expect([400, 500, 600, 700, 800]).toContain(w);
    }
    expect(new Set(LOGO_FONT_FAMILIES).size).toBe(20);
  });

  it("fontEntry falls back to Inter for unknown families", () => {
    expect(fontEntry("Nope").family).toBe("Inter");
    expect(fontEntry("Lora").family).toBe("Lora");
  });
});

describe("palettes", () => {
  it("has 24 unique palettes, theme first, valid colors", () => {
    const palettes = PALETTES("#1a56db");
    expect(palettes).toHaveLength(24);
    expect(palettes[0].id).toBe("theme");
    expect(new Set(palettes.map((p) => p.id)).size).toBe(24);
    for (const p of palettes) {
      expect(p.mark).toMatch(HEX);
      expect(p.text).toMatch(HEX);
      expect(p.tagline).toMatch(HEX);
      if (p.badge.type === "solid") expect(p.badge.color).toMatch(HEX);
      else {
        expect(p.badge.from).toMatch(HEX);
        expect(p.badge.to).toMatch(HEX);
      }
    }
  });
});

describe("defaultRecipe", () => {
  it("returns a v2 recipe seeded from the brand", () => {
    const r = defaultRecipe("Zeynep Yoga", "#1a56db");
    expect(r.version).toBe(2);
    expect(r.layout).toBe("horizontal");
    expect(r.colors.badge).toEqual({ type: "solid", color: "#1a56db" });
    expect(r.typography.name.weight).toBe(700);
    expect(r.elements.tagline).toEqual({ offset: [0, 0], scale: 1 });
  });
});
