"use client";

import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PALETTES, applyPalette } from "@/lib/logo/catalog";
import type { LogoRecipe } from "@/types/logo";
import { LAYOUTS, BADGES, toggleClass } from "./constants";
import type { StudioPanelProps } from "./index";

// ── Global controls (nothing selected) ─────────────────────────────────────
export function GlobalControls({
  recipe,
  onPatch,
  onUpdate,
  primaryHex,
  onGetNewIdeas,
}: StudioPanelProps) {
  const badgeSwatch = (fill: LogoRecipe["colors"]["badge"]) =>
    fill.type === "solid"
      ? fill.color
      : `linear-gradient(135deg, ${fill.from}, ${fill.to})`;

  return (
    <>
      <section>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={onGetNewIdeas}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Get new ideas
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Click any part of your logo in the preview to edit it directly.
        </p>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Name</p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={recipe.name}
          maxLength={80}
          onChange={(e) => onPatch({ name: e.target.value }, "name-text")}
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Tagline (optional)</p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={recipe.tagline}
          maxLength={120}
          placeholder="e.g. Yoga for busy mothers"
          onChange={(e) => onPatch({ tagline: e.target.value }, "tagline-text")}
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Layout</p>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={recipe.layout === l.id}
              onClick={() => onPatch({ layout: l.id })}
              className={toggleClass(recipe.layout === l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Colors</p>
        <div className="flex flex-wrap gap-1.5">
          {PALETTES(primaryHex).map((pair) => {
            const active = recipe.colors.palette_id === pair.id;
            return (
              <button
                key={pair.id}
                type="button"
                title={pair.label}
                aria-label={pair.label}
                aria-pressed={active}
                onClick={() => onUpdate((r) => applyPalette(r, pair))}
                className={`h-7 w-7 rounded-full border-2 ${active ? "border-primary" : "border-transparent"}`}
                style={{ background: badgeSwatch(pair.badge) }}
              />
            );
          })}
          <input
            type="color"
            aria-label="Custom badge color"
            value={
              recipe.colors.badge.type === "solid"
                ? recipe.colors.badge.color
                : "#111827"
            }
            onChange={(e) =>
              onPatch(
                {
                  colors: {
                    ...recipe.colors,
                    palette_id: null,
                    badge: { type: "solid", color: e.target.value },
                  },
                },
                "badge-color",
              )
            }
            className="h-7 w-7 cursor-pointer rounded-full border p-0"
          />
        </div>
      </section>

      {recipe.layout !== "name_only" && (
        <section className="space-y-1.5">
          <p className="text-sm font-medium">Badge shape</p>
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((badge) => (
              <button
                key={badge.id}
                type="button"
                aria-pressed={recipe.badge.shape === badge.id}
                onClick={() =>
                  onPatch({ badge: { ...recipe.badge, shape: badge.id } })
                }
                className={toggleClass(recipe.badge.shape === badge.id)}
              >
                {badge.label}
              </button>
            ))}
          </div>
          {recipe.badge.shape !== "none" && (
            <button
              type="button"
              aria-pressed={recipe.badge.outline}
              onClick={() =>
                onPatch({
                  badge: { ...recipe.badge, outline: !recipe.badge.outline },
                })
              }
              className={toggleClass(recipe.badge.outline)}
            >
              Outline only
            </button>
          )}
        </section>
      )}
    </>
  );
}
