import { describe, expect, it } from "vitest";
import { ABSTRACT_FAMILIES } from "@/lib/logo/abstract";
import {
  LOGO_FONTS,
  LOGO_ICONS,
  PALETTES,
  defaultRecipe,
  fontEntry,
} from "@/lib/logo/catalog";
import {
  STYLE_CHIPS,
  applyRefinedDesign,
  composeConverseDesign,
  composeDesigns,
  composeFromPack,
  composeIconPreview,
  composePackWall,
  composeWall,
  moreLikeThis,
  packElementsByIndex,
  type Brief,
  type BrandPack,
  type BrandPackDesign,
  type ConverseDesign,
  type RefinedDesign,
} from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";

const BRIEF: Brief = {
  brandName: "Zeynep Yoga",
  niche: "yoga for busy mothers",
  styleChips: [],
};

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

const DESIGN: BrandPackDesign = {
  concept: "A rising line through a circle",
  rationale: "Feels like progress.",
  paths: [{ d: "M10 10L90 90Z", fill: "mark" }],
  elements: [{ type: "circle", cx: 50, cy: 50, r: 30 }],
  layout: "stacked",
  badge_shape: "circle",
  badge_outline: true,
  font: "Sora",
  typography: { case: "upper", tracking: 0.12, weight: 600 },
  palette_index: 1,
  color_roles: {
    badge: "ink",
    mark: "white",
    mark2: "secondary",
    mark_accent: "accent",
    text: "ink",
    tagline: "primary",
  },
};
const PACK_V3: BrandPack = {
  designs: [DESIGN],
  palettes: [
    {
      name: "Calm",
      primary: "#336699",
      secondary: "#88aacc",
      accent: "#ee7755",
      ink: "#112233",
    },
    {
      name: "Vivid",
      primary: "#0055ff",
      secondary: "#66ccff",
      accent: "#ffaa00",
      ink: "#001122",
    },
  ],
  tagline: "Move daily",
  font_vibe: "Minimal",
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
  expect(r.version).toBe(3);
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

  it("never pairs a variant's name or tagline with a weight its font doesn't ship", () => {
    // A "More like this" base can be an AI wall tile (composeDesigns output),
    // which — unlike composeWall — can carry a Script-vibe font. Simulate one
    // directly: moreLikeThis only reads base.typography.name.font to pick its
    // font pool, so overriding it on a composeWall base is a faithful stand-in.
    //
    // The base font must be "Dancing Script" (weights [400,500,600,700]) with
    // weight 500, NOT "Great Vibes" (weights [400] only): 400 is valid for
    // every font in the catalog, so a base tagline weight of 400 would pass
    // even with the bug (carrying a stale-but-still-valid weight forward).
    // 500 is valid for Dancing Script/Caveat but NOT Great Vibes/Pacifico —
    // only that mismatch actually exercises the re-snap-on-reroll fix.
    const scriptBase: LogoRecipe = {
      ...composeWall(BRIEF, 42)[0]!,
      typography: {
        name: {
          font: "Dancing Script",
          weight: 500,
          tracking: 0,
          case: "none",
        },
        tagline: {
          font: "Dancing Script",
          weight: 500,
          tracking: 0.08,
          case: "upper",
        },
      },
    };
    for (let seed = 1; seed <= 10; seed++) {
      for (const v of moreLikeThis(scriptBase, BRIEF, seed)) {
        const nameEntry = fontEntry(v.typography.name.font);
        const taglineEntry = fontEntry(v.typography.tagline.font);
        expect(nameEntry.weights).toContain(v.typography.name.weight);
        expect(taglineEntry.weights).toContain(v.typography.tagline.weight);
      }
    }
  });
});

