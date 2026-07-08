"use client";

import { memo } from "react";
import { Moon, Shuffle, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LogoRecipe } from "@/types/logo";
import { LogoRenderer } from "./logo-renderer";

interface StudioWallProps {
  wall: LogoRecipe[];
  dark: boolean;
  onToggleDark: () => void;
  onShuffle: () => void;
  onCustomize: (recipe: LogoRecipe) => void;
  onMoreLikeThis: (recipe: LogoRecipe) => void;
  /** true while showing a more-like-this batch instead of the full wall */
  showingVariants: boolean;
  onShowAll: () => void;
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
  onCustomize: (recipe: LogoRecipe) => void;
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

export function StudioWall({
  wall,
  dark,
  onToggleDark,
  onShuffle,
  onCustomize,
  onMoreLikeThis,
  showingVariants,
  onShowAll,
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
        className={`grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-6 md:grid-cols-3 xl:grid-cols-4 ${dark ? "bg-zinc-950" : "bg-muted/40"}`}
      >
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
  );
}
