"use client";

import { Sparkles, Wand2 } from "lucide-react";
import type { CuratedLogo } from "@/lib/logo/library-catalog";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import { CuratedGallery } from "./curated-gallery";

interface StudioEntranceProps {
  logos: CuratedLogo[];
  loadingLibrary: boolean;
  logoAiStatus: LogoAiStatus | null;
  onUseCurated: (logo: CuratedLogo) => void;
  onCreateFromCurated: (logo: CuratedLogo) => void;
  onOpenChat: () => void;
  onUpgrade: () => void;
}

export function StudioEntrance({
  logos,
  loadingLibrary,
  logoAiStatus,
  onUseCurated,
  onCreateFromCurated,
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
    </div>
  );
}
