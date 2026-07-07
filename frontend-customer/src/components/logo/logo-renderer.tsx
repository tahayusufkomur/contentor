// Pure SVG renderer for a Logo Studio recipe. Single source of truth:
// live preview, fine-tune canvas, AI suggestion cards, and PNG export all
// render through this component, so they can never drift.
import type { Ref } from "react";
import { LOGO_ICONS, initialsFor } from "@/lib/logo/catalog";
import type { LogoRecipe } from "@/types/logo";

export const LOGO_VIEWBOX = { w: 640, h: 200 };
export const MARK_VIEWBOX = 256;

const BADGE_RX: Record<string, number> = {
  circle: -1,
  rounded: 24,
  squircle: 48,
  none: 0,
};

function Badge({
  shape,
  size,
  fill,
}: {
  shape: string;
  size: number;
  fill: string;
}) {
  if (shape === "none") return null;
  if (shape === "circle")
    return <circle cx={size / 2} cy={size / 2} r={size / 2} fill={fill} />;
  return (
    <rect
      width={size}
      height={size}
      rx={BADGE_RX[shape] * (size / 160)}
      fill={fill}
    />
  );
}

/** The mark drawn into a size×size box anchored at (0,0). */
function Mark({ recipe, size }: { recipe: LogoRecipe; size: number }) {
  const { mark, badge, colors, font } = recipe;
  const hasBadge = badge !== "none";
  const fg = hasBadge ? colors.mark_fg : colors.badge_bg;
  const inner = size * (hasBadge ? 0.55 : 0.8);
  const pad = (size - inner) / 2;
  let content = null;
  if (mark.type === "icon") {
    const Icon = LOGO_ICONS[mark.icon];
    if (Icon) {
      // lucide components render a nested <svg>; x/y/width/height place it.
      content = (
        <Icon
          x={pad}
          y={pad}
          width={inner}
          height={inner}
          color={fg}
          strokeWidth={1.75}
        />
      );
    }
  } else if (mark.type === "image") {
    content = (
      <image
        href={mark.url}
        x={pad}
        y={pad}
        width={inner}
        height={inner}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  if (!content) {
    // initials (also the fallback for unknown icon names / missing image url)
    const initials = initialsFor(recipe.name);
    content = (
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={`'${font}', sans-serif`}
        fontWeight={700}
        fontSize={size * (initials.length > 1 ? 0.38 : 0.5)}
        fill={fg}
      >
        {initials}
      </text>
    );
  }
  return (
    <g>
      <Badge shape={badge} size={size} fill={colors.badge_bg} />
      {content}
    </g>
  );
}

interface LogoRendererProps {
  recipe: LogoRecipe;
  width?: number;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
}

export function LogoRenderer({
  recipe,
  width = 320,
  className,
  svgRef,
}: LogoRendererProps) {
  const { layout, name, colors, font, overrides } = recipe;
  const markSize = 160;
  const markY = (LOGO_VIEWBOX.h - markSize) / 2;
  const showMark = layout !== "name_only";
  const textX = showMark ? 24 + markSize + 24 : 32;
  const budget = LOGO_VIEWBOX.w - textX - 24;
  const fontSize = Math.max(
    30,
    Math.min(80, budget / (0.58 * Math.max(name.length, 3))),
  );
  const [mdx, mdy] = overrides.mark_offset;
  const [ndx, ndy] = overrides.name_offset;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${LOGO_VIEWBOX.w} ${LOGO_VIEWBOX.h}`}
      width={width}
      height={(width * LOGO_VIEWBOX.h) / LOGO_VIEWBOX.w}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {showMark && (
        <g
          data-part="mark"
          transform={`translate(${24 + mdx + (markSize * (1 - overrides.mark_scale)) / 2}, ${markY + mdy + (markSize * (1 - overrides.mark_scale)) / 2}) scale(${overrides.mark_scale})`}
        >
          <Mark recipe={recipe} size={markSize} />
        </g>
      )}
      <g
        data-part="name"
        transform={`translate(${ndx}, ${ndy}) scale(${overrides.name_scale})`}
        style={{ transformOrigin: `${textX}px ${LOGO_VIEWBOX.h / 2}px` }}
      >
        <text
          x={textX}
          y={LOGO_VIEWBOX.h / 2}
          dominantBaseline="central"
          fontFamily={`'${font}', sans-serif`}
          fontWeight={700}
          fontSize={fontSize}
          fill={colors.text}
        >
          {name}
        </text>
      </g>
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
  // Square export/preview: badge fills the box; name_only recipes fall back
  // to an initials mark so the favicon is never empty.
  const markRecipe: LogoRecipe =
    recipe.layout === "name_only" && recipe.mark.type !== "image"
      ? {
          ...recipe,
          mark: { type: "initials" },
          badge: recipe.badge === "none" ? "rounded" : recipe.badge,
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
      <Mark recipe={markRecipe} size={MARK_VIEWBOX} />
    </svg>
  );
}
