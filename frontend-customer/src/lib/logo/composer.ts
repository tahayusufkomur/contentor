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
  type FontEntry,
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

export type PaletteRole = "primary" | "secondary" | "accent" | "ink" | "white";
export interface BrandPackColorRoles {
  badge: PaletteRole;
  mark: PaletteRole;
  mark2: PaletteRole;
  mark_accent: PaletteRole;
  text: Exclude<PaletteRole, "white" | "accent">;
  tagline: Exclude<PaletteRole, "white">;
}
export interface BrandPackTypography {
  case: TextCase;
  tracking: number;
  weight: FontWeight;
}
/** A v3 pack's complete lockup for one design — the AI designs the whole
 * logo (layout, badge, font, colors), not just a bare mark; composeDesigns
 * materializes this faithfully instead of dice-rolling combinations. */
export interface BrandPackDesign {
  concept: string;
  rationale: string;
  paths: BrandPackPath[];
  elements?: BrandPackElement[];
  layout: RecipeLayout;
  badge_shape: BadgeShape;
  badge_outline: boolean;
  font: string;
  typography: BrandPackTypography;
  palette_index: number;
  color_roles: BrandPackColorRoles;
}
export interface BrandPack {
  /** v3 packs (PROMPT_VERSION >= 5): complete designs. */
  designs?: BrandPackDesign[];
  /** Legacy packs from saved studio sessions (<= 14 days old). */
  marks?: BrandPackMark[];
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
  for (const mark of pack.marks ?? []) {
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
            weight: taglineWeight(entry),
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

function resolveRole(role: PaletteRole, palette: BrandPackPalette): string {
  return role === "white" ? "#ffffff" : palette[role];
}

const clampTracking = (t: number) => Math.max(-0.1, Math.min(0.4, t || 0));

/** The tagline's preferred weight is 500 (a touch lighter than the name),
 * but single-weight families (e.g. Great Vibes, Pacifico — Script vibe,
 * weight 400 only) don't have it: snap to the family's heaviest available
 * weight instead of requesting a Google Fonts variant that 404s. */
const taglineWeight = (entry: FontEntry): FontWeight =>
  entry.weights.includes(500) ? 500 : entry.weights[entry.weights.length - 1]!;

/** v3 packs: the AI already designed the whole lockup (layout, badge, font,
 * typography, colors) per design — materialize it faithfully, 1:1, with no
 * dice-rolling. Font/weight/palette-index are still defensively resolved
 * against the client catalogs (an AI response is untrusted input). */
export function composeDesigns(pack: BrandPack, brief: Brief): LogoRecipe[] {
  const vibePool = LOGO_FONTS.filter((f) => f.vibe === pack.font_vibe).map(
    (f) => f.family,
  );
  return (pack.designs ?? []).map((design) => {
    const palette =
      pack.palettes[
        Math.max(0, Math.min(design.palette_index, pack.palettes.length - 1))
      ] ?? pack.palettes[0]!;
    const family = LOGO_FONT_FAMILIES.includes(design.font)
      ? design.font
      : (vibePool[0] ?? LOGO_FONT_FAMILIES[0]!);
    const entry = fontEntry(family);
    const weight: FontWeight = entry.weights.includes(design.typography.weight)
      ? design.typography.weight
      : entry.weights[entry.weights.length - 1]!;
    const roles = design.color_roles;
    const noBadge =
      design.badge_shape === "none" || design.layout === "name_only";
    const markRole: PaletteRole =
      noBadge && roles.mark === "white" ? "ink" : roles.mark;
    const paths: CustomMarkPath[] = design.paths.map((p) => ({
      d: p.d,
      fill: p.fill ?? "mark",
      fill_rule: p.fill_rule,
      opacity: p.opacity,
    }));
    const base = defaultRecipe(brief.brandName || "My Brand", palette.primary);
    return {
      ...base,
      layout: design.layout,
      tagline: pack.tagline,
      mark: { type: "custom", rationale: design.rationale, paths },
      badge: { shape: design.badge_shape, outline: design.badge_outline },
      typography: {
        name: {
          font: entry.family,
          weight,
          tracking: clampTracking(design.typography.tracking),
          case: design.typography.case,
        },
        tagline: {
          font: entry.family,
          weight: taglineWeight(entry),
          tracking: 0.08,
          case: "upper",
        },
      },
      colors: {
        palette_id: null,
        badge: { type: "solid", color: resolveRole(roles.badge, palette) },
        mark: resolveRole(markRole, palette),
        mark2: resolveRole(roles.mark2, palette),
        mark_accent: resolveRole(roles.mark_accent, palette),
        text: resolveRole(roles.text, palette),
        tagline: resolveRole(roles.tagline, palette),
      },
    };
  });
}

/** Single entry point for AI walls: v3 packs materialize their designs;
 * legacy packs (old saved sessions) keep the deterministic fan-out. */
export function composePackWall(
  pack: BrandPack,
  brief: Brief,
  seed: number,
): LogoRecipe[] {
  return pack.designs?.length
    ? composeDesigns(pack, brief)
    : composeFromPack(pack, brief, seed);
}

/** Parallel index into the flattened wall order composeDesigns/composeFromPack
 * build recipes in — the single source of truth for that pairing, reused
 * by logo-studio.tsx to know which source elements (if any) back a given
 * AI wall tile, for handing to logo-refine/ later. v3 packs are 1:1 with
 * designs; legacy packs keep the `marks x palettes` fan-out order. */
export function packElementsByIndex(
  pack: BrandPack,
): (BrandPackElement[] | undefined)[] {
  if (pack.designs?.length) return pack.designs.map((d) => d.elements);
  const out: (BrandPackElement[] | undefined)[] = [];
  for (const mark of pack.marks ?? []) {
    for (let i = 0; i < pack.palettes.length; i++) out.push(mark.elements);
  }
  return out;
}

/** The logo-refine/ endpoint's response payload — a compact design (not a
 * full LogoRecipe) that applyRefinedDesign folds onto the current draft.
 * Carries a complete lockup (badge/font/typography/color roles), same as a
 * v3 pack's BrandPackDesign, so a refinement can redesign the whole logo. */
export interface RefinedDesign {
  mark: BrandPackMark;
  palette: BrandPackPalette;
  font_vibe: FontVibe;
  layout: RecipeLayout;
  badge_shape: BadgeShape;
  badge_outline: boolean;
  font: string;
  typography: BrandPackTypography;
  color_roles: BrandPackColorRoles;
  rationale: string;
}

/** Applies an AI refinement to the current editor draft: reshapes the mark,
 * repalettes, and replaces the badge/typography/color-role lockup with the
 * AI's — everything else on the recipe (name, tagline text, element
 * placement) is left untouched. Font/weight are defensively resolved
 * against the client catalogs the same way composeDesigns does. */
export function applyRefinedDesign(
  recipe: LogoRecipe,
  design: RefinedDesign,
): LogoRecipe {
  const vibePool = LOGO_FONTS.filter((f) => f.vibe === design.font_vibe).map(
    (f) => f.family,
  );
  const family = LOGO_FONT_FAMILIES.includes(design.font)
    ? design.font
    : vibePool.includes(recipe.typography.name.font)
      ? recipe.typography.name.font
      : (vibePool[0] ?? LOGO_FONT_FAMILIES[0]!);
  const entry = fontEntry(family);
  const weight: FontWeight = entry.weights.includes(design.typography.weight)
    ? design.typography.weight
    : entry.weights[entry.weights.length - 1]!;
  const paths: CustomMarkPath[] = design.mark.paths.map((p) => ({
    d: p.d,
    fill: p.fill ?? "mark",
    fill_rule: p.fill_rule,
    opacity: p.opacity,
  }));
  const roles = design.color_roles;
  const noBadge =
    design.badge_shape === "none" || design.layout === "name_only";
  const markRole: PaletteRole =
    noBadge && roles.mark === "white" ? "ink" : roles.mark;
  return {
    ...recipe,
    layout: design.layout,
    mark: { type: "custom", rationale: design.mark.rationale, paths },
    badge: { shape: design.badge_shape, outline: design.badge_outline },
    typography: {
      name: {
        font: entry.family,
        weight,
        tracking: clampTracking(design.typography.tracking),
        case: design.typography.case,
      },
      tagline: {
        ...recipe.typography.tagline,
        font: entry.family,
        weight: taglineWeight(entry),
      },
    },
    colors: {
      ...recipe.colors,
      palette_id: null,
      badge: { type: "solid", color: resolveRole(roles.badge, design.palette) },
      mark: resolveRole(markRole, design.palette),
      mark2: resolveRole(roles.mark2, design.palette),
      mark_accent: resolveRole(roles.mark_accent, design.palette),
      text: resolveRole(roles.text, design.palette),
      tagline: resolveRole(roles.tagline, design.palette),
    },
  };
}
