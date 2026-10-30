"use client";

// One renderer for every place a cover shows: it draws a design as HTML and CSS in the nearest of
// three sizes (Card is the look's shape, Wide 16/9, Banner 3/1), chosen by container queries in
// cover-art.module.css, so it needs no measuring. It fills its positioned parent.
// A client module: it reads the site's language from a context (useSiteLocale), which a server
// page cannot call. Server pages (course detail, /render/cover) still render it, props are plain data.
//
// Frames and stacking come from lib/covers (framesFor, layerOrder); this file only paints them. A
// cover wears its look's own light palette and its two fonts, whatever scheme the viewer is in.

import type { CSSProperties, ReactNode } from "react";
import type { CoverAspect, SiteStyle } from "@shared/sections/types";
import { cn } from "@/lib/utils";
import { CLAMP_PAD, clampClip } from "@/lib/covers/clamp";
import type { ClampWord } from "@/lib/covers/clamp";
import { BADGE_GAP, fitLines, LEADING, textSize } from "@/lib/covers/layouts";
import { markedWords, plainWords } from "@/lib/covers/marks";
import type { TextPart } from "@/lib/covers/layouts";
import {
  coverPalette,
  lightness,
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
import { PHOTO_TREATMENTS } from "@/lib/site-styles";
import { SIZES } from "@/types/design";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  FontRole,
  Frame,
  Mask,
  Paint,
  PartStyle,
  ShapeKind,
  Weight,
} from "@/types/design";
import styles from "./cover-art.module.css";
import { COVER_ICONS } from "./cover-icons";
import { QrCode } from "./cover-qr";
import { useLocale } from "next-intl";
import { useSiteLocale } from "@shared/i18n/site-preview";

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

const SHAPE_RADIUS: Record<ShapeKind, string | undefined> = {
  rect: undefined,
  circle: "50%",
  arch: "999px 999px 0 0",
  line: undefined,
  pill: "9999px",
  star: undefined,
  burst: undefined,
  arrow: undefined,
};

/** A starburst of twelve points, for a sticker ("Free", "-30%"). */
const BURST = `polygon(${Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 ? 41 : 50;
  const a = (i / 24) * 2 * Math.PI - Math.PI / 2;
  return `${+(50 + r * Math.cos(a)).toFixed(2)}% ${+(50 + r * Math.sin(a)).toFixed(2)}%`;
}).join(", ")})`;

/** The shapes drawn by a polygon of their box (the Elements drawer draws its glyphs with them too). */
export const SHAPE_CLIP: Partial<Record<ShapeKind, string>> = {
  star: "polygon(50% 0%, 61.2% 34.5%, 97.6% 34.5%, 68.2% 55.9%, 79.4% 90.5%, 50% 69.1%, 20.6% 90.5%, 31.8% 55.9%, 2.4% 34.5%, 38.8% 34.5%)",
  burst: BURST,
  arrow:
    "polygon(0% 32%, 62% 32%, 62% 0%, 100% 50%, 62% 100%, 62% 68%, 0% 68%)",
};

/** An organic shape, as a mask the photo's frame is cut to (stretched to the frame). */
const BLOB = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath d='M52 2C75 1 97 17 98 42C99 66 85 95 57 98C30 101 6 86 2 60C-2 34 25 3 52 2Z'/%3E%3C/svg%3E")`;

/** The photo's frame cut to a shape. The frame's clip (`overflow: hidden`) holds the rest. (The Edit photo
 *  drawer draws its glyphs with them too.) */
export const PHOTO_MASKS: Record<Mask, CSSProperties> = {
  none: {},
  rounded: { borderRadius: "6cqmin" },
  circle: { clipPath: "circle(closest-side)" },
  arch: { borderRadius: "999px 999px 0 0" },
  blob: {
    maskImage: BLOB,
    WebkitMaskImage: BLOB,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  },
};

/** The two colours of a warmth shift, laid over the photo in soft light. */
const WARM = "rgb(255 150 50)";
const COOL = "rgb(60 140 255)";

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

// The faces the site loads, named as `styleVars` in site-styles.ts names them. (The studio's drawers
// preview the look's fonts in the same stacks.)
export const family = (look: SiteStyle, role: FontRole) =>
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

