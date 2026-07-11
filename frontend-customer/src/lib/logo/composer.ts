// Deterministic wall composer — the sole idea engine of the studio. Pure:
// (brief, seed) -> 24 diverse v2 recipes, instantly, offline, zero cost.
// Style chips bias the axis pools; niche keywords pick icons + abstract
// families; a diversity constraint keeps the wall from repeating itself.
//
// AI Brand Pack (see backend/apps/tenant_config/logo_ai.py) supplies bespoke
// vector marks + brand palettes from ONE paid-tier-gated API call per brief;
// composeFromPack below multiplies that single pack into a batch of wall
// recipes using this same deterministic machinery, at zero extra cost.
//
// Every recipe emitted here must pass the backend's validate_recipe:
// enums come exclusively from the Phase-1 catalogs (AI Brand Pack marks are
// validated separately, server-side, before ever reaching this module).
import { ABSTRACT_FAMILIES, mulberry32 } from "@/lib/logo/abstract";
import {
  LOGO_FONT_FAMILIES,
  LOGO_FONTS,
  PALETTES,
  applyPalette,
  defaultRecipe,
  fontEntry,
  type FontVibe,
  type Palette,
} from "@/lib/logo/catalog";
import type {
  AbstractFamily,
  BadgeShape,
  CustomMarkPath,
  FontWeight,
  LogoMark,
  LogoRecipe,
  RecipeLayout,
  TextCase,
} from "@/types/logo";

export type StyleChip =
  | "Minimal"
  | "Bold"
  | "Elegant"
  | "Playful"
  | "Organic"
  | "Tech";

export const STYLE_CHIPS: StyleChip[] = [
  "Minimal",
  "Bold",
  "Elegant",
  "Playful",
  "Organic",
  "Tech",
];

export interface Brief {
  brandName: string;
  niche: string;
  styleChips: StyleChip[];
  /** Free-text vibe, consumed only by the AI Brand Pack endpoint — the
   * deterministic composer above never reads it. */
  vibe?: string;
}

// niche keyword -> icons that read well for it (single source of truth —
// the backend has no niche mapping anymore).
const NICHE_ICONS: Record<string, string[]> = {
  yoga: ["flower-2", "leaf", "sun", "sparkles"],
  fitness: ["dumbbell", "flame", "trophy", "activity"],
  music: ["music", "guitar", "mic", "headphones"],
  business: ["briefcase", "trending-up", "target", "rocket"],
  cooking: ["chef-hat", "utensils-crossed", "cake", "coffee"],
  food: ["chef-hat", "salad", "apple", "coffee"],
  art: ["palette", "brush", "camera", "gem"],
  education: ["book-open", "graduation-cap", "lightbulb", "brain"],
};
const DEFAULT_ICONS = ["sparkles", "star", "zap", "heart"];

const NICHE_FAMILIES: Record<string, AbstractFamily[]> = {
  yoga: ["bloom", "waves"],
  fitness: ["prism", "orbits"],
  music: ["waves", "orbits"],
  business: ["grid", "prism"],
  cooking: ["bloom", "grid"],
  food: ["bloom", "grid"],
  art: ["prism", "bloom"],
  education: ["grid", "knot"],
};

interface BadgeChoice {
  shape: BadgeShape;
  outline: boolean;
}
interface TypoPreset {
  weight: FontWeight;
  case: TextCase;
  tracking: number;
}

interface ChipProfile {
  vibes: FontVibe[];
  palettes: string[];
  badges: BadgeChoice[];
  families: AbstractFamily[];
  typo: TypoPreset[];
}

const b = (shape: BadgeShape, outline = false): BadgeChoice => ({
  shape,
  outline,
});

