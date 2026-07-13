import { describe, expect, it } from "vitest";
import { LOGO_FONTS, defaultRecipe } from "@/lib/logo/catalog";
import { composeCuratedPreview } from "@/lib/logo/curated-preview";
import type { CuratedLogo } from "@/lib/logo/library-catalog";

const BASE = defaultRecipe("Base Brand", "#1a56db");

const TRACED: CuratedLogo = {
  title: "Lotus",
  filename: "lotus.png",
  prompt: "a lotus logo",
  tags: ["yoga", "elegant"],
  imageUrl: "http://storage.local/lotus.png",
  markPaths: [{ d: "M0 0 L10 10 Z", fill: "mark" }],
};

const UNTRACED: CuratedLogo = {
  title: "Splash",
  filename: "splash.png",
  prompt: "a colorful splash",
  tags: ["colorful", "playful"],
  imageUrl: "http://storage.local/splash.png",
};

const OPTS = {
  brandName: "Zeynep Yoga",
  tagline: "Breathe daily",
  base: BASE,
  primaryHex: "#1a56db",
  index: 0,
};

describe("composeCuratedPreview", () => {
  it("is deterministic for the same inputs", () => {
    const a = composeCuratedPreview(TRACED, OPTS);
    const b = composeCuratedPreview(TRACED, OPTS);
    expect(a).toEqual(b);
  });

  it("varies adjacent cards (same logo, different index)", () => {
    const a = composeCuratedPreview(TRACED, OPTS);
    const b = composeCuratedPreview(TRACED, { ...OPTS, index: 1 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("biases the font toward the logo's tags (elegant -> Elegant/Script vibes)", () => {
    const recipe = composeCuratedPreview(TRACED, OPTS);
    const entry = LOGO_FONTS.find(
      (f) => f.family === recipe.typography.name.font,
    );
    expect(["Elegant", "Script"]).toContain(entry?.vibe);
  });

  it("builds a complete logo from a traced mark: custom paths + name + tagline", () => {
    const recipe = composeCuratedPreview(TRACED, OPTS);
    expect(recipe.mark).toEqual({
      type: "custom",
      rationale: "Lotus",
      paths: TRACED.markPaths,
    });
    expect(recipe.name).toBe("Zeynep Yoga");
    expect(recipe.tagline).toBe("Breathe daily");
    expect(recipe.version).toBe(3);
  });

  it("falls back to a badge-less image mark for untraced logos", () => {
    const recipe = composeCuratedPreview(UNTRACED, OPTS);
    expect(recipe.mark).toEqual({
      type: "image",
      photo_id: "",
      url: UNTRACED.imageUrl,
    });
    expect(recipe.badge.shape).toBe("none");
  });

  it("never paints a badge-less mark white (visibility on the white card)", () => {
    // Sweep indexes so every profile/palette rotation is exercised.
    for (let index = 0; index < 12; index++) {
      const recipe = composeCuratedPreview(TRACED, { ...OPTS, index });
      if (recipe.badge.shape === "none") {
        expect(recipe.colors.mark).not.toBe("#ffffff");
      }
    }
  });

  it("falls back to the base recipe's name when brandName is empty", () => {
    const recipe = composeCuratedPreview(TRACED, { ...OPTS, brandName: "" });
    expect(recipe.name).toBe("Base Brand");
  });
});
