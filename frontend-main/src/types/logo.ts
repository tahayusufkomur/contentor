// MIRRORED FROM frontend-customer/src/types/logo.ts — keep in sync (phase-3 wizard)
// Logo Studio recipe types. v3 is the live schema; v1/v2 are kept only as
// input types for lib/logo/migrate.ts. Validation source of truth:
// backend/apps/tenant_config/logo_recipe.py.

export type RecipeLayoutV1 = "badge_name" | "icon_name" | "name_only";
export type RecipeBadgeV1 = "circle" | "rounded" | "squircle" | "none";
export type LogoMarkV1 =
  | { type: "icon"; icon: string }
  | { type: "initials" }
  | { type: "image"; photo_id: string; url: string };

export interface LogoRecipeV1 {
  version: 1;
  layout: RecipeLayoutV1;
  name: string;
  mark: LogoMarkV1;
  badge: RecipeBadgeV1;
  font: string;
  colors: { badge_bg: string; mark_fg: string; text: string };
  overrides: {
    mark_offset: [number, number];
    mark_scale: number;
    name_offset: [number, number];
    name_scale: number;
  };
}

export type RecipeLayout =
  | "horizontal"
  | "horizontal_reversed"
  | "stacked"
  | "name_only"
  | "emblem";
export type BadgeShape =
  | "none"
  | "circle"
  | "rounded"
  | "squircle"
  | "hexagon"
  | "shield"
  | "diamond";
export type TextCase = "none" | "upper" | "title";
export type FontWeight = 400 | 500 | 600 | 700 | 800;
export type AbstractFamily =
  | "orbits"
  | "bloom"
  | "waves"
  | "prism"
  | "knot"
  | "grid";

export type Fill =
  | { type: "solid"; color: string }
  | { type: "linear"; from: string; to: string; angle: number }
  | { type: "radial"; from: string; to: string };

/** A single filled path in a "custom" mark's unit (0..100) viewBox. `fill`
 * is a role token — not raw hex — so one mark recolors across palettes and
 * the dark-variant export via LogoRecipe.colors.mark/mark2/mark_accent. */
export interface CustomMarkPath {
  d: string;
  fill?: "mark" | "mark2" | "accent";
  fill_rule?: "nonzero" | "evenodd";
  opacity?: number;
}

export type LogoMark =
  | { type: "icon"; icon: string; style: "outline" | "solid" }
  | { type: "initials"; style: "plain" | "monogram" | "split" | "overlap" }
  | { type: "abstract"; family: AbstractFamily; seed: number }
  | { type: "image"; photo_id: string; url: string }
  // AI Brand Pack: bespoke vector mark drawn for this brand. `rationale` is
  // the one-sentence "why it works" caption shown on AI wall tiles.
  | { type: "custom"; rationale: string; paths: CustomMarkPath[] };

export interface TextStyle {
  font: string;
  weight: FontWeight;
  tracking: number; // em-relative letter-spacing, e.g. 0.08
  case: TextCase;
}

export interface ElementPlacement {
  offset: [number, number];
  scale: number;
}

export interface LogoRecipeV2 {
  version: 2;
  layout: RecipeLayout;
  name: string;
  tagline: string; // "" = no tagline element
  mark: LogoMark;
  badge: { shape: BadgeShape; outline: boolean };
  typography: { name: TextStyle; tagline: TextStyle };
  colors: {
    palette_id: string | null;
    badge: Fill;
    mark: string;
    text: string;
    tagline: string;
    // Optional secondary fill roles for "custom" marks (AI Brand Pack) —
    // omitted entirely on recipes with no custom mark.
    mark2?: string;
    mark_accent?: string;
  };
  elements: {
    mark: ElementPlacement;
    name: ElementPlacement;
    tagline: ElementPlacement;
  };
}

// A mark color role can be a flat hex string (legacy palettes) or a full
// Fill (solid/linear/radial) — lets AI Brand Pack marks use gradients.
export type MarkFill = string | Fill;

export interface LogoRecipe extends Omit<LogoRecipeV2, "version" | "colors"> {
  version: 3;
  colors: Omit<LogoRecipeV2["colors"], "mark" | "mark2" | "mark_accent"> & {
    mark: MarkFill;
    mark2?: MarkFill;
    mark_accent?: MarkFill;
  };
}

export type AnyLogoRecipe = LogoRecipeV1 | LogoRecipeV2 | LogoRecipe;
