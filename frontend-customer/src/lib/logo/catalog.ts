// Logo Studio catalog: curated lucide icons (8 niche groups), brand fonts
// and palettes — the single source of truth for the client-side composer.
// KEEP IN SYNC: backend/apps/tenant_config/logo_recipe.py PALETTE_IDS lists
// exactly the PALETTES ids below.
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Apple,
  Baby,
  BarChart3,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Brush,
  Cake,
  Camera,
  Cat,
  ChefHat,
  Coffee,
  Compass,
  Cookie,
  Crown,
  Dog,
  Drum,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  Gem,
  Globe,
  GraduationCap,
  Guitar,
  Handshake,
  Headphones,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Leaf,
  Library,
  Lightbulb,
  Medal,
  Mic,
  Moon,
  Mountain,
  Music,
  Music2,
  NotebookPen,
  Palette,
  PawPrint,
  Pencil,
  PenTool,
  Piano,
  Radio,
  Rocket,
  Salad,
  Scissors,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  UtensilsCrossed,
  Wand2,
  Waves,
  Wheat,
  Zap,
} from "lucide-react";
import type { Fill, FontWeight, LogoRecipe } from "@/types/logo";

export const LOGO_ICONS: Record<string, LucideIcon> = {
  "flower-2": Flower2,
  leaf: Leaf,
  sprout: Sprout,
  sun: Sun,
  moon: Moon,
  heart: Heart,
  "heart-pulse": HeartPulse,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  bike: Bike,
  trophy: Trophy,
  medal: Medal,
  flame: Flame,
  zap: Zap,
  activity: Activity,
  footprints: Footprints,
  music: Music,
  "music-2": Music2,
  mic: Mic,
  headphones: Headphones,
  guitar: Guitar,
  piano: Piano,
  drum: Drum,
  radio: Radio,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  pencil: Pencil,
  "pen-tool": PenTool,
  lightbulb: Lightbulb,
  brain: Brain,
  library: Library,
  "notebook-pen": NotebookPen,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  target: Target,
  "bar-chart-3": BarChart3,
  rocket: Rocket,
  globe: Globe,
  handshake: Handshake,
  landmark: Landmark,
  camera: Camera,
  palette: Palette,
  brush: Brush,
  scissors: Scissors,
  "wand-2": Wand2,
  gem: Gem,
  crown: Crown,
  star: Star,
  "chef-hat": ChefHat,
  "utensils-crossed": UtensilsCrossed,
  coffee: Coffee,
  cake: Cake,
  apple: Apple,
  wheat: Wheat,
  salad: Salad,
  cookie: Cookie,
  home: Home,
  "paw-print": PawPrint,
  dog: Dog,
  cat: Cat,
  baby: Baby,
  compass: Compass,
  mountain: Mountain,
  waves: Waves,
};

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  {
    label: "Wellness",
    icons: [
      "flower-2",
      "leaf",
      "sprout",
      "sun",
      "moon",
      "heart",
      "heart-pulse",
      "sparkles",
    ],
  },
  {
    label: "Fitness",
    icons: [
      "dumbbell",
      "bike",
      "trophy",
      "medal",
      "flame",
      "zap",
      "activity",
      "footprints",
    ],
  },
  {
    label: "Music",
    icons: [
      "music",
      "music-2",
      "mic",
      "headphones",
      "guitar",
      "piano",
      "drum",
      "radio",
    ],
  },
  {
    label: "Education",
    icons: [
      "book-open",
      "graduation-cap",
      "pencil",
      "pen-tool",
      "lightbulb",
      "brain",
      "library",
      "notebook-pen",
    ],
  },
  {
    label: "Business",
    icons: [
      "briefcase",
      "trending-up",
      "target",
      "bar-chart-3",
      "rocket",
      "globe",
      "handshake",
      "landmark",
    ],
  },
  {
    label: "Creative",
    icons: [
      "camera",
      "palette",
      "brush",
      "scissors",
      "wand-2",
      "gem",
      "crown",
      "star",
    ],
  },
  {
    label: "Food",
    icons: [
      "chef-hat",
      "utensils-crossed",
      "coffee",
      "cake",
      "apple",
      "wheat",
      "salad",
      "cookie",
    ],
  },
  {
    label: "Lifestyle",
    icons: [
      "home",
      "paw-print",
      "dog",
      "cat",
      "baby",
      "compass",
      "mountain",
      "waves",
    ],
  },
];

export type FontVibe =
  | "Modern"
  | "Elegant"
  | "Bold"
  | "Playful"
  | "Minimal"
  | "Script";
export interface FontEntry {
  family: string;
  vibe: FontVibe;
  weights: FontWeight[];
}