const CHIP_PROFILES: Record<StyleChip, ChipProfile> = {
  Minimal: {
    vibes: ["Minimal", "Modern"],
    palettes: ["mono", "ink", "slate", "sand", "sky", "theme"],
    badges: [b("none"), b("circle", true), b("rounded", true), b("circle")],
    families: ["grid", "waves", "orbits"],
    typo: [
      { weight: 500, case: "upper", tracking: 0.12 },
      { weight: 600, case: "upper", tracking: 0.08 },
      { weight: 400, case: "none", tracking: 0.05 },
    ],
  },
  Bold: {
    vibes: ["Bold"],
    palettes: [
      "ink",
      "violet",
      "sunset-fade",
      "berry-fade",
      "amber",
      "coral",
      "rose",
      "midnight-fade",
    ],
    badges: [
      b("squircle"),
      b("hexagon"),
      b("diamond"),
      b("shield"),
      b("circle"),
    ],
    families: ["prism", "grid", "knot"],
    typo: [
      { weight: 800, case: "none", tracking: 0 },
      { weight: 800, case: "upper", tracking: 0.04 },
      { weight: 700, case: "none", tracking: 0 },
    ],
  },
  Elegant: {
    vibes: ["Elegant", "Modern"],
    palettes: [
      "sage",
      "clay",
      "plum",
      "sand",
      "cocoa",
      "lavender",
      "mono",
      "ink",
    ],
    badges: [b("none"), b("circle", true), b("circle"), b("rounded")],
    families: ["bloom", "knot", "waves"],
    typo: [
      { weight: 500, case: "title", tracking: 0.02 },
      { weight: 400, case: "upper", tracking: 0.18 },
      { weight: 600, case: "title", tracking: 0 },
    ],
  },
  Playful: {
    vibes: ["Playful"],
    palettes: [
      "coral",
      "amber",
      "sky",
      "mint-fade",
      "sunset-fade",
      "lavender",
      "rose",
    ],
    badges: [b("circle"), b("rounded"), b("squircle")],
    families: ["bloom", "orbits", "prism"],
    typo: [
      { weight: 700, case: "none", tracking: 0 },
      { weight: 800, case: "none", tracking: 0.01 },
      { weight: 600, case: "title", tracking: 0.02 },
    ],
  },
  Organic: {
    vibes: ["Elegant", "Minimal"],
    palettes: ["sage", "forest", "pine", "clay", "mint-fade", "terracotta"],
    badges: [b("circle"), b("none"), b("rounded")],
    families: ["bloom", "waves", "knot"],
    typo: [
      { weight: 500, case: "title", tracking: 0.03 },
      { weight: 600, case: "none", tracking: 0.02 },
    ],
  },
  Tech: {
    vibes: ["Modern", "Minimal"],
    palettes: [
      "ocean-fade",
      "midnight-fade",
      "ink",
      "sky",
      "slate",
      "mono",
      "theme",
    ],
    badges: [b("hexagon"), b("squircle"), b("none"), b("hexagon", true)],
    families: ["grid", "orbits", "prism"],
    typo: [
      { weight: 600, case: "upper", tracking: 0.08 },
      { weight: 700, case: "upper", tracking: 0.05 },
      { weight: 500, case: "none", tracking: 0.03 },
    ],
  },
};

const DEFAULT_PROFILE: ChipProfile = {
  vibes: ["Modern", "Elegant", "Bold", "Playful", "Minimal"],
  palettes: PALETTES("#000000").map((p) => p.id),
  badges: [
    b("circle"),
    b("rounded"),
    b("squircle"),
    b("none"),
    b("circle", true),
    b("shield"),
    b("hexagon"),
  ],
  families: [...ABSTRACT_FAMILIES],
  typo: [
    { weight: 700, case: "none", tracking: 0 },
    { weight: 700, case: "title", tracking: 0 },
    { weight: 600, case: "upper", tracking: 0.08 },
    { weight: 800, case: "none", tracking: 0 },
  ],
};

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function mergeProfiles(chips: StyleChip[]): ChipProfile {
  if (!chips.length) return DEFAULT_PROFILE;
  const profiles = chips.map((c) => CHIP_PROFILES[c]);
  return {
    vibes: dedupe(profiles.flatMap((p) => p.vibes)),
    palettes: dedupe(profiles.flatMap((p) => p.palettes)),
    badges: dedupe(
      profiles.flatMap((p) => p.badges).map((x) => JSON.stringify(x)),
    ).map((s) => JSON.parse(s) as BadgeChoice),
    families: dedupe(profiles.flatMap((p) => p.families)),
    typo: dedupe(
      profiles.flatMap((p) => p.typo).map((x) => JSON.stringify(x)),
    ).map((s) => JSON.parse(s) as TypoPreset),
  };
}

