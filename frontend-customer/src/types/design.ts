// The recipe a cover is drawn from, and the payload that carries it to a page.
// KEEP IN SYNC: backend/apps/media/design_recipe.py holds the same constants, ranges and defaults
// (lib/covers/__tests__/recipe.test.ts compares the constants with that file).

export const LAYOUTS = [
  "panel",
  "full",
  "title",
  "band",
  "framed",
  "photo",
] as const;
export const SIZES = ["card", "wide", "banner"] as const;
export const PARTS = [
  "photo",
  "panel",
  "label",
  "title",
  "subtitle",
  "logo",
  "badge",
] as const;
export const BADGE_KINDS = ["none", "new", "date", "live", "text"] as const;
export const FONT_ROLES = ["display", "body"] as const;
export const PAINT_ROLES = [
  "primary",
  "accent",
  "ink",
  "paper",
  "surface",
  "inverse",
  "inverse-ink",
  "primary-light",
  "primary-dark",
  "accent-light",
  "accent-dark",
  "white",
  "black",
] as const;
export const SHAPES = ["rect", "circle", "arch", "line"] as const;
export const WEIGHTS = [400, 500, 600, 700, 800] as const;
export const MAX_EXTRAS = 12;
export const TEXT_MAX = {
  label: 40,
  title: 90,
  subtitle: 140,
  badge: 24,
  extra: 140,
} as const;

export type LayoutId = (typeof LAYOUTS)[number];
/** Card is the look's own shape, Wide is 16/9, Banner is 3/1. */
export type CoverSize = (typeof SIZES)[number];
/** The fixed layers every layout can draw. */
export type PartId = (typeof PARTS)[number];
export type BadgeKind = (typeof BADGE_KINDS)[number];
export type FontRole = (typeof FONT_ROLES)[number];
export type PaintRole = (typeof PAINT_ROLES)[number];
export type ShapeKind = (typeof SHAPES)[number];
export type Weight = (typeof WEIGHTS)[number];

/** A palette role (it follows a look change) or `#rrggbb` (it does not). */
export type Paint = PaintRole | `#${string}`;

/** Fractions of one size's canvas. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every key is optional: an omitted key means the layout's own. */
export interface PartStyle {
  scale?: number;
  weight?: Weight;
  upper?: boolean;
  tracking?: number;
  leading?: number;
  align?: "left" | "center" | "right";
  color?: Paint;
  font?: FontRole;
  /** A fixed part she removed. */
  hidden?: boolean;
}

/** A layer she added. They stack above the fixed parts, in array order. */
export type Extra =
  | { id: string; type: "text"; text: string; style: PartStyle; frame: Frame }
  | { id: string; type: "badge"; text: string; fill: Paint; frame: Frame }
  | {
      id: string;
      type: "shape";
      shape: ShapeKind;
      fill: Paint;
      opacity: number;
      frame: Frame;
    };

export interface CoverRecipe {
  version: 1;
  layout: LayoutId;
  photo: {
    id: string | null;
    focus: [number, number];
    zoom: number;
    brightness: number;
    contrast: number;
    saturation: number;
    darken: number;
  };
  /** `title: null` is the item's own title. */
  words: { label: string; title: string | null; subtitle: string };
  badge: { kind: BadgeKind; text: string; fill: Paint };
  logo: boolean;
  panel: Paint;
  styles: Partial<Record<PartId, PartStyle>>;
  extras: Extra[];
  /** A frame for one layer at one size, replacing the layout's. */
  overrides: Partial<Record<CoverSize, Record<string, Frame>>>;
}

/** What a page needs to draw a kept cover (`cover_for` on the backend). */
export interface CoverDesign {
  id: string;
  recipe: CoverRecipe;
  /** Photo id to signed URL; a photo with no row is left out. */
  photos: Record<string, string>;
  logo_url: string | null;
  /** `<style id>` or `<style id>:<palette id>`. */
  look: string;
}

/** The course or event a cover is drawn for. */
export interface CoverItem {
  title: string;
  createdAt?: string | null;
  startsAt?: string | null;
  /** The zone the date badge reads `startsAt` in (the tenant's); none is the viewer's own. */
  timeZone?: string | null;
}

// The studio's API (backend/apps/media/design_views.py, design_serializers.py).

/** A course, download or event series the studio can put a cover on (`GET /designs/targets/`). */
export interface DesignTarget {
  /** "course", "download", or an event kind: "live", "stream", "zoom" or "onsite". */
  target_kind: string;
  /** A course's or download's id, or an event series' exact title. */
  target_key: string;
  title: string;
  /** Sessions in an event series; null for a course or download. */
  sessions: number | null;
  /** The next session still to come (ISO); null for a course or download, or a series with none. */
  next_at: string | null;
  /** A course's or download's state; null for an event series. */
  status: "published" | "draft" | null;
  /** When a course or download was made (ISO), which its "New" badge reads; null for an event series. */
  created_at: string | null;
  /** The picture it wears now, a signed link; null for none. */
  photo_url: string | null;
  /** The kept cover it wears; null when it shows a plain photo, or none. */
  cover: CoverDesign | null;
  /** Its open draft, if she has one. */
  draft_id: string | null;
}

export interface DesignTargets {
  /** Her courses in her order, then her event series, then her downloads. */
  targets: DesignTarget[];
  /** Catalog photos already on a course or series: asset id to the title wearing it. */
  in_use: Record<string, string>;
  /** `<style id>` or `<style id>:<palette id>`. */
  look: string;
  logo_url: string | null;
  /** New photos she can still make this month. */
  generations_left: number;
}

/** A design as the API sends it: a draft or kept cover, with what the renderer needs to draw it. */
export interface DesignRecord extends CoverDesign {
  kind: string;
  target_kind: string;
  target_key: string;
  state: "draft" | "kept" | "retired";
  /** "" when she made it herself, else the key of the specialist who did. */
  made_by: string;
  run_id: string;
  created_at: string;
  updated_at: string;
  kept_at: string | null;
  /** The title of its target. */
  title: string;
}

/** `POST /designs/<id>/keep/`: what Keep did, and the History row that undoes it. */
export interface KeepResponse {
  result: {
    /** The course, or the first session of the series. */
    id: number | string;
    design_id: string;
    title: string;
    target_kind: string;
    target_key: string;
  };
  /** Null when the History row could not be written (the cover is kept all the same). */
  audit_id: number | null;
}
