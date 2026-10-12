import { SITE_STYLES } from "@shared/sections/styles";
import type { SiteStyle, SiteStylePalette } from "@shared/sections/types";

export { SITE_STYLES };

export function getSiteStyle(id?: string | null): SiteStyle | undefined {
  return id ? SITE_STYLES[id] : undefined;
}

/** The looks a coach can filter by, in the order the chips show them. The
 *  tags themselves live in each style's manifest (`tags`). */
export const STYLE_TAGS: [tag: string, label: string][] = [
  ["selling", "Made to sell"],
  ["expertise", "Shows expertise"],
  ["short", "Short page"],
  ["long", "Long page"],
  ["sensual", "Soft and moody"],
  ["confident", "Confident"],
  ["sexy", "Sexy"],
  ["playful", "Playful"],
];

/** The palette a site wears: the style's own, or one of its alternatives.
 *  An id the style does not have (e.g. left over from a style switch) means
 *  the style's own. */
export function paletteOf(
  style: SiteStyle,
  paletteId?: string | null,
): SiteStylePalette {
  return (
    style.palettes?.find((p) => paletteId && p.id === paletteId)?.palette ??
    style.palette
  );
}

const DESTRUCTIVE = "oklch(0.577 0.245 27.33)";

const parseOklch = (c: string) => {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
  return m ? { l: +m[1], c: +m[2], h: +m[3] } : null;
};

/** A palette is dark when its ground is. */
export const isDarkPalette = (p: SiteStylePalette) =>
  (parseOklch(p.background)?.l ?? 1) < 0.5;

/** The palette in the requested scheme. Its own scheme is returned as is; the
 *  other is derived — ground and ink swapped for tints of the palette's own
 *  hue, brand colours lifted or deepened to stay readable on them (an ink
 *  primary swapped with the ink) — so any style can honour the light/dark
 *  toggle. */
export function modePalette(
  p: SiteStylePalette,
  mode: "light" | "dark",
): SiteStylePalette {
  if (isDarkPalette(p) === (mode === "dark")) return p;
  const dark = mode === "dark";
  // Dark ink carries the brand hue on a light palette; on a dark one the ground does.
  const tint = parseOklch(dark ? p.foreground : p.background);
  const h = tint?.h ?? 0;
  const c = Math.min(tint?.c ?? 0, dark ? 0.04 : 0.02);
  const ground = dark ? `oklch(0.18 ${c} ${h})` : `oklch(0.975 ${c} ${h})`;
  const ink = dark ? `oklch(0.95 0.01 ${h})` : `oklch(0.22 0.02 ${h})`;
  const mix = (a: string, pct: number, b: string, space = "oklab") =>
    `color-mix(in ${space}, ${a} ${pct}%, ${b})`;
  // A brand colour with no hue of its own is the palette's ink (journal's
  // black button): it swaps with the paper like the ink does. Lifted like a
  // colour it lands on a flat mid-grey that reads as a disabled button.
  const brand = (color: string) =>
    (parseOklch(color)?.c ?? 1) < 0.04
      ? ink
      : dark
        ? mix(color, 55, "white", "oklch")
        : mix(color, 70, "black", "oklch");
  return {
    background: ground,
    foreground: ink,
    surface: mix(ground, 91, ink),
    mutedForeground: mix(ink, 62, ground),
    primary: brand(p.primary),
    primaryForeground: ground,
    accent: brand(p.accent),
    accentForeground: ground,
    border: mix(ground, 80, ink),
    inverse: dark ? `oklch(0.25 ${c} ${h})` : `oklch(0.93 ${c} ${h})`,
    inverseForeground: ink,
  };
}

/** The theme a visitor starts in: a style made dark wears its own look. */
export function styleDefaultTheme(
  style: SiteStyle,
  paletteId?: string | null,
): "light" | "dark" {
  return isDarkPalette(paletteOf(style, paletteId)) ? "dark" : "light";
}

/** Where next-themes keeps a visitor's light/dark choice. A styled site keys it
 *  per look (and colourway): the choice made on one look must not repaint
 *  another, or its derived opposite scheme shows instead of the look's own
 *  colours. The default theme applies again whenever the look changes. */
export function themeStorageKey(
  styleId?: string | null,
  paletteId?: string | null,
): string {
  return getSiteStyle(styleId)
    ? `theme:${styleId}:${paletteId ?? ""}`
    : "theme";
}

/** An oklch() colour as sRGB hex (for the browser bar / PWA manifest, which
 *  take no oklch). Undefined when the string is not oklch(). */
