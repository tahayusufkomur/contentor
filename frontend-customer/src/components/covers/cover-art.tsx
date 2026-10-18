// One renderer for every place a cover shows: it draws a design as HTML and CSS in the nearest of
// three sizes (Card is the look's shape, Wide 16/9, Banner 3/1), chosen by container queries in
// cover-art.module.css, so it needs no hooks and no measuring. It fills its positioned parent.
//
// Frames and stacking come from lib/covers (framesFor, layerOrder); this file only paints them. A
// cover wears its look's own light palette and its two fonts, whatever scheme the viewer is in.

import type { CSSProperties, ReactNode } from "react";
import type { CoverAspect, SiteStyle } from "@shared/sections/types";
import { cn } from "@/lib/utils";
import { fitLines, LEADING, textSize } from "@/lib/covers/layouts";
import type { TextPart } from "@/lib/covers/layouts";
import {
  coverPalette,
  paintColor,
  parseLook,
  readableOn,
} from "@/lib/covers/palette";
import type { CoverPalette } from "@/lib/covers/palette";
import {
  framesFor,
  layerOrder,
  resolveWords,
  sizeAspect,
} from "@/lib/covers/recipe";
import { SIZES } from "@/types/design";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  FontRole,
  Frame,
  Paint,
  PartStyle,
  ShapeKind,
  Weight,
} from "@/types/design";
import styles from "./cover-art.module.css";

export interface CoverArtProps {
  design: CoverDesign;
  /** The course or event the cover is for: its own title, and the dates its badge reads. */
  item: CoverItem;
  /** `bare` draws no words and no badges, for slots where the look prints its own over the cover. */
  mode?: "full" | "bare";
  /** Draw this size and no other, always (even in a frame under 180 px); without it the size nearest
   *  the frame's shape shows, and a frame under 180 px shows the photo alone. */
  size?: CoverSize;
  /** On the photo's `<img>`: the look's photo effects (greyscale, hover zoom). */
  photoClassName?: string;
  /** Load the photo at once, ahead of the rest of the page (the page's lead image); lazily otherwise. */
  priority?: boolean;
  className?: string;
  /** The date the "New" and date badges are read against. */
  now?: Date;
}

/** The root's class for each shape a look shows covers in; each defines where the sizes switch. */
const CARD_CLASS: Record<CoverAspect, string> = {
  "3/4": styles.card_34,
  "4/5": styles.card_45,
  "1/1": styles.card_11,
  "4/3": styles.card_43,
  "3/2": styles.card_32,
  "16/10": styles.card_1610,
};

type Kind = TextPart | "extra";

/** How a kind of text is set when neither the layout nor her style says otherwise. */
const TYPE: Record<
  Kind,
  {
    font: FontRole;
    weight: Weight;
    upper: boolean;
    tracking: number;
    leading: number;
  }
> = {
  label: {
    font: "body",
    weight: 600,
    upper: true,
    tracking: 0.12,
    leading: LEADING.label,
  },
  title: {
    font: "display",
    weight: 700,
    upper: false,
    tracking: -0.01,
    leading: LEADING.title,
  },
  subtitle: {
    font: "body",
    weight: 400,
    upper: false,
    tracking: 0,
    leading: LEADING.subtitle,
  },
  badge: {
    font: "body",
    weight: 700,
    upper: true,
    tracking: 0.06,
    leading: 1.15,
  },
  extra: {
    font: "body",
    weight: 600,
    upper: false,
    tracking: 0,
    leading: LEADING.subtitle,
  },
};

/** The most lines a word takes, when its frame holds that many. */
const MOST_LINES = { label: 1, title: 3, subtitle: 3 } as const;

/** Where a word sits in its box, so the three stay together however many lines each takes. */
const ANCHOR = {
  label: "flex-end",
  title: "center",
  subtitle: "flex-start",
  extra: "flex-start",
} as const;

const SIDE = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