function nicheLookup<T>(niche: string, table: Record<string, T[]>): T[] {
  const lower = niche.toLowerCase();
  for (const [keyword, values] of Object.entries(table)) {
    if (lower.includes(keyword)) return values;
  }
  return [];
}

const pickFrom = <T>(r: () => number, xs: T[]): T =>
  xs[Math.floor(r() * xs.length)]!;

function pickLayout(r: () => number): RecipeLayout {
  const x = r();
  if (x < 0.4) return "horizontal";
  if (x < 0.65) return "stacked";
  if (x < 0.8) return "emblem";
  if (x < 0.9) return "horizontal_reversed";
  return "name_only";
}

function pickMark(
  r: () => number,
  icons: string[],
  families: AbstractFamily[],
): LogoMark {
  const x = r();
  if (x < 0.4)
    return {
      type: "icon",
      icon: pickFrom(r, icons),
      style: r() < 0.75 ? "outline" : "solid",
    };
  if (x < 0.7)
    return {
      type: "abstract",
      family: pickFrom(r, families),
      seed: 1 + Math.floor(r() * 100_000),
    };
  return {
    type: "initials",
    style: pickFrom(r, ["plain", "monogram", "split", "overlap"] as const),
  };
}

function markKey(mark: LogoMark): string {
  if (mark.type === "icon") return `icon:${mark.icon}`;
  if (mark.type === "abstract") return `abstract:${mark.family}`;
  if (mark.type === "initials") return `initials:${mark.style}`;
  return "image";
}

function buildRecipe(
  brief: Brief,
  primaryHex: string,
  layout: RecipeLayout,
  mark: LogoMark,
  badge: BadgeChoice,
  palette: Palette,
  font: string,
  typo: TypoPreset,
): LogoRecipe {
  const entry = fontEntry(font);
  const weight = entry.weights.includes(typo.weight) ? typo.weight : 700;
  const base = defaultRecipe(brief.brandName || "My Brand", primaryHex);
  return applyPalette(
    {
      ...base,
      layout,
      mark,
      badge: { shape: badge.shape, outline: badge.outline },
      typography: {
        name: {
          font: entry.family,
          weight,
          tracking: typo.tracking,
          case: typo.case,
        },
        tagline: {
          font: entry.family,
          weight: 500,
          tracking: 0.08,
          case: "upper",
        },
      },
    },
    palette,
  );
}

export function composeWall(
  brief: Brief,
  seed: number,
  count = 24,
  primaryHex = "#1a56db",
): LogoRecipe[] {
  const r = mulberry32(seed);
  const profile = mergeProfiles(brief.styleChips);
  const allPalettes = PALETTES(primaryHex);
  const palettePool = allPalettes.filter((p) =>
    profile.palettes.includes(p.id),
  );
  const fontPool = LOGO_FONTS.filter((f) => profile.vibes.includes(f.vibe)).map(
    (f) => f.family,
  );
  const icons = nicheLookup(brief.niche, NICHE_ICONS);
  const iconPool = icons.length ? icons : DEFAULT_ICONS;
  const nicheFamilies = nicheLookup(brief.niche, NICHE_FAMILIES).filter((f) =>
    profile.families.includes(f),
  );
  // 60% of abstract picks favor the niche families when they fit the chips.
  const familyPick = (): AbstractFamily =>
    nicheFamilies.length && r() < 0.6
      ? pickFrom(r, nicheFamilies)
      : pickFrom(r, profile.families);

  const wall: LogoRecipe[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let recipe: LogoRecipe | null = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const layout = pickLayout(r);
      const mark = pickMark(r, iconPool, [familyPick()]);
      const badge = pickFrom(r, profile.badges);
      const palette = pickFrom(r, palettePool);
      const font = pickFrom(r, fontPool);
      const typo = pickFrom(r, profile.typo);
      const key = `${markKey(mark)}|${palette.id}|${font}`;
      if (used.has(key) && attempt < 11) continue;
      used.add(key);
      recipe = buildRecipe(
        brief,
        primaryHex,
        layout,
        mark,
        badge,
        palette,
        font,
        typo,
      );
      break;
    }
    if (recipe) wall.push(recipe);
  }
  return wall;
}

