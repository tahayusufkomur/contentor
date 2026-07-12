"use client";

import { Sparkles, Wand2 } from "lucide-react";
import type { LogoRecipe } from "@/types/logo";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import { CuratedGallery } from "./curated-gallery";
import { StudioWall } from "./studio-wall";

interface StudioEntranceProps {
  logos: CuratedLogo[];
  loadingLibrary: boolean;
  wall: LogoRecipe[] | null;
  wallDark: boolean;
  showingVariants: boolean;
  logoAiStatus: LogoAiStatus | null;
  onToggleWallDark: () => void;
  onShuffle: () => void;
  onShowAll: () => void;
  onUseCurated: (logo: CuratedLogo) => void;
  onCreateFromCurated: (logo: CuratedLogo) => void;
  onUseWall: (recipe: LogoRecipe) => void;
  onMoreLikeThisWall: (recipe: LogoRecipe) => void;
  onOpenChat: () => void;
  onUpgrade: () => void;
}

export function StudioEntrance({
  logos,
  loadingLibrary,
  wall,
  wallDark,
  showingVariants,
  logoAiStatus,
  onToggleWallDark,
  onShuffle,
  onShowAll,
  onUseCurated,
  onCreateFromCurated,
  onUseWall,
  onMoreLikeThisWall,
  onOpenChat,
  onUpgrade,
}: StudioEntranceProps) {
  const aiEligible = logoAiStatus?.eligible ?? false;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-4 p-6 pb-0 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Ready-made logos
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Hand-picked for your niche. Free to use, add your name and colors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (aiEligible ? onOpenChat() : onUpgrade())}
          className="flex flex-col items-start rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4 text-primary" /> Design with AI
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {aiEligible
              ? "Describe your vibe and let AI craft a bespoke logo."
              : "Upgrade to design a bespoke logo with AI."}
          </p>
        </button>
      </div>

      <CuratedGallery
        logos={logos}
        loading={loadingLibrary}
        aiEligible={aiEligible}
        onUse={onUseCurated}
        onCreateSimilar={onCreateFromCurated}
        onUpgrade={onUpgrade}
      />

      {wall && (
        <details className="border-t px-6 py-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            More auto-generated ideas
          </summary>
          <div className="mt-3">
            <StudioWall
              wall={wall}
              dark={wallDark}
              onToggleDark={onToggleWallDark}
              onShuffle={onShuffle}
              onCustomize={onUseWall}
              onMoreLikeThis={onMoreLikeThisWall}
              showingVariants={showingVariants}
              onShowAll={onShowAll}
              logoAiStatus={logoAiStatus}
              onOpenChat={onOpenChat}
            />
          </div>
        </details>
      )}
    </div>
  );
}