/** The widest a badge grows, as a fraction of the cover's width: room for 24 characters on a Card
 *  of any shape (they take 41 to 77% of its width). */
const BADGE_CAP = 0.77;
/** The clear space kept between a grown badge and the logo or the edge of its photo, in cqmin. */
const BADGE_GAP = 3;

const SHAPE_RADIUS: Record<ShapeKind, string | undefined> = {
  rect: undefined,
  circle: "50%",
  arch: "999px 999px 0 0",
  line: undefined,
};

/** How far above its first word the full photo's fade starts, as a fraction of the cover's height. */
const FADE_PAD = 0.15;

interface Ctx {
  design: CoverDesign;
  recipe: CoverRecipe;
  look: SiteStyle;
  palette: CoverPalette;
  words: ReturnType<typeof resolveWords>;
  bare: boolean;
  photoClassName?: string;
  priority?: boolean;
  /** Her photo's URL; none when she chose none or its row is gone. */
  photoUrl?: string;
  /** The words' colour where her style names none. */
  ink: string;
}

const round = (v: number) => +v.toFixed(3);
const pct = (v: number) => `${round(v * 100)}%`;
const box = (f: Frame): CSSProperties => ({
  left: pct(f.x),
  top: pct(f.y),
  width: pct(f.w),
  height: pct(f.h),
});

// The faces the site loads, named as `styleVars` in site-styles.ts names them.
const family = (look: SiteStyle, role: FontRole) =>
  role === "display"
    ? `'${look.fonts.display}', Georgia, serif`
    : `'${look.fonts.body}', system-ui, sans-serif`;

/** A part's size in cqmin with her scale in it, and its line height. */
function measure(ctx: Ctx, kind: Kind, style: PartStyle, aspect: number) {
  const part: TextPart = kind === "extra" ? "subtitle" : kind;
  return {
    size: textSize(ctx.recipe.layout, part, aspect) * (style.scale ?? 1),
    leading: style.leading ?? TYPE[kind].leading,
  };
}

/** A font size: `size` in cqmin, the unit the layouts are written in, held down by the frame's height
 *  and width in proportion to the shape the layout was made for (`aspect`). The nearest size can be
 *  up to 1.5 times off the frame's shape, and a portrait Card in a squarer frame would otherwise set
 *  its words taller than the frames the layout gave them, so they spill over each other. At the
 *  layout's own shape the three terms are equal. */
const fontSize = (size: number, aspect: number) =>
  `min(${round(size)}cqmin, ${round(size * Math.min(1, aspect))}cqh, ${round(size / Math.max(1, aspect))}cqw)`;

function type(
  ctx: Ctx,
  kind: Kind,
  style: PartStyle,
  size: number,
  aspect: number,
  color: string,
): CSSProperties {
  const d = TYPE[kind];
  return {
    fontFamily: family(ctx.look, style.font ?? d.font),
    fontSize: fontSize(size, aspect),
    fontWeight: style.weight ?? d.weight,
    lineHeight: style.leading ?? d.leading,
    letterSpacing: `${style.tracking ?? d.tracking}em`,
    textTransform: (style.upper ?? d.upper) ? "uppercase" : "none",
    color,
  };
}

const colorOf = (ctx: Ctx, style: PartStyle, fallback: string) =>
  style.color ? paintColor(style.color, ctx.palette) : fallback;

/** The browser's own line clamp, in the style of the element holding the text. */
const clamp = (lines: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: lines,
  overflow: "hidden",
});

/** What a photo that is not there looks like: the tint `Img` draws, in the look's own colours. */
const empty = (p: CoverPalette): CSSProperties => ({
  backgroundColor: p.surface,
  backgroundImage: `radial-gradient(ellipse at 30% 20%, color-mix(in oklch, ${p.primary} 18%, transparent), transparent 60%), radial-gradient(ellipse at 80% 90%, color-mix(in oklch, ${p.accent} 22%, transparent), transparent 55%)`,
});

