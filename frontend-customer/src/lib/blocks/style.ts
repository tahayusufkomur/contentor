// Per-block style overrides (hybrid theme-lock). A block stays content-only by
// default; an optional `style` adds a theme-token background, a vertical-spacing
// step, and/or text alignment. These are applied by `BlockRenderer` as a wrapper
// that overrides the block's own `<section>` via `[&>*]:!…` (important, so the
// override always wins regardless of the block's built-in classes). Values are
// theme TOKENS — never raw colors — so dark mode and theme switching keep
// working. The allowlist here mirrors the server's `BLOCK_STYLE_ALLOWLIST`
// (backend `defaults.py`), which is authoritative.

import type { Block } from "@/types/tenant";

export type StyleControl = "background" | "spacing" | "align";

// Each color preset pairs a surface token with its contrasting foreground, and
// forces that foreground onto the block's text elements (headings, paragraphs,
// list items, spans) — so a background change always keeps text readable,
// regardless of the text colors a block hard-codes. On the Brand/Accent
// backgrounds, buttons flip to an inverse fill and links take the contrasting
// foreground so they stay visible. Full class strings are spelled out as
// literals so Tailwind's JIT scanner generates them.
const BACKGROUND_CLASSES: Record<string, string> = {
  muted:
    "[&>*]:!bg-muted [&>*]:!text-foreground [&_h1]:!text-foreground [&_h2]:!text-foreground [&_h3]:!text-foreground [&_h4]:!text-foreground [&_p]:!text-foreground [&_li]:!text-foreground [&_span]:!text-foreground",
  card: "[&>*]:!bg-card [&>*]:!text-card-foreground [&_h1]:!text-card-foreground [&_h2]:!text-card-foreground [&_h3]:!text-card-foreground [&_h4]:!text-card-foreground [&_p]:!text-card-foreground [&_li]:!text-card-foreground [&_span]:!text-card-foreground",
  accent:
    "[&>*]:!bg-accent [&>*]:!text-accent-foreground [&_h1]:!text-accent-foreground [&_h2]:!text-accent-foreground [&_h3]:!text-accent-foreground [&_h4]:!text-accent-foreground [&_p]:!text-accent-foreground [&_li]:!text-accent-foreground [&_span]:!text-accent-foreground [&_a]:!text-accent-foreground [&_strong]:!text-accent-foreground [&_small]:!text-accent-foreground [&_label]:!text-accent-foreground [&_[data-slot=button]]:!bg-accent-foreground [&_[data-slot=button]]:!text-accent",
  primary:
    "[&>*]:!bg-primary [&>*]:!text-primary-foreground [&_h1]:!text-primary-foreground [&_h2]:!text-primary-foreground [&_h3]:!text-primary-foreground [&_h4]:!text-primary-foreground [&_p]:!text-primary-foreground [&_li]:!text-primary-foreground [&_span]:!text-primary-foreground [&_a]:!text-primary-foreground [&_strong]:!text-primary-foreground [&_small]:!text-primary-foreground [&_label]:!text-primary-foreground [&_[data-slot=button]]:!bg-primary-foreground [&_[data-slot=button]]:!text-primary",
};

const SPACING_CLASSES: Record<string, string> = {
  none: "[&>*]:!py-0",
  compact: "[&>*]:!py-8",
  spacious: "[&>*]:!py-28",
  // "normal" intentionally omitted — the block keeps its own default padding.
};

const ALIGN_CLASSES: Record<string, string> = {
  left: "[&>*]:!text-left [&>*]:!justify-start",
  center: "[&>*]:!text-center [&>*]:!justify-center",
  right: "[&>*]:!text-right [&>*]:!justify-end",
};

/** Tailwind classes for a block's optional style override, applied by the
 *  renderer as a wrapper. Returns "" when there's no (effective) override. */
export function blockStyleClasses(block: Pick<Block, "style">): string {
  const s = block.style;
  if (!s) return "";
  return [
    s.background && BACKGROUND_CLASSES[s.background],
    s.spacing && SPACING_CLASSES[s.spacing],
    s.align && ALIGN_CLASSES[s.align],
  ]
    .filter(Boolean)
    .join(" ");
}

// Which style controls the editor surfaces per block type (a subset of — never
// wider than — the server allowlist). Structural/dynamic blocks get outer
// chrome only so their themed inner cards stay consistent.
export const STYLE_CONTROLS: Record<string, StyleControl[]> = {
  hero: [], // hero uses layout presets instead of generic style overrides
  richText: ["background", "spacing", "align"],
  imageText: ["background", "spacing"],
  cta: ["background", "spacing", "align"],
  stats: ["background", "spacing", "align"],
  testimonials: ["background", "spacing"],
  faq: ["background", "spacing"],
  logos: ["background", "spacing"],
  banner: ["align"],
  gallery: ["spacing"],
  video: ["spacing"],
  contact: ["background", "spacing"],
  courseGrid: ["spacing"],
  pricingPlans: ["spacing"],
  upcomingEvents: ["spacing"],
  storeProducts: ["spacing"],
};

export function styleControlsFor(type: string): StyleControl[] {
  return STYLE_CONTROLS[type] ?? [];
}

/** Tailwind classes for a section heading at the given level (h2/h3/h4). */
export function headingClasses(level?: string): string {
  switch (level) {
    case "h1":
      return "font-display text-4xl font-bold tracking-tight md:text-5xl";
    case "h3":
      return "font-display text-2xl font-bold tracking-tight";
    case "h4":
      return "font-display text-xl font-semibold tracking-tight";
    default:
      return "font-display text-3xl font-bold tracking-tight";
  }
}

// Option metadata for the editor UI. The first option of each is the "no
// override" default (cleared from the stored style).
export const STYLE_OPTIONS: Record<
  StyleControl,
  { label: string; value: string }[]
> = {
  background: [
    { label: "Default", value: "default" },
    { label: "Muted", value: "muted" },
    { label: "Card", value: "card" },
    { label: "Accent", value: "accent" },
    { label: "Brand", value: "primary" },
  ],
  spacing: [
    { label: "None", value: "none" },
    { label: "Compact", value: "compact" },
    { label: "Normal", value: "normal" },
    { label: "Spacious", value: "spacious" },
  ],
  align: [
    { label: "Auto", value: "auto" },
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" },
  ],
};

/** The value treated as "no override" for a control (cleared from `style`).
 *  `background:"default"` / `spacing:"normal"` are dropped by the server too;
 *  `align:"auto"` isn't a valid enum, so it's likewise dropped (= no override). */
export const STYLE_DEFAULTS: Record<StyleControl, string> = {
  background: "default",
  spacing: "normal",
  align: "auto",
};