export function oklchToHex(color: string): string | undefined {
  const o = parseOklch(color);
  if (!o) return undefined;
  const a = o.c * Math.cos((o.h * Math.PI) / 180);
  const b = o.c * Math.sin((o.h * Math.PI) / 180);
  const l_ = (o.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (o.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (o.l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    lin
      .map((v) => {
        const c = Math.min(1, Math.max(0, v));
        const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(g * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

/** The modes the toggle steps through: styles are light or dark, no dim. */
export const themeModes = (styled: boolean) =>
  styled ? ["light", "dark"] : ["light", "dim", "dark"];

/** Each style's content width (its sections' WRAP) — the site header and
 *  footer align to it via --site-wrap / --site-gutter(-md). */
const SITE_WRAP: Record<string, string> = {
  journal: "82rem",
  kinetic: "90rem",
  grid: "88rem",
  pop: "84rem",
  ledger: "80rem",
  darkroom: "96rem",
  nocturne: "76rem",
  primer: "78rem",
  tavola: "84rem",
  encore: "88rem",
  trail: "86rem",
  maison: "80rem",
  studiofloor: "90rem",
  atelier: "80rem",
  dojo: "84rem",
  workshop: "82rem",
  terminal: "80rem",
  sprout: "80rem",
  manuscript: "72rem",
  sanctum: "80rem",
  velvet: "78rem",
};
const DESTRUCTIVE_FG = "oklch(0.985 0 0)";

/** A style's compact palette → the full theme variable set the whole tenant
 *  app reads (shadcn tokens + brand + charts), plus the section-only tokens
 *  (--inverse, --font-display, --radius). Keys are without the leading `--`. */
export function styleVars(
  style: SiteStyle,
  paletteId?: string | null,
  mode?: "light" | "dark",
): Record<string, string> {
  const own = paletteOf(style, paletteId);
  const p = mode ? modePalette(own, mode) : own;
  return {
    background: p.background,
    foreground: p.foreground,
    card: p.surface,
    "card-foreground": p.foreground,
    popover: p.background,
    "popover-foreground": p.foreground,
    primary: p.primary,
    "primary-foreground": p.primaryForeground,
    secondary: p.surface,
    "secondary-foreground": p.foreground,
    muted: p.surface,
    "muted-foreground": p.mutedForeground,
    accent: p.accent,
    "accent-foreground": p.accentForeground,
    destructive: DESTRUCTIVE,
    "destructive-foreground": DESTRUCTIVE_FG,
    border: p.border,
    input: p.border,
    ring: p.primary,
    "brand-primary": p.primary,
    "brand-accent": p.accent,
    "brand-warm": p.accent,
    "brand-surface": p.surface,
    "chart-1": p.primary,
    "chart-2": p.accent,
    "chart-3": p.mutedForeground,
    "chart-4": p.foreground,
    "chart-5": p.border,
    inverse: p.inverse,
    "inverse-foreground": p.inverseForeground,
    "font-display": `'${style.fonts.display}', Georgia, serif`,
    "font-sans": `'${style.fonts.body}', system-ui, sans-serif`,
    radius: style.radius,
    "cinematic-bg": "none",
    "site-wrap": SITE_WRAP[style.id] ?? "80rem",
    "site-gutter": "1.25rem",
    "site-gutter-md": "2rem",
  };
}

/** Inline `style` object scoping a style's tokens to a subtree (showcase,
 *  wizard previews) without touching :root. */
export function styleScope(
  style: SiteStyle,
  paletteId?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(styleVars(style, paletteId)))
    out[`--${k}`] = v;
  out.backgroundColor = "var(--background)";
  out.color = "var(--foreground)";
  out.fontFamily = "var(--font-sans)";
  return out;
}

/** :root CSS for a styled tenant: the light scheme on :root, the dark one
 *  (.dark, and .dim for visitors who stored it before) beside it. */
export function styleRootCss(
  style: SiteStyle,
  extraCss = "",
  paletteId?: string | null,
): string {
  const block = (mode: "light" | "dark") =>
    Object.entries(styleVars(style, paletteId, mode))
      .map(([k, v]) => `  --${k}: ${v};`)
      .join("\n");
  const safeExtra = (extraCss || "").replace(/[<>]/g, "");
  return `:root {\n${block("light")}\n}\n.dark, .dim {\n${block("dark")}\n}\n${safeExtra}`;
}

export function styleFontsHref(style: SiteStyle): string {
  return `https://fonts.googleapis.com/css2?${style.fonts.googleQuery}&display=swap`;
}