export function moreLikeThis(
  base: LogoRecipe,
  brief: Brief,
  seed: number,
  count = 8,
): LogoRecipe[] {
  const r = mulberry32(seed);
  const profile = mergeProfiles(brief.styleChips);
  const baseVibe = fontEntry(base.typography.name.font).vibe;
  const fontPool = dedupe([
    ...LOGO_FONTS.filter((f) => f.vibe === baseVibe).map((f) => f.family),
    ...LOGO_FONTS.filter((f) => profile.vibes.includes(f.vibe)).map(
      (f) => f.family,
    ),
  ]);
  const variants: LogoRecipe[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const layout = pickLayout(r);
      const badge = pickFrom(r, profile.badges);
      const font = pickFrom(r, fontPool);
      const typo = pickFrom(r, profile.typo);
      // Lock the mark family: same icon / same abstract family (fresh seed)
      // / same initials style. Lock the palette: copy colors verbatim.
      const mark: LogoMark =
        base.mark.type === "abstract"
          ? { ...base.mark, seed: 1 + Math.floor(r() * 100_000) }
          : base.mark;
      const key = `${layout}|${font}|${badge.shape}${badge.outline ? "o" : ""}|${typo.weight}${typo.case}`;
      if (used.has(key) && attempt < 11) continue;
      used.add(key);
      const entry = fontEntry(font);
      const weight = entry.weights.includes(typo.weight) ? typo.weight : 700;
      variants.push({
        ...base,
        layout,
        mark,
        badge: { shape: badge.shape, outline: badge.outline },
        typography: {
          name: {
            font: entry.family,
            weight,
            tracking: typo.tracking,
            case: typo.case,
          },
          tagline: { ...base.typography.tagline, font: entry.family },
        },
        colors: { ...base.colors },
        elements: {
          mark: { offset: [0, 0], scale: 1 },
          name: { offset: [0, 0], scale: 1 },
          tagline: { offset: [0, 0], scale: 1 },
        },
      });
      break;
    }
  }
  return variants;
}

// ── AI Brand Pack multiplication ───────────────────────────────────────────
// One `/api/v1/admin/config/logo-brand-pack/` call returns a small Brand
// Pack (bespoke vector marks + brand palettes); composeFromPack fans it out
// into a batch of wall recipes using the same deterministic machinery as
// composeWall, at zero extra API cost. Shapes mirror the backend's
// structured-output schema — see backend/apps/tenant_config/logo_ai.py.

export interface BrandPackPath {
  d: string;
  fill?: "mark" | "mark2" | "accent";
  fill_rule?: "nonzero" | "evenodd";
  opacity?: number;
}
/** A mark's pre-compile source geometry — opaque to the client (never
 * interpreted, only ever round-tripped to the logo-refine/ endpoint). Shape
 * mirrors backend/apps/tenant_config/logo_ai.py's `_Element` union. */
export type BrandPackElement = Record<string, unknown>;

export interface BrandPackMark {
  rationale: string;
  paths: BrandPackPath[];
  /** Present on packs generated after the elements round-trip shipped;
   * absent on older cached packs. */
  elements?: BrandPackElement[];
}
export interface BrandPackPalette {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
}
export interface BrandPack {
  marks: BrandPackMark[];
  palettes: BrandPackPalette[];
  tagline: string;
  font_vibe: FontVibe;
}

const PACK_LAYOUTS: RecipeLayout[] = [
  "horizontal",
  "stacked",
  "emblem",
  "horizontal_reversed",
  "name_only",
];
const PACK_BADGES: BadgeChoice[] = [
  b("circle"),
  b("rounded"),
  b("squircle"),
  b("none"),
  b("hexagon"),
  b("circle", true),
];

