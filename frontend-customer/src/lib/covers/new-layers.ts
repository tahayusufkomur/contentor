// The layers the editor's drawers add to a cover: a title, a line of text, a badge, a shape, an icon, a QR
// code. Each comes with
// a place and a size that read on any cover, and the id the reducer will keep (lib/covers/editor.ts).
//
// The sizes are in cqmin, the unit the layouts are written in (1% of the canvas's smaller side), so a layer
// has the same weight on a tall Card and on a Banner. A frame is a share of its size's canvas, and a layer
// has one base frame that Wide and Banner reuse unless they have their own: so a new layer gets a frame for
// each size, built the same way for the shape of each, and the same box in cqmin stays the same shape on
// all three (a circle round, a line thin) at the same share of the canvas.

import { newExtraId } from "@/lib/covers/editor";
import { RANGES, sizeAspect } from "@/lib/covers/recipe";
import { ALL_SIZES } from "@/types/design";
import type {
  CoverRecipe,
  CoverSize,
  Extra,
  Frame,
  IconName,
  PartStyle,
  ShapeKind,
} from "@/types/design";
import type { CoverAspect } from "@shared/sections/types";

/** What an `addExtra` edit takes: the extra, whose own `frame` is the Card's, and its frame at the other
 *  sizes. One edit, so one Undo takes the layer from all three. */
export interface NewLayer<E extends Extra = Extra> {
  extra: E;
  frames: Partial<Record<CoverSize, Frame>>;
}

/** From the edge of the canvas to what the layouts put on it. */
const MARGIN = 5.5;
/** How far each layer already added moves the next one across and down, so they do not sit on one another
 *  (it wraps after five). */
const STEP = [2.5, 3.5] as const;
const STEPS = 5;

/** A canvas in cqmin, and how far the next layer is moved from where the first goes. */
interface Canvas {
  width: number;
  height: number;
  across: number;
  down: number;
}

function canvas(recipe: CoverRecipe, aspect: number): Canvas {
  const n = recipe.extras.length % STEPS;
  return {
    width: 100 * Math.max(1, aspect),
    height: 100 / Math.min(1, aspect),
    across: STEP[0] * n,
    down: STEP[1] * n,
  };
}

/** A box in cqmin as a frame of canvas `c`, kept inside the ranges the server clamps to. */
function frameOf(
  c: Canvas,
  [x, y, w, h]: readonly [number, number, number, number],
): Frame {
  const side = (value: number, [low, high]: readonly [number, number]) =>
    Math.round(Math.min(high, Math.max(low, value)) * 1e4) / 1e4;
  return {
    x: side(x / c.width, RANGES.frame.x),
    y: side(y / c.height, RANGES.frame.y),
    w: side(w / c.width, RANGES.frame.w),
    h: side(h / c.height, RANGES.frame.h),
  };
}

/** The layer's frame at each size, from `box`, which says where it goes on a canvas (in cqmin) of the shape
 *  of that size. */
function framed(
  recipe: CoverRecipe,
  cardAspect: CoverAspect,
  box: (c: Canvas) => readonly [number, number, number, number],
) {
  const at = (size: CoverSize) => {
    const c = canvas(recipe, sizeAspect(size, cardAspect));
    return frameOf(c, box(c));
  };
  return {
    frame: at("card"),
    frames: Object.fromEntries(
      ALL_SIZES.filter((size) => size !== "card").map((size) => [
        size,
        at(size),
      ]),
    ) as NewLayer["frames"],
  };
}

export type TextKind = "title" | "subtitle" | "line";

/** How each kind of text is set, and where its box sits (`at`: a share of the canvas's height; `h`: its
 *  height in cqmin, enough for the lines named). A text layer is drawn the size of a subtitle, times its
 *  `scale`. */
const TEXT: Record<TextKind, { style: PartStyle; at: number; h: number }> = {
  // two lines of about the size a layout gives its title
  title: {
    style: { font: "display", weight: 700, scale: 1.7, leading: 1.1 },
    at: 0.3,
    h: 22,
  },
  // two lines
  subtitle: {
    style: { font: "body", weight: 500, scale: 1.1 },
    at: 0.52,
    h: 17,
  },
  // two lines, small
  line: { style: { font: "body", weight: 400, scale: 0.8 }, at: 0.68, h: 12 },
};

