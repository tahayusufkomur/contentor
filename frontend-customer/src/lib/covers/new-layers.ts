// The layers the editor's drawers add to a cover: a title, a line of text, a badge, a shape. Each comes with
// a place and a size that read on any cover, and the id the reducer will keep (lib/covers/editor.ts).
//
// The sizes are in cqmin, the unit the layouts are written in (1% of the canvas's smaller side), so a layer
// has the same weight on a tall Card and on a Banner; they become fractions of the canvas for `aspect`
// (width over height), the shape of the size she is editing.

import { newExtraId } from "@/lib/covers/editor";
import { RANGES } from "@/lib/covers/recipe";
import type {
  CoverRecipe,
  Extra,
  Frame,
  PartStyle,
  ShapeKind,
} from "@/types/design";

/** From the edge of the canvas to what the layouts put on it. */
const MARGIN = 5.5;
/** How far each layer already added moves the next one across and down, so they do not sit on one another
 *  (it wraps after five). */
const STEP = [2.5, 3.5] as const;
const STEPS = 5;

/** A box in cqmin as a frame, kept inside the ranges the server clamps to. */
function frameOf(
  aspect: number,
  [x, y, w, h]: readonly [number, number, number, number],
): Frame {
  const width = 100 * Math.max(1, aspect);
  const height = 100 / Math.min(1, aspect);
  const side = (value: number, [low, high]: readonly [number, number]) =>
    Math.round(Math.min(high, Math.max(low, value)) * 1e4) / 1e4;
  return {
    x: side(x / width, RANGES.frame.x),
    y: side(y / height, RANGES.frame.y),
    w: side(w / width, RANGES.frame.w),
    h: side(h / height, RANGES.frame.h),
  };
}

/** The canvas in cqmin, and how far the next layer is moved from where the first goes. */
function canvas(recipe: CoverRecipe, aspect: number) {
  const n = recipe.extras.length % STEPS;
  return {
    width: 100 * Math.max(1, aspect),
    height: 100 / Math.min(1, aspect),
    across: STEP[0] * n,
    down: STEP[1] * n,
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
  aspect: number,
  text: string,
): Extract<Extra, { type: "text" }> {
  const c = canvas(recipe, aspect);
  const { style, at, h } = TEXT[kind];
  return {
    id: newExtraId(recipe),
    type: "text",
    text,
    style: { ...style },
    frame: frameOf(aspect, [
      MARGIN + c.across,
      at * c.height + c.down,
      Math.min(c.width - 2 * MARGIN, 76),
      h,
    ]),
  };
}

/** Each shape's size in cqmin. A circle is as wide as it is high on the screen; a line is as thin as the
 *  server lets a frame be on a canvas that is tall for its width. */
const SHAPE: Record<ShapeKind, [w: number, h: number]> = {
  rect: [36, 24],
  circle: [28, 28],
  arch: [24, 34],
  line: [40, 2],
};

export function newShapeExtra(
  recipe: CoverRecipe,
  shape: ShapeKind,
  aspect: number,
): Extract<Extra, { type: "shape" }> {
  const c = canvas(recipe, aspect);
  const [w, h] = SHAPE[shape];
  return {
    id: newExtraId(recipe),
    type: "shape",
    shape,
    fill: "accent",
    opacity: 1,
    // right of the middle and above it, where the layouts leave room: the words sit low and at the left
    frame: frameOf(aspect, [
      0.62 * c.width - w / 2 + c.across,
      0.38 * c.height - h / 2 + c.down,
      w,
      h,
    ]),
  };
}

/** The badge's size in cqmin: as the layouts give the fixed one. */
const BADGE = [32, 8] as const;

export function newBadgeExtra(
  recipe: CoverRecipe,
  aspect: number,
  text: string,
): Extract<Extra, { type: "badge" }> {
  const c = canvas(recipe, aspect);
  return {
    id: newExtraId(recipe),
    type: "badge",
    text,
    fill: "accent",
    // at the top right, where the fixed badge sits, a little left and down for each layer already added
    frame: frameOf(aspect, [
      c.width - MARGIN - BADGE[0] - c.across,
      MARGIN + c.down,
      BADGE[0],
      BADGE[1],
    ]),
  };
}
