// Where each layout puts a cover's parts. A layout is a function from the shape of the frame (and
// which words are there) to frames, so one recipe draws in any size.
//
// Every frame is {x, y, w, h} in fractions of the canvas. Sizes are in cqmin: 1% of the canvas's
// shorter side, the unit CoverArt sets text in, so a layout reads the same at any width. The frames
// hold for aspects from 0.4 to 5 (cards run 0.75 to 1.6, Wide is 16/9, Banner is 3).
//
// What the renderer needs to know besides the frames:
//  - Words align left, except in `title`, where they and the logo are centred. In its frame the
//    label sits at the bottom, the title in the middle and the subtitle at the top, so the three
//    stay together however many lines each takes. A part's line clamp is `fitLines` of its frame.
//  - The logo is anchored to the left of its frame (centred in `title`), the badge to the right.
//  - `full` has no panel: CoverArt darkens the bottom of the photo behind the words, so its words
//    are white by default. In `band` the photo runs under the band, which is drawn over it.

import { LAYOUTS } from "@/types/design";
import type { Frame, LayoutId, PartId } from "@/types/design";

export { LAYOUTS };

export type AspectClass = "portrait" | "square" | "landscape" | "banner";

/** The shape of a frame, by width over height. */
export function aspectClass(aspect: number): AspectClass {
  if (aspect < 0.95) return "portrait";
  if (aspect < 1.2) return "square";
  return aspect < 2.4 ? "landscape" : "banner";
}

type WordPart = "label" | "title" | "subtitle";
export type TextPart = WordPart | "badge";
/** Which words are drawn. A word left out closes its gap in the stack; the default is all of them. */
export type ShownWords = Partial<Record<WordPart, boolean>>;

const WORDS: WordPart[] = ["label", "title", "subtitle"];

/** Line height per word, in em. The frames are sized with it. */
export const LEADING: Record<WordPart, number> = {
  label: 1.2,
  title: 1.1,
  subtitle: 1.3,
};

/** A plain layout's title, in cqmin. */
const TITLE = 9.5;
/** A title is never under 5.45% of the frame's width: over 16 px in a frame 300 px wide (16 px is
 *  5.33%; the rest keeps rounding from taking it under). */
const FLOOR = 5.45;
const TITLE_SCALE: Record<LayoutId, number> = {
  panel: 1,
  full: 1.05,
  title: 1.2,
  band: 0.85,
  framed: 0.9,
  photo: 1,
};

/** The size of a part, in cqmin. */
export function textSize(
  layout: LayoutId,
  part: TextPart,
  aspect: number,
): number {
  const title = Math.max(TITLE * TITLE_SCALE[layout], FLOOR * aspect);
  const size =
    part === "title"
      ? title
      : part === "label"
        ? 0.46 * title
        : part === "subtitle"
          ? 0.59 * title
          : 0.44 * Math.max(TITLE, FLOOR * aspect);
  return Math.round(size * 100) / 100;
}

/** The lines of text that fit in a frame, for the line clamp: `size` is the part's size in cqmin
 *  (textSize times her scale) and `leading` its line height in em. At least one. */
export function fitLines(
  frame: Frame,
  aspect: number,
  size: number,
  leading: number,
): number {
  const height = frame.h * (100 / Math.min(1, aspect));
  return Math.max(1, Math.floor(height / (size * leading) + 1e-6));
}

/** The most lines of title and of subtitle a layout gives its words in a shape. Where the words sit
 *  in a box that grows with them (under the panel's or the framed photo) or in the short band they
 *  are kept to two and one; elsewhere the room is there. A title takes fewer lines than this when
 *  the other words leave it less room. */
function maxLines(
  layout: LayoutId,
  cls: AspectClass,
): [title: number, subtitle: number] {
  if (cls === "banner") return [3, 1];
  const roomy =
    layout === "full" ||
    layout === "title" ||
    (cls === "landscape" && (layout === "panel" || layout === "framed"));
  return roomy ? [3, 2] : [2, 1];
}

