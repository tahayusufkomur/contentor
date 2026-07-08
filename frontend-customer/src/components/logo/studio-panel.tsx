"use client";

import { useRef } from "react";
import { Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ABSTRACT_FAMILIES } from "@/lib/logo/abstract";
import {
  ICON_GROUPS,
  LOGO_FONTS,
  LOGO_ICONS,
  PALETTES,
  TEXT_COLORS,
  applyPalette,
  fontEntry,
  initialsFor,
} from "@/lib/logo/catalog";
import type {
  BadgeShape,
  FontWeight,
  LogoRecipe,
  RecipeLayout,
  TextCase,
  TextStyle,
} from "@/types/logo";
import { AbstractMark } from "./abstract-mark";
import type { ElementKey } from "./studio-canvas";

const LAYOUTS: { id: RecipeLayout; label: string }[] = [
  { id: "horizontal", label: "Mark + name" },
  { id: "horizontal_reversed", label: "Name + mark" },
  { id: "stacked", label: "Stacked" },
  { id: "emblem", label: "Emblem" },
  { id: "name_only", label: "Name only" },
];
const BADGES: { id: BadgeShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Squircle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "shield", label: "Shield" },
  { id: "diamond", label: "Diamond" },
  { id: "none", label: "None" },
];
const VIBES = ["Modern", "Elegant", "Bold", "Playful", "Minimal"] as const;
const WEIGHT_LABELS: Record<number, string> = {
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
};

const toggleClass = (active: boolean) =>
  `rounded-md border px-2.5 py-1.5 text-xs ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`;

interface StudioPanelProps {
  recipe: LogoRecipe;
  selected: ElementKey | null;
  onPatch: (part: Partial<LogoRecipe>) => void;
  onUpdate: (updater: (r: LogoRecipe) => LogoRecipe) => void;
  primaryHex: string;
  onGetNewIdeas: () => void;
  onUploadMark: (file: File) => void;
}

/** Contextual controls rail: shows the selected element's controls, or the
 * global sections (layout / palette / badge) when nothing is selected. */
export function StudioPanel(props: StudioPanelProps) {
  const { selected } = props;
  return (
    <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
      {selected === null && <GlobalControls {...props} />}
      {(selected === "name" || selected === "tagline") && (
        <TextControls {...props} element={selected} />
      )}
      {selected === "mark" && <MarkControls {...props} />}
    </div>
  );
}

