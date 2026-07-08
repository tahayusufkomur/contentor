// Logo Studio recipe types. v2 is the live schema; v1 is kept only as the
// input type for lib/logo/migrate.ts. Validation source of truth:
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

export type LogoMark =
  | { type: "icon"; icon: string; style: "outline" | "solid" }
  | { type: "initials"; style: "plain" | "monogram" | "split" | "overlap" }
  | { type: "abstract"; family: AbstractFamily; seed: number }
  | { type: "image"; photo_id: string; url: string };

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

export interface LogoRecipe {
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
  };
  elements: {
    mark: ElementPlacement;
    name: ElementPlacement;
    tagline: ElementPlacement;
  };
}

export type AnyLogoRecipe = LogoRecipeV1 | LogoRecipe;
