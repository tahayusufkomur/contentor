import { SITE_STYLES } from "@shared/sections/styles";
import type { SiteStyle } from "@shared/sections/types";

export { SITE_STYLES };

export function getSiteStyle(id?: string | null): SiteStyle | undefined {
  return id ? SITE_STYLES[id] : undefined;
}

const DESTRUCTIVE = "oklch(0.577 0.245 27.33)";

/** Each style's content width (its sections' WRAP) — the site header and
 *  footer align to it via --site-wrap / --site-gutter(-md). */
const SITE_WRAP: Record<string, string> = {
  journal: "82rem",
  kinetic: "90rem",
  grid: "88rem",
  pop: "84rem",
};
const DESTRUCTIVE_FG = "oklch(0.985 0 0)";

/** A style's compact palette → the full theme variable set the whole tenant
 *  app reads (shadcn tokens + brand + charts), plus the section-only tokens
 *  (--inverse, --font-display, --radius). Keys are without the leading `--`. */
export function styleVars(style: SiteStyle): Record<string, string> {
  const p = style.palette;
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
export function styleScope(style: SiteStyle): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(styleVars(style))) out[`--${k}`] = v;
  out.backgroundColor = "var(--background)";
  out.color = "var(--foreground)";
  out.fontFamily = "var(--font-sans)";
  return out;
}

/** :root CSS for a styled tenant. Styles are designed as a single mode, so
 *  .dark/.dim get the same values (the layout also forces light). */
export function styleRootCss(style: SiteStyle, extraCss = ""): string {
  const vars = Object.entries(styleVars(style))
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");
  const safeExtra = (extraCss || "").replace(/[<>]/g, "");
  return `:root, .dark, .dim {\n${vars}\n}\n${safeExtra}`;
}

export function styleFontsHref(style: SiteStyle): string {
  return `https://fonts.googleapis.com/css2?${style.fonts.googleQuery}&display=swap`;
}
