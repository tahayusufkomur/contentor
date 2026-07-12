// AI Brand Pack (see backend/apps/tenant_config/logo_ai.py) supplies bespoke
// vector marks + brand palettes from ONE paid-tier-gated API call per brief.
// This module materializes those AI designs into LogoRecipes for the
// converse (Design-with-AI) flow and the refine flow.
//
// Every recipe emitted here must pass the backend's validate_recipe:
// enums come exclusively from the Phase-1 catalogs (AI Brand Pack marks are
// validated separately, server-side, before ever reaching this module).
import {
  LOGO_FONTS,
  LOGO_FONT_FAMILIES,
  defaultRecipe,
  fontEntry,
  type FontEntry,
  type FontVibe,
} from "@/lib/logo/catalog";
import type {
  BadgeShape,
  CustomMarkPath,
  FontWeight,
  LogoRecipe,
  MarkFill,
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
  /** Free-text vibe, consumed only by the AI Brand Pack endpoint. */
  vibe?: string;
}

// Shapes mirror the backend's structured-output schema — see
// backend/apps/tenant_config/logo_ai.py.

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

// ── Staged Design-with-AI (converse) compose ───────────────────────────────
// The converse endpoints (backend/apps/tenant_config/views.py logo_converse)
// stream ONE design at a time across three stages — icon, name, tagline — so
// the coach converges on a single logo instead of picking off a wall. Stage 1
// yields bare icon candidates (composeIconPreview -> MarkRenderer cards);
// stages 2/3 yield the complete lockup (composeConverseDesign). Both reuse the
// same faithful materialization + defensive catalog resolution.

/** Mark-only color roles — a stage-1 icon candidate has no lockup yet. */
export interface ConverseMarkRoles {
  mark: PaletteRole;
  mark2: PaletteRole;
  mark_accent: PaletteRole;
}

/** A gradient request for the mark fill: paint from the mark's own color to a
 * second palette role, at `angle` degrees. `null`/absent = flat solid mark. */
export type MarkGradient = {
  to: Exclude<PaletteRole, "white">;
  angle: number;
} | null;

/** One design from a converse turn. Stage 1 carries only the mark + mark
 * roles; stages 2/3 add the full lockup (layout, badge, font, typography,
 * lockup color roles) plus mark_scale/mark_gradient/tagline refinements. */
export interface ConverseDesign {
  concept: string;
  rationale: string;
  paths: BrandPackPath[];
  elements?: BrandPackElement[];
  palette: BrandPackPalette;
  color_roles: ConverseMarkRoles | BrandPackColorRoles;
  layout?: RecipeLayout;
  badge_shape?: BadgeShape;
  badge_outline?: boolean;
  font?: string;
  typography?: BrandPackTypography;
  mark_scale?: number;
  mark_gradient?: MarkGradient;
  tagline?: string;
}

/** The mark placement scale the AI may request, clamped to a sane range so a
 * runaway value can't blow the mark out of (or shrink it past) the lockup. */
const clampScale = (s: number | undefined) =>
  Math.max(0.6, Math.min(1.8, s ?? 1));

/** Resolve a mark fill: a flat hex when no gradient is requested, else a
 * linear Fill from the mark's own color (`markHex`) to the target role's
 * color, at a clamped angle. Shared by composeConverseDesign and the refine
 * flow (both carry a palette + optional MarkGradient). */
function markFillFor(
  gradient: MarkGradient | undefined,
  palette: BrandPackPalette,
  markHex: string,
): MarkFill {
  if (!gradient) return markHex;
  return {
    type: "linear",
    from: markHex,
    to: resolveRole(gradient.to, palette),
    angle: Math.max(0, Math.min(360, gradient.angle)),
  };
}

const toCustomPaths = (paths: BrandPackPath[]): CustomMarkPath[] =>
  paths.map((p) => ({
    d: p.d,
    fill: p.fill ?? "mark",
    fill_rule: p.fill_rule,
    opacity: p.opacity,
  }));

/** Stage-1 icon candidate -> a minimal, badge-less recipe for the MarkRenderer
 * preview cards. Only the mark + its three color roles are known this early. */
