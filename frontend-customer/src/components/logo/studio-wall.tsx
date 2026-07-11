"use client";

import { memo } from "react";
import { Moon, Shuffle, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveAiBannerState } from "@/lib/logo/ai-banner";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import type { BrandPackElement } from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";
import { LogoRenderer } from "./logo-renderer";

interface StudioWallProps {
  wall: LogoRecipe[];
  dark: boolean;
  onToggleDark: () => void;
  onShuffle: () => void;
  onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
  /** true while showing a more-like-this batch instead of the full wall */
  showingVariants: boolean;
  onShowAll: () => void;
  /** Design-with-AI (paid-tier feature) — all optional so the wall still
   * renders standalone wherever this isn't wired up. */
  logoAiStatus?: LogoAiStatus | null;
  /** Opens the staged Design-with-AI chat (idle banner CTA). Optional so the
   * wall still renders standalone without AI wired up. */
  onOpenChat?: () => void;
}

/** One wall card. Memoized — the wall renders ~24 SVG logos and hover /
 * parent state changes must not re-render all of them. */
const WallCard = memo(function WallCard({
  recipe,
  dark,
  onCustomize,
  onMoreLikeThis,
}: {
  recipe: LogoRecipe;
  dark: boolean;
  onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
}) {
  return (
    <div
      data-testid="wall-card"
      className={`group flex flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md ${dark ? "border-zinc-700 bg-zinc-900" : "bg-white"}`}
    >
      <button
        type="button"
        aria-label={`Customize this ${recipe.layout} logo`}
        onClick={() => onCustomize(recipe)}
        className="flex flex-1 items-center justify-center p-4"
      >
        <LogoRenderer recipe={recipe} width={200} />
      </button>
      <div
        className={`flex items-center justify-between gap-2 border-t px-3 py-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${dark ? "border-zinc-700" : ""}`}
      >
        <button
          type="button"
          onClick={() => onCustomize(recipe)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Customize
        </button>
        <button
          type="button"
          onClick={() => onMoreLikeThis(recipe)}
          className={`text-xs hover:underline ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
        >
          More like this
        </button>
      </div>
    </div>
  );
});

/** The Design-with-AI CTA banner above the wall — states come from
 * deriveAiBannerState (progress now lives inside the chat, not here). */
function AiChatBanner({
  logoAiStatus,
  onOpenChat,
  dark,
}: {
  logoAiStatus?: LogoAiStatus | null;
  onOpenChat?: () => void;
  dark: boolean;
}) {
  const state = deriveAiBannerState({ status: logoAiStatus ?? null });

  if (state.kind === "hidden") return null;

  if (state.kind === "upsell") {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border border-dashed p-4 ${dark ? "border-zinc-700" : ""}`}
      >
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          AI logo designer — design your logo one-on-one with the AI, included
          with paid plans.
        </p>
        <Button asChild size="sm" variant="outline">
          <a href="/admin/billing/subscription">Upgrade</a>
        </Button>
      </div>
    );
  }

  if (state.kind === "quota_exhausted") {
    return (
      <p
        className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
      >
        You&apos;ve used this month&apos;s AI design turns. More next month.
      </p>
    );
  }

  if (state.kind === "disabled") {
    return (
      <p
        className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
      >
        AI design is temporarily unavailable — your ideas below are ready to
        use.
      </p>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between ${dark ? "border-zinc-700" : ""}`}
    >
      <p
        className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
      >
        {state.description}
      </p>
      <Button
        type="button"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => onOpenChat?.()}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Design with AI
      </Button>
    </div>
  );
}

export function StudioWall({
  wall,
  dark,
  onToggleDark,
  onShuffle,
  onCustomize,
  onMoreLikeThis,
  showingVariants,
  onShowAll,
  logoAiStatus,
  onOpenChat,
}: StudioWallProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <p className="text-sm text-muted-foreground">
          {showingVariants
            ? "Variations — pick one or go back to all ideas."
            : "Pick a starting point — everything stays fully editable."}
        </p>
        <div className="flex items-center gap-2">
          {showingVariants ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onShowAll}
            >
              Show all ideas
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onShuffle}
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </Button>
          )}
          <button
            type="button"
            aria-label={
              dark
                ? "Preview on light background"
                : "Preview on dark background"
            }
            aria-pressed={dark}
            onClick={onToggleDark}
            className="rounded-md border p-1.5 text-muted-foreground hover:border-foreground"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div
        data-testid="logo-wall"
        className={`flex-1 space-y-6 overflow-y-auto p-6 ${dark ? "bg-zinc-950" : "bg-muted/40"}`}
      >
        {!showingVariants && (
          <AiChatBanner
            logoAiStatus={logoAiStatus}
            onOpenChat={onOpenChat}
            dark={dark}
          />
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {wall.map((recipe, i) => (
            <WallCard
              key={i}
              recipe={recipe}
              dark={dark}
              onCustomize={onCustomize}
              onMoreLikeThis={onMoreLikeThis}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
