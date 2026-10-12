import { useId } from "react";
import type { LogoMark } from "@/types/tenant";

const FILL: Record<string, string> = {
  mark: "currentColor",
  mark2: "currentColor",
  accent: "var(--accent, currentColor)",
};

/** A library logo's traced mark as crisp vector art in the current text
 * colour (the site's own palette), cropped to the artwork. */
export function LogoMarkSvg({
  mark,
  label,
  className,
}: {
  mark: LogoMark;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={mark.box}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      {mark.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={FILL[p.role] ?? "currentColor"}
          fillRule={p.fill_rule}
          opacity={p.opacity ?? (p.role === "mark2" ? 0.55 : undefined)}
        />
      ))}
    </svg>
  );
}

/** A flat library mark shown from its transparent image, redrawn in the
 * current text colour. The filter turns ink darkness into coverage (``gain``
 * lifts the darkest ink to full strength), so white areas inside the mark
 * stay clear. It works on another origin's image: nothing is read back. */
export function TintedMark({
  src,
  gain,
  label,
  className,
}: {
  src: string;
  gain: number;
  label?: string;
  className?: string;
}) {
  const id = `mark-tint-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix
          type="matrix"
          values={`0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${-0.2126 * gain} ${-0.7152 * gain} ${-0.0722 * gain} ${gain} 0`}
          result="ink"
        />
        <feFlood floodColor="currentColor" />
        <feComposite in2="ink" operator="in" />
      </filter>
      <image
        href={src}
        width="100"
        height="100"
        preserveAspectRatio="xMidYMid meet"
        filter={`url(#${id})`}
      />
    </svg>
  );
}
