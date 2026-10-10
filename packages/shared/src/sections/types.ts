import familiesJson from "./families.json";

/** The section manifest (families.json) is the single catalog shared by the
 *  tenant renderer, the editor registry, the wizard Style step and (via a
 *  synced copy) the backend validator + AI composer. */
export const SECTION_MANIFEST = familiesJson;

export type FamilyId = keyof typeof familiesJson.families;

export const FAMILY_IDS = Object.keys(familiesJson.families) as FamilyId[];

export type RecipePage = keyof typeof familiesJson.recipes;

/** A page's section order: the style's own (`style.recipes`) when it has one,
 *  else the manifest's. Entries are `family` or `family:variant`. */
export function styleRecipe(
  style: Pick<SiteStyle, "recipes"> | undefined,
  page: RecipePage,
): readonly string[] {
  return style?.recipes?.[page] ?? familiesJson.recipes[page];
}

export interface FamilyField {
  type: "text" | "richtext" | "link" | "image" | "items" | "select" | "bool";
  label: string;
  max?: number;
  required?: boolean;
  aspect?: string;
  role?: string;
  min?: number;
  itemLabel?: string;
  options?: string[];
  default?: string | boolean;
  fields?: Record<string, FamilyField>;
}

export interface Family {
  label: string;
  kind: "content" | "dynamic";
  source?: "courses" | "plans" | "events";
  imageHeavy: boolean;
  fields: Record<string, FamilyField>;
}

export const FAMILIES = familiesJson.families as unknown as Record<
  FamilyId,
  Family
>;

/** Compact palette a style defines; expanded to the full theme variable set
 *  by the renderer so every portal page (catalog, checkout, account) also
 *  wears the style. All values are CSS colors (oklch preferred). */
export interface SiteStylePalette {
  background: string;
  surface: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  /** Color-blocked section background (e.g. a dark band) and its text. */
  inverse: string;
  inverseForeground: string;
}

/** An alternative colourway a style ships. Fonts, radius, photo words and
 *  layouts stay the style's; only the palette changes. */
export interface SitePaletteVariant {
  id: string;
  label: string;
  mood: string;
  palette: SiteStylePalette;
}

export interface SiteStyle {
  id: string;
  label: string;
  mood: string;
  /** Niche ids this style suits best — ranks the wizard Style step. */
  niches: string[];
  /** Tones of voice (warm, energetic, calm, expert, playful) the style
   *  carries — a tone the coach asked for lifts it in the ranking. */
  tones?: string[];
  /** What the look is for, filterable on /setup (see STYLE_TAGS in
   *  frontend-customer/src/lib/site-styles.ts): selling, expertise, short,
   *  long, sensual, confident, sexy, playful. */
  tags?: string[];
  /** Build/display order. */
  order: number;
  /** Only enabled styles are offered to coaches. */
  enabled: boolean;
  /** The home hero's composition (split, poster, photo, arch, titlepage,
   *  fullbleed, collage, giant, cover, centered): /setup shows one look per
   *  layout first, the rest grouped under it. Labels live in the backend's
   *  HERO_LAYOUTS (apps/tenant_config/sections.py). */
  heroLayout?: string;
  /** Pages this style orders itself (home today); the rest follow the
   *  manifest's recipes. Entries are `family` or `family:variant`. */
  recipes?: Partial<Record<RecipePage, string[]>>;
  /** How the style builds the body sections that vary most (story, benefits,
   *  howItWorks): two styles sharing a hero layout must differ in at least
   *  two of them. Vocabulary is checked by scripts/sync_sections.py. */
  bodyLayouts?: Partial<Record<"story" | "benefits" | "howItWorks", string>>;
  fonts: {
    display: string;
    body: string;
    /** Google Fonts css2 query, e.g. "family=Fraunces:wght@300..700&family=Inter+Tight:wght@400;500;600". */
    googleQuery: string;
  };
  palette: SiteStylePalette;
  /** Name of the style's own `palette` as shown beside the alternatives. */
  paletteLabel: string;
  /** Alternative colourways; a look is `<style.id>` or `<style.id>:<palette.id>`. */
  palettes: SitePaletteVariant[];
  /** Base radius (CSS length) — drives Tailwind rounded-sm/md/lg. */
  radius: string;
  /** Appended to every stock-photo search so a site's photos share one look. */
  photoWords: string;
  /** Layout variants this style ships per family; the first is the default.
   *  `hero` must include "intro" (compact hero for inner pages). */
  variants: Record<FamilyId, string[]>;
}
