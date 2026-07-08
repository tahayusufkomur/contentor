// Seeded parametric SVG symbol generators — the "abstract" mark family.
// Pure data ("spec") functions: (family, seed) -> shapes in unit space
// (0..1 box). components/logo/abstract-mark.tsx maps a spec to JSX. Keeping
// the spec pure lets vitest assert determinism without a DOM.
import type { AbstractFamily } from "@/types/logo";

export const ABSTRACT_FAMILIES: AbstractFamily[] = [
  "orbits",
  "bloom",
  "waves",
  "prism",
  "knot",
  "grid",
];

export type AbstractShape =
  | {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      opacity: number;
      stroke?: boolean;
      strokeWidth?: number;
    }
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      rotate: number;
      opacity: number;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      rx: number;
      opacity: number;
    }
  | {
      kind: "path";
      d: string;
      opacity: number;
      stroke?: boolean;
      strokeWidth?: number;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeWidth: number;
      opacity: number;
    };

// mulberry32 — tiny deterministic PRNG.
function rng(seed: number): () => number {
  let t = (seed || 1) >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const rnd = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]!;

function orbits(r: () => number): AbstractShape[] {
  const shapes: AbstractShape[] = [
    { kind: "circle", cx: 0.5, cy: 0.5, r: rnd(r, 0.1, 0.16), opacity: 1 },
    {
      kind: "circle",
      cx: 0.5,
      cy: 0.5,
      r: rnd(r, 0.3, 0.38),
      opacity: 0.9,
      stroke: true,
      strokeWidth: 0.035,
    },
  ];
  const satellites = 2 + Math.floor(r() * 3);
  const ringR = (shapes[1] as { r: number }).r;
  for (let i = 0; i < satellites; i++) {
    const a = rnd(r, 0, TAU);
    shapes.push({
      kind: "circle",
      cx: 0.5 + Math.cos(a) * ringR,
      cy: 0.5 + Math.sin(a) * ringR,
      r: rnd(r, 0.045, 0.075),
      opacity: i === 0 ? 1 : 0.7,
    });
  }
  return shapes;
}

function bloom(r: () => number): AbstractShape[] {
  const petals = pick(r, [5, 6, 7, 8]);
  const rx = rnd(r, 0.1, 0.14);
  const ry = rnd(r, 0.2, 0.26);
  const shapes: AbstractShape[] = [];
  for (let i = 0; i < petals; i++) {
    shapes.push({
      kind: "ellipse",
      cx: 0.5,
      cy: 0.5 - ry * 0.85,
      rx,
      ry,
      rotate: (360 / petals) * i,
      opacity: 0.82,
    });
  }
  shapes.push({
    kind: "circle",
    cx: 0.5,
    cy: 0.5,
    r: rnd(r, 0.07, 0.1),
    opacity: 1,
  });
  return shapes;
}

function waves(r: () => number): AbstractShape[] {
  const rows = pick(r, [3, 4]);
  const amp = rnd(r, 0.05, 0.09);
  const shapes: AbstractShape[] = [];
  for (let i = 0; i < rows; i++) {
    const y = 0.3 + (0.4 / (rows - 1)) * i;
    const phase = rnd(r, -0.08, 0.08);
    const d =
      `M0.08 ${y.toFixed(3)}` +
      ` Q${(0.29 + phase).toFixed(3)} ${(y - amp).toFixed(3)} 0.5 ${y.toFixed(3)}` +
      ` T0.92 ${y.toFixed(3)}`;
    shapes.push({
      kind: "path",
      d,
      opacity: 1 - i * 0.22,
      stroke: true,
      strokeWidth: 0.055,
    });
  }
  return shapes;
}

function prism(r: () => number): AbstractShape[] {
  const shapes: AbstractShape[] = [];
  const tris = pick(r, [3, 4]);
  for (let i = 0; i < tris; i++) {
    const cx = rnd(r, 0.4, 0.6);
    const cy = rnd(r, 0.42, 0.58);
    const size = rnd(r, 0.28, 0.42);
    const rot = rnd(r, 0, TAU);
    const pts = [0, 1, 2].map((k) => {
      const a = rot + (TAU / 3) * k;
      return `${(cx + Math.cos(a) * size).toFixed(3)} ${(cy + Math.sin(a) * size).toFixed(3)}`;
    });
    shapes.push({
      kind: "path",
      d: `M${pts[0]} L${pts[1]} L${pts[2]} Z`,
      opacity: i === 0 ? 0.95 : 0.45,
    });
  }
  return shapes;
}

function knot(r: () => number): AbstractShape[] {
  const rings = pick(r, [2, 3]);
  const ringR = rnd(r, 0.17, 0.21);
  const spread = rnd(r, 0.1, 0.14);
  const start = rnd(r, 0, TAU);
  const shapes: AbstractShape[] = [];
  for (let i = 0; i < rings; i++) {
    const a = start + (TAU / rings) * i;
    shapes.push({
      kind: "circle",
      cx: 0.5 + Math.cos(a) * spread,
      cy: 0.5 + Math.sin(a) * spread,
      r: ringR,
      opacity: 0.85,
      stroke: true,
      strokeWidth: 0.05,
    });
  }
  return shapes;
}

function grid(r: () => number): AbstractShape[] {
  const shapes: AbstractShape[] = [];
  const cell = 0.24;
  const gap = 0.04;
  const origin = 0.5 - (cell * 3 + gap * 2) / 2;
  const accent = Math.floor(r() * 9);
  for (let i = 0; i < 9; i++) {
    if (r() < 0.25 && i !== accent) continue; // seeded holes
    const x = origin + (i % 3) * (cell + gap);
    const y = origin + Math.floor(i / 3) * (cell + gap);
    if (i === accent) {
      shapes.push({
        kind: "circle",
        cx: x + cell / 2,
        cy: y + cell / 2,
        r: cell / 2,
        opacity: 1,
      });
    } else {
      shapes.push({
        kind: "rect",
        x,
        y,
        w: cell,
        h: cell,
        rx: cell * 0.28,
        opacity: 0.8,
      });
    }
  }
  return shapes;
}

const GENERATORS: Record<AbstractFamily, (r: () => number) => AbstractShape[]> =
  {
    orbits,
    bloom,
    waves,
    prism,
    knot,
    grid,
  };

export function abstractSpec(
  family: AbstractFamily,
  seed: number,
): AbstractShape[] {
  return GENERATORS[family](rng(seed));
}
