// A QR code layer: a web address as a square of squares, in her colours, with the quiet border a phone's
// camera needs around it. Drawn as one SVG path, so it stays sharp at any size and in a downloaded image.

import { encode } from "uqr";

/** The path of the dark squares of `text`'s code, and how many squares a side has (border included). */
export function qrPath(text: string): { d: string; size: number } {
  // M: it still reads with about a seventh of its squares lost (a smudge on a printed poster).
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { d, size };
}

export function QrCode({
  text,
  fill,
  back,
}: {
  text: string;
  fill: string;
  back: string;
}) {
  const { d, size } = qrPath(text);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill={back} />
      <path d={d} fill={fill} />
    </svg>
  );
}
