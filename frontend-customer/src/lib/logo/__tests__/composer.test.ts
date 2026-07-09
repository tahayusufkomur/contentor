import { describe, expect, it } from "vitest";
import { ABSTRACT_FAMILIES } from "@/lib/logo/abstract";
import { LOGO_FONTS, LOGO_ICONS, PALETTES } from "@/lib/logo/catalog";
import {
  STYLE_CHIPS,
  composeFromPack,
  composeWall,
  moreLikeThis,
  type Brief,
  type BrandPack,
} from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";

const BRIEF: Brief = {
  brandName: "Zeynep Yoga",
  niche: "yoga for busy mothers",
  styleChips: [],
};

const PALETTE_IDS = new Set(PALETTES("#1a56db").map((p) => p.id));
const FONT_FAMILIES = new Set(LOGO_FONTS.map((f) => f.family));
const LAYOUTS = new Set([
  "horizontal",
  "horizontal_reversed",
  "stacked",
  "name_only",
  "emblem",
]);

function markKey(r: LogoRecipe): string {
  if (r.mark.type === "icon") return `icon:${r.mark.icon}`;
  if (r.mark.type === "abstract") return `abstract:${r.mark.family}`;
  if (r.mark.type === "initials") return `initials:${r.mark.style}`;
  return "image";
}

/** Every composed recipe must survive backend validate_recipe: catalog enums only. */
function assertStructurallyValid(r: LogoRecipe) {
  expect(r.version).toBe(2);
  expect(LAYOUTS.has(r.layout)).toBe(true);
  expect(r.name).toBe("Zeynep Yoga");
  if (r.mark.type === "icon") expect(LOGO_ICONS[r.mark.icon]).toBeTruthy();
  if (r.mark.type === "abstract")
    expect(ABSTRACT_FAMILIES).toContain(r.mark.family);
  expect(r.colors.palette_id && PALETTE_IDS.has(r.colors.palette_id)).toBe(
    true,
  );
  expect(FONT_FAMILIES.has(r.typography.name.font)).toBe(true);
  expect([400, 500, 600, 700, 800]).toContain(r.typography.name.weight);
  expect(r.elements.mark).toEqual({ offset: [0, 0], scale: 1 });
}

describe("composeWall", () => {
  it("is deterministic and seed-sensitive", () => {
    expect(composeWall(BRIEF, 7)).toEqual(composeWall(BRIEF, 7));
    expect(JSON.stringify(composeWall(BRIEF, 7))).not.toEqual(
      JSON.stringify(composeWall(BRIEF, 8)),
    );
  });

  it("returns 24 structurally valid recipes", () => {
    const wall = composeWall(BRIEF, 42);
    expect(wall).toHaveLength(24);
    for (const r of wall) assertStructurallyValid(r);
  });

  it("enforces diversity", () => {
    const wall = composeWall(BRIEF, 42);
    const triples = wall.map(
      (r) => `${markKey(r)}|${r.colors.palette_id}|${r.typography.name.font}`,
    );
    expect(new Set(triples).size).toBe(triples.length);
    expect(new Set(wall.map((r) => r.mark.type)).size).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      new Set(wall.map((r) => r.colors.palette_id)).size,
    ).toBeGreaterThanOrEqual(8);
  });

  it("biases fonts and badges when Elegant is chosen", () => {
    const wall = composeWall({ ...BRIEF, styleChips: ["Elegant"] }, 5);
    const elegantOrModern = new Set(
      LOGO_FONTS.filter((f) => f.vibe === "Elegant" || f.vibe === "Modern").map(
        (f) => f.family,
      ),
    );
    for (const r of wall) {
      expect(elegantOrModern.has(r.typography.name.font)).toBe(true);
      // Elegant never uses loud filled geometric badges
      if (["hexagon", "diamond"].includes(r.badge.shape)) {
        expect(r.badge.outline).toBe(true);
      }
    }
  });

  it("biases palettes when Tech is chosen", () => {
    const wall = composeWall({ ...BRIEF, styleChips: ["Tech"] }, 5);
    const techPalettes = new Set([
      "ocean-fade",
      "midnight-fade",
      "ink",
      "sky",
      "slate",
      "mono",
      "theme",
    ]);
    for (const r of wall)
      expect(techPalettes.has(r.colors.palette_id!)).toBe(true);
  });

  it("biases icons toward the niche", () => {
    const wall = composeWall(BRIEF, 3); // niche mentions yoga
    const yogaIcons = new Set(["flower-2", "leaf", "sun", "sparkles"]);
    const iconRecipes = wall.filter((r) => r.mark.type === "icon");
    expect(iconRecipes.length).toBeGreaterThan(0);
    for (const r of iconRecipes) {
      if (r.mark.type === "icon") expect(yogaIcons.has(r.mark.icon)).toBe(true);
    }
  });

  it("exposes exactly six style chips", () => {
    expect(STYLE_CHIPS).toEqual([
      "Minimal",
      "Bold",
      "Elegant",
      "Playful",
      "Organic",
      "Tech",
    ]);
  });
});

