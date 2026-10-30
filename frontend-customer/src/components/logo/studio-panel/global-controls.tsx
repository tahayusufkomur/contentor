"use client";

import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.logo");
  const ts = useTranslations("studio.logo");
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
          {t("panel.getIdeas")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("panel.clickToEdit")}
        </p>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">{t("panel.name")}</p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={recipe.name}
          maxLength={80}
          onChange={(e) => onPatch({ name: e.target.value }, "name-text")}
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">{t("panel.taglineOptional")}</p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={recipe.tagline}
          maxLength={120}
          placeholder={t("brief.taglinePlaceholder")}
          onChange={(e) => onPatch({ tagline: e.target.value }, "tagline-text")}
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">{t("panel.layout.label")}</p>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={recipe.layout === l}
              onClick={() => onPatch({ layout: l })}
              className={toggleClass(recipe.layout === l)}
            >
              {t(`panel.layout.${l}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">{t("panel.colors")}</p>
        <div className="flex flex-wrap gap-1.5">
          {PALETTES(primaryHex).map((pair) => {
            const active = recipe.colors.palette_id === pair.id;
            return (
              <button
                key={pair.id}
                type="button"
                title={ts(`palette.${pair.id}`)}
                aria-label={ts(`palette.${pair.id}`)}
                aria-pressed={active}
                onClick={() => onUpdate((r) => applyPalette(r, pair))}
                className={`h-7 w-7 rounded-full border-2 ${active ? "border-primary" : "border-transparent"}`}
                style={{ background: badgeSwatch(pair.badge) }}
              />
            );
          })}
          <input
            type="color"
            aria-label={t("panel.customBadgeColor")}
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
          <p className="text-sm font-medium">{t("panel.badgeShape")}</p>
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((badge) => (
              <button
                key={badge}
                type="button"
                aria-pressed={recipe.badge.shape === badge}
                onClick={() =>
                  onPatch({ badge: { ...recipe.badge, shape: badge } })
                }
                className={toggleClass(recipe.badge.shape === badge)}
              >
                {t(`panel.badge.${badge}`)}
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
              {t("panel.outlineOnly")}
            </button>
          )}
        </section>
      )}
    </>
  );
}