export function newTextExtra(
  recipe: CoverRecipe,
  kind: TextKind,
  cardAspect: CoverAspect,
  text: string,
): NewLayer<Extract<Extra, { type: "text" }>> {
  const { style, at, h } = TEXT[kind];
  const { frame, frames } = framed(recipe, cardAspect, (c) => [
    MARGIN + c.across,
    at * c.height + c.down,
    Math.min(c.width - 2 * MARGIN, 76),
    h,
  ]);
  return {
    extra: {
      id: newExtraId(recipe),
      type: "text",
      text,
      style: { ...style },
      frame,
    },
    frames,
  };
}

/** Each shape's size in cqmin. A circle is as wide as it is high on the screen. A line is the thinnest the
 *  server lets a frame be on the tallest Card (3/4: a frame is 0.02 high at least, 2.67 cqmin of 133), so
 *  that it is as thick on every size and the frame is not clamped on any. */
const SHAPE: Record<ShapeKind, [w: number, h: number]> = {
  rect: [36, 24],
  circle: [28, 28],
  arch: [24, 34],
  line: [40, 2.7],
  pill: [36, 12],
  star: [26, 26],
  burst: [30, 30],
  arrow: [34, 16],
};

export function newShapeExtra(
  recipe: CoverRecipe,
  shape: ShapeKind,
  cardAspect: CoverAspect,
): NewLayer<Extract<Extra, { type: "shape" }>> {
  const [w, h] = SHAPE[shape];
  // right of the middle and above it, where the layouts leave room: the words sit low and at the left
  const { frame, frames } = framed(recipe, cardAspect, (c) => [
    0.62 * c.width - w / 2 + c.across,
    0.38 * c.height - h / 2 + c.down,
    w,
    h,
  ]);
  return {
    extra: {
      id: newExtraId(recipe),
      type: "shape",
      shape,
      fill: "accent",
      opacity: 1,
      frame,
    },
    frames,
  };
}

/** The badge's size in cqmin: as the layouts give the fixed one. */
const BADGE = [32, 8] as const;

export function newBadgeExtra(
  recipe: CoverRecipe,
  cardAspect: CoverAspect,
  text: string,
): NewLayer<Extract<Extra, { type: "badge" }>> {
  // at the top right, where the fixed badge sits, a little left and down for each layer already added
  const { frame, frames } = framed(recipe, cardAspect, (c) => [
    c.width - MARGIN - BADGE[0] - c.across,
    MARGIN + c.down,
    BADGE[0],
    BADGE[1],
  ]);
  return {
    extra: {
      id: newExtraId(recipe),
      type: "badge",
      text,
      fill: "accent",
      frame,
    },
    frames,
  };
}

/** An icon's box in cqmin: about a line of title high. */
const ICON = 14;

export function newIconExtra(
  recipe: CoverRecipe,
  icon: IconName,
  cardAspect: CoverAspect,
): NewLayer<Extract<Extra, { type: "icon" }>> {
  // where a new shape goes: right of the middle and above it
  const { frame, frames } = framed(recipe, cardAspect, (c) => [
    0.62 * c.width - ICON / 2 + c.across,
    0.38 * c.height - ICON / 2 + c.down,
    ICON,
    ICON,
  ]);
  return {
    extra: {
      id: newExtraId(recipe),
      type: "icon",
      icon,
      fill: "accent",
      opacity: 1,
      frame,
    },
    frames,
  };
}

/** A QR code's box in cqmin: big enough for a phone held at arm's length to a poster. */
const QR = 26;

export function newQrExtra(
  recipe: CoverRecipe,
  link: string,
  cardAspect: CoverAspect,
): NewLayer<Extract<Extra, { type: "qr" }>> {
  // in the bottom right corner, where the layouts leave the most room
  const { frame, frames } = framed(recipe, cardAspect, (c) => [
    c.width - MARGIN - QR - c.across,
    c.height - MARGIN - QR - c.down,
    QR,
    QR,
  ]);
  return {
    extra: {
      id: newExtraId(recipe),
      type: "qr",
      text: link,
      fill: "black",
      back: "white",
      frame,
    },
    frames,
  };
}
