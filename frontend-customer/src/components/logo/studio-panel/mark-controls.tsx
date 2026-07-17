"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ABSTRACT_FAMILIES } from "@/lib/logo/abstract";
import { ICON_GROUPS, LOGO_ICONS, initialsFor } from "@/lib/logo/catalog";
import { AbstractMark } from "../abstract-mark";
import { asFill, solidOf } from "../logo-renderer";
import { toggleClass } from "./constants";
import type { StudioPanelProps } from "./index";

// ── Mark controls ──────────────────────────────────────────────────────────
export function MarkControls({
  recipe,
  onPatch,
  onUpdate,
  onUploadMark,
}: StudioPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <section className="space-y-1.5">
        <p className="text-sm font-medium">
          {recipe.mark.type === "custom" ? "AI-drawn mark" : "Mark"}
        </p>
        {recipe.mark.type === "custom" && (
          <p className="text-xs text-muted-foreground">
            Pick a different mark below to swap it out, or use the color
            controls to recolor it.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(["plain", "monogram", "split", "overlap"] as const).map((style) => {
            const active =
              recipe.mark.type === "initials" && recipe.mark.style === style;
            return (
              <button
                key={style}
                type="button"
                aria-pressed={active}
                onClick={() => onPatch({ mark: { type: "initials", style } })}
                className={`${toggleClass(active)} capitalize`}
              >
                {initialsFor(recipe.name)} {style}
              </button>
            );
          })}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] && onUploadMark(e.target.files[0])
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> Your own
          </Button>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Abstract</p>
          <div className="grid grid-cols-6 gap-1">
            {ABSTRACT_FAMILIES.map((family) => {
              const active =
                recipe.mark.type === "abstract" &&
                recipe.mark.family === family;
              const seed =
                recipe.mark.type === "abstract" ? recipe.mark.seed : 1;
              return (
                <button
                  key={family}
                  type="button"
                  aria-label={`Abstract ${family}`}
                  aria-pressed={active}
                  onClick={() =>
                    onPatch({
                      mark: {
                        type: "abstract",
                        family,
                        seed: active ? seed + 1 : seed,
                      },
                    })
                  }
                  className={`flex h-9 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10 text-primary" : "hover:border-foreground"}`}
                >
                  <svg viewBox="0 0 24 24" width={20} height={20}>
                    <AbstractMark
                      family={family}
                      seed={seed}
                      color="currentColor"
                      size={24}
                    />
                  </svg>
                </button>
              );
            })}
          </div>
          {recipe.mark.type === "abstract" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Click again to shuffle the shape.
            </p>
          )}
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {ICON_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 text-xs text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {group.icons.map((iconName) => {
                  const Icon = LOGO_ICONS[iconName];
                  const active =
                    recipe.mark.type === "icon" &&
                    recipe.mark.icon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      aria-label={iconName}
                      aria-pressed={active}
                      onClick={() =>
                        onPatch({
                          mark: {
                            type: "icon",
                            icon: iconName,
                            style: "outline",
                          },
                        })
                      }
                      className={`flex h-8 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {recipe.mark.type === "icon" && (
          <div className="flex gap-1.5">
            {(["outline", "solid"] as const).map((style) => {
              const active =
                recipe.mark.type === "icon" && recipe.mark.style === style;
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    recipe.mark.type === "icon" &&
                    onPatch({ mark: { ...recipe.mark, style } })
                  }
                  className={`${toggleClass(active)} capitalize`}
                >
                  {style}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        {(() => {
          const markFill = asFill(recipe.colors.mark);
          const isGradient = markFill.type === "linear";
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Mark color</p>
                <button
                  type="button"
                  aria-pressed={isGradient}
                  onClick={() =>
                    onPatch({
                      colors: {
                        ...recipe.colors,
                        palette_id: null,
                        mark: isGradient
                          ? solidOf(recipe.colors.mark)
                          : {
                              type: "linear",
                              from: solidOf(recipe.colors.mark),
                              to: "#111827",
                              angle: 90,
                            },
                      },
                    })
                  }
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {isGradient ? "Solid" : "Gradient"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Mark color"
                  value={
                    isGradient ? markFill.from : solidOf(recipe.colors.mark)
                  }
                  onChange={(e) =>
                    onPatch(
                      {
                        colors: {
                          ...recipe.colors,
                          palette_id: null,
                          mark: isGradient
                            ? { ...markFill, from: e.target.value }
                            : e.target.value,
                        },
                      },
                      "mark-color",
                    )
                  }
                />
                {isGradient && (
                  <>
                    <input
                      type="color"
                      aria-label="Mark gradient end color"
                      value={markFill.to}
                      onChange={(e) =>
                        onPatch(
                          {
                            colors: {
                              ...recipe.colors,
                              palette_id: null,
                              mark: { ...markFill, to: e.target.value },
                            },
                          },
                          "mark-color",
                        )
                      }
                    />
                    <input
                      type="number"
                      aria-label="Gradient angle"
                      min={0}
                      max={360}
                      value={markFill.angle}
                      onChange={(e) =>
                        onPatch(
                          {
                            colors: {
                              ...recipe.colors,
                              palette_id: null,
                              mark: {
                                ...markFill,
                                angle: Math.max(
                                  0,
                                  Math.min(360, Number(e.target.value) || 0),
                                ),
                              },
                            },
                          },
                          "mark-color",
                        )
                      }
                      className="w-16 rounded-md border bg-background px-2 py-1 text-sm"
                    />
                  </>
                )}
              </div>
            </div>
          );
        })()}
        <label className="block text-xs text-muted-foreground">
          Size
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={recipe.elements.mark.scale}
            onChange={(e) =>
              onUpdate(
                (r) => ({
                  ...r,
                  elements: {
                    ...r.elements,
                    mark: {
                      ...r.elements.mark,
                      scale: Number(e.target.value),
                    },
                  },
                }),
                "mark-scale",
              )
            }
            className="w-full"
          />
        </label>
      </section>

      {recipe.mark.type === "custom" && (
        <section className="space-y-1.5">
          <p className="text-sm font-medium">AI-drawn mark colors</p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                aria-label="Secondary color"
                value={solidOf(recipe.colors.mark2 ?? recipe.colors.mark)}
                onChange={(e) =>
                  onPatch(
                    { colors: { ...recipe.colors, mark2: e.target.value } },
                    "mark2-color",
                  )
                }
                className="h-7 w-7 shrink-0 cursor-pointer rounded-full border p-0"
              />
              Secondary
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                aria-label="Accent color"
                value={solidOf(recipe.colors.mark_accent ?? recipe.colors.mark)}
                onChange={(e) =>
                  onPatch(
                    {
                      colors: { ...recipe.colors, mark_accent: e.target.value },
                    },
                    "mark-accent-color",
                  )
                }
                className="h-7 w-7 shrink-0 cursor-pointer rounded-full border p-0"
              />
              Accent
            </label>
          </div>
        </section>
      )}
    </>
  );
}
