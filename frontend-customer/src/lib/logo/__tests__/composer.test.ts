import { describe, expect, it } from "vitest";
import { defaultRecipe } from "@/lib/logo/catalog";
import { LOGO_FONTS } from "@/lib/logo/catalog";
import {
  applyRefinedDesign,
  composeConverseDesign,
  composeIconPreview,
  type BrandPackColorRoles,
  type BrandPackPalette,
  type ConverseDesign,
  type RefinedDesign,
} from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";

describe("applyRefinedDesign", () => {
  it("reshapes the mark, palette, layout, and font while keeping name/tagline", () => {
    const recipe = defaultRecipe("Zeynep Yoga", "#1a56db");
    const design: RefinedDesign = {
      mark: { rationale: "warmer", paths: [{ d: "M0 0 Z", fill: "mark" }] },
      palette: {
        name: "Warm",
        primary: "#c2410c",
        secondary: "#e11d48",
        accent: "#fbbf24",
        ink: "#111827",
      },
      font_vibe: "Bold",
      layout: "stacked",
      badge_shape: "circle",
      badge_outline: false,
      font: "Poppins",
      typography: { case: "none", tracking: 0, weight: 700 },
      color_roles: {
        badge: "primary",
        mark: "ink",
        mark2: "secondary",
        mark_accent: "accent",
        text: "ink",
        tagline: "secondary",
      },
      rationale: "Warmed the palette and gave the mark more weight.",
    };
    const next = applyRefinedDesign(recipe, design);
    expect(next.name).toBe(recipe.name);
    expect(next.tagline).toBe(recipe.tagline);
    expect(next.layout).toBe("stacked");
    expect(next.mark).toEqual({
      type: "custom",
      rationale: "warmer",
      paths: [
        { d: "M0 0 Z", fill: "mark", fill_rule: undefined, opacity: undefined },
      ],
    });
    expect(next.colors.mark).toBe("#111827");
    expect(next.colors.palette_id).toBeNull();
  });
});

const iconDesign: ConverseDesign = {
  concept: "c",
  rationale: "r",
  paths: [{ d: "M0 0 Z", fill: "mark" }],
  palette: {
    name: "P",
    primary: "#0f766e",
    secondary: "#14b8a6",
    accent: "#f59e0b",
    ink: "#111827",
  },
  color_roles: { mark: "primary", mark2: "secondary", mark_accent: "accent" },
};
const lockupDesign: ConverseDesign = {
  ...iconDesign,
  layout: "horizontal",
  badge_shape: "none",
  badge_outline: false,
  font: "Manrope",
  typography: { case: "none", tracking: 0, weight: 700 },
  color_roles: {
    badge: "primary",
    mark: "ink",
    mark2: "secondary",
    mark_accent: "accent",
    text: "ink",
    tagline: "secondary",
  },
  mark_scale: 1.4,
  mark_gradient: { to: "accent", angle: 45 },
  tagline: "Breathe.",
};

describe("composeConverseDesign", () => {
  it("maps mark_scale onto elements.mark.scale", () => {
    const recipe = composeConverseDesign(lockupDesign, "Flow");
    expect(recipe.elements.mark.scale).toBe(1.4);
  });
  it("materializes mark_gradient as a linear Fill from mark role to target role", () => {
    const recipe = composeConverseDesign(lockupDesign, "Flow");
    expect(recipe.colors.mark).toEqual({
      type: "linear",
      from: "#111827",
      to: "#f59e0b",
      angle: 45,
    });
  });
  it("keeps solid mark when no gradient", () => {
    const recipe = composeConverseDesign(
      { ...lockupDesign, mark_gradient: null },
      "Flow",
    );
    expect(recipe.colors.mark).toBe("#111827");
  });
  it("sets the design's tagline text", () => {
    expect(composeConverseDesign(lockupDesign, "Flow").tagline).toBe(
      "Breathe.",
    );
  });
});

describe("composeIconPreview", () => {
  it("builds a badge-less custom-mark recipe with role-resolved colors", () => {
    const recipe = composeIconPreview(iconDesign, "Flow");
    expect(recipe.mark.type).toBe("custom");
    expect(recipe.badge.shape).toBe("none");
    expect(recipe.colors.mark).toBe("#0f766e");
    expect(recipe.colors.mark2).toBe("#14b8a6");
  });
});

const PALETTE: BrandPackPalette = {
  name: "Calm",
  primary: "#336699",
  secondary: "#88aacc",
  accent: "#ee7755",
  ink: "#112233",
};
const ROLES: BrandPackColorRoles = {
  badge: "ink",
  mark: "white",
  mark2: "secondary",
  mark_accent: "accent",
  text: "ink",
  tagline: "primary",
};

describe("applyRefinedDesign lockup", () => {
  it("applies badge, font, typography and color roles", () => {
    const refined: RefinedDesign = {
      mark: { rationale: "r", paths: [{ d: "M1 1L2 2Z" }] },
      palette: PALETTE,
      font_vibe: "Script",
      layout: "emblem",
      badge_shape: "squircle",
      badge_outline: false,
      font: "Caveat",
      typography: { case: "title", tracking: 0, weight: 500 },
      color_roles: ROLES,
      rationale: "warmer",
    };
    const next = applyRefinedDesign(
      defaultRecipe("Zeynep Yoga", "#1a56db"),
      refined,
    );
    expect(next.layout).toBe("emblem");
    expect(next.badge).toEqual({ shape: "squircle", outline: false });
    expect(next.typography.name.font).toBe("Caveat");
    expect(next.colors.badge).toEqual({ type: "solid", color: "#112233" });
    expect(next.colors.mark).toBe("#ffffff");
  });

  it("snaps the tagline weight for single-weight families", () => {
    // Great Vibes only ships weight 400 — same bug class as composeDesigns'
    // tagline handling, reproduced live via the refine flow in the studio.
    const refined: RefinedDesign = {
      mark: { rationale: "r", paths: [{ d: "M1 1L2 2Z" }] },
      palette: PALETTE,
      font_vibe: "Script",
      layout: "emblem",
      badge_shape: "none",
      badge_outline: false,
      font: "Great Vibes",
      typography: { case: "none", tracking: 0, weight: 400 },
      color_roles: ROLES,
      rationale: "warmer",
    };
    const next = applyRefinedDesign(
      defaultRecipe("Zeynep Yoga", "#1a56db"),
      refined,
    );
    expect(next.typography.tagline.weight).toBe(400);
  });
});
