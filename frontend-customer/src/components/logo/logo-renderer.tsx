// Pure SVG renderer for a Logo Studio recipe (schema v2). Single source of
// truth: live preview, fine-tune canvas, suggestion/wall cards, and PNG/SVG
// export all render through this component, so they can never drift.
"use client";

import { useId, type Ref } from "react";
import { LOGO_ICONS, initialsFor } from "@/lib/logo/catalog";
import type { Fill, LogoRecipe, RecipeLayout, TextStyle } from "@/types/logo";
import { AbstractMark } from "./abstract-mark";

export const MARK_VIEWBOX = 256;

export function logoViewBox(layout: RecipeLayout): { w: number; h: number } {
  if (layout === "stacked") return { w: 480, h: 360 };
  if (layout === "emblem") return { w: 480, h: 400 };
  return { w: 640, h: 200 };
}

function applyCase(text: string, style: TextStyle): string {
  if (style.case === "upper") return text.toUpperCase();
  if (style.case === "title")
    return text.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1));
  return text;
}

/** Fitted font size so `text` occupies at most `budget` px width. */
function fitFontSize(
  text: string,
  style: TextStyle,
  budget: number,
  max = 80,
): number {
  const perChar = 0.58 + style.tracking;
  return Math.max(
    22,
    Math.min(max, budget / (perChar * Math.max(text.length, 3))),
  );
}

/** Paints a Fill: solid -> color string; gradients -> url(#id) + <defs>. */
function useFillPaint(
  fill: Fill,
  key: string,
): { paint: string; defs: React.ReactNode } {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (fill.type === "solid") return { paint: fill.color, defs: null };
  const id = `lg-${key}-${uid}`;
  if (fill.type === "linear") {
    const rad = ((fill.angle - 90) * Math.PI) / 180;
    const x = Math.cos(rad) / 2;
    const y = Math.sin(rad) / 2;
    return {
      paint: `url(#${id})`,
      defs: (
        <linearGradient
          id={id}
          x1={0.5 - x}
          y1={0.5 - y}
          x2={0.5 + x}
          y2={0.5 + y}
        >
          <stop offset="0%" stopColor={fill.from} />
          <stop offset="100%" stopColor={fill.to} />
        </linearGradient>
      ),
    };
  }
  return {
    paint: `url(#${id})`,
    defs: (
      <radialGradient id={id}>
        <stop offset="0%" stopColor={fill.from} />
        <stop offset="100%" stopColor={fill.to} />
      </radialGradient>
    ),
  };
}

const SQUIRCLE_RX = 48 / 160;
const ROUNDED_RX = 24 / 160;

export function Badge({
  shape,
  size,
  paint,
  outline,
}: {
  shape: string;
  size: number;
  paint: string;
  outline: boolean;
}) {
  if (shape === "none") return null;
  const stroke = outline
    ? { fill: "none", stroke: paint, strokeWidth: size * 0.05 }
    : { fill: paint };
  const inset = outline ? size * 0.025 : 0;
  const s = size - inset * 2;
  if (shape === "circle")
    return <circle cx={size / 2} cy={size / 2} r={s / 2} {...stroke} />;
  if (shape === "rounded" || shape === "squircle") {
    const rx = (shape === "squircle" ? SQUIRCLE_RX : ROUNDED_RX) * s;
    return (
      <rect x={inset} y={inset} width={s} height={s} rx={rx} {...stroke} />
    );
  }
  // hexagon / shield / diamond as normalized paths scaled to `size`.
  const paths: Record<string, string> = {
    hexagon: "M0.5 0.02 L0.92 0.26 V0.74 L0.5 0.98 L0.08 0.74 V0.26 Z",
    shield:
      "M0.5 0.02 L0.94 0.16 V0.52 C0.94 0.78 0.74 0.94 0.5 0.99 C0.26 0.94 0.06 0.78 0.06 0.52 V0.16 Z",
    diamond: "M0.5 0.02 L0.98 0.5 L0.5 0.98 L0.02 0.5 Z",
  };
  return (
    <path
      d={paths[shape]}
      transform={`translate(${inset},${inset}) scale(${s})`}
      {...(outline
        ? { fill: "none", stroke: paint, strokeWidth: 0.05 } // unit space — scaled with the path
        : { fill: paint })}
    />
  );
}

