import type { BadgeShape, RecipeLayout } from "@/types/logo";

export const LAYOUTS: { id: RecipeLayout; label: string }[] = [
  { id: "horizontal", label: "Mark + name" },
  { id: "horizontal_reversed", label: "Name + mark" },
  { id: "stacked", label: "Stacked" },
  { id: "emblem", label: "Emblem" },
  { id: "name_only", label: "Name only" },
];
export const BADGES: { id: BadgeShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Squircle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "shield", label: "Shield" },
  { id: "diamond", label: "Diamond" },
  { id: "none", label: "None" },
];
export const VIBES = [
  "Modern",
  "Elegant",
  "Bold",
  "Playful",
  "Minimal",
] as const;
export const WEIGHT_LABELS: Record<number, string> = {
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
};

export const toggleClass = (active: boolean) =>
  `rounded-md border px-2.5 py-1.5 text-xs ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`;
