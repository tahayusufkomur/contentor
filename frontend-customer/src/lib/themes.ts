/**
 * Curated theme system for Contentor tenant apps.
 *
 * Each theme defines ALL CSS variables (OKLch) for light + dark modes,
 * a cinematic full-page gradient, and preview swatches for the selector UI.
 */

export interface ThemePalette {
  id: string;
  name: string;
  description: string;
  primaryHex: string; // For PWA manifest theme_color
  preview: string[]; // 5 hex swatches for the card UI
  cinematic: { light: string; dark: string };
  light: Record<string, string>;
  dark: Record<string, string>;
}

// ─── Ocean ────────────────────────────────────────────────────────────────────
// Calm deep-blue with teal accents. Professional, trustworthy.
const ocean: ThemePalette = {
  id: "ocean",
  name: "Ocean",
  description: "Calm & professional — business coaching",
  primaryHex: "#1a56db",
  preview: ["#1a56db", "#0d9488", "#f0f9ff", "#1e3a5f", "#e0f2fe"],
  cinematic: {
    light:
      "radial-gradient(ellipse 120% 80% at 15% 10%, oklch(0.92 0.045 240 / 0.4), transparent 60%), radial-gradient(ellipse 80% 120% at 85% 50%, oklch(0.94 0.035 185 / 0.3), transparent 55%), radial-gradient(ellipse 100% 60% at 50% 95%, oklch(0.96 0.02 260 / 0.2), transparent 50%), radial-gradient(circle at 30% 60%, oklch(0.90 0.05 220 / 0.15), transparent 40%)",
    dark: "radial-gradient(ellipse 120% 80% at 15% 10%, oklch(0.22 0.05 240 / 0.45), transparent 60%), radial-gradient(ellipse 80% 120% at 85% 50%, oklch(0.18 0.04 185 / 0.35), transparent 55%), radial-gradient(ellipse 100% 60% at 50% 95%, oklch(0.15 0.03 260 / 0.25), transparent 50%), radial-gradient(circle at 30% 60%, oklch(0.20 0.05 220 / 0.2), transparent 40%)",
  },
  light: {
    background: "oklch(0.985 0.005 240)",
    foreground: "oklch(0.175 0.015 240)",
    card: "oklch(0.993 0.003 240)",
    "card-foreground": "oklch(0.175 0.015 240)",
    popover: "oklch(0.993 0.003 240)",
    "popover-foreground": "oklch(0.175 0.015 240)",
    primary: "oklch(0.45 0.16 250)",
    "primary-foreground": "oklch(0.985 0.005 240)",
    secondary: "oklch(0.955 0.015 240)",
    "secondary-foreground": "oklch(0.25 0.015 240)",
    muted: "oklch(0.955 0.015 240)",
    "muted-foreground": "oklch(0.52 0.012 240)",
    accent: "oklch(0.6 0.12 185)",
    "accent-foreground": "oklch(0.175 0.015 240)",
    destructive: "oklch(0.577 0.245 27.33)",
    "destructive-foreground": "oklch(0.985 0.005 240)",
    border: "oklch(0.91 0.01 240)",
    input: "oklch(0.91 0.01 240)",
    ring: "oklch(0.45 0.16 250)",
    "brand-primary": "oklch(0.45 0.16 250)",
    "brand-accent": "oklch(0.6 0.12 185)",
    "brand-warm": "oklch(0.78 0.04 220)",
    "brand-surface": "oklch(0.97 0.01 240)",
    "chart-1": "oklch(0.5 0.16 250)",
    "chart-2": "oklch(0.6 0.12 185)",
    "chart-3": "oklch(0.65 0.08 220)",
    "chart-4": "oklch(0.55 0.1 200)",
    "chart-5": "oklch(0.7 0.06 260)",
  },
  dark: {
    background: "oklch(0.16 0.015 240)",
    foreground: "oklch(0.93 0.008 240)",
    card: "oklch(0.2 0.015 240)",
    "card-foreground": "oklch(0.93 0.008 240)",
    popover: "oklch(0.2 0.015 240)",
    "popover-foreground": "oklch(0.93 0.008 240)",
    primary: "oklch(0.65 0.14 250)",
    "primary-foreground": "oklch(0.16 0.015 240)",
    secondary: "oklch(0.25 0.015 240)",
    "secondary-foreground": "oklch(0.93 0.008 240)",
    muted: "oklch(0.25 0.015 240)",
    "muted-foreground": "oklch(0.65 0.01 240)",
    accent: "oklch(0.55 0.1 185)",
    "accent-foreground": "oklch(0.93 0.008 240)",
    destructive: "oklch(0.396 0.141 25.723)",
    "destructive-foreground": "oklch(0.93 0.008 240)",
    border: "oklch(0.28 0.015 240)",
    input: "oklch(0.28 0.015 240)",
    ring: "oklch(0.65 0.14 250)",
    "brand-primary": "oklch(0.65 0.14 250)",
    "brand-accent": "oklch(0.55 0.1 185)",
    "brand-warm": "oklch(0.5 0.04 220)",
    "brand-surface": "oklch(0.22 0.015 240)",
    "chart-1": "oklch(0.6 0.14 250)",
    "chart-2": "oklch(0.55 0.1 185)",
    "chart-3": "oklch(0.6 0.08 220)",
    "chart-4": "oklch(0.55 0.1 200)",
    "chart-5": "oklch(0.65 0.06 260)",
  },
};