const W_FULL: FontWeight[] = [400, 500, 600, 700, 800];
const W_TO_700: FontWeight[] = [400, 500, 600, 700];
const W_400: FontWeight[] = [400];
const W_400_TO_700: FontWeight[] = [400, 500, 600, 700];

// 24 Google Fonts, 4 per vibe. weights list which of 400..800 the family
// actually ships — the UI and export must only request these.
// KEEP IN SYNC: backend/apps/tenant_config/logo_ai.py _FONT_CATALOG
export const LOGO_FONTS: FontEntry[] = [
  { family: "Inter", vibe: "Modern", weights: W_FULL },
  { family: "Geist", vibe: "Modern", weights: W_FULL },
  { family: "DM Sans", vibe: "Modern", weights: W_FULL },
  { family: "Plus Jakarta Sans", vibe: "Modern", weights: W_FULL },
  { family: "Playfair Display", vibe: "Elegant", weights: W_FULL },
  { family: "Lora", vibe: "Elegant", weights: W_TO_700 },
  { family: "EB Garamond", vibe: "Elegant", weights: W_FULL },
  { family: "Cormorant Garamond", vibe: "Elegant", weights: W_TO_700 },
  { family: "Poppins", vibe: "Bold", weights: W_FULL },
  { family: "Montserrat", vibe: "Bold", weights: W_FULL },
  { family: "Archivo", vibe: "Bold", weights: W_FULL },
  { family: "Space Grotesk", vibe: "Bold", weights: W_TO_700 },
  { family: "Nunito", vibe: "Playful", weights: W_FULL },
  { family: "Quicksand", vibe: "Playful", weights: W_TO_700 },
  { family: "Baloo 2", vibe: "Playful", weights: W_FULL },
  { family: "Fredoka", vibe: "Playful", weights: W_TO_700 },
  { family: "Work Sans", vibe: "Minimal", weights: W_FULL },
  { family: "Manrope", vibe: "Minimal", weights: W_FULL },
  { family: "Sora", vibe: "Minimal", weights: W_FULL },
  { family: "Outfit", vibe: "Minimal", weights: W_FULL },
  { family: "Dancing Script", vibe: "Script", weights: W_400_TO_700 },
  { family: "Great Vibes", vibe: "Script", weights: W_400 },
  { family: "Pacifico", vibe: "Script", weights: W_400 },
  { family: "Caveat", vibe: "Script", weights: W_400_TO_700 },
];

export const LOGO_FONT_FAMILIES = LOGO_FONTS.map((f) => f.family);

export function fontEntry(family: string): FontEntry {
  return LOGO_FONTS.find((f) => f.family === family) ?? LOGO_FONTS[0];
}

export interface Palette {
  id: string;
  label: string;
  badge: Fill;
  mark: string;
  text: string;
  tagline: string;
}

const solid = (color: string): Fill => ({ type: "solid", color });
const linear = (from: string, to: string, angle = 135): Fill => ({
  type: "linear",
  from,
  to,
  angle,
});