/** The browser's own line clamp, in the style of the element holding the text. Its box reaches past the
 *  lines by CLAMP_PAD em above and below (and is pulled back by the same, so it lays out as the lines);
 *  the clip under the last line is drawn where that line's descenders end and the next one's ink begins. */
const clamp = (lines: number, word: ClampWord): CSSProperties => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: lines,
  overflow: "hidden",
  paddingBlock: `${CLAMP_PAD}em`,
  marginBlock: `-${CLAMP_PAD}em`,
  clipPath: clampClip(word),
});

/** What a photo that is not there looks like: the tint `Img` draws, in the look's own colours. */
const empty = (p: CoverPalette): CSSProperties => ({
  backgroundColor: p.surface,
  backgroundImage: `radial-gradient(ellipse at 30% 20%, color-mix(in oklch, ${p.primary} 18%, transparent), transparent 60%), radial-gradient(ellipse at 80% 90%, color-mix(in oklch, ${p.accent} 22%, transparent), transparent 55%)`,
});

/** What a grade does to the photo: a filter on it, and a colour laid over it (a tint), or for a duotone the
 *  two colours its shadows and its lights become. The looks' grades are the site's own (PHOTO_TREATMENTS
 *  in site-styles.ts); "site" is her look's, so it follows a look change as the site's photos do. */
function gradeOf(ctx: Ctx): {
  filter: string;
  tint?: {
    color: string;
    blend: CSSProperties["mixBlendMode"];
    opacity: number;
  };
  duo?: [dark: string, light: string];
} {
  const grade = ctx.recipe.photo.grade ?? "none";
  const { palette } = ctx;
  if (grade === "duo" || grade === "duo-accent") {
    const [a, b] =
      grade === "duo"
        ? [palette.primary, palette.paper]
        : [palette.ink, palette.accent];
    // the darker of the two takes the shadows, whatever scheme the look has
    return {
      filter: "grayscale(1) contrast(1.1)",
      duo: lightness(a) <= lightness(b) ? [a, b] : [b, a],
    };
  }
  const treatment =
    PHOTO_TREATMENTS[grade === "site" ? ctx.look.photoTreatment : grade] ??
    PHOTO_TREATMENTS.none;
  return {
    filter: treatment.filter === "none" ? "" : treatment.filter,
    tint:
      treatment.tint === "transparent"
        ? undefined
        : {
            // the site's tint is its primary colour: on a cover, the cover's own
            color: treatment.tint.replace("var(--primary)", palette.primary),
            blend: treatment.blend as CSSProperties["mixBlendMode"],
            opacity: Number(treatment.opacity),
          },
  };
}

/** The photo, put through her focus, zoom, grade and adjustments, with her tint, warmth and darken over it.
 *  Her zoom and adjustments sit on a wrapper and the look's classes on the `<img>`, so neither overrides the
 *  other. A cutout (a photo whose background she removed) stands whole at the foot of its frame. */
