// OKLCH → linear sRGB → WCAG relative luminance. Enough for token checks;
// not a colour library. (ponytail: no gamut mapping, out-of-gamut channels
// are clamped — our tokens are all in gamut.)

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function parseOklch(css: string): Oklch | null {
  const m = css.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return null;
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

function linearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

function luminance(color: string): number {
  const parsed = parseOklch(color);
  if (!parsed) throw new Error(`not an oklch() colour: ${color}`);
  const [r, g, b] = linearSrgb(parsed);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two oklch() colours, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `--name: value;` declarations of one selector block, as a map. */
export function readTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}