// Distances in cqmin.
/** From the canvas edge to what is on it. */
const MARGIN = 5.5;
/** Under a logo. */
const BELOW_LOGO = 3;
/** The framed photo's inset from the edge of the colour field, and its gap to the words. */
const INSET = 6;
const PHOTO_GAP = 4;
/** From a photo's corner to the logo or badge on it. */
const ON_PHOTO = 3;
/** Inside the band, above and below its words. */
const BAND_PAD = 3.5;
/** Left and right of the centred words of a title-only cover in a tall or square frame. */
const CENTRED_MARGIN = 8;

type Frames = Record<PartId, Frame | null>;
type Anchor = "start" | "middle" | "end";

export function layoutFrames(
  layout: LayoutId,
  aspect: number,
  shown: ShownWords = {},
): Frames {
  const cls = aspectClass(aspect);
  const sideBySide = cls === "landscape" || cls === "banner";
  // The canvas in cqmin; fr() turns a box in cqmin into a frame.
  const W = 100 * Math.max(1, aspect);
  const H = 100 / Math.min(1, aspect);
  const fr = (x: number, y: number, w: number, h: number): Frame => ({
    x: x / W,
    y: y / H,
    w: w / W,
    h: h / H,
  });

  // The logo and badge grow with a wide frame, up to 1.4 times.
  const grow = Math.min(Math.max(TITLE, FLOOR * aspect) / TITLE, 1.4);
  const logoW = 22 * grow;
  const logoH = 6.5 * grow;
  const badgeW = 32 * grow;
  const badgeH = 8 * grow;
  const logo = (x: number, y: number) => fr(x, y, logoW, logoH);
  const badge = (right: number, y: number) =>
    fr(right - badgeW, y, badgeW, badgeH);
  const underLogo = MARGIN + logoH + BELOW_LOGO;

  const lineHeight = (part: WordPart) =>
    textSize(layout, part, aspect) * LEADING[part];
  const [titleMax, subtitleMax] = maxLines(layout, cls);
  const most = { label: 1, title: titleMax, subtitle: subtitleMax };
  const gap = 0.15 * textSize(layout, "title", aspect);
  /** The height of the words stacked, the title on `titleLines` lines. */
  const stackHeight = (parts: WordPart[], titleLines = titleMax) =>
    parts.reduce(
      (sum, part) =>
        sum + (part === "title" ? titleLines : most[part]) * lineHeight(part),
      0,
    ) +
    gap * Math.max(0, parts.length - 1);

  // The words stacked top to bottom in a box (in cqmin). The title takes the lines the others leave
  // it, up to its most.
  const words = (
    x: number,
    y: number,
    w: number,
    h: number,
    anchor: Anchor,
  ): Pick<Frames, WordPart> => {
    const parts = WORDS.filter((part) => shown[part] !== false);
    const room = h - stackHeight(parts, 0);
    const titleLines = Math.max(
      1,
      Math.min(titleMax, Math.floor(room / lineHeight("title") + 1e-6)),
    );
    const height = (part: WordPart) =>
      (part === "title" ? titleLines : most[part]) * lineHeight(part);
    const free = h - stackHeight(parts, titleLines);
    let top =
      y + (anchor === "end" ? free : anchor === "middle" ? free / 2 : 0);
    const out: Pick<Frames, WordPart> = {
      label: null,
      title: null,
      subtitle: null,
    };
    for (const part of parts) {
      out[part] = fr(x, top, w, height(part));
      top += height(part) + gap;
    }
    return out;
  };

  const none: Frames = {
    photo: null,
    panel: null,
    label: null,
    title: null,
    subtitle: null,
    logo: null,
    badge: null,
  };
  const topRight = badge(W - MARGIN, MARGIN);

  switch (layout) {
    case "panel": {
      if (!sideBySide) {
        // Photo on top; the panel under it holds the logo and, at its bottom, the words.
        const stack = stackHeight(WORDS);
        const panelH = underLogo + stack + MARGIN;
        const top = H - panelH;
        return {
          ...none,
          photo: fr(0, 0, W, top),
          panel: fr(0, top, W, panelH),
          logo: logo(MARGIN, top + MARGIN),
          badge: topRight,
          ...words(MARGIN, top + underLogo, W - 2 * MARGIN, stack, "end"),
        };
      }
      // Panel on the left, photo on the right (the larger part of a banner).
      const panelW =
        cls === "banner" ? 0.38 * W : Math.min(84, Math.max(66, 0.5 * W));
      return {
        ...none,
        photo: fr(panelW, 0, W - panelW, H),
        panel: fr(0, 0, panelW, H),
        logo: logo(MARGIN, MARGIN),
        badge: topRight,
        ...words(
          MARGIN,
          underLogo,
          panelW - 2 * MARGIN,
          H - MARGIN - underLogo,
          "end",
        ),
      };
    }
    case "full": {
      const column = sideBySide ? 0.6 * W : W - 2 * MARGIN;
      return {
        ...none,
        photo: fr(0, 0, W, H),
        logo: logo(MARGIN, MARGIN),
        badge: topRight,
        ...words(MARGIN, underLogo, column, H - MARGIN - underLogo, "end"),
      };
    }
    case "title": {
      const column = sideBySide ? 0.72 * W : W - 2 * CENTRED_MARGIN;
      return {
        ...none,
        panel: fr(0, 0, W, H),
        logo: logo((W - logoW) / 2, MARGIN),
        badge: topRight,
        ...words(
          (W - column) / 2,
          underLogo,
          column,
          H - MARGIN - underLogo,
          "middle",
        ),
      };
    }
    case "band": {
      const photo = fr(0, 0, W, H);
      if (cls === "banner") {
        const bandW = 0.38 * W;
        return {
          ...none,
          photo,
          panel: fr(0, 0, bandW, H),
          logo: logo(MARGIN, MARGIN),
          badge: topRight,
          ...words(
            MARGIN,
            underLogo,
            bandW - 2 * MARGIN,
            H - MARGIN - underLogo,
            "middle",
          ),
        };
      }
      // The bottom 34%; taller only if a one-line title with the other words would not fit
      // (a frame wider than any cover is drawn in).
      const bandH = Math.max(0.34 * H, stackHeight(WORDS, 1) + 2 * BAND_PAD);
      return {
        ...none,
        photo,
        panel: fr(0, H - bandH, W, bandH),
        logo: logo(MARGIN, MARGIN),
        badge: topRight,
        ...words(
          MARGIN,
          H - bandH + BAND_PAD,
          W - 2 * MARGIN,
          bandH - 2 * BAND_PAD,
          "middle",
        ),
      };
    }
    case "framed": {
      if (!sideBySide) {
        // The photo inset at the top of the field, the words under it.
        const inner = W - 2 * INSET;
        const stack = stackHeight(WORDS);
        const photoH = H - INSET - PHOTO_GAP - stack - MARGIN;
        return {
          ...none,
          panel: fr(0, 0, W, H),
          photo: fr(INSET, INSET, inner, photoH),
          logo: logo(INSET + ON_PHOTO, INSET + ON_PHOTO),
          badge: badge(W - INSET - ON_PHOTO, INSET + ON_PHOTO),
          ...words(INSET, INSET + photoH + PHOTO_GAP, inner, stack, "start"),
        };
      }
      // The photo inset at the left of the field, the words beside it. The logo and badge share
      // the photo's top row, which the photo is wide enough to hold.
      const photoW = Math.min(108, Math.max(60, 0.44 * W));
      const x = 2 * INSET + photoW;
      return {
        ...none,
        panel: fr(0, 0, W, H),
        photo: fr(INSET, INSET, photoW, H - 2 * INSET),
        logo: logo(INSET + ON_PHOTO, INSET + ON_PHOTO),
        badge: badge(INSET + photoW - ON_PHOTO, INSET + ON_PHOTO),
        ...words(x, INSET, W - x - INSET, H - 2 * INSET, "middle"),
      };
    }
    case "photo":
      return {
        ...none,
        photo: fr(0, 0, W, H),
        logo: logo(MARGIN, MARGIN),
        badge: topRight,
      };
  }
}
