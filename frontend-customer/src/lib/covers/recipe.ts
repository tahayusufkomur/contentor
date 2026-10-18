// Helpers over a cover recipe. KEEP IN SYNC with backend/apps/media/design_recipe.py: the shape,
// the defaults and the constants are the same (see types/design.ts).

import type { CoverAspect } from "@shared/sections/types";
import { BADGE_KINDS, PARTS, SIZES } from "@/types/design";
import type {
  BadgeKind,
  CoverItem,
  CoverRecipe,
  CoverSize,
  Frame,
  LayoutId,
  Paint,
  PartId,
} from "@/types/design";
import { layoutFrames } from "./layouts";

export { SIZES };

/** The ranges the server clamps numbers to (backend/apps/media/design_recipe.py; recipe.test.ts pins
 *  them). Every slider and drag in the studio stays inside them, so what she sees is what is saved. */
export const RANGES = {
  focus: [0, 1],
  zoom: [1, 3],
  brightness: [0.5, 1.5],
  contrast: [0.5, 1.5],
  saturation: [0.5, 1.5],
  darken: [0, 0.7],
  scale: [0.5, 2],
  tracking: [-0.05, 0.3],
  leading: [0.9, 1.6],
  opacity: [0.1, 1],
  /** A frame, in fractions of its canvas. */
  frame: { x: [-0.5, 1.5], y: [-0.5, 1.5], w: [0.02, 2], h: [0.02, 2] },
} as const;

const WIDE = 16 / 9;
const BANNER = 3;
const DAY = 86_400_000;
export type GenerationAspect = "16:9" | "1:1" | "4:3" | "9:16" | "4:5";
/** The shapes the photo generation endpoint can draw. */
const GENERATION: [ratio: GenerationAspect, aspect: number][] = [
  ["16:9", 16 / 9],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["9:16", 9 / 16],
  ["4:5", 4 / 5],
];

/** Width over height of a size: the look's own for Card, 16/9 for Wide, 3 for Banner. */
export function sizeAspect(size: CoverSize, cardAspect: CoverAspect): number {
  if (size === "wide") return WIDE;
  if (size === "banner") return BANNER;
  const [w, h] = cardAspect.split("/").map(Number);
  return w / h;
}

/** The index of the aspect nearest `aspect`, by ratio (a frame twice as wide is as far as one half as wide). */
const nearest = (aspect: number, candidates: number[]) =>
  candidates.reduce(
    (best, candidate, i) =>
      Math.abs(Math.log(aspect / candidate)) <
      Math.abs(Math.log(aspect / candidates[best]))
        ? i
        : best,
    0,
  );

/** The size a frame of this aspect shows. */
export function nearestSize(
  frameAspect: number,
  cardAspect: CoverAspect,
): CoverSize {
  return SIZES[
    nearest(
      frameAspect,
      SIZES.map((size) => sizeAspect(size, cardAspect)),
    )
  ];
}

/** The generation endpoint's aspect closest to the Card shape. */
export function nearestGenerationAspect(card: CoverAspect): GenerationAspect {
  return GENERATION[
    nearest(
      sizeAspect("card", card),
      GENERATION.map(([, aspect]) => aspect),
    )
  ][0];
}

/** The layers a recipe draws at one size, by layer id: the layout's frames for the parts that are
 *  drawn, then her extras, then the frames she set for this size alone. A part that is not drawn
 *  (an empty label or subtitle, a removed part, no logo, no badge) has no frame, and a frame set
 *  for a layer that is not drawn is ignored. */
export function framesFor(
  recipe: CoverRecipe,
  size: CoverSize,
  cardAspect: CoverAspect,
): Record<string, Frame> {
  const { words, styles } = recipe;
  const hidden = (part: PartId) => styles[part]?.hidden === true;
  const base = layoutFrames(recipe.layout, sizeAspect(size, cardAspect), {
    label: words.label.trim() !== "" && !hidden("label"),
    title: !hidden("title"),
    subtitle: words.subtitle.trim() !== "" && !hidden("subtitle"),
    // A title-only cover stacks its badge with the words, so it has room for it only while it is drawn.
    badge: recipe.badge.kind !== "none" && !hidden("badge"),
  });
  const drawn = (part: PartId) =>
    !hidden(part) &&
    (part !== "logo" || recipe.logo) &&
    (part !== "badge" || recipe.badge.kind !== "none");
  const frames: Record<string, Frame> = {};
  for (const part of PARTS) {
    const frame = base[part];
    if (frame && drawn(part)) frames[part] = frame;
  }
  for (const extra of recipe.extras) frames[extra.id] = extra.frame;
  for (const [id, frame] of Object.entries(recipe.overrides[size] ?? {})) {
    if (id in frames) frames[id] = frame;
  }
  return frames;
}