// ─── Ember ────────────────────────────────────────────────────────────────────
// Warm terracotta and earth tones. Bold, energetic.
const ember: ThemePalette = {
  id: "ember",
  name: "Ember",
  description: "Bold & energetic — fitness, motivation",
  primaryHex: "#c2410c",
  preview: ["#c2410c", "#d97706", "#fff7ed", "#7c2d12", "#fed7aa"],
  cinematic: {
    light:
      "radial-gradient(ellipse 110% 90% at 80% 15%, oklch(0.91 0.05 35 / 0.4), transparent 55%), radial-gradient(ellipse 90% 110% at 10% 60%, oklch(0.93 0.04 70 / 0.3), transparent 50%), radial-gradient(ellipse 120% 50% at 50% 100%, oklch(0.95 0.03 20 / 0.22), transparent 45%), radial-gradient(circle at 65% 45%, oklch(0.89 0.055 50 / 0.15), transparent 35%)",
    dark: "radial-gradient(ellipse 110% 90% at 80% 15%, oklch(0.24 0.06 35 / 0.45), transparent 55%), radial-gradient(ellipse 90% 110% at 10% 60%, oklch(0.20 0.05 70 / 0.35), transparent 50%), radial-gradient(ellipse 120% 50% at 50% 100%, oklch(0.16 0.04 20 / 0.25), transparent 45%), radial-gradient(circle at 65% 45%, oklch(0.22 0.06 50 / 0.2), transparent 35%)",
  },
  light: {
    background: "oklch(0.985 0.005 60)",
    foreground: "oklch(0.175 0.012 40)",
    card: "oklch(0.993 0.004 60)",
    "card-foreground": "oklch(0.175 0.012 40)",
    popover: "oklch(0.993 0.004 60)",
    "popover-foreground": "oklch(0.175 0.012 40)",
    primary: "oklch(0.5 0.16 35)",
    "primary-foreground": "oklch(0.985 0.005 60)",
    secondary: "oklch(0.955 0.015 60)",
    "secondary-foreground": "oklch(0.25 0.012 40)",
    muted: "oklch(0.955 0.015 60)",
    "muted-foreground": "oklch(0.52 0.01 50)",
    accent: "oklch(0.65 0.13 70)",
    "accent-foreground": "oklch(0.175 0.012 40)",
    destructive: "oklch(0.577 0.245 27.33)",
    "destructive-foreground": "oklch(0.985 0.005 60)",
    border: "oklch(0.91 0.01 60)",
    input: "oklch(0.91 0.01 60)",
    ring: "oklch(0.5 0.16 35)",
    "brand-primary": "oklch(0.5 0.16 35)",
    "brand-accent": "oklch(0.65 0.13 70)",
    "brand-warm": "oklch(0.78 0.06 55)",
    "brand-surface": "oklch(0.97 0.012 60)",
    "chart-1": "oklch(0.55 0.16 35)",
    "chart-2": "oklch(0.65 0.13 70)",
    "chart-3": "oklch(0.6 0.08 50)",
    "chart-4": "oklch(0.7 0.1 25)",
    "chart-5": "oklch(0.5 0.12 55)",
  },
  dark: {
    background: "oklch(0.16 0.012 40)",
    foreground: "oklch(0.93 0.008 60)",
    card: "oklch(0.2 0.012 40)",
    "card-foreground": "oklch(0.93 0.008 60)",
    popover: "oklch(0.2 0.012 40)",
    "popover-foreground": "oklch(0.93 0.008 60)",
    primary: "oklch(0.65 0.15 35)",
    "primary-foreground": "oklch(0.16 0.012 40)",
    secondary: "oklch(0.25 0.012 40)",
    "secondary-foreground": "oklch(0.93 0.008 60)",
    muted: "oklch(0.25 0.012 40)",
    "muted-foreground": "oklch(0.65 0.01 50)",
    accent: "oklch(0.58 0.11 70)",
    "accent-foreground": "oklch(0.93 0.008 60)",
    destructive: "oklch(0.396 0.141 25.723)",
    "destructive-foreground": "oklch(0.93 0.008 60)",
    border: "oklch(0.28 0.012 40)",
    input: "oklch(0.28 0.012 40)",
    ring: "oklch(0.65 0.15 35)",
    "brand-primary": "oklch(0.65 0.15 35)",
    "brand-accent": "oklch(0.58 0.11 70)",
    "brand-warm": "oklch(0.5 0.04 55)",
    "brand-surface": "oklch(0.22 0.012 40)",
    "chart-1": "oklch(0.6 0.15 35)",
    "chart-2": "oklch(0.58 0.11 70)",
    "chart-3": "oklch(0.55 0.08 50)",
    "chart-4": "oklch(0.65 0.1 25)",
    "chart-5": "oklch(0.55 0.1 55)",
  },
};

