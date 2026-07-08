import { describe, expect, it } from "vitest";
import { isRecipe, migrateRecipe } from "@/lib/logo/migrate";
import type { LogoRecipe, LogoRecipeV1 } from "@/types/logo";

// KEEP IN SYNC: backend/apps/tenant_config/tests/test_logo_recipe.py uses
// this exact fixture pair to guarantee TS/Python migration parity.
const V1: LogoRecipeV1 = {
  version: 1,
  layout: "badge_name",
  name: "Zeynep Yoga",
  mark: { type: "icon", icon: "flower-2" },
  badge: "circle",
  font: "Playfair Display",
  colors: { badge_bg: "#7c3aed", mark_fg: "#ffffff", text: "#111827" },
  overrides: {
    mark_offset: [4, -2],
    mark_scale: 1.2,
    name_offset: [0, 0],
    name_scale: 0.9,
  },
};

const V2: LogoRecipe = {
  version: 2,
  layout: "horizontal",
  name: "Zeynep Yoga",
  tagline: "",
  mark: { type: "icon", icon: "flower-2", style: "outline" },
  badge: { shape: "circle", outline: false },
  typography: {
    name: { font: "Playfair Display", weight: 700, tracking: 0, case: "none" },
    tagline: {
      font: "Playfair Display",
      weight: 500,
      tracking: 0.08,
      case: "upper",
    },
  },
  colors: {
    palette_id: null,
    badge: { type: "solid", color: "#7c3aed" },
    mark: "#ffffff",
    text: "#111827",
    tagline: "#6b7280",
  },
  elements: {
    mark: { offset: [4, -2], scale: 1.2 },
    name: { offset: [0, 0], scale: 0.9 },
    tagline: { offset: [0, 0], scale: 1 },
  },
};

describe("migrateRecipe", () => {
  it("upgrades the parity fixture exactly", () => {
    expect(migrateRecipe(V1)).toEqual(V2);
  });

  it("passes v2 recipes through untouched", () => {
    expect(migrateRecipe(V2)).toBe(V2);
  });

  it("maps icon_name to horizontal keeping the badge, initials to plain style", () => {
    const out = migrateRecipe({
      ...V1,
      layout: "icon_name",
      badge: "none",
      mark: { type: "initials" },
    });
    expect(out.layout).toBe("horizontal");
    expect(out.badge).toEqual({ shape: "none", outline: false });
    expect(out.mark).toEqual({ type: "initials", style: "plain" });
  });

  it("maps name_only to name_only and image marks unchanged", () => {
    const out = migrateRecipe({
      ...V1,
      layout: "name_only",
      mark: { type: "image", photo_id: "abc", url: "data:x" },
    });
    expect(out.layout).toBe("name_only");
    expect(out.mark).toEqual({ type: "image", photo_id: "abc", url: "data:x" });
  });
});

describe("isRecipe", () => {
  it("accepts v1 and v2, rejects junk", () => {
    expect(isRecipe(V1)).toBe(true);
    expect(isRecipe(V2)).toBe(true);
    expect(isRecipe(null)).toBe(false);
    expect(isRecipe({})).toBe(false);
    expect(isRecipe({ version: 3 })).toBe(false);
  });
});
