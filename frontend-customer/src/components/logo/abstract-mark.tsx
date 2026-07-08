// Renders an abstractSpec into a size×size SVG group. Stroked shapes use
// fill:none so the mark reads as line-work; opacity layers give depth with
// a single brand color.
import { abstractSpec } from "@/lib/logo/abstract";
import type { AbstractFamily } from "@/types/logo";

export function AbstractMark({
  family,
  seed,
  color,
  size,
}: {
  family: AbstractFamily;
  seed: number;
  color: string;
  size: number;
}) {
  const shapes = abstractSpec(family, seed);
  return (
    <g>
      {shapes.map((s, i) => {
        if (s.kind === "circle") {
          return s.stroke ? (
            <circle key={i} cx={s.cx * size} cy={s.cy * size} r={s.r * size} fill="none" stroke={color} strokeWidth={(s.strokeWidth ?? 0.04) * size} opacity={s.opacity} />
          ) : (
            <circle key={i} cx={s.cx * size} cy={s.cy * size} r={s.r * size} fill={color} opacity={s.opacity} />
          );
        }
        if (s.kind === "ellipse") {
          return (
            <ellipse
              key={i}
              cx={s.cx * size}
              cy={s.cy * size}
              rx={s.rx * size}
              ry={s.ry * size}
              transform={`rotate(${s.rotate} ${0.5 * size} ${0.5 * size})`}
              fill={color}
              opacity={s.opacity}
            />
          );
        }
        if (s.kind === "rect") {
          return <rect key={i} x={s.x * size} y={s.y * size} width={s.w * size} height={s.h * size} rx={s.rx * size} fill={color} opacity={s.opacity} />;
        }
        if (s.kind === "line") {
          return <line key={i} x1={s.x1 * size} y1={s.y1 * size} x2={s.x2 * size} y2={s.y2 * size} stroke={color} strokeWidth={s.strokeWidth * size} opacity={s.opacity} strokeLinecap="round" />;
        }
        // path: scale unit coords via transform (numbers inside d are 0..1)
        return s.stroke ? (
          <path key={i} d={s.d} transform={`scale(${size})`} fill="none" stroke={color} strokeWidth={s.strokeWidth ?? 0.04} opacity={s.opacity} strokeLinecap="round" />
        ) : (
          <path key={i} d={s.d} transform={`scale(${size})`} fill={color} opacity={s.opacity} />
        );
      })}
    </g>
  );
}