// ─── Forest ───────────────────────────────────────────────────────────────────
// Rich greens with golden warmth. Natural, growth-oriented.
const forest: ThemePalette = {
  id: "forest",
  name: "Forest",
  description: "Natural & grounding — wellness, health",
  primaryHex: "#15803d",
  preview: ["#15803d", "#a16207", "#f0fdf4", "#14532d", "#bbf7d0"],
  cinematic: {
    light:
      "radial-gradient(ellipse 100% 100% at 10% 20%, oklch(0.92 0.04 155 / 0.38), transparent 55%), radial-gradient(ellipse 80% 130% at 90% 70%, oklch(0.94 0.035 80 / 0.28), transparent 50%), radial-gradient(ellipse 130% 60% at 45% 5%, oklch(0.96 0.02 130 / 0.2), transparent 45%), radial-gradient(circle at 70% 30%, oklch(0.90 0.045 100 / 0.15), transparent 35%)",
    dark: "radial-gradient(ellipse 100% 100% at 10% 20%, oklch(0.20 0.05 155 / 0.4), transparent 55%), radial-gradient(ellipse 80% 130% at 90% 70%, oklch(0.18 0.04 80 / 0.3), transparent 50%), radial-gradient(ellipse 130% 60% at 45% 5%, oklch(0.15 0.03 130 / 0.22), transparent 45%), radial-gradient(circle at 70% 30%, oklch(0.20 0.05 100 / 0.18), transparent 35%)",
  },
  light: {
    background: "oklch(0.985 0.005 145)",
    foreground: "oklch(0.175 0.015 150)",
    card: "oklch(0.993 0.004 145)",
    "card-foreground": "oklch(0.175 0.015 150)",
    popover: "oklch(0.993 0.004 145)",
    "popover-foreground": "oklch(0.175 0.015 150)",
    primary: "oklch(0.45 0.14 155)",
    "primary-foreground": "oklch(0.985 0.005 145)",
    secondary: "oklch(0.955 0.015 145)",
    "secondary-foreground": "oklch(0.25 0.015 150)",
    muted: "oklch(0.955 0.015 145)",
    "muted-foreground": "oklch(0.52 0.012 150)",
    accent: "oklch(0.62 0.1 80)",
    "accent-foreground": "oklch(0.175 0.015 150)",
    destructive: "oklch(0.577 0.245 27.33)",
    "destructive-foreground": "oklch(0.985 0.005 145)",
    border: "oklch(0.91 0.01 145)",
    input: "oklch(0.91 0.01 145)",
    ring: "oklch(0.45 0.14 155)",
    "brand-primary": "oklch(0.45 0.14 155)",
    "brand-accent": "oklch(0.62 0.1 80)",
    "brand-warm": "oklch(0.78 0.05 100)",
    "brand-surface": "oklch(0.97 0.01 145)",
    "chart-1": "oklch(0.5 0.14 155)",
    "chart-2": "oklch(0.62 0.1 80)",
    "chart-3": "oklch(0.6 0.08 120)",
    "chart-4": "oklch(0.7 0.1 100)",
    "chart-5": "oklch(0.55 0.06 170)",
  },
  dark: {
    background: "oklch(0.16 0.015 150)",
    foreground: "oklch(0.93 0.008 145)",
    card: "oklch(0.2 0.015 150)",
    "card-foreground": "oklch(0.93 0.008 145)",
    popover: "oklch(0.2 0.015 150)",
    "popover-foreground": "oklch(0.93 0.008 145)",
    primary: "oklch(0.62 0.13 155)",
    "primary-foreground": "oklch(0.16 0.015 150)",
    secondary: "oklch(0.25 0.015 150)",
    "secondary-foreground": "oklch(0.93 0.008 145)",
    muted: "oklch(0.25 0.015 150)",
    "muted-foreground": "oklch(0.65 0.01 150)",
    accent: "oklch(0.55 0.08 80)",
    "accent-foreground": "oklch(0.93 0.008 145)",
    destructive: "oklch(0.396 0.141 25.723)",
    "destructive-foreground": "oklch(0.93 0.008 145)",
    border: "oklch(0.28 0.015 150)",
    input: "oklch(0.28 0.015 150)",
    ring: "oklch(0.62 0.13 155)",
    "brand-primary": "oklch(0.62 0.13 155)",
    "brand-accent": "oklch(0.55 0.08 80)",
    "brand-warm": "oklch(0.5 0.04 100)",
    "brand-surface": "oklch(0.22 0.015 150)",
    "chart-1": "oklch(0.58 0.13 155)",
    "chart-2": "oklch(0.55 0.08 80)",
    "chart-3": "oklch(0.55 0.07 120)",
    "chart-4": "oklch(0.6 0.1 100)",
    "chart-5": "oklch(0.52 0.06 170)",
  },
};

