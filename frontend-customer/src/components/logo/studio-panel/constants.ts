import type { BadgeShape, RecipeLayout } from "@/types/logo";

// Names are messages: admin.logo.panel.layout.<id>, .badge.<id>, .weight.<n>.
export const LAYOUTS: RecipeLayout[] = [
  "horizontal",
  "horizontal_reversed",
  "stacked",
  "emblem",
  "name_only",
];
export const BADGES: BadgeShape[] = [
  "circle",
  "rounded",
  "squircle",
  "hexagon",
  "shield",
  "diamond",
  "none",
];
export const VIBES = [
  "Modern",
  "Elegant",
  "Bold",
  "Playful",
  "Minimal",
] as const;
export const toggleClass = (active: boolean) =>
  `rounded-md border px-2.5 py-1.5 text-xs ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`;
