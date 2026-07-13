// Composes one curated library logo + the coach's brief into a COMPLETE
// LogoRecipe for the Ideas gallery: the curated mark (traced vector, or the
// raw PNG as an image mark), the coach's brand name + tagline, and a
// deterministically varied lockup (layout/font/palette) biased by the logo's
// tags — so the gallery reads as finished logo concepts, and "Use this"
// hands over exactly what was previewed.
// See docs/superpowers/specs/2026-07-13-logo-studio-curated-v2-design.md.
import {
  LOGO_FONTS,
  PALETTES,
  applyPalette,
  type FontVibe,
} from "@/lib/logo/catalog";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type {
  BadgeShape,
  FontWeight,
  LogoRecipe,
  RecipeLayout,
  TextCase,
} from "@/types/logo";

interface StyleProfile {
  /** Any overlap with the logo's tags selects this profile. */
  keywords: string[];
  vibes: FontVibe[];
  layouts: RecipeLayout[];
  badges: BadgeShape[];
  /** Ids from catalog PALETTES — the per-card color variation pool. */
  paletteIds: string[];
  tracking: number;
  nameCase: TextCase;
}

const PROFILES: StyleProfile[] = [
  {
    keywords: ["elegant", "luxury", "premium", "boutique", "classy"],
    vibes: ["Elegant", "Script"],
    layouts: ["stacked", "horizontal"],
    badges: ["none", "circle"],
    paletteIds: ["ink", "sand", "plum", "gold-fade", "cocoa"],
    tracking: 0.05,
    nameCase: "title",
  },
  {
    keywords: ["bold", "strong", "fitness", "sport", "gym", "power"],
    vibes: ["Bold"],
    layouts: ["horizontal", "emblem", "stacked"],
    badges: ["circle", "shield", "hexagon"],
    paletteIds: ["ink", "midnight-fade", "sunset-fade", "coral"],
    tracking: 0.06,
    nameCase: "upper",
  },
  {
    keywords: ["playful", "fun", "kids", "colorful", "cute"],
    vibes: ["Playful"],
    layouts: ["horizontal", "stacked"],
    badges: ["circle", "rounded"],
    paletteIds: ["coral", "amber", "berry-fade", "sky"],
    tracking: 0,
    nameCase: "none",
  },
  {
    keywords: ["minimal", "clean", "simple", "modern"],
    vibes: ["Minimal", "Modern"],
    layouts: ["horizontal", "horizontal_reversed"],
    badges: ["none"],
    paletteIds: ["mono", "slate", "sand", "ink"],
    tracking: 0.02,
    nameCase: "none",
  },
  {
    keywords: ["organic", "nature", "wellness", "yoga", "zen", "calm"],
    vibes: ["Elegant", "Minimal"],
    layouts: ["stacked", "horizontal"],
    badges: ["none", "circle"],
    paletteIds: ["sage", "forest", "clay", "mint-fade", "pine"],
    tracking: 0.02,
    nameCase: "none",
  },
  {
    keywords: ["tech", "digital", "code", "data", "ai"],
    vibes: ["Modern", "Minimal"],
    layouts: ["horizontal", "horizontal_reversed"],
    badges: ["none", "squircle"],
    paletteIds: ["midnight-fade", "ocean-fade", "slate", "violet"],
    tracking: 0.01,
    nameCase: "none",
  },
];

const DEFAULT_PROFILE: StyleProfile = {
  keywords: [],
  vibes: ["Modern", "Bold", "Playful", "Elegant"],
  layouts: ["horizontal", "stacked", "horizontal_reversed"],
  badges: ["none", "circle"],
  paletteIds: ["theme", "ink", "forest", "violet", "ocean-fade", "terracotta"],
  tracking: 0,
  nameCase: "none",
};

function profileFor(tags: string[]): StyleProfile {
  return (
    PROFILES.find((p) => p.keywords.some((k) => tags.includes(k))) ??
    DEFAULT_PROFILE
  );
}

/** djb2 — stable, cheap, good spread for short filenames. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], n: number): T {
  return arr[((n % arr.length) + arr.length) % arr.length]!;
}

export function composeCuratedPreview(
  logo: CuratedLogo,
  opts: {
    brandName: string;
    tagline: string;
    base: LogoRecipe;
    primaryHex: string;
    index: number;
  },
): LogoRecipe {
  const profile = profileFor(logo.tags);
  const seed = hashString(logo.filename);
  const vibe = pick(profile.vibes, seed + opts.index);
  const families = LOGO_FONTS.filter((f) => f.vibe === vibe);
  const font = pick(families, (seed >> 3) + opts.index);
  const layout = pick(profile.layouts, (seed >> 5) + opts.index);
  const traced = Boolean(logo.markPaths?.length);
  // PNG art carries its own colors and shape — no badge behind it.
  const badgeShape: BadgeShape = traced
    ? pick(profile.badges, (seed >> 7) + opts.index)
    : "none";
  const palettes = PALETTES(opts.primaryHex);
  const paletteId = pick(profile.paletteIds, (seed >> 9) + opts.index);
  const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0]!;
  const nameWeight: FontWeight = font.weights.includes(700)
    ? 700
    : font.weights[font.weights.length - 1]!;
  const taglineWeight: FontWeight = font.weights.includes(500)
    ? 500
    : font.weights[font.weights.length - 1]!;

  const recipe = applyPalette(
    {
      ...opts.base,
      layout,
      name: opts.brandName || opts.base.name,
      tagline: opts.tagline,
      mark: traced
        ? { type: "custom", rationale: logo.title, paths: logo.markPaths! }
        : // photo_id "" is display-only — handleUseCurated uploads the PNG
          // and swaps in a real photo_id before this recipe reaches the editor.
          { type: "image", photo_id: "", url: logo.imageUrl },
      badge: { shape: badgeShape, outline: false },
      typography: {
        name: {
          font: font.family,
          weight: nameWeight,
          tracking: profile.tracking,
          case: profile.nameCase,
        },
        tagline: {
          font: font.family,
          weight: taglineWeight,
          tracking: 0.08,
          case: "upper",
        },
      },
      elements: {
        mark: { offset: [0, 0], scale: 1 },
        name: { offset: [0, 0], scale: 1 },
        tagline: { offset: [0, 0], scale: 1 },
      },
    },
    palette,
  );
  // Palette mark colors are designed to sit ON a badge (often white). With no
  // badge behind it, paint the mark in the palette's text color; give the
  // secondary custom-mark roles readable companions either way.
  const colors = {
    ...recipe.colors,
    mark2: palette.text,
    mark_accent: palette.tagline,
  };
  if (badgeShape === "none") colors.mark = palette.text;
  return { ...recipe, colors };
}
