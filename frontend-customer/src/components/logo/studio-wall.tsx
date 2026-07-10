"use client";

import { memo, useEffect, useState } from "react";
import { Moon, Shuffle, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveAiBannerState } from "@/lib/logo/ai-banner";
import type { BrandPackStatus } from "@/lib/logo/brand-pack-api";
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
  /** AI Brand Pack (paid-tier feature) — all optional so the wall still
   * renders standalone wherever this isn't wired up. */
  brandName?: string;
  aiWall?: LogoRecipe[] | null;
  aiWallElements?: (BrandPackElement[] | undefined)[] | null;
  aiLoading?: boolean;
  aiNotice?: string | null;
  brandPackStatus?: BrandPackStatus | null;
  /** Click handler for the explicit "Generate AI logos" button (idle
   * state). Optional so the wall still renders standalone without AI
   * wired up, matching the rest of this prop group. */
  onGenerateAi?: () => void;
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

/** An AI Brand Pack wall card — same shell as WallCard, plus the mark's
 * one-sentence designer rationale as a muted caption. */
const AiWallCard = memo(function AiWallCard({
  recipe,
  elements,
  dark,
  onCustomize,
  onMoreLikeThis,
}: {
  recipe: LogoRecipe;
  elements?: BrandPackElement[];
  dark: boolean;
  onCustomize: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
}) {
  const rationale = recipe.mark.type === "custom" ? recipe.mark.rationale : "";
  return (
    <div
      data-testid="ai-wall-card"
      className={`group flex flex-col overflow-hidden rounded-lg border shadow-sm ring-1 ring-primary/30 transition-shadow hover:shadow-md ${dark ? "border-zinc-700 bg-zinc-900" : "bg-white"}`}
    >
      <button
        type="button"
        aria-label={`Customize this AI-designed ${recipe.layout} logo`}
        onClick={() => onCustomize(recipe, elements)}
        className="flex flex-1 items-center justify-center p-4"
      >
        <LogoRenderer recipe={recipe} width={200} />
      </button>
      {rationale && (
        <p
          className={`px-3 text-xs italic ${dark ? "text-zinc-400" : "text-muted-foreground"}`}
        >
          {rationale}
        </p>
      )}
      <div
        className={`flex items-center justify-between gap-2 border-t px-3 py-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${dark ? "border-zinc-700" : ""}`}
      >
        <button
          type="button"
          onClick={() => onCustomize(recipe, elements)}
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

/** Seconds since `active` last became true; resets to 0 whenever it goes
 * false. Owned here (not lifted into logo-studio.tsx) so the once-a-second
 * tick only re-renders the wall, not the whole studio dialog. */
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

/** The single state machine for the AI Brand Pack banner above the wall —
 * see deriveAiBannerState for the states and docs/superpowers/specs/2026-07-10-logo-studio-ai-trigger-design.md
 * for the design. */
function AiGenerateBanner({
  brandPackStatus,
  aiLoading,
  aiWall,
  aiNotice,
  brandName,
  onGenerateAi,
  dark,
}: {
  brandPackStatus?: BrandPackStatus | null;
  aiLoading?: boolean;
  aiWall?: LogoRecipe[] | null;
  aiNotice?: string | null;
  brandName?: string;
  onGenerateAi?: () => void;
  dark: boolean;
}) {
  const elapsedSeconds = useElapsedSeconds(!!aiLoading);
  const state = deriveAiBannerState({
    brandPackStatus,
    aiLoading: !!aiLoading,
    aiWall,
    aiNotice,
    elapsedSeconds,
  });

  if (state.kind === "hidden") return null;

  if (state.kind === "upsell") {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border border-dashed p-4 ${dark ? "border-zinc-700" : ""}`}
      >
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          AI logo designer — bespoke marks made for your brand, included
          with paid plans.
        </p>
        <Button asChild size="sm" variant="outline">
          <a href="/admin/billing/subscription">Upgrade</a>
        </Button>
      </div>
    );
  }

  if (state.kind === "generating") {
    return (
      <div className={`space-y-2 rounded-lg border p-4 ${dark ? "border-zinc-700" : ""}`}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          Generating AI logos for {brandName || "your brand"}…
        </p>
        <div
          role="progressbar"
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className={`h-1.5 w-full overflow-hidden rounded-full ${dark ? "bg-zinc-800" : "bg-muted"}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${state.percent}%` }}
          />
        </div>
        <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
          {state.label} Usually takes about 2 minutes.
        </p>
      </div>
    );
  }

  if (state.kind === "quota_exhausted") {
    return (
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
        You&apos;ve used this month&apos;s AI logo generations. More next
        month.
      </p>
    );
  }

  if (state.kind === "disabled") {
    return (
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
        AI logo generation is temporarily unavailable — your ideas below
        are ready to use.
      </p>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between ${dark ? "border-zinc-700" : ""}`}
    >
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-muted-foreground"}`}>
        {state.description}
      </p>
      <Button
        type="button"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => onGenerateAi?.()}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate AI logos for {brandName || "your brand"}
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
  brandName,
  aiWall,
  aiWallElements,
  aiLoading,
  aiNotice,
  brandPackStatus,
  onGenerateAi,
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
          <AiGenerateBanner
            brandPackStatus={brandPackStatus}
            aiLoading={aiLoading}
            aiWall={aiWall}
            aiNotice={aiNotice}
            brandName={brandName}
            onGenerateAi={onGenerateAi}
            dark={dark}
          />
        )}

        {!showingVariants && aiWall && aiWall.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Made for {brandName || "your brand"}
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {aiWall.map((recipe, i) => (
                <AiWallCard
                  key={i}
                  recipe={recipe}
                  elements={aiWallElements?.[i]}
                  dark={dark}
                  onCustomize={onCustomize}
                  onMoreLikeThis={onMoreLikeThis}
                />
              ))}
            </div>
          </div>
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