/** The photo, put through her focus, zoom and adjustments, and her darken over it. Her zoom and
 *  adjustments sit on a wrapper and the look's classes on the `<img>`, so neither overrides the other. */
function photo(ctx: Ctx, placeholder: boolean): ReactNode {
  const { photo: p } = ctx.recipe;
  const at = `${pct(p.focus[0])} ${pct(p.focus[1])}`;
  const zoomed = p.zoom !== 1;
  const adjusted = p.brightness !== 1 || p.contrast !== 1 || p.saturation !== 1;
  if (!ctx.photoUrl && !placeholder) return null;
  return (
    <>
      <div
        className={styles.fill}
        style={{
          transform: zoomed ? `scale(${p.zoom})` : undefined,
          transformOrigin: zoomed ? at : undefined,
          filter: adjusted
            ? `brightness(${p.brightness}) contrast(${p.contrast}) saturate(${p.saturation})`
            : undefined,
        }}
      >
        {ctx.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ctx.photoUrl}
            alt=""
            loading={ctx.priority ? "eager" : "lazy"}
            // React 18 knows only the lowercase attribute (Next's own Image does the same).
            {...(ctx.priority ? { fetchpriority: "high" } : {})}
            decoding="async"
            className={cn(styles.fill, styles.cover, ctx.photoClassName)}
            style={{ objectPosition: at }}
          />
        ) : (
          <div
            aria-hidden="true"
            data-empty-image=""
            className={styles.fill}
            style={empty(ctx.palette)}
          />
        )}
      </div>
      {p.darken > 0 && (
        <div
          className={styles.fill}
          style={{ background: `rgb(0 0 0 / ${p.darken})` }}
        />
      )}
    </>
  );
}

function wordLayer(
  ctx: Ctx,
  id: string,
  kind: Exclude<Kind, "badge">,
  text: string,
  style: PartStyle,
  frame: Frame,
  aspect: number,
): ReactNode {
  const { size, leading } = measure(ctx, kind, style, aspect);
  const fits = fitLines(frame, aspect, size, leading);
  return (
    <div
      key={id}
      data-layer={id}
      data-words=""
      className={cn(styles.layer, styles.words)}
      style={{
        ...box(frame),
        ...type(ctx, kind, style, size, aspect, colorOf(ctx, style, ctx.ink)),
        // Words align left, except on a title-only cover, where they are centred.
        textAlign:
          style.align ??
          (kind !== "extra" && ctx.recipe.layout === "title"
            ? "center"
            : "left"),
        justifyContent: ANCHOR[kind],
      }}
    >
      <span
        className={styles.clamp}
        style={clamp(
          kind === "extra" ? fits : Math.min(MOST_LINES[kind], fits),
        )}
      >
        {text}
      </span>
    </div>
  );
}

/** What a badge keeps clear of: the logo's frame where one is drawn, and the photo's where the badge
 *  sits on an inset photo and must not hang off it. */
interface Near {
  logo?: Frame;
  photo?: Frame;
}

/** How wide a badge may grow, as a fraction of the cover's width. It is sized to its text and grows
 *  out of its frame from the side its alignment names (leftwards from a right-anchored frame,
 *  rightwards from a left-anchored one, both ways from the centre), so it stops at the cap, at the
 *  edge of the cover (or of its photo), and at the logo where the two share a row. The layouts give
 *  the badge room, so these limits are the safety net for frames she moved. It is never less than
 *  its frame. */
function badgeCap(
  frame: Frame,
  side: keyof typeof SIDE,
  near: Near,
  aspect: number,
): number {
  const gap = BADGE_GAP / (100 * Math.max(1, aspect));
  const anchor =
    side === "left"
      ? frame.x
      : side === "center"
        ? frame.x + frame.w / 2
        : frame.x + frame.w;
  const { logo, photo } = near;
  // The span of the cover the badge may use, left to right.
  let low = photo ? photo.x + gap : 0;
  const high = photo ? photo.x + photo.w - gap : 1;
  if (
    logo &&
    logo.y < frame.y + frame.h &&
    frame.y < logo.y + logo.h &&
    logo.x + logo.w <= anchor
  ) {
    low = Math.max(low, logo.x + logo.w + gap);
  }
  const toLeft = anchor - low;
  const toRight = high - anchor;
  const room =
    side === "right"
      ? toLeft
      : side === "left"
        ? toRight
        : 2 * Math.min(toLeft, toRight);
  return Math.min(BADGE_CAP, Math.max(frame.w, room));
}

