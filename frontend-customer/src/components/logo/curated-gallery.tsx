"use client";

import { useMemo, useState } from "react";
import { Loader2, Lock, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { composeCuratedPreview } from "@/lib/logo/curated-preview";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoRecipe } from "@/types/logo";
import { LogoRenderer } from "./logo-renderer";

interface CuratedGalleryProps {
  logos: CuratedLogo[];
  loading: boolean;
  aiEligible: boolean;
  brandName: string;
  tagline: string;
  baseRecipe: LogoRecipe;
  primaryHex: string;
  onUse: (logo: CuratedLogo, preview: LogoRecipe) => void;
  onCreateSimilar: (logo: CuratedLogo) => void;
  onUpgrade: () => void;
  generatingFilename: string | null;
}

export function CuratedGallery({
  logos,
  loading,
  aiEligible,
  brandName,
  tagline,
  baseRecipe,
  primaryHex,
  onUse,
  onCreateSimilar,
  onUpgrade,
  generatingFilename,
}: CuratedGalleryProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(
    () => Array.from(new Set(logos.flatMap((l) => l.tags))).sort(),
    [logos],
  );
  const shown = activeTag
    ? logos.filter((l) => l.tags.includes(activeTag))
    : logos;

  // Each card is a COMPLETE logo concept for this coach: the curated mark
  // composed with their brand name + tagline in a varied, tag-biased lockup.
  // "Use this" hands over exactly this recipe.
  const previews = useMemo(
    () =>
      shown.map((logo, index) =>
        composeCuratedPreview(logo, {
          brandName,
          tagline,
          base: baseRecipe,
          primaryHex,
          index,
        }),
      ),
    [shown, brandName, tagline, baseRecipe, primaryHex],
  );

  if (loading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Loading ready-made logos…
      </p>
    );
  }
  if (!logos.length) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No ready-made logos yet — try Design with AI instead.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-3 py-1 text-xs ${activeTag === null ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${activeTag === tag ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((logo, index) => {
          const generating = generatingFilename === logo.filename;
          const anyGenerating = generatingFilename !== null;
          return (
            <div
              key={logo.filename}
              className="flex flex-col overflow-hidden rounded-xl border"
            >
              <div className="relative flex h-44 items-center justify-center overflow-hidden bg-white p-4">
                <LogoRenderer recipe={previews[index]!} width={220} />
                {generating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-xs font-medium text-primary">
                      Designing your version…
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 border-t p-3">
                <p className="truncate text-xs font-medium" title={logo.title}>
                  {logo.title}
                </p>
                <Button
                  size="sm"
                  onClick={() => onUse(logo, previews[index]!)}
                  disabled={anyGenerating}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" /> Use this
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    aiEligible ? onCreateSimilar(logo) : onUpgrade()
                  }
                  disabled={anyGenerating}
                  className="gap-1"
                >
                  {aiEligible ? (
                    <Wand2 className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  Create your own
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