function photo(ctx: Ctx, placeholder: boolean): ReactNode {
  const { photo: p } = ctx.recipe;
  const cutout = ctx.recipe.layout === "cutout";
  const at = `${pct(p.focus[0])} ${cutout ? "100%" : pct(p.focus[1])}`;
  const blur = p.blur ?? 0;
  const warmth = p.warmth ?? 0;
  // A blur fades the photo's edges, so it is drawn a little larger to keep them in the frame.
  const scale = p.zoom * (1 + blur * 0.08);
  const grade = gradeOf(ctx);
  const filter = [
    grade.filter,
    p.brightness !== 1 && `brightness(${p.brightness})`,
    p.contrast !== 1 && `contrast(${p.contrast})`,
    p.saturation !== 1 && `saturate(${p.saturation})`,
    blur > 0 && `blur(${round(blur * 2.5)}cqmin)`,
  ]
    .filter(Boolean)
    .join(" ");
  if (!ctx.photoUrl && !placeholder) return null;
  const img = ctx.photoUrl && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ctx.photoUrl}
      alt=""
      loading={ctx.priority ? "eager" : "lazy"}
      // React 18 knows only the lowercase attribute (Next's own Image does the same). The site's motion holds
      // an image at opacity 0 until it has loaded, except one marked priority.
      {...(ctx.priority
        ? { fetchpriority: "high", "data-site-img": "priority" }
        : {})}
      decoding="async"
      className={cn(
        styles.fill,
        cutout ? styles.contain : styles.cover,
        ctx.photoClassName,
      )}
      style={{ objectPosition: at }}
    />
  );
  return (
    <>
      {grade.duo && ctx.photoUrl && (
        <div className={styles.fill} style={{ background: grade.duo[1] }} />
      )}
      <div
        className={styles.fill}
        style={{
          transform: scale !== 1 ? `scale(${round(scale)})` : undefined,
          // her focus, mirrored with the picture when it is flipped
          transformOrigin:
            scale !== 1
              ? p.flip
                ? `${pct(1 - p.focus[0])} ${at.split(" ")[1]}`
                : at
              : undefined,
          filter: filter || undefined,
          mixBlendMode: grade.duo && ctx.photoUrl ? "multiply" : undefined,
        }}
      >
        {ctx.photoUrl && p.flip ? (
          // flipped on a wrapper of its own: the look's classes may move the <img> too
          <div className={styles.fill} style={{ transform: "scaleX(-1)" }}>
            {img}
          </div>
        ) : ctx.photoUrl ? (
          img
        ) : (
          <div
            aria-hidden="true"
            data-empty-image=""
            className={styles.fill}
            style={empty(ctx.palette)}
          />
        )}
      </div>
      {ctx.photoUrl && grade.duo && (
        <div
          className={styles.fill}
          style={{ background: grade.duo[0], mixBlendMode: "lighten" }}
        />
      )}
      {ctx.photoUrl && grade.tint && (
        <div
          className={styles.fill}
          style={{
            background: grade.tint.color,
            mixBlendMode: grade.tint.blend,
            opacity: grade.tint.opacity,
          }}
        />
      )}
      {ctx.photoUrl && warmth !== 0 && (
        <div
          className={styles.fill}
          style={{
            background: warmth > 0 ? WARM : COOL,
            mixBlendMode: "soft-light",
            opacity: round(Math.abs(warmth) * 0.6),
          }}
        />
      )}
      {p.darken > 0 && (
        <div
          className={styles.fill}
          style={{ background: `rgb(0 0 0 / ${p.darken})` }}
        />
      )}
    </>
  );
}

/** The look of an effect on words: a soft shadow that lifts them off a photo, a hard one, an
 *  outline (drawn behind the letters, so they keep their shapes), or a band of colour behind each line,
 *  which is drawn on the text itself (see wordLayer). Its colour is hers, else the effect's own. */