// ─── Sunset ───────────────────────────────────────────────────────────────────
// Coral pinks flowing to warm amber. Creative, lifestyle.
const sunset: ThemePalette = {
  id: "sunset",
  name: "Sunset",
  description: "Warm & creative — lifestyle, art",
  primaryHex: "#e11d48",
  preview: ["#e11d48", "#d97706", "#fff1f2", "#9f1239", "#fecdd3"],
  cinematic: {
    light:
      "radial-gradient(ellipse 130% 80% at 85% 10%, oklch(0.91 0.05 20 / 0.38), transparent 55%), radial-gradient(ellipse 90% 120% at 5% 55%, oklch(0.93 0.04 55 / 0.3), transparent 50%), radial-gradient(ellipse 100% 50% at 55% 95%, oklch(0.95 0.025 350 / 0.2), transparent 45%), radial-gradient(circle at 40% 30%, oklch(0.89 0.05 40 / 0.15), transparent 35%)",
    dark: "radial-gradient(ellipse 130% 80% at 85% 10%, oklch(0.24 0.06 20 / 0.42), transparent 55%), radial-gradient(ellipse 90% 120% at 5% 55%, oklch(0.20 0.05 55 / 0.32), transparent 50%), radial-gradient(ellipse 100% 50% at 55% 95%, oklch(0.16 0.03 350 / 0.22), transparent 45%), radial-gradient(circle at 40% 30%, oklch(0.22 0.06 40 / 0.18), transparent 35%)",
  },
  light: {
    background: "oklch(0.985 0.005 20)",
    foreground: "oklch(0.175 0.012 15)",
    card: "oklch(0.993 0.004 20)",
    "card-foreground": "oklch(0.175 0.012 15)",
    popover: "oklch(0.993 0.004 20)",
    "popover-foreground": "oklch(0.175 0.012 15)",
    primary: "oklch(0.52 0.2 10)",
    "primary-foreground": "oklch(0.985 0.005 20)",
    secondary: "oklch(0.955 0.015 20)",
    "secondary-foreground": "oklch(0.25 0.012 15)",
    muted: "oklch(0.955 0.015 20)",
    "muted-foreground": "oklch(0.52 0.01 15)",
    accent: "oklch(0.65 0.12 55)",
    "accent-foreground": "oklch(0.175 0.012 15)",
    destructive: "oklch(0.577 0.245 27.33)",
    "destructive-foreground": "oklch(0.985 0.005 20)",
    border: "oklch(0.91 0.01 20)",
    input: "oklch(0.91 0.01 20)",
    ring: "oklch(0.52 0.2 10)",
    "brand-primary": "oklch(0.52 0.2 10)",
    "brand-accent": "oklch(0.65 0.12 55)",
    "brand-warm": "oklch(0.8 0.06 40)",
    "brand-surface": "oklch(0.97 0.012 20)",
    "chart-1": "oklch(0.55 0.18 10)",
    "chart-2": "oklch(0.65 0.12 55)",
    "chart-3": "oklch(0.6 0.1 35)",
    "chart-4": "oklch(0.7 0.08 20)",
    "chart-5": "oklch(0.5 0.14 350)",
  },
  dark: {
    background: "oklch(0.16 0.012 15)",
    foreground: "oklch(0.93 0.008 20)",
    card: "oklch(0.2 0.012 15)",
    "card-foreground": "oklch(0.93 0.008 20)",
    popover: "oklch(0.2 0.012 15)",
    "popover-foreground": "oklch(0.93 0.008 20)",
    primary: "oklch(0.65 0.18 10)",
    "primary-foreground": "oklch(0.16 0.012 15)",
    secondary: "oklch(0.25 0.012 15)",
    "secondary-foreground": "oklch(0.93 0.008 20)",
    muted: "oklch(0.25 0.012 15)",
    "muted-foreground": "oklch(0.65 0.01 15)",
    accent: "oklch(0.58 0.1 55)",
    "accent-foreground": "oklch(0.93 0.008 20)",
    destructive: "oklch(0.396 0.141 25.723)",
    "destructive-foreground": "oklch(0.93 0.008 20)",
    border: "oklch(0.28 0.012 15)",
    input: "oklch(0.28 0.012 15)",
    ring: "oklch(0.65 0.18 10)",
    "brand-primary": "oklch(0.65 0.18 10)",
    "brand-accent": "oklch(0.58 0.1 55)",
    "brand-warm": "oklch(0.5 0.04 40)",
    "brand-surface": "oklch(0.22 0.012 15)",
    "chart-1": "oklch(0.6 0.16 10)",
    "chart-2": "oklch(0.58 0.1 55)",
    "chart-3": "oklch(0.55 0.08 35)",
    "chart-4": "oklch(0.65 0.08 20)",
    "chart-5": "oklch(0.55 0.12 350)",
  },
};