/** Mark content only (icon / initials / abstract / image) — no badge. */
export function MarkContent({
  recipe,
  size,
  color,
}: {
  recipe: LogoRecipe;
  size: number;
  color: string;
}) {
  const { mark, typography } = recipe;
  if (mark.type === "icon") {
    const Icon = LOGO_ICONS[mark.icon];
    if (Icon) {
      const solidProps =
        mark.style === "solid"
          ? { fill: color, strokeWidth: 1 }
          : { fill: "none", strokeWidth: 1.75 };
      return (
        <Icon
          x={0}
          y={0}
          width={size}
          height={size}
          color={color}
          {...solidProps}
        />
      );
    }
  }
  if (mark.type === "abstract") {
    return (
      <AbstractMark
        family={mark.family}
        seed={mark.seed}
        color={color}
        size={size}
      />
    );
  }
  if (mark.type === "image" && mark.url) {
    return (
      <image
        href={mark.url}
        x={0}
        y={0}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  // initials (plain fallback for unknown icons / missing image urls too)
  const initials = initialsFor(recipe.name);
  const style = mark.type === "initials" ? mark.style : "plain";
  return (
    <InitialsMark
      initials={initials}
      style={style}
      size={size}
      color={color}
      font={typography.name.font}
    />
  );
}

function InitialsMark({
  initials,
  style,
  size,
  color,
  font,
}: {
  initials: string;
  style: string;
  size: number;
  color: string;
  font: string;
}) {
  const family = `'${font}', sans-serif`;
  const base = size * (initials.length > 1 ? 0.42 : 0.55);
  if (style === "split" && initials.length > 1) {
    return (
      <g fontFamily={family} fontWeight={700} fill={color}>
        <text
          x={size * 0.3}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={base}
        >
          {initials[0]}
        </text>
        <line
          x1={size / 2}
          y1={size * 0.2}
          x2={size / 2}
          y2={size * 0.8}
          stroke={color}
          strokeWidth={size * 0.02}
        />
        <text
          x={size * 0.7}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={base}
        >
          {initials[1]}
        </text>
      </g>
    );
  }
  if (style === "overlap" && initials.length > 1) {
    return (
      <g fontFamily={family} fontWeight={700}>
        <text
          x={size * 0.4}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={base * 1.15}
          fill={color}
          opacity={0.55}
        >
          {initials[0]}
        </text>
        <text
          x={size * 0.6}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={base * 1.15}
          fill={color}
        >
          {initials[1]}
        </text>
      </g>
    );
  }
  if (style === "monogram") {
    return (
      <g>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.46}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.03}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={family}
          fontWeight={700}
          fontSize={base * 0.8}
          fill={color}
          letterSpacing={initials.length > 1 ? "0.05em" : undefined}
        >
          {initials}
        </text>
      </g>
    );
  }
  return (
    <text
      x={size / 2}
      y={size / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={family}
      fontWeight={700}
      fontSize={base}
      fill={color}
    >
      {initials}
    </text>
  );
}

/** Badge + inset mark content (the classic composed mark).
 * `emblem` mode shrinks + raises the content so the name (drawn by
 * LogoRenderer on top of the badge) fits in the lower half. */
function ComposedMark({
  recipe,
  size,
  emblem = false,
}: {
  recipe: LogoRecipe;
  size: number;
  emblem?: boolean;
}) {
  const hasBadge = recipe.badge.shape !== "none";
  const { paint, defs } = useFillPaint(recipe.colors.badge, "badge");
  // Solid color stand-in for the badge fill (gradient -> its `from` stop):
  // used when the mark itself must carry the badge color (no badge, or
  // outline-only badge — v1 behavior generalized to gradient fills).
  const badgeSolid =
    recipe.colors.badge.type === "solid"
      ? recipe.colors.badge.color
      : recipe.colors.badge.from;
  const fg =
    hasBadge && !recipe.badge.outline ? recipe.colors.mark : badgeSolid;
  const inner = size * (emblem ? 0.3 : hasBadge ? 0.55 : 0.8);
  const padX = (size - inner) / 2;
  const padY = emblem ? size * 0.18 : padX;
  return (
    <g>
      {defs && <defs>{defs}</defs>}
      <Badge
        shape={recipe.badge.shape}
        size={size}
        paint={paint}
        outline={recipe.badge.outline}
      />
      <g transform={`translate(${padX}, ${padY})`}>
        <MarkContent recipe={recipe} size={inner} color={fg} />
      </g>
    </g>
  );
}

function TextEl({
  value,
  style,
  color,
  x,
  y,
  anchor,
  fontSize,
}: {
  value: string;
  style: TextStyle;
  color: string;
  x: number;
  y: number;
  anchor: "start" | "middle";
  fontSize: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontFamily={`'${style.font}', sans-serif`}
      fontWeight={style.weight}
      fontSize={fontSize}
      letterSpacing={`${style.tracking}em`}
      fill={color}
    >
      {applyCase(value, style)}
    </text>
  );
}

interface Slots {
  mark: { x: number; y: number; size: number } | null;
  name: {
    x: number;
    y: number;
    anchor: "start" | "middle";
    budget: number;
    max: number;
  };
  tagline: {
    x: number;
    y: number;
    anchor: "start" | "middle";
    budget: number;
  } | null;
  emblem: boolean;
}

function computeSlots(recipe: LogoRecipe): Slots {
  const { layout, tagline } = recipe;
  const vb = logoViewBox(layout);
  const hasTagline = tagline.trim().length > 0;
  if (layout === "horizontal" || layout === "horizontal_reversed") {
    const markSize = 160;
    const markX = layout === "horizontal" ? 24 : vb.w - 24 - markSize;
    const textX = layout === "horizontal" ? 24 + markSize + 24 : 32;
    const budget = vb.w - markSize - 24 * 3;
    return {
      mark: { x: markX, y: (vb.h - markSize) / 2, size: markSize },
      name: {
        x: textX,
        y: hasTagline ? vb.h / 2 - 22 : vb.h / 2,
        anchor: "start",
        budget,
        max: 80,
      },
      tagline: hasTagline
        ? { x: textX, y: vb.h / 2 + 42, anchor: "start", budget }
        : null,
      emblem: false,
    };
  }
  if (layout === "stacked") {
    return {
      mark: { x: (vb.w - 150) / 2, y: 24, size: 150 },
      name: {
        x: vb.w / 2,
        y: hasTagline ? 240 : 262,
        anchor: "middle",
        budget: vb.w - 48,
        max: 64,
      },
      tagline: hasTagline
        ? { x: vb.w / 2, y: 300, anchor: "middle", budget: vb.w - 64 }
        : null,
      emblem: false,
    };
  }
  if (layout === "emblem") {
    return {
      mark: { x: (vb.w - 280) / 2, y: 20, size: 280 },
      name: {
        x: vb.w / 2,
        y: 20 + 280 * 0.68,
        anchor: "middle",
        budget: 280 * 0.72,
        max: 44,
      },
      tagline: hasTagline
        ? { x: vb.w / 2, y: 20 + 280 + 46, anchor: "middle", budget: vb.w - 64 }
        : null,
      emblem: true,
    };
  }
  // name_only
  return {
    mark: null,
    name: {
      x: vb.w / 2,
      y: hasTagline ? vb.h / 2 - 18 : vb.h / 2,
      anchor: "middle",
      budget: vb.w - 64,
      max: 88,
    },
    tagline: hasTagline
      ? { x: vb.w / 2, y: vb.h / 2 + 46, anchor: "middle", budget: vb.w - 96 }
      : null,
    emblem: false,
  };
}

interface LogoRendererProps {
  recipe: LogoRecipe;
  width?: number;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
}

export function LogoRenderer({
  recipe,
  width = 320,
  className,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: LogoRendererProps) {
  const vb = logoViewBox(recipe.layout);
  const slots = computeSlots(recipe);
  const { elements, colors, typography } = recipe;
  const name = applyCase(recipe.name, typography.name);
  const nameSize = fitFontSize(
    name,
    typography.name,
    slots.name.budget,
    slots.name.max,
  );
  const tagline = applyCase(recipe.tagline, typography.tagline);
  const taglineSize = slots.tagline
    ? Math.min(
        nameSize * 0.42,
        fitFontSize(tagline, typography.tagline, slots.tagline.budget, 30),
      )
    : 0;

  // In the emblem layout the badge is the big container; name sits inside it
  // and must contrast with the badge fill -> use colors.mark for the name.
  const nameColor = slots.emblem ? colors.mark : colors.text;

  const place = (key: "mark" | "name" | "tagline", cx: number, cy: number) => {
    const p = elements[key];
    return `translate(${p.offset[0] + cx * (1 - p.scale)}, ${p.offset[1] + cy * (1 - p.scale)}) scale(${p.scale})`;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      width={width}
      height={(width * vb.h) / vb.w}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {slots.mark && (
        <g
          data-part="mark"
          transform={place(
            "mark",
            slots.mark.x + slots.mark.size / 2,
            slots.mark.y + slots.mark.size / 2,
          )}
        >
          <g transform={`translate(${slots.mark.x}, ${slots.mark.y})`}>
            <ComposedMark
              recipe={recipe}
              size={slots.mark.size}
              emblem={slots.emblem}
            />
          </g>
        </g>
      )}
      <g data-part="name" transform={place("name", slots.name.x, slots.name.y)}>
        <TextEl
          value={recipe.name}
          style={typography.name}
          color={nameColor}
          x={slots.name.x}
          y={slots.name.y}
          anchor={slots.name.anchor}
          fontSize={nameSize}
        />
      </g>
      {slots.tagline && (
        <g
          data-part="tagline"
          transform={place("tagline", slots.tagline.x, slots.tagline.y)}
        >
          <TextEl
            value={recipe.tagline}
            style={typography.tagline}
            color={colors.tagline}
            x={slots.tagline.x}
            y={slots.tagline.y}
            anchor={slots.tagline.anchor}
            fontSize={taglineSize}
          />
        </g>
      )}
    </svg>
  );
}

export function MarkRenderer({
  recipe,
  size = 96,
  svgRef,
}: {
  recipe: LogoRecipe;
  size?: number;
  svgRef?: Ref<SVGSVGElement>;
}) {
  // Square export/preview: badge fills the box; never renders name or
  // tagline (spec: "Square mark" rule). Only name_only needs the initials
  // fallback — every other layout (emblem included) carries a real mark.
  const needsFallback =
    recipe.layout === "name_only" && recipe.mark.type !== "image";
  const markRecipe: LogoRecipe = needsFallback
    ? {
        ...recipe,
        mark: { type: "initials", style: "plain" },
        badge: {
          ...recipe.badge,
          shape: recipe.badge.shape === "none" ? "rounded" : recipe.badge.shape,
        },
      }
    : recipe;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <ComposedMark recipe={markRecipe} size={MARK_VIEWBOX} />
    </svg>
  );
}
