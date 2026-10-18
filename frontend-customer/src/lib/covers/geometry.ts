// Frame maths for the studio canvas: pure functions over fractions of one size's canvas, the numbers
// `framesFor` (recipe.ts) returns. The canvas gives each the frame as it was when the pointer went down
// and the pointer's whole travel since, so nothing builds up, and a drag that comes back to where it
// began gives the frame back. Results stay inside the ranges the server keeps (RANGES), so what she sees
// is what is saved.

import type { Frame } from "@/types/design";
import { RANGES } from "./recipe";

export type Handle = "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";

type Range = readonly [number, number];
const clamp = (value: number, [lo, hi]: Range) =>
  Math.min(hi, Math.max(lo, value));

/** A frame inside the ranges the server keeps. */
function inRange(frame: Frame): Frame {
  const { x, y, w, h } = RANGES.frame;
  return {
    x: clamp(frame.x, x),
    y: clamp(frame.y, y),
    w: clamp(frame.w, w),
    h: clamp(frame.h, h),
  };
}

export function moveFrame(frame: Frame, dx: number, dy: number): Frame {
  return inRange({ ...frame, x: frame.x + dx, y: frame.y + dy });
}

/** One axis of a resize: where it starts and how long it is once the edge(s) the handle holds have
 *  moved by `d`. The length stops at the range's ends, and the edge opposite the handle stays put. */
function span(
  start: number,
  length: number,
  low: boolean,
  high: boolean,
  d: number,
  range: Range,
): [start: number, length: number] {
  const next = clamp(length + (high ? d : 0) - (low ? d : 0), range);
  return [low ? start + length - next : start, next];
}

/** `frame` with the edges `handle` holds moved by the pointer's travel (`dx`, `dy`). `keepRatio` keeps
 *  w/h: a corner scales about the opposite corner so that it stays as near the pointer as the frame's
 *  shape allows (the pointer's travel along the diagonal), an edge scales about the opposite edge, with
 *  the other side kept centred. `aspect` is the canvas's width over its height in px: a frame's fractions
 *  are of unequal lengths, and a corner follows the pointer in px. */
export function resizeFrame(
  frame: Frame,
  handle: Handle,
  dx: number,
  dy: number,
  keepRatio: boolean,
  aspect = 1,
): Frame {
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  if (!keepRatio) {
    const [x, w] = span(frame.x, frame.w, west, east, dx, RANGES.frame.w);
    const [y, h] = span(frame.y, frame.h, north, south, dy, RANGES.frame.h);
    return inRange({ x, y, w, h });
  }
  // How many times as long the frame would get, before any limit.
  const wanted =
    (west || east) && (north || south)
      ? 1 +
        ((east ? 1 : -1) * dx * aspect * frame.w * aspect +
          (south ? 1 : -1) * dy * frame.h) /
          ((frame.w * aspect) ** 2 + frame.h ** 2)
      : west || east
        ? (frame.w + (east ? dx : -dx)) / frame.w
        : (frame.h + (south ? dy : -dy)) / frame.h;
  const scale = clamp(wanted, [
    Math.max(RANGES.frame.w[0] / frame.w, RANGES.frame.h[0] / frame.h),
    Math.min(RANGES.frame.w[1] / frame.w, RANGES.frame.h[1] / frame.h),
  ]);
  const w = frame.w * scale;
  const h = frame.h * scale;
  return inRange({
    x: west
      ? frame.x + frame.w - w
      : east
        ? frame.x
        : frame.x + (frame.w - w) / 2,
    y: north
      ? frame.y + frame.h - h
      : south
        ? frame.y
        : frame.y + (frame.h - h) / 2,
    w,
    h,
  });
}

/** `frame` scaled by `scale` about the point (`ax`, `ay`), which stays where it is. */
export function scaleAbout(
  frame: Frame,
  ax: number,
  ay: number,
  scale: number,
): Frame {
  return {
    x: ax + (frame.x - ax) * scale,
    y: ay + (frame.y - ay) * scale,
    w: frame.w * scale,
    h: frame.h * scale,
  };
}

/** The frame of a layer that is drawn smaller than it (a logo, in the wide frame the layouts give it)
 *  when she resizes the box it is drawn in, `drawn`, from a corner: the box keeps its shape, and the
 *  frame scales with it about the corner of the box that holds still, so the layer stays where it was
 *  in its frame. */