// ── Text element controls (name / tagline share the same anatomy) ─────────
function TextControls({
  recipe,
  element,
  onPatch,
  onUpdate,
  primaryHex,
}: StudioPanelProps & { element: "name" | "tagline" }) {
  const style = recipe.typography[element];
  const colorKey = element === "name" ? "text" : "tagline";

  const patchTypography = (part: Partial<TextStyle>) =>
    onUpdate((r) => ({
      ...r,
      typography: {
        ...r.typography,
        [element]: { ...r.typography[element], ...part },
      },
    }));

  return (
    <>
      <section className="space-y-1.5">
        <p className="text-sm font-medium">
          {element === "name" ? "Name" : "Tagline"}
        </p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={element === "name" ? recipe.name : recipe.tagline}
          maxLength={element === "name" ? 80 : 120}
          placeholder={
            element === "tagline" ? "e.g. Yoga for busy mothers" : undefined
          }
          onChange={(e) =>
            onPatch(
              element === "name"
                ? { name: e.target.value }
                : { tagline: e.target.value },
            )
          }
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Font</p>
        {VIBES.map((vibe) => (
          <div key={vibe}>
            <p className="mb-1 text-xs text-muted-foreground">{vibe}</p>
            <div className="flex flex-wrap gap-1.5">
              {LOGO_FONTS.filter((f) => f.vibe === vibe).map((f) => (
                <button
                  key={f.family}
                  type="button"
                  aria-pressed={style.font === f.family}
                  onClick={() =>
                    patchTypography({
                      font: f.family,
                      weight: f.weights.includes(style.weight)
                        ? style.weight
                        : 700,
                    })
                  }
                  style={{ fontFamily: `'${f.family}', sans-serif` }}
                  className={toggleClass(style.font === f.family)}
                >
                  {f.family}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-1.5">
        <div className="flex items-center gap-3">
          <label className="flex-1 text-xs text-muted-foreground">
            Weight
            <select
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={style.weight}
              onChange={(e) =>
                patchTypography({
                  weight: Number(e.target.value) as FontWeight,
                })
              }
            >
              {fontEntry(style.font).weights.map((w) => (
                <option key={w} value={w}>
                  {WEIGHT_LABELS[w]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Case
            <select
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={style.case}
              onChange={(e) =>
                patchTypography({ case: e.target.value as TextCase })
              }
            >
              <option value="none">As typed</option>
              <option value="title">Title Case</option>
              <option value="upper">UPPERCASE</option>
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Letter spacing
          <input
            type="range"
            min={-0.05}
            max={0.3}
            step={0.01}
            value={style.tracking}
            onChange={(e) =>
              patchTypography({ tracking: Number(e.target.value) })
            }
            className="w-full"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Size
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={recipe.elements[element].scale}
            onChange={(e) =>
              onUpdate((r) => ({
                ...r,
                elements: {
                  ...r.elements,
                  [element]: {
                    ...r.elements[element],
                    scale: Number(e.target.value),
                  },
                },
              }))
            }
            className="w-full"
          />
        </label>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Color</p>
        <div className="flex gap-1.5">
          {TEXT_COLORS(primaryHex).map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`Color ${hex}`}
              aria-pressed={recipe.colors[colorKey] === hex}
              onClick={() =>
                onPatch({
                  colors: {
                    ...recipe.colors,
                    palette_id: null,
                    [colorKey]: hex,
                  },
                })
              }
              className={`h-7 w-7 rounded-full border-2 ${recipe.colors[colorKey] === hex ? "border-primary" : "border-border"}`}
              style={{ background: hex }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom color"
            value={recipe.colors[colorKey]}
            onChange={(e) =>
              onPatch({
                colors: {
                  ...recipe.colors,
                  palette_id: null,
                  [colorKey]: e.target.value,
                },
              })
            }
            className="h-7 w-7 cursor-pointer rounded-full border p-0"
          />
        </div>
      </section>
    </>
  );
}

// ── Mark controls ──────────────────────────────────────────────────────────
function MarkControls({
  recipe,
  onPatch,
  onUpdate,
  onUploadMark,
}: StudioPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <section className="space-y-1.5">
        <p className="text-sm font-medium">Mark</p>
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
        <p className="text-sm font-medium">Mark color</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Mark color"
            value={recipe.colors.mark}
            onChange={(e) =>
              onPatch({
                colors: {
                  ...recipe.colors,
                  palette_id: null,
                  mark: e.target.value,
                },
              })
            }
            className="h-7 w-7 shrink-0 cursor-pointer rounded-full border p-0"
          />
          <label className="flex-1 text-xs text-muted-foreground">
            Size
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={recipe.elements.mark.scale}
              onChange={(e) =>
                onUpdate((r) => ({
                  ...r,
                  elements: {
                    ...r.elements,
                    mark: { ...r.elements.mark, scale: Number(e.target.value) },
                  },
                }))
              }
              className="w-full"
            />
          </label>
        </div>
      </section>
    </>
  );
}

// ── Global controls (nothing selected) ─────────────────────────────────────
function GlobalControls({
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
          onChange={(e) => onPatch({ name: e.target.value })}
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Tagline (optional)</p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={recipe.tagline}
          maxLength={120}
          placeholder="e.g. Yoga for busy mothers"
          onChange={(e) => onPatch({ tagline: e.target.value })}
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
              onPatch({
                colors: {
                  ...recipe.colors,
                  palette_id: null,
                  badge: { type: "solid", color: e.target.value },
                },
              })
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