/** Every layer id, bottom to top. The band is drawn over its photo; extras stack above the parts,
 *  in the order she added them. Not every id is drawn: see framesFor. */
export function layerOrder(recipe: CoverRecipe): string[] {
  return [
    ...(recipe.layout === "band" ? ["photo", "panel"] : ["panel", "photo"]),
    "label",
    "title",
    "subtitle",
    "logo",
    "badge",
    ...recipe.extras.map((extra) => extra.id),
  ];
}

/** The badge kinds worth offering for a target ("course", or an event's kind): a course has no date to
 *  show and an event is never new. The kind it has now stays in the list. Without a target, all of them. */
export function badgeKindsFor(
  targetKind: string | undefined,
  current: BadgeKind,
): BadgeKind[] {
  return BADGE_KINDS.filter(
    (kind) =>
      kind === current ||
      targetKind === undefined ||
      (targetKind === "course" ? kind !== "date" : kind !== "new"),
  );
}

/** The colour the cover's panel is drawn in: none while she has deleted it (it is not drawn, so no swatch is
 *  on and every one of them, the colour it has too, brings it back). */
export function panelPaint(recipe: CoverRecipe): Paint | undefined {
  return recipe.styles.panel?.hidden ? undefined : recipe.panel;
}

/** The recipe a new cover starts from: the contract's defaults, then her set (the layout and
 *  colours of the cover she kept last), then the layout and photo asked for. */
export function defaultRecipe(
  opts: {
    layout?: LayoutId;
    photoId?: string | null;
    set?: CoverRecipe | null;
  } = {},
): CoverRecipe {
  const recipe: CoverRecipe = {
    version: 1,
    layout: "panel",
    photo: {
      id: null,
      focus: [0.5, 0.5],
      zoom: 1,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      darken: 0,
    },
    words: { label: "", title: null, subtitle: "" },
    badge: { kind: "none", text: "", fill: "accent" },
    logo: true,
    panel: "primary",
    styles: {},
    extras: [],
    overrides: {},
  };
  if (opts.set) Object.assign(recipe, fromSet(opts.set));
  if (opts.layout) recipe.layout = opts.layout;
  if (opts.photoId) recipe.photo.id = opts.photoId;
  return recipe;
}

/** What "your set" carries to another item: the layout, the colours and styles, the badge and the
 *  logo, not the words, photo, extras or frames. A copy. */
export function fromSet(
  kept: CoverRecipe,
): Pick<CoverRecipe, "layout" | "panel" | "styles" | "badge" | "logo"> {
  return structuredClone({
    layout: kept.layout,
    panel: kept.panel,
    styles: kept.styles,
    badge: kept.badge,
    logo: kept.logo,
  });
}

/** The words a cover shows for an item, as of `now`. The title is the item's own until she types
 *  another. The badge is null when its kind has nothing to say: New after 30 days, the date once
 *  the session has begun, text she left blank. */
export function resolveWords(
  recipe: CoverRecipe,
  item: CoverItem,
  now: Date,
): { label: string; title: string; subtitle: string; badge: string | null } {
  const { words, badge } = recipe;
  return {
    label: words.label,
    title: words.title ?? item.title,
    subtitle: words.subtitle,
    badge: badgeText(badge, item, now),
  };
}

function badgeText(
  badge: CoverRecipe["badge"],
  item: CoverItem,
  now: Date,
): string | null {
  switch (badge.kind) {
    case "new":
      return item.createdAt &&
        now.getTime() - new Date(item.createdAt).getTime() <= 30 * DAY
        ? "New"
        : null;
    case "date": {
      // In the item's time zone, as calendar-utils prints event dates; without one, the viewer's
      // (a server render and the browser can then print different days near midnight).
      const start = item.startsAt ? new Date(item.startsAt) : null;
      return start && start >= now
        ? start.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: item.timeZone || undefined,
          })
        : null;
    }
    case "live":
      return "Live";
    case "text":
      return badge.text.trim() ? badge.text : null;
    default:
      return null;
  }
}
