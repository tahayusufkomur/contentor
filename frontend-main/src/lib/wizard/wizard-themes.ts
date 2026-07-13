/** Swatch colors for wizard previews. primary values MIRROR
 * frontend-customer/src/lib/themes.ts primaryHex — keep in sync. */

export const THEME_SWATCHES: Record<string, { primary: string; soft: string; ink: string }> = {
  ocean: { primary: "#1a56db", soft: "#dbeafe", ink: "#0f2f6d" },
  ember: { primary: "#c2410c", soft: "#ffedd5", ink: "#7c2d12" },
  forest: { primary: "#15803d", soft: "#dcfce7", ink: "#14532d" },
  sunset: { primary: "#e11d48", soft: "#ffe4e6", ink: "#881337" },
  violet: { primary: "#7c3aed", soft: "#ede9fe", ink: "#4c1d95" },
  slate: { primary: "#334155", soft: "#e2e8f0", ink: "#0f172a" },
};

export const FONT_STACKS: Record<string, string> = {
  Inter: "var(--font-wizard-inter, 'Inter'), system-ui, sans-serif",
  Nunito: "var(--font-wizard-nunito, 'Nunito'), system-ui, sans-serif",
  "Playfair Display": "var(--font-wizard-playfair, 'Playfair Display'), serif",
};