// ─── Violet ───────────────────────────────────────────────────────────────────
// Deep purple with lavender highlights. Premium, spiritual.
const violet: ThemePalette = {
  id: "violet",
  name: "Violet",
  description: "Premium & elegant — luxury, spirituality",
  primaryHex: "#7c3aed",
  preview: ["#7c3aed", "#db2777", "#faf5ff", "#4c1d95", "#e9d5ff"],
  cinematic: {
    light:
      "radial-gradient(ellipse 100% 110% at 20% 15%, oklch(0.91 0.05 300 / 0.38), transparent 55%), radial-gradient(ellipse 120% 80% at 80% 65%, oklch(0.93 0.04 340 / 0.28), transparent 50%), radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.95 0.025 270 / 0.2), transparent 45%), radial-gradient(circle at 75% 20%, oklch(0.89 0.055 320 / 0.15), transparent 35%)",
    dark: "radial-gradient(ellipse 100% 110% at 20% 15%, oklch(0.20 0.06 300 / 0.42), transparent 55%), radial-gradient(ellipse 120% 80% at 80% 65%, oklch(0.18 0.05 340 / 0.32), transparent 50%), radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.15 0.035 270 / 0.22), transparent 45%), radial-gradient(circle at 75% 20%, oklch(0.22 0.06 320 / 0.18), transparent 35%)",
  },
  light: {
    background: "oklch(0.985 0.006 300)",
    foreground: "oklch(0.175 0.015 290)",
    card: "oklch(0.993 0.004 300)",
    "card-foreground": "oklch(0.175 0.015 290)",
    popover: "oklch(0.993 0.004 300)",
    "popover-foreground": "oklch(0.175 0.015 290)",
    primary: "oklch(0.48 0.2 295)",
    "primary-foreground": "oklch(0.985 0.006 300)",
    secondary: "oklch(0.955 0.015 300)",
    "secondary-foreground": "oklch(0.25 0.015 290)",
    muted: "oklch(0.955 0.015 300)",
    "muted-foreground": "oklch(0.52 0.012 290)",
    accent: "oklch(0.58 0.16 340)",
    "accent-foreground": "oklch(0.175 0.015 290)",
    destructive: "oklch(0.577 0.245 27.33)",
    "destructive-foreground": "oklch(0.985 0.006 300)",
    border: "oklch(0.91 0.01 300)",
    input: "oklch(0.91 0.01 300)",
    ring: "oklch(0.48 0.2 295)",
    "brand-primary": "oklch(0.48 0.2 295)",
    "brand-accent": "oklch(0.58 0.16 340)",
    "brand-warm": "oklch(0.78 0.05 310)",
    "brand-surface": "oklch(0.97 0.012 300)",
    "chart-1": "oklch(0.52 0.18 295)",
    "chart-2": "oklch(0.58 0.16 340)",
    "chart-3": "oklch(0.6 0.08 280)",
    "chart-4": "oklch(0.65 0.1 320)",
    "chart-5": "oklch(0.5 0.12 260)",
  },
  dark: {
    background: "oklch(0.16 0.015 290)",
    foreground: "oklch(0.93 0.008 300)",
    card: "oklch(0.2 0.015 290)",
    "card-foreground": "oklch(0.93 0.008 300)",
    popover: "oklch(0.2 0.015 290)",
    "popover-foreground": "oklch(0.93 0.008 300)",
    primary: "oklch(0.65 0.18 295)",
    "primary-foreground": "oklch(0.16 0.015 290)",
    secondary: "oklch(0.25 0.015 290)",
    "secondary-foreground": "oklch(0.93 0.008 300)",
    muted: "oklch(0.25 0.015 290)",
    "muted-foreground": "oklch(0.65 0.01 290)",
    accent: "oklch(0.55 0.14 340)",
    "accent-foreground": "oklch(0.93 0.008 300)",
    destructive: "oklch(0.396 0.141 25.723)",
    "destructive-foreground": "oklch(0.93 0.008 300)",
    border: "oklch(0.28 0.015 290)",
    input: "oklch(0.28 0.015 290)",
    ring: "oklch(0.65 0.18 295)",
    "brand-primary": "oklch(0.65 0.18 295)",
    "brand-accent": "oklch(0.55 0.14 340)",
    "brand-warm": "oklch(0.5 0.04 310)",
    "brand-surface": "oklch(0.22 0.015 290)",
    "chart-1": "oklch(0.6 0.16 295)",
    "chart-2": "oklch(0.55 0.14 340)",
    "chart-3": "oklch(0.55 0.08 280)",
    "chart-4": "oklch(0.6 0.1 320)",
    "chart-5": "oklch(0.52 0.1 260)",
  },
};

