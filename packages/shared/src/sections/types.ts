import familiesJson from "./families.json";

/** The section manifest (families.json) is the single catalog shared by the
 *  tenant renderer, the editor registry, the wizard Style step and (via a
 *  synced copy) the backend validator + AI composer. */
export const SECTION_MANIFEST = familiesJson;

export type FamilyId = keyof typeof familiesJson.families;

export const FAMILY_IDS = Object.keys(familiesJson.families) as FamilyId[];

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

export interface SiteStyle {
  id: string;
  label: string;
  mood: string;
  /** Niche ids this style suits best — ranks the wizard Style step. */
  niches: string[];
  /** Build/display order. */
  order: number;
  /** Only enabled styles are offered to coaches. */
  enabled: boolean;
  fonts: {
    display: string;
    body: string;
    /** Google Fonts css2 query, e.g. "family=Fraunces:wght@300..700&family=Inter+Tight:wght@400;500;600". */
    googleQuery: string;
  };
  palette: SiteStylePalette;
  /** Base radius (CSS length) — drives Tailwind rounded-sm/md/lg. */
  radius: string;
  /** Appended to every stock-photo search so a site's photos share one look. */
  photoWords: string;
  /** Layout variants this style ships per family; the first is the default.
   *  `hero` must include "intro" (compact hero for inner pages). */
  variants: Record<FamilyId, string[]>;
}
