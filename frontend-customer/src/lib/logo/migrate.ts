// v1 → v2 recipe migration. Pure, lossless for everything v1 could express.
// KEEP IN SYNC: backend/apps/tenant_config/logo_recipe.py implements the
// identical upgrade in Python — change both together (parity fixture:
// __tests__/migrate.test.ts / tests/test_logo_recipe.py).
import type {
  AnyLogoRecipe,
  LogoMark,
  LogoRecipe,
  TextStyle,
} from "@/types/logo";

export function isRecipe(value: unknown): value is AnyLogoRecipe {
  if (!value || typeof value !== "object") return false;
  const v = (value as { version?: unknown }).version;
  return v === 1 || v === 2;
}

export function migrateRecipe(recipe: AnyLogoRecipe): LogoRecipe {
  if (recipe.version === 2) return recipe;
  const mark: LogoMark =
    recipe.mark.type === "icon"
      ? { type: "icon", icon: recipe.mark.icon, style: "outline" }
      : recipe.mark.type === "image"
        ? {
            type: "image",
            photo_id: recipe.mark.photo_id,
            url: recipe.mark.url,
          }
        : { type: "initials", style: "plain" };
  const name: TextStyle = {
    font: recipe.font,
    weight: 700,
    tracking: 0,
    case: "none",
  };
  return {
    version: 2,
    layout: recipe.layout === "name_only" ? "name_only" : "horizontal",
    name: recipe.name,
    tagline: "",
    mark,
    badge: { shape: recipe.badge, outline: false },
    typography: {
      name,
      tagline: {
        font: recipe.font,
        weight: 500,
        tracking: 0.08,
        case: "upper",
      },
    },
    colors: {
      palette_id: null,
      badge: { type: "solid", color: recipe.colors.badge_bg },
      mark: recipe.colors.mark_fg,
      text: recipe.colors.text,
      tagline: "#6b7280",
    },
    elements: {
      mark: {
        offset: recipe.overrides.mark_offset,
        scale: recipe.overrides.mark_scale,
      },
      name: {
        offset: recipe.overrides.name_offset,
        scale: recipe.overrides.name_scale,
      },
      tagline: { offset: [0, 0], scale: 1 },
    },
  };
}