// 24 curated palettes. KEEP IN SYNC: backend/apps/tenant_config/
// logo_recipe.py PALETTE_IDS lists exactly these ids.
export function PALETTES(primaryHex: string): Palette[] {
  return [
    {
      id: "theme",
      label: "Your theme",
      badge: solid(primaryHex),
      mark: "#ffffff",
      text: "#111827",
      tagline: "#6b7280",
    },
    {
      id: "ink",
      label: "Ink",
      badge: solid("#111827"),
      mark: "#ffffff",
      text: "#111827",
      tagline: "#6b7280",
    },
    {
      id: "slate",
      label: "Slate",
      badge: solid("#334155"),
      mark: "#ffffff",
      text: "#334155",
      tagline: "#64748b",
    },
    {
      id: "forest",
      label: "Forest",
      badge: solid("#15803d"),
      mark: "#ffffff",
      text: "#14532d",
      tagline: "#4d7c0f",
    },
    {
      id: "terracotta",
      label: "Terracotta",
      badge: solid("#c2410c"),
      mark: "#fff7ed",
      text: "#7c2d12",
      tagline: "#9a3412",
    },
    {
      id: "rose",
      label: "Rose",
      badge: solid("#e11d48"),
      mark: "#fff1f2",
      text: "#881337",
      tagline: "#9f1239",
    },
    {
      id: "violet",
      label: "Violet",
      badge: solid("#7c3aed"),
      mark: "#f5f3ff",
      text: "#4c1d95",
      tagline: "#6d28d9",
    },
    {
      id: "amber",
      label: "Amber",
      badge: solid("#f59e0b"),
      mark: "#1f2937",
      text: "#78350f",
      tagline: "#92400e",
    },
    {
      id: "ocean-fade",
      label: "Ocean fade",
      badge: linear("#0ea5e9", "#1d4ed8"),
      mark: "#ffffff",
      text: "#0c4a6e",
      tagline: "#0369a1",
    },
    {
      id: "sunset-fade",
      label: "Sunset fade",
      badge: linear("#f97316", "#e11d48"),
      mark: "#ffffff",
      text: "#7c2d12",
      tagline: "#c2410c",
    },
    {
      id: "mint-fade",
      label: "Mint fade",
      badge: linear("#34d399", "#0d9488"),
      mark: "#022c22",
      text: "#134e4a",
      tagline: "#0f766e",
    },
    {
      id: "berry-fade",
      label: "Berry fade",
      badge: linear("#a855f7", "#db2777"),
      mark: "#ffffff",
      text: "#581c87",
      tagline: "#86198f",
    },
    {
      id: "midnight-fade",
      label: "Midnight fade",
      badge: linear("#1e293b", "#0f172a"),
      mark: "#93c5fd",
      text: "#0f172a",
      tagline: "#475569",
    },
    {
      id: "gold-fade",
      label: "Gold fade",
      badge: linear("#fbbf24", "#d97706"),
      mark: "#451a03",
      text: "#78350f",
      tagline: "#a16207",
    },
    {
      id: "sage",
      label: "Sage",
      badge: solid("#84a98c"),
      mark: "#f0fdf4",
      text: "#354f52",
      tagline: "#52796f",
    },
    {
      id: "clay",
      label: "Clay",
      badge: solid("#b08968"),
      mark: "#fefae0",
      text: "#5f4b32",
      tagline: "#7f5539",
    },
    {
      id: "sky",
      label: "Sky",
      badge: solid("#38bdf8"),
      mark: "#082f49",
      text: "#0c4a6e",
      tagline: "#0284c7",
    },
    {
      id: "plum",
      label: "Plum",
      badge: solid("#6b21a8"),
      mark: "#faf5ff",
      text: "#3b0764",
      tagline: "#7e22ce",
    },
    {
      id: "sand",
      label: "Sand",
      badge: solid("#e7e5e4"),
      mark: "#44403c",
      text: "#292524",
      tagline: "#78716c",
    },
    {
      id: "coral",
      label: "Coral",
      badge: solid("#fb7185"),
      mark: "#4c0519",
      text: "#881337",
      tagline: "#be123c",
    },
    {
      id: "pine",
      label: "Pine",
      badge: solid("#065f46"),
      mark: "#d1fae5",
      text: "#064e3b",
      tagline: "#047857",
    },
    {
      id: "mono",
      label: "Mono",
      badge: solid("#404040"),
      mark: "#fafafa",
      text: "#171717",
      tagline: "#737373",
    },
    {
      id: "cocoa",
      label: "Cocoa",
      badge: solid("#4a2c2a"),
      mark: "#fde68a",
      text: "#3f1d1b",
      tagline: "#78350f",
    },
    {
      id: "lavender",
      label: "Lavender",
      badge: solid("#c4b5fd"),
      mark: "#312e81",
      text: "#3730a3",
      tagline: "#6366f1",
    },
  ];
}

export function applyPalette(recipe: LogoRecipe, p: Palette): LogoRecipe {
  return {
    ...recipe,
    colors: {
      palette_id: p.id,
      badge: p.badge,
      mark: p.mark,
      text: p.text,
      tagline: p.tagline,
    },
  };
}

export function TEXT_COLORS(primaryHex: string): string[] {
  return ["#111827", "#334155", primaryHex, "#ffffff"];
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "A"
  );
}

export function defaultRecipe(
  brandName: string,
  primaryHex: string,
): LogoRecipe {
  return {
    version: 2,
    layout: "horizontal",
    name: brandName || "My Brand",
    tagline: "",
    mark: { type: "initials", style: "plain" },
    badge: { shape: "circle", outline: false },
    typography: {
      name: { font: "Inter", weight: 700, tracking: 0, case: "none" },
      tagline: { font: "Inter", weight: 500, tracking: 0.08, case: "upper" },
    },
    colors: {
      palette_id: "theme",
      badge: { type: "solid", color: primaryHex },
      mark: "#ffffff",
      text: "#111827",
      tagline: "#6b7280",
    },
    elements: {
      mark: { offset: [0, 0], scale: 1 },
      name: { offset: [0, 0], scale: 1 },
      tagline: { offset: [0, 0], scale: 1 },
    },
  };
}