describe("moreLikeThis", () => {
  it("locks mark family and palette, varies the rest, deterministically", () => {
    const base = composeWall(BRIEF, 42)[0]!;
    const variants = moreLikeThis(base, BRIEF, 9);
    expect(variants).toHaveLength(8);
    expect(variants).toEqual(moreLikeThis(base, BRIEF, 9));
    for (const v of variants) {
      expect(v.colors.palette_id).toBe(base.colors.palette_id);
      expect(v.mark.type).toBe(base.mark.type);
      if (base.mark.type === "icon" && v.mark.type === "icon")
        expect(v.mark.icon).toBe(base.mark.icon);
      if (base.mark.type === "abstract" && v.mark.type === "abstract")
        expect(v.mark.family).toBe(base.mark.family);
      assertStructurallyValid(v);
    }
    // the batch itself varies
    expect(
      new Set(
        variants.map(
          (v) => `${v.layout}|${v.typography.name.font}|${v.badge.shape}`,
        ),
      ).size,
    ).toBeGreaterThan(1);
  });
});

describe("composeFromPack", () => {
  const PACK: BrandPack = {
    marks: [
      {
        rationale: "A rising line evokes progress.",
        paths: [{ d: "M10 10 L90 90 Z", fill: "mark2" }],
      },
      {
        rationale: "A closed loop for community.",
        paths: [{ d: "M0 0 H100 V100 Z", fill_rule: "evenodd" }],
      },
    ],
    palettes: [
      {
        name: "Sunrise",
        primary: "#e11d48",
        secondary: "#f97316",
        accent: "#fbbf24",
        ink: "#111827",
      },
      {
        name: "Ocean",
        primary: "#0ea5e9",
        secondary: "#1d4ed8",
        accent: "#38bdf8",
        ink: "#0c4a6e",
      },
    ],
    tagline: "Breathe. Move. Grow.",
    font_vibe: "Elegant",
  };

  it("produces marks × palettes recipes, all carrying a custom mark", () => {
    const recipes = composeFromPack(PACK, BRIEF, 11);
    expect(recipes).toHaveLength(4); // 2 marks * 2 palettes
    for (const r of recipes) {
      expect(r.version).toBe(2);
      expect(r.mark.type).toBe("custom");
      expect(r.tagline).toBe(PACK.tagline);
      expect(LAYOUTS.has(r.layout)).toBe(true);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(composeFromPack(PACK, BRIEF, 11)).toEqual(
      composeFromPack(PACK, BRIEF, 11),
    );
  });

  it("varies layout/badge/font across the batch", () => {
    const recipes = composeFromPack(PACK, BRIEF, 3);
    const keys = new Set(
      recipes.map(
        (r) => `${r.layout}|${r.badge.shape}|${r.typography.name.font}`,
      ),
    );
    expect(keys.size).toBeGreaterThan(1);
  });

  it("colors each recipe from its own pack palette, not the catalog palettes", () => {
    const recipes = composeFromPack(PACK, BRIEF, 5);
    for (const r of recipes) {
      const palette = PACK.palettes.find(
        (p) =>
          r.colors.badge.type === "solid" && r.colors.badge.color === p.primary,
      );
      expect(palette).toBeTruthy();
      expect(r.colors.mark2).toBe(palette!.secondary);
      expect(r.colors.mark_accent).toBe(palette!.accent);
      expect(r.colors.mark).toBe(palette!.ink);
    }
  });

  it("restricts fonts to the pack's font_vibe", () => {
    const recipes = composeFromPack(PACK, BRIEF, 9);
    const elegant = new Set(
      LOGO_FONTS.filter((f) => f.vibe === "Elegant").map((f) => f.family),
    );
    for (const r of recipes)
      expect(elegant.has(r.typography.name.font)).toBe(true);
  });

  it("carries the mark's rationale and role-token paths through untouched", () => {
    const recipes = composeFromPack(PACK, BRIEF, 1);
    const first = recipes.find(
      (r) =>
        r.mark.type === "custom" &&
        r.mark.rationale === PACK.marks[0]!.rationale,
    );
    expect(first).toBeTruthy();
    if (first!.mark.type === "custom") {
      expect(first!.mark.paths).toEqual([
        {
          d: "M10 10 L90 90 Z",
          fill: "mark2",
          fill_rule: undefined,
          opacity: undefined,
        },
      ]);
    }
    const second = recipes.find(
      (r) =>
        r.mark.type === "custom" &&
        r.mark.rationale === PACK.marks[1]!.rationale,
    );
    if (second!.mark.type === "custom") {
      expect(second!.mark.paths[0]!.fill_rule).toBe("evenodd");
    }
  });
});