export function resizeDrawn(
  frame: Frame,
  drawn: Frame,
  handle: Handle,
  dx: number,
  dy: number,
  aspect = 1,
): Frame {
  const next = resizeFrame(drawn, handle, dx, dy, true, aspect);
  return inRange(
    scaleAbout(
      frame,
      handle.includes("w") ? drawn.x + drawn.w : drawn.x,
      handle.includes("n") ? drawn.y + drawn.h : drawn.y,
      next.w / drawn.w,
    ),
  );
}

/** The guide nearest any of `points`, if one is within `tolerance`, and how far the points must move
 *  to be on it. */
function nearest(
  points: number[],
  guides: readonly number[],
  tolerance: number,
): { guide: number; shift: number } | null {
  let best: { guide: number; shift: number } | null = null;
  for (const point of points) {
    for (const guide of guides) {
      const shift = guide - point;
      if (
        Math.abs(shift) <= tolerance + 1e-9 &&
        (!best || Math.abs(shift) < Math.abs(best.shift))
      ) {
        best = { guide, shift };
      }
    }
  }
  return best;
}

/** A frame moved onto a guide when its left edge, middle or right edge (and, up and down, its top,
 *  middle or bottom) is within `tolerance` of one, and the guides it landed on, for the canvas to draw.
 *  Each axis snaps on its own, to the nearest. */
export function snap(
  frame: Frame,
  guides: readonly number[] = [0, 0.5, 1],
  tolerance = 0.012,
): { frame: Frame; guides: { x?: number; y?: number } } {
  const x = nearest(
    [frame.x, frame.x + frame.w / 2, frame.x + frame.w],
    guides,
    tolerance,
  );
  const y = nearest(
    [frame.y, frame.y + frame.h / 2, frame.y + frame.h],
    guides,
    tolerance,
  );
  return {
    frame: {
      ...frame,
      x: frame.x + (x?.shift ?? 0),
      y: frame.y + (y?.shift ?? 0),
    },
    guides: { ...(x && { x: x.guide }), ...(y && { y: y.guide }) },
  };
}

/** `snap` for a layer drawn smaller than its frame (a logo in its wide frame, a badge): the guides are
 *  met by the box that is drawn, `drawn`, which is what she sees, and the frame moves by the same
 *  correction. Both are given where the move has put them. */
export function snapDrawn(
  frame: Frame,
  drawn: Frame,
  guides?: readonly number[],
  tolerance?: number,
): { frame: Frame; guides: { x?: number; y?: number } } {
  const snapped = snap(drawn, guides, tolerance);
  return {
    frame: {
      ...frame,
      x: frame.x + snapped.frame.x - drawn.x,
      y: frame.y + snapped.frame.y - drawn.y,
    },
    guides: snapped.guides,
  };
}

/** The layer on top under a point (`x`, `y` in fractions of the canvas): the last of `order`, which
 *  runs bottom to top, whose frame holds it. A layer with no frame is not drawn. */
export function hitTest(
  frames: Record<string, Frame>,
  x: number,
  y: number,
  order: string[],
): string | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const f = frames[order[i]];
    if (f && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) {
      return order[i];
    }
  }
  return null;
}

/** The focus after dragging the photo by `drag` (px) in a frame of `frame` px: the picture follows
 *  the pointer. A photo is set to cover its frame (CoverArt's `object-fit: cover`), so the part past
 *  the frame is what can move; the focus is both where it sits (object-position) and the point `zoom`
 *  scales about, so a unit of focus moves the picture by `(zoom - 1) * frame + zoom * overflow`.
 *  `image` is the photo's own size, null while it loads; a picture with nowhere to go stays. */
export function panFocus(
  focus: [number, number],
  drag: [number, number],
  frame: { w: number; h: number },
  image: { w: number; h: number } | null,
  zoom: number,
): [number, number] {
  const cover = image ? Math.max(frame.w / image.w, frame.h / image.h) : 0;
  const along = (at: number, d: number, size: number, own: number) => {
    const travel = (zoom - 1) * size + zoom * (image ? own * cover - size : 0);
    return travel > 1e-6 ? clamp(at - d / travel, RANGES.focus) : at;
  };
  return [
    along(focus[0], drag[0], frame.w, image?.w ?? 0),
    along(focus[1], drag[1], frame.h, image?.h ?? 0),
  ];
}
