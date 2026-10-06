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