describe("composeFromPack", () => {
  it("produces marks × palettes recipes, all carrying a custom mark", () => {
    const recipes = composeFromPack(PACK, BRIEF, 11);
    expect(recipes).toHaveLength(4); // 2 marks * 2 palettes
    for (const r of recipes) {
      expect(r.version).toBe(3);
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

  it("never requests a tagline weight the dice-rolled font doesn't ship (Script vibe)", () => {
    // Great Vibes/Pacifico (Script vibe) only ship weight 400 — sweep several
    // seeds so the dice roll actually lands on a single-weight family.
    const scriptPack: BrandPack = { ...PACK, font_vibe: "Script" };
    for (let seed = 1; seed <= 20; seed++) {
      for (const r of composeFromPack(scriptPack, BRIEF, seed)) {
        const entry = fontEntry(r.typography.name.font);
        expect(entry.weights).toContain(r.typography.tagline.weight);
      }
    }
  });

  it("carries the mark's rationale and role-token paths through untouched", () => {
    const recipes = composeFromPack(PACK, BRIEF, 1);
    const first = recipes.find(
      (r) =>
        r.mark.type === "custom" &&
        r.mark.rationale === PACK.marks?.[0]!.rationale,
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
        r.mark.rationale === PACK.marks?.[1]!.rationale,
    );
    if (second!.mark.type === "custom") {
      expect(second!.mark.paths[0]!.fill_rule).toBe("evenodd");
    }
  });
});

describe("packElementsByIndex", () => {
  it("aligns each recipe's index to its source mark's elements", () => {
    const pack: BrandPack = {
      marks: [
        { rationale: "a", paths: [], elements: [{ type: "circle" }] },
        { rationale: "b", paths: [] },
      ],
      palettes: [
        {
          name: "p1",
          primary: "#111827",
          secondary: "#111827",
          accent: "#111827",
          ink: "#111827",
        },
        {
          name: "p2",
          primary: "#111827",
          secondary: "#111827",
          accent: "#111827",
          ink: "#111827",
        },
      ],
      tagline: "",
      font_vibe: "Minimal",
    };
    const byIndex = packElementsByIndex(pack);
    const recipes = composeFromPack(
      pack,
      { brandName: "X", niche: "", styleChips: [] },
      1,
    );
    expect(recipes).toHaveLength(4);
    expect(byIndex).toEqual([
      [{ type: "circle" }],
      [{ type: "circle" }],
      undefined,
      undefined,
    ]);
  });
});

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

describe("composeDesigns", () => {
  it("materializes the AI's lockup faithfully — no dice", () => {
    const [recipe] = composeDesigns(PACK_V3, BRIEF);
    expect(recipe!.layout).toBe("stacked");
    expect(recipe!.badge).toEqual({ shape: "circle", outline: true });
    expect(recipe!.typography.name).toMatchObject({
      font: "Sora",
      weight: 600,
      tracking: 0.12,
      case: "upper",
    });
    expect(recipe!.colors.badge).toEqual({ type: "solid", color: "#001122" }); // ink of palette 1
    expect(recipe!.colors.mark).toBe("#ffffff"); // white role
    expect(recipe!.colors.tagline).toBe("#0055ff"); // primary of palette 1
    expect(recipe!.mark).toMatchObject({
      type: "custom",
      rationale: "Feels like progress.",
    });
    expect(recipe!.tagline).toBe("Move daily");
  });

  it("falls back to the pack vibe pool on unknown fonts and clamps palette_index", () => {
    const [recipe] = composeDesigns(
      {
        ...PACK_V3,
        designs: [{ ...DESIGN, font: "Comic Sans", palette_index: 9 }],
      },
      BRIEF,
    );
    expect(recipe!.typography.name.font).toBe("Work Sans"); // first Minimal family
    expect(recipe!.colors.tagline).toBe("#0055ff"); // clamped to last palette
  });

  it("guards a white mark when there is no badge behind it", () => {
    const [recipe] = composeDesigns(
      { ...PACK_V3, designs: [{ ...DESIGN, badge_shape: "none" }] },
      BRIEF,
    );
    expect(recipe!.colors.mark).toBe("#001122"); // ink instead of invisible white
  });

  it("snaps unavailable weights to the family's heaviest", () => {
    const [recipe] = composeDesigns(
      {
        ...PACK_V3,
        designs: [
          {
            ...DESIGN,
            font: "Great Vibes",
            typography: { ...DESIGN.typography, weight: 700 },
          },
        ],
      },
      BRIEF,
    );
    expect(recipe!.typography.name.weight).toBe(400);
  });

  it("snaps the tagline weight too, for single-weight families", () => {
    // Great Vibes only ships weight 400 — the tagline's default preferred
    // weight (500) doesn't exist for it and must not be requested verbatim,
    // or the browser 404s fetching a nonexistent Google Fonts variant.
    const [recipe] = composeDesigns(
      { ...PACK_V3, designs: [{ ...DESIGN, font: "Great Vibes" }] },
      BRIEF,
    );
    expect(recipe!.typography.tagline.weight).toBe(400);
  });
});

describe("composePackWall", () => {
  it("routes v3 packs to composeDesigns and legacy packs to composeFromPack", () => {
    expect(composePackWall(PACK_V3, BRIEF, 5)).toHaveLength(1);
    expect(composePackWall(PACK, BRIEF, 5)).toHaveLength(
      (PACK.marks?.length ?? 0) * PACK.palettes.length,
    );
  });
});

describe("packElementsByIndex v3", () => {
  it("is one-to-one with designs", () => {
    expect(packElementsByIndex(PACK_V3)).toEqual([DESIGN.elements]);
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

describe("applyRefinedDesign lockup", () => {
  it("applies badge, font, typography and color roles", () => {
    const refined: RefinedDesign = {
      mark: { rationale: "r", paths: [{ d: "M1 1L2 2Z" }] },
      palette: PACK_V3.palettes[0]!,
      font_vibe: "Script",
      layout: "emblem",
      badge_shape: "squircle",
      badge_outline: false,
      font: "Caveat",
      typography: { case: "title", tracking: 0, weight: 500 },
      color_roles: DESIGN.color_roles,
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
      palette: PACK_V3.palettes[0]!,
      font_vibe: "Script",
      layout: "emblem",
      badge_shape: "none",
      badge_outline: false,
      font: "Great Vibes",
      typography: { case: "none", tracking: 0, weight: 400 },
      color_roles: DESIGN.color_roles,
      rationale: "warmer",
    };
    const next = applyRefinedDesign(
      defaultRecipe("Zeynep Yoga", "#1a56db"),
      refined,
    );
    expect(next.typography.tagline.weight).toBe(400);
  });
});