export function composeIconPreview(
  design: ConverseDesign,
  brandName: string,
): LogoRecipe {
  const roles = design.color_roles;
  const base = defaultRecipe(brandName || "My Brand", design.palette.primary);
  return {
    ...base,
    mark: {
      type: "custom",
      rationale: design.rationale,
      paths: toCustomPaths(design.paths),
    },
    badge: { shape: "none", outline: false },
    colors: {
      ...base.colors,
      palette_id: null,
      badge: { type: "solid", color: design.palette.primary },
      mark: resolveRole(
        roles.mark === "white" ? "ink" : roles.mark,
        design.palette,
      ),
      mark2: resolveRole(roles.mark2, design.palette),
      mark_accent: resolveRole(roles.mark_accent, design.palette),
    },
  };
}

/** Stage-2/3 candidate -> the complete recipe, materialized faithfully (no
 * dice). Font/weight are defensively resolved against the client catalogs,
 * mark_scale/mark_gradient are applied, and a white mark with no badge behind
 * it is guarded to ink — the same rules as applyRefinedDesign. */
export function composeConverseDesign(
  design: ConverseDesign,
  brandName: string,
): LogoRecipe {
  const roles = design.color_roles as BrandPackColorRoles;
  const palette = design.palette;
  const family = LOGO_FONT_FAMILIES.includes(design.font ?? "")
    ? design.font!
    : LOGO_FONT_FAMILIES[0]!;
  const entry = fontEntry(family);
  const typography = design.typography ?? {
    case: "none" as const,
    tracking: 0,
    weight: 700 as const,
  };
  const weight: FontWeight = entry.weights.includes(typography.weight)
    ? typography.weight
    : entry.weights[entry.weights.length - 1]!;
  const layout = design.layout ?? "horizontal";
  const badgeShape = design.badge_shape ?? "none";
  const noBadge = badgeShape === "none" || layout === "name_only";
  const markRole: PaletteRole =
    noBadge && roles.mark === "white" ? "ink" : roles.mark;
  const markHex = resolveRole(markRole, palette);
  const base = defaultRecipe(brandName || "My Brand", palette.primary);
  return {
    ...base,
    layout,
    tagline: design.tagline ?? "",
    mark: {
      type: "custom",
      rationale: design.rationale,
      paths: toCustomPaths(design.paths),
    },
    badge: { shape: badgeShape, outline: design.badge_outline ?? false },
    typography: {
      name: {
        font: entry.family,
        weight,
        tracking: clampTracking(typography.tracking),
        case: typography.case,
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
      mark: markFillFor(design.mark_gradient, palette, markHex),
      mark2: resolveRole(roles.mark2, palette),
      mark_accent: resolveRole(roles.mark_accent, palette),
      text: resolveRole(roles.text, palette),
      tagline: resolveRole(roles.tagline, palette),
    },
    elements: {
      ...base.elements,
      mark: { offset: [0, 0], scale: clampScale(design.mark_scale) },
    },
  };
}

/** The logo-refine/ endpoint's response payload — a compact design (not a
 * full LogoRecipe) that applyRefinedDesign folds onto the current draft.
 * Carries a complete lockup (badge/font/typography/color roles), so a
 * refinement can redesign the whole logo. */
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
  /** Optional mark refinements — same semantics as ConverseDesign: scale the
   * mark within the lockup and/or paint it with a linear gradient. */
  mark_scale?: number;
  mark_gradient?: MarkGradient;
}

/** Applies an AI refinement to the current editor draft: reshapes the mark,
 * repalettes, and replaces the badge/typography/color-role lockup with the
 * AI's — everything else on the recipe (name, tagline text, element
 * placement) is left untouched. Font/weight are defensively resolved
 * against the client catalogs (an AI response is untrusted input). */
export function applyRefinedDesign(
  recipe: LogoRecipe,
  design: RefinedDesign,
  opts: { keepMark?: boolean } = {},
): LogoRecipe {
  const keepMark = opts.keepMark ?? false;
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
  const markHex = resolveRole(markRole, design.palette);
  return {
    ...recipe,
    layout: design.layout,
    mark: keepMark
      ? recipe.mark
      : { type: "custom", rationale: design.mark.rationale, paths },
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
      mark: keepMark
        ? recipe.colors.mark
        : markFillFor(design.mark_gradient, design.palette, markHex),
      mark2: keepMark
        ? recipe.colors.mark2
        : resolveRole(roles.mark2, design.palette),
      mark_accent: keepMark
        ? recipe.colors.mark_accent
        : resolveRole(roles.mark_accent, design.palette),
      text: resolveRole(roles.text, design.palette),
      tagline: resolveRole(roles.tagline, design.palette),
    },
    elements: {
      ...recipe.elements,
      mark: keepMark
        ? recipe.elements.mark
        : { ...recipe.elements.mark, scale: clampScale(design.mark_scale) },
    },
  };
}
