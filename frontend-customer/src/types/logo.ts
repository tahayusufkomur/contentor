export type RecipeLayout = "badge_name" | "icon_name" | "name_only";
export type RecipeBadge = "circle" | "rounded" | "squircle" | "none";

export type LogoMark =
  | { type: "icon"; icon: string }
  | { type: "initials" }
  | { type: "image"; photo_id: string; url: string };

export interface LogoRecipe {
  version: 1;
  layout: RecipeLayout;
  name: string;
  mark: LogoMark;
  badge: RecipeBadge;
  font: string;
  colors: { badge_bg: string; mark_fg: string; text: string };
  overrides: {
    mark_offset: [number, number];
    mark_scale: number;
    name_offset: [number, number];
    name_scale: number;
  };
}