function effectOf(
  ctx: Ctx,
  style: PartStyle,
): { text: CSSProperties; band?: string } {
  const tone = style.effectColor
    ? paintColor(style.effectColor, ctx.palette)
    : undefined;
  switch (style.effect) {
    case "lift":
      return {
        text: { textShadow: `0 0.04em 0.32em ${tone ?? "rgb(0 0 0 / 0.55)"}` },
      };
    case "shadow":
      return {
        text: { textShadow: `0.07em 0.07em 0 ${tone ?? ctx.palette.accent}` },
      };
    case "outline":
      return {
        text: {
          WebkitTextStroke: `0.09em ${tone ?? ctx.palette.accent}`,
          paintOrder: "stroke fill",
        },
      };
    case "highlight":
      return { text: {}, band: tone ?? ctx.palette.accent };
    default:
      return { text: {} };
  }
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
  const d = TYPE[kind];
  const effect = effectOf(ctx, style);
  const parts = markedWords(text);
  // A band goes behind the words she marked, or behind all of them where she marked none.
  const bandAll = Boolean(effect.band) && !parts.some((part) => part.marked);
  const onBand = effect.band
    ? readableOn(style.effectColor ?? "accent", ctx.palette)
    : undefined;
  // Words on a band take the colour that reads on it, unless she chose one.
  const ink =
    bandAll && !style.color && onBand ? onBand : colorOf(ctx, style, ctx.ink);
  const marked = (part: string, i: number) =>
    effect.band ? (
      <span
        key={i}
        className={styles.band}
        style={{
          background: effect.band,
          color: style.emphasis
            ? paintColor(style.emphasis, ctx.palette)
            : onBand,
        }}
      >
        {part}
      </span>
    ) : (
      <span
        key={i}
        style={{ color: paintColor(style.emphasis ?? "accent", ctx.palette) }}
      >
        {part}
      </span>
    );
  const words = parts.map((part, i) =>
    part.marked ? marked(part.text, i) : part.text,
  );
  return (
    <div
      key={id}
      data-layer={id}
      data-words=""
      className={cn(styles.layer, styles.words)}
      style={{
        ...box(frame),
        ...type(ctx, kind, style, size, aspect, ink),
        ...effect.text,
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
          {
            family: ctx.look.fonts[style.font ?? d.font],
            text: plainWords(text),
            upper: style.upper ?? d.upper,
            leading,
          },
        )}
      >
        {bandAll ? (
          <span className={styles.band} style={{ background: effect.band }}>
            {words}
          </span>
        ) : (
          words
        )}
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

const WHITE_LOGO = "brightness(0) invert(1)";
const BLACK_LOGO = "brightness(0)";

/** The logo's filter. Her colour for it is white, black, or any other (the logo as it is). With none
 *  it takes the colour that reads on what it sits on, as text does: white on a dark panel and on a
 *  photo, black on a light panel. What it sits on is the highest of the panel and the photo whose
 *  frame holds its centre (in a band layout the logo at the top is on the photo, in a framed one
 *  it is on the inset photo). A photo that is not there is drawn as the surface tint. */
function logoTint(
  ctx: Ctx,
  frame: Frame,
  frames: Record<string, Frame>,
): string | undefined {
  const color = ctx.recipe.styles.logo?.color;
  if (color !== undefined) {
    return color === "white"
      ? WHITE_LOGO
      : color === "black"
        ? BLACK_LOGO
        : undefined;
  }
  const [x, y] = [frame.x + frame.w / 2, frame.y + frame.h / 2];
  let on: "panel" | "photo" | undefined;
  for (const id of layerOrder(ctx.recipe)) {
    const f = frames[id];
    if (
      (id === "panel" || id === "photo") &&
      f &&
      f.x <= x &&
      x <= f.x + f.w &&
      f.y <= y &&
      y <= f.y + f.h
    ) {
      on = id;
    }
  }
  if (on === "photo" && ctx.photoUrl) return WHITE_LOGO;
  const paint = on === "photo" ? "surface" : ctx.recipe.panel;
  return readableOn(paint, ctx.palette) === ctx.palette.white
    ? WHITE_LOGO
    : BLACK_LOGO;
}

/** Her logo, in a frame five times as wide as it is high (see the layouts): drawn by that height,
 *  contained, from the left of the frame, or from its centre in a title-only cover. */
function logoLayer(
  ctx: Ctx,
  frame: Frame,
  frames: Record<string, Frame>,
): ReactNode {
  if (!ctx.design.logo_url) return null;
  const style = ctx.recipe.styles.logo ?? {};
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
        style={{
          objectPosition: `${side} center`,
          filter: logoTint(ctx, frame, frames),
        }}
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
          // draw the photo over the panel and the words. Its blends (a duotone, a tint) mix with
          // the photo alone, not with what is under the frame.
          style={{
            ...box(frame),
            overflow: "hidden",
            isolation: "isolate",
            ...PHOTO_MASKS[recipe.photo.mask ?? "none"],
          }}
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
      return logoLayer(ctx, frame, frames);
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
          clipPath: SHAPE_CLIP[extra.shape],
        }}
      />
    );
  }
  if (extra.type === "icon") {
    const Icon = COVER_ICONS[extra.icon];
    return Icon ? (
      <div
        key={id}
        data-layer={id}
        className={styles.layer}
        style={{
          ...box(frame),
          color: paintColor(extra.fill, palette),
          opacity: extra.opacity,
        }}
      >
        <Icon aria-hidden="true" width="100%" height="100%" />
      </div>
    ) : null;
  }
  if (extra.type === "qr") {
    return (
      <div key={id} data-layer={id} className={styles.layer} style={box(frame)}>
        <QrCode
          text={extra.text}
          fill={paintColor(extra.fill, palette)}
          back={paintColor(extra.back, palette)}
        />
      </div>
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
  const own = useLocale();
  const siteLocale = useSiteLocale();
  const locale = siteLocale ?? own;
  const { recipe } = design;
  const { style: look, paletteId } = parseLook(design.look);
  const palette = coverPalette(look, paletteId);
  const panel = paintColor(recipe.panel, palette);
  const ctx: Ctx = {
    design,
    recipe,
    look,
    palette,
    words: resolveWords(recipe, item, now, locale),
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
      lang={siteLocale ?? undefined}
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
