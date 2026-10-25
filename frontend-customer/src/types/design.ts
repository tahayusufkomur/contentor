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
  "cutout",
] as const;
/** The sizes her site shows a cover in. CoverArt picks the nearest of them by the frame's shape. */
export const SIZES = ["card", "wide", "banner"] as const;
/** The sizes a design is downloaded in for social posts: drawn only when asked for by name. */
export const SOCIAL_SIZES = ["post", "portrait", "story"] as const;
/** Every size a design has frames for. */
export const ALL_SIZES = [...SIZES, ...SOCIAL_SIZES] as const;
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
export const SHAPES = [
  "rect",
  "circle",
  "arch",
  "line",
  "pill",
  "star",
  "burst",
  "arrow",
] as const;
export const WEIGHTS = [400, 500, 600, 700, 800] as const;
/** A grade on the photo: a look's photo treatment ("site" is her look's own), or a duotone in her colours. */
export const GRADES = [
  "none",
  "site",
  "mono",
  "soft",
  "tint",
  "vivid",
  "duo",
  "duo-accent",
] as const;
/** The photo's frame cut to a shape. */
export const MASKS = ["none", "rounded", "circle", "arch", "blob"] as const;
export const TEXT_EFFECTS = ["lift", "shadow", "outline", "highlight"] as const;
/** The icons an icon layer can draw: lucide's names (components/covers/cover-icons.tsx draws them). */
export const ICONS = [
  "calendar",
  "clock",
  "map-pin",
  "video",
  "mic",
  "users",
  "user",
  "heart",
  "star",
  "sparkles",
  "sun",
  "moon",
  "leaf",
  "flower",
  "mountain",
  "waves",
  "flame",
  "zap",
  "check",
  "circle-check",
  "play",
  "gift",
  "award",
  "trophy",
  "target",
  "book-open",
  "graduation-cap",
  "pen-tool",
  "palette",
  "camera",
  "music",
  "dumbbell",
  "brain",
  "coffee",
  "smile",
  "globe",
  "mail",
  "phone",
  "arrow-right",
  "chevron-right",
] as const;
export const MAX_EXTRAS = 12;
export const TEXT_MAX = {
  label: 40,
  title: 90,
  subtitle: 140,
  badge: 24,
  extra: 140,
  qr: 300,
} as const;

export type LayoutId = (typeof LAYOUTS)[number];
/** Card is the look's own shape, Wide is 16/9, Banner is 3/1; Post is 1/1, Portrait 4/5 and Story 9/16. */
export type CoverSize = (typeof ALL_SIZES)[number];
export type SiteSize = (typeof SIZES)[number];
/** The fixed layers every layout can draw. */
export type PartId = (typeof PARTS)[number];
export type BadgeKind = (typeof BADGE_KINDS)[number];
export type FontRole = (typeof FONT_ROLES)[number];
export type PaintRole = (typeof PAINT_ROLES)[number];
export type ShapeKind = (typeof SHAPES)[number];
export type Weight = (typeof WEIGHTS)[number];
export type Grade = (typeof GRADES)[number];
export type Mask = (typeof MASKS)[number];
export type TextEffect = (typeof TEXT_EFFECTS)[number];
export type IconName = (typeof ICONS)[number];

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
  /** A shadow, an outline or a colour band behind the words; none is plain. */
  effect?: TextEffect;
  /** The effect's colour; none is the effect's own (see CoverArt). */
  effectColor?: Paint;
  /** The colour of the words she marked `*like this*`; none is the accent. */
  emphasis?: Paint;
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
    }
  | {
      id: string;
      type: "icon";
      icon: IconName;
      fill: Paint;
      opacity: number;
      frame: Frame;
    }
  /** A QR code of a web address (`text`): `fill` is its squares, `back` the ground under them. */
  | {
      id: string;
      type: "qr";
      text: string;
      fill: Paint;
      back: Paint;
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
    // A recipe saved before these existed has none of them: each reads as its default (CoverArt).
    grade?: Grade;
    /** -1 is cool, 1 warm. */
    warmth?: number;
    blur?: number;
    mask?: Mask;
    flip?: boolean;
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
  /** The page of her site it is on ("/courses/<slug>", "/events", "/store"): what a QR code opens. */
  path?: string;
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
  /** The image model can change her photos (extend, take out, change). */
  photo_ai?: boolean;
  /** Her photos' backgrounds can be removed. */
  cutout?: boolean;
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