export function composeFromPack(
  pack: BrandPack,
  brief: Brief,
  seed: number,
): LogoRecipe[] {
  const r = mulberry32(seed);
  const fontPool = LOGO_FONTS.filter((f) => f.vibe === pack.font_vibe).map(
    (f) => f.family,
  );
  const fonts = fontPool.length ? fontPool : LOGO_FONT_FAMILIES;

  const recipes: LogoRecipe[] = [];
  for (const mark of pack.marks) {
    const paths: CustomMarkPath[] = mark.paths.map((p) => ({
      d: p.d,
      fill: p.fill ?? "mark",
      fill_rule: p.fill_rule,
      opacity: p.opacity,
    }));
    for (const palette of pack.palettes) {
      const layout = pickFrom(r, PACK_LAYOUTS);
      const badge = pickFrom(r, PACK_BADGES);
      const font = pickFrom(r, fonts);
      const entry = fontEntry(font);
      const weight: FontWeight = entry.weights.includes(700)
        ? 700
        : entry.weights[entry.weights.length - 1]!;
      const base = defaultRecipe(
        brief.brandName || "My Brand",
        palette.primary,
      );
      recipes.push({
        ...base,
        layout,
        tagline: pack.tagline,
        mark: { type: "custom", rationale: mark.rationale, paths },
        badge: { shape: badge.shape, outline: badge.outline },
        typography: {
          name: { font: entry.family, weight, tracking: 0, case: "none" },
          tagline: {
            font: entry.family,
            weight: 500,
            tracking: 0.08,
            case: "upper",
          },
        },
        colors: {
          palette_id: null,
          badge: { type: "solid", color: palette.primary },
          mark: palette.ink,
          mark2: palette.secondary,
          mark_accent: palette.accent,
          text: palette.ink,
          tagline: palette.secondary,
        },
      });
    }
  }
  return recipes;
}

/** Parallel index into the flattened `marks x palettes` order composeFromPack
 * builds recipes in — the single source of truth for that pairing, reused
 * by logo-studio.tsx to know which source elements (if any) back a given
 * AI wall tile, for handing to logo-refine/ later. */
export function packElementsByIndex(
  pack: BrandPack,
): (BrandPackElement[] | undefined)[] {
  const out: (BrandPackElement[] | undefined)[] = [];
  for (const mark of pack.marks) {
    for (let i = 0; i < pack.palettes.length; i++) out.push(mark.elements);
  }
  return out;
}

/** The logo-refine/ endpoint's response payload — a compact design (not a
 * full LogoRecipe) that applyRefinedDesign folds onto the current draft. */
export interface RefinedDesign {
  mark: BrandPackMark;
  palette: BrandPackPalette;
  font_vibe: FontVibe;
  layout: RecipeLayout;
  rationale: string;
}

/** Applies an AI refinement to the current editor draft: reshapes the mark,
 * repalettes, and swaps to a font in the new font_vibe's pool (keeping the
 * current family if it already fits) — everything else on the recipe
 * (name, tagline text, badge, element placement) is left untouched. */
export function applyRefinedDesign(
  recipe: LogoRecipe,
  design: RefinedDesign,
): LogoRecipe {
  const fontPool = LOGO_FONTS.filter((f) => f.vibe === design.font_vibe).map(
    (f) => f.family,
  );
  const fonts = fontPool.length ? fontPool : LOGO_FONT_FAMILIES;
  const font = fonts.includes(recipe.typography.name.font)
    ? recipe.typography.name.font
    : fonts[0]!;
  const entry = fontEntry(font);
  const weight: FontWeight = entry.weights.includes(700)
    ? 700
    : entry.weights[entry.weights.length - 1]!;
  const paths: CustomMarkPath[] = design.mark.paths.map((p) => ({
    d: p.d,
    fill: p.fill ?? "mark",
    fill_rule: p.fill_rule,
    opacity: p.opacity,
  }));
  return {
    ...recipe,
    layout: design.layout,
    mark: { type: "custom", rationale: design.mark.rationale, paths },
    typography: {
      name: { ...recipe.typography.name, font, weight },
      tagline: { ...recipe.typography.tagline, font, weight: 500 },
    },
    colors: {
      ...recipe.colors,
      palette_id: null,
      badge: { type: "solid", color: design.palette.primary },
      mark: design.palette.ink,
      mark2: design.palette.secondary,
      mark_accent: design.palette.accent,
      text: design.palette.ink,
      tagline: design.palette.secondary,
    },
  };
}