/** A badge: a box of its text on its fill, grown out of its frame as `badgeCap` says, in one line,
 *  cut with an ellipsis only where the text is longer than the cap. It hangs from `home`, the side
 *  of its frame it grows from unless her style names another. */
function badgeLayer(
  ctx: Ctx,
  id: string,
  text: string,
  fill: Paint,
  style: PartStyle,
  frame: Frame,
  aspect: number,
  home: keyof typeof SIDE,
  near: Near = {},
): ReactNode {
  const { size } = measure(ctx, "badge", style, aspect);
  const side = style.align ?? home;
  return (
    <div
      key={id}
      data-layer={id}
      data-badge=""
      className={cn(styles.layer, styles.badge)}
      style={{ ...box(frame), justifyContent: SIDE[side] }}
    >
      <span
        className={styles.pill}
        style={{
          ...type(
            ctx,
            "badge",
            style,
            size,
            aspect,
            colorOf(ctx, style, readableOn(fill, ctx.palette)),
          ),
          background: paintColor(fill, ctx.palette),
          borderRadius: ctx.look.radius,
          width: "max-content",
          maxWidth: `${round(badgeCap(frame, side, near, aspect) * 100)}cqw`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** Her logo, white or black when her style says so and as it is otherwise. */
function logoLayer(ctx: Ctx, frame: Frame): ReactNode {
  if (!ctx.design.logo_url) return null;
  const style = ctx.recipe.styles.logo ?? {};
  const tint =
    style.color === "white"
      ? "brightness(0) invert(1)"
      : style.color === "black"
        ? "brightness(0)"
        : undefined;
  const side =
    style.align ?? (ctx.recipe.layout === "title" ? "center" : "left");
  return (
    <div
      key="logo"
      data-layer="logo"
      data-logo=""
      className={styles.layer}
      style={box(frame)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ctx.design.logo_url}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn(styles.fill, styles.contain)}
        style={{ objectPosition: `${side} center`, filter: tint }}
      />
    </div>
  );
}

/** The full layout's photo carries its words with nothing under them, so the foot of the photo is
 *  darkened from a little above the first word. */
function fade(frames: Record<string, Frame>): ReactNode {
  const tops = (["label", "title", "subtitle"] as const).flatMap((part) =>
    frames[part] ? [frames[part].y] : [],
  );
  if (tops.length === 0) return null;
  const top = Math.min(...tops);
  const start = Math.max(0, top - FADE_PAD);
  return (
    <div
      key="fade"
      className={styles.fade}
      style={{
        top: pct(start),
        backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 0.78), rgb(0 0 0 / 0.5) ${pct((1 - top) / (1 - start))}, transparent)`,
      }}
    />
  );
}

function drawLayer(
  ctx: Ctx,
  id: string,
  frame: Frame,
  aspect: number,
  frames: Record<string, Frame>,
): ReactNode {
  const { recipe, palette, words, bare } = ctx;
  switch (id) {
    case "panel":
      return (
        <div
          key={id}
          data-layer={id}
          className={styles.layer}
          style={{
            ...box(frame),
            background: paintColor(recipe.panel, palette),
          }}
        />
      );
    case "photo":
      return (
        <div
          key={id}
          data-layer={id}
          className={styles.layer}
          // Clipped to its frame: her zoom, and a look's hover scale on the img, would otherwise
          // draw the photo over the panel and the words.
          style={{ ...box(frame), overflow: "hidden" }}
        >
          {photo(ctx, true)}
        </div>
      );
    case "label":
    case "title":
    case "subtitle":
      return bare || !words[id].trim()
        ? null
        : wordLayer(
            ctx,
            id,
            id,
            words[id],
            recipe.styles[id] ?? {},
            frame,
            aspect,
          );
    case "logo":
      return logoLayer(ctx, frame);
    case "badge":
      return bare || words.badge === null
        ? null
        : badgeLayer(
            ctx,
            id,
            words.badge,
            recipe.badge.fill,
            recipe.styles.badge ?? {},
            frame,
            aspect,
            // Centred above the words of a title-only cover, at the right of its frame elsewhere.
            recipe.layout === "title" ? "center" : "right",
            {
              logo: ctx.design.logo_url ? frames.logo : undefined,
              // On a framed cover the badge belongs to its inset photo and stays on it.
              photo: recipe.layout === "framed" ? frames.photo : undefined,
            },
          );
  }
  const extra = recipe.extras.find((e) => e.id === id);
  if (!extra) return null;
  if (extra.type === "shape") {
    return (
      <div
        key={id}
        data-layer={id}
        className={styles.layer}
        style={{
          ...box(frame),
          background: paintColor(extra.fill, palette),
          opacity: extra.opacity,
          borderRadius: SHAPE_RADIUS[extra.shape],
        }}
      />
    );
  }
  if (bare || !extra.text.trim()) return null;
  return extra.type === "text"
    ? wordLayer(ctx, id, "extra", extra.text, extra.style, frame, aspect)
    : badgeLayer(ctx, id, extra.text, extra.fill, {}, frame, aspect, "right");
}

/** The layers of one size, bottom to top. */
function layers(ctx: Ctx, size: CoverSize): ReactNode[] {
  const cardAspect = ctx.look.coverAspect;
  const aspect = sizeAspect(size, cardAspect);
  const frames = framesFor(ctx.recipe, size, cardAspect);
  const out: ReactNode[] = [];
  for (const id of layerOrder(ctx.recipe)) {
    const frame = frames[id];
    if (!frame) continue;
    out.push(drawLayer(ctx, id, frame, aspect, frames));
    if (id === "photo" && ctx.recipe.layout === "full" && !ctx.bare) {
      out.push(fade(frames));
    }
  }
  return out;
}

export function CoverArt({
  design,
  item,
  mode = "full",
  size,
  photoClassName,
  priority,
  className,
  now = new Date(),
}: CoverArtProps) {
  const { recipe } = design;
  const { style: look, paletteId } = parseLook(design.look);
  const palette = coverPalette(look, paletteId);
  const panel = paintColor(recipe.panel, palette);
  const ctx: Ctx = {
    design,
    recipe,
    look,
    palette,
    words: resolveWords(recipe, item, now),
    bare: mode === "bare",
    photoClassName,
    priority,
    photoUrl: recipe.photo.id ? design.photos[recipe.photo.id] : undefined,
    // Words sit on the panel, except over a full photo (or her own words on a photo-only cover).
    ink:
      recipe.layout === "full" || recipe.layout === "photo"
        ? palette.white
        : readableOn(recipe.panel, palette),
  };
  const sizes: readonly CoverSize[] = size ? [size] : SIZES;
  return (
    <div
      data-cover=""
      className={cn(styles.root, CARD_CLASS[look.coverAspect], className)}
      style={{ background: panel }}
    >
      {/* Under 180 px: the photo alone, full-bleed, or the panel colour where the layout draws none. */}
      {!size && (
        <div data-thumb="">
          {Boolean(framesFor(recipe, "card", look.coverAspect).photo) &&
            photo(ctx, false)}
        </div>
      )}
      {/* A forced size shows in any frame: inline display beats the container queries' rules. */}
      {sizes.map((s) => (
        <div
          key={s}
          data-size={s}
          style={size ? { display: "block" } : undefined}
        >
          {layers(ctx, s)}
        </div>
      ))}
    </div>
  );
}