// ─── Slate ────────────────────────────────────────────────────────────────────
// Sophisticated neutral grays with blue tint. Minimal, professional.
const slate: ThemePalette = {
  id: "slate",
  name: "Slate",
  description: "Minimal & clean — tech, education",
  primaryHex: "#334155",
  preview: ["#334155", "#6366f1", "#f8fafc", "#0f172a", "#e2e8f0"],
  cinematic: {
    light:
      "radial-gradient(ellipse 110% 100% at 5% 25%, oklch(0.95 0.015 250 / 0.25), transparent 55%), radial-gradient(ellipse 100% 110% at 95% 75%, oklch(0.96 0.012 200 / 0.2), transparent 50%), radial-gradient(ellipse 120% 50% at 50% 5%, oklch(0.97 0.008 270 / 0.15), transparent 45%), radial-gradient(circle at 60% 50%, oklch(0.94 0.018 230 / 0.1), transparent 35%)",
    dark: "radial-gradient(ellipse 110% 100% at 5% 25%, oklch(0.20 0.02 250 / 0.3), transparent 55%), radial-gradient(ellipse 100% 110% at 95% 75%, oklch(0.18 0.018 200 / 0.25), transparent 50%), radial-gradient(ellipse 120% 50% at 50% 5%, oklch(0.16 0.012 270 / 0.18), transparent 45%), radial-gradient(circle at 60% 50%, oklch(0.19 0.022 230 / 0.15), transparent 35%)",
  },
  light: {
    background: "oklch(0.985 0.003 250)",
    foreground: "oklch(0.175 0.012 250)",
    card: "oklch(0.993 0.002 250)",
    "card-foreground": "oklch(0.175 0.012 250)",
    popover: "oklch(0.993 0.002 250)",
    "popover-foreground": "oklch(0.175 0.012 250)",
    primary: "oklch(0.35 0.03 250)",
    "primary-foreground": "oklch(0.985 0.003 250)",
    secondary: "oklch(0.955 0.008 250)",
    "secondary-foreground": "oklch(0.25 0.012 250)",
    muted: "oklch(0.955 0.008 250)",
    "muted-foreground": "oklch(0.52 0.008 250)",
    accent: "oklch(0.55 0.14 270)",
    "accent-foreground": "oklch(0.175 0.012 250)",
    destructive: "oklch(0.577 0.245 27.33)",
    "destructive-foreground": "oklch(0.985 0.003 250)",
    border: "oklch(0.91 0.006 250)",
    input: "oklch(0.91 0.006 250)",
    ring: "oklch(0.35 0.03 250)",
    "brand-primary": "oklch(0.35 0.03 250)",
    "brand-accent": "oklch(0.55 0.14 270)",
    "brand-warm": "oklch(0.78 0.02 240)",
    "brand-surface": "oklch(0.97 0.005 250)",
    "chart-1": "oklch(0.4 0.03 250)",
    "chart-2": "oklch(0.55 0.14 270)",
    "chart-3": "oklch(0.6 0.06 230)",
    "chart-4": "oklch(0.5 0.08 200)",
    "chart-5": "oklch(0.65 0.04 260)",
  },
  dark: {
    background: "oklch(0.16 0.01 250)",
    foreground: "oklch(0.93 0.006 250)",
    card: "oklch(0.2 0.01 250)",
    "card-foreground": "oklch(0.93 0.006 250)",
    popover: "oklch(0.2 0.01 250)",
    "popover-foreground": "oklch(0.93 0.006 250)",
    primary: "oklch(0.7 0.03 250)",
    "primary-foreground": "oklch(0.16 0.01 250)",
    secondary: "oklch(0.25 0.01 250)",
    "secondary-foreground": "oklch(0.93 0.006 250)",
    muted: "oklch(0.25 0.01 250)",
    "muted-foreground": "oklch(0.65 0.008 250)",
    accent: "oklch(0.55 0.12 270)",
    "accent-foreground": "oklch(0.93 0.006 250)",
    destructive: "oklch(0.396 0.141 25.723)",
    "destructive-foreground": "oklch(0.93 0.006 250)",
    border: "oklch(0.28 0.01 250)",
    input: "oklch(0.28 0.01 250)",
    ring: "oklch(0.7 0.03 250)",
    "brand-primary": "oklch(0.7 0.03 250)",
    "brand-accent": "oklch(0.55 0.12 270)",
    "brand-warm": "oklch(0.5 0.02 240)",
    "brand-surface": "oklch(0.22 0.01 250)",
    "chart-1": "oklch(0.65 0.03 250)",
    "chart-2": "oklch(0.55 0.12 270)",
    "chart-3": "oklch(0.55 0.06 230)",
    "chart-4": "oklch(0.5 0.08 200)",
    "chart-5": "oklch(0.6 0.04 260)",
  },
};

