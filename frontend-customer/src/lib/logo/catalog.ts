// Logo Studio catalog: curated lucide icons (8 niche groups), brand fonts and
// color pairs. KEEP IN SYNC: backend/apps/tenant_config/logo_ai.py mirrors
// the icon names and fonts for AI-suggestion validation.
import type { LucideIcon } from "lucide-react";
import {
  Activity, Apple, Baby, BarChart3, Bike, BookOpen, Brain, Briefcase, Brush,
  Cake, Camera, Cat, ChefHat, Coffee, Compass, Cookie, Crown, Dog, Drum,
  Dumbbell, Flame, Flower2, Footprints, Gem, Globe, GraduationCap, Guitar,
  Handshake, Headphones, Heart, HeartPulse, Home, Landmark, Leaf, Library,
  Lightbulb, Medal, Mic, Moon, Mountain, Music, Music2, NotebookPen, Palette,
  PawPrint, Pencil, PenTool, Piano, Radio, Rocket, Salad, Scissors, Sparkles,
  Sprout, Star, Sun, Target, TrendingUp, Trophy, UtensilsCrossed, Wand2, Waves,
  Wheat, Zap,
} from "lucide-react";
import type { LogoRecipe } from "@/types/logo";

export const LOGO_ICONS: Record<string, LucideIcon> = {
  "flower-2": Flower2, leaf: Leaf, sprout: Sprout, sun: Sun, moon: Moon,
  heart: Heart, "heart-pulse": HeartPulse, sparkles: Sparkles,
  dumbbell: Dumbbell, bike: Bike, trophy: Trophy, medal: Medal, flame: Flame,
  zap: Zap, activity: Activity, footprints: Footprints,
  music: Music, "music-2": Music2, mic: Mic, headphones: Headphones,
  guitar: Guitar, piano: Piano, drum: Drum, radio: Radio,
  "book-open": BookOpen, "graduation-cap": GraduationCap, pencil: Pencil,
  "pen-tool": PenTool, lightbulb: Lightbulb, brain: Brain, library: Library,
  "notebook-pen": NotebookPen,
  briefcase: Briefcase, "trending-up": TrendingUp, target: Target,
  "bar-chart-3": BarChart3, rocket: Rocket, globe: Globe, handshake: Handshake,
  landmark: Landmark,
  camera: Camera, palette: Palette, brush: Brush, scissors: Scissors,
  "wand-2": Wand2, gem: Gem, crown: Crown, star: Star,
  "chef-hat": ChefHat, "utensils-crossed": UtensilsCrossed, coffee: Coffee,
  cake: Cake, apple: Apple, wheat: Wheat, salad: Salad, cookie: Cookie,
  home: Home, "paw-print": PawPrint, dog: Dog, cat: Cat, baby: Baby,
  compass: Compass, mountain: Mountain, waves: Waves,
};

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: "Wellness", icons: ["flower-2", "leaf", "sprout", "sun", "moon", "heart", "heart-pulse", "sparkles"] },
  { label: "Fitness", icons: ["dumbbell", "bike", "trophy", "medal", "flame", "zap", "activity", "footprints"] },
  { label: "Music", icons: ["music", "music-2", "mic", "headphones", "guitar", "piano", "drum", "radio"] },
  { label: "Education", icons: ["book-open", "graduation-cap", "pencil", "pen-tool", "lightbulb", "brain", "library", "notebook-pen"] },
  { label: "Business", icons: ["briefcase", "trending-up", "target", "bar-chart-3", "rocket", "globe", "handshake", "landmark"] },
  { label: "Creative", icons: ["camera", "palette", "brush", "scissors", "wand-2", "gem", "crown", "star"] },
  { label: "Food", icons: ["chef-hat", "utensils-crossed", "coffee", "cake", "apple", "wheat", "salad", "cookie"] },
  { label: "Lifestyle", icons: ["home", "paw-print", "dog", "cat", "baby", "compass", "mountain", "waves"] },
];

// Same 8 families the Brand tab offers (brand-tab.tsx).
export const LOGO_FONTS = [
  "Inter", "Geist", "Poppins", "Nunito", "DM Sans",
  "Playfair Display", "Merriweather", "Lora",
];

export function COLOR_PAIRS(primaryHex: string) {
  return [
    { label: "Your theme", badge_bg: primaryHex, mark_fg: "#ffffff" },
    { label: "Ink", badge_bg: "#111827", mark_fg: "#ffffff" },
    { label: "Slate", badge_bg: "#334155", mark_fg: "#ffffff" },
    { label: "Forest", badge_bg: "#15803d", mark_fg: "#ffffff" },
    { label: "Terracotta", badge_bg: "#c2410c", mark_fg: "#fff7ed" },
    { label: "Rose", badge_bg: "#e11d48", mark_fg: "#fff1f2" },
    { label: "Violet", badge_bg: "#7c3aed", mark_fg: "#f5f3ff" },
    { label: "Amber", badge_bg: "#f59e0b", mark_fg: "#1f2937" },
  ];
}

export function TEXT_COLORS(primaryHex: string): string[] {
  return ["#111827", "#334155", primaryHex, "#ffffff"];
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A";
}

export function defaultRecipe(brandName: string, primaryHex: string): LogoRecipe {
  return {
    version: 1,
    layout: "badge_name",
    name: brandName || "My Brand",
    mark: { type: "initials" },
    badge: "circle",
    font: "Inter",
    colors: { badge_bg: primaryHex, mark_fg: "#ffffff", text: "#111827" },
    overrides: { mark_offset: [0, 0], mark_scale: 1, name_offset: [0, 0], name_scale: 1 },
  };
}