// ─── Dim derivation ───────────────────────────────────────────────────────────
// "Dim" is a soft-dark middle brightness derived from each theme's dark palette:
// surface tokens are lifted toward a ~0.22 background while text, accents, and
// charts stay identical to dark. Only the L channel of surface tokens changes.

const DIM_SURFACE_KEYS = new Set<string>([
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "border",
  "input",
  "brand-surface",
]);

const DIM_LIGHTNESS_LIFT = 0.06;

export function deriveDim(
  dark: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dark)) {
    if (!DIM_SURFACE_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    const match = value.match(
      /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s*\)$/,
    );
    if (!match) {
      out[key] = value; // defensive: leave unparseable values untouched
      continue;
    }
    const lifted = parseFloat(match[1]) + DIM_LIGHTNESS_LIFT;
    const l = Math.min(1, Math.round(lifted * 1000) / 1000);
    out[key] = `oklch(${l} ${match[2]} ${match[3]})`;
  }
  return out;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const THEMES: ThemePalette[] = [
  ocean,
  ember,
  forest,
  sunset,
  violet,
  slate,
];

export const THEME_MAP: Record<string, ThemePalette> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
);

export const DEFAULT_THEME = "ocean";

export function getThemePalette(themeId?: string): ThemePalette {
  return THEME_MAP[themeId ?? DEFAULT_THEME] ?? THEME_MAP[DEFAULT_THEME];
}

/**
 * Generate a full CSS string for a theme, setting all CSS variables for both
 * light (:root) and dark (.dark) modes, plus the cinematic background.
 */
export function generateThemeCSS(
  themeId?: string,
  fontFamily?: string,
  extraCss = "",
): string {
  const theme = getThemePalette(themeId);

  const lightVars = Object.entries(theme.light)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  const darkVars = Object.entries(theme.dark)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  const dimVars = Object.entries(deriveDim(theme.dark))
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");

  const font = fontFamily
    ? `  --font-sans: '${fontFamily}', system-ui, sans-serif;`
    : "";

  // Defense-in-depth: strip the </style> breakout vector from any custom CSS
  // (backend sanitizes on write; this also covers values stored before that).
  const safeExtra = (extraCss || "").replace(/[<>]/g, "");

  return `:root {
${lightVars}
  --cinematic-bg: ${theme.cinematic.light};
${font}
}
.dark {
${darkVars}
  --cinematic-bg: ${theme.cinematic.dark};
${font}
}
.dim {
${dimVars}
  --cinematic-bg: ${theme.cinematic.dark};
${font}
}
${safeExtra}`;
}
