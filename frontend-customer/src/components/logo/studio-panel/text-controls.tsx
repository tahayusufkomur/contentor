"use client";

import { useTranslations } from "next-intl";
import { LOGO_FONTS, TEXT_COLORS, fontEntry } from "@/lib/logo/catalog";
import type { FontWeight, TextCase, TextStyle } from "@/types/logo";
import { VIBES, toggleClass } from "./constants";
import type { StudioPanelProps } from "./index";

// ── Text element controls (name / tagline share the same anatomy) ─────────
export function TextControls({
  recipe,
  element,
  onPatch,
  onUpdate,
  primaryHex,
}: StudioPanelProps & { element: "name" | "tagline" }) {
  const t = useTranslations("admin.logo");
  const ts = useTranslations("studio.logo");
  const style = recipe.typography[element];
  const colorKey = element === "name" ? "text" : "tagline";

  const patchTypography = (part: Partial<TextStyle>, coalesceKey?: string) =>
    onUpdate(
      (r) => ({
        ...r,
        typography: {
          ...r.typography,
          [element]: { ...r.typography[element], ...part },
        },
      }),
      coalesceKey,
    );

  return (
    <>
      <section className="space-y-1.5">
        <p className="text-sm font-medium">
          {element === "name" ? t("panel.name") : t("panel.tagline")}
        </p>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={element === "name" ? recipe.name : recipe.tagline}
          maxLength={element === "name" ? 80 : 120}
          placeholder={
            element === "tagline" ? t("brief.taglinePlaceholder") : undefined
          }
          onChange={(e) =>
            onPatch(
              element === "name"
                ? { name: e.target.value }
                : { tagline: e.target.value },
              element === "name" ? "name-text" : "tagline-text",
            )
          }
        />
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">{t("panel.font")}</p>
        {VIBES.map((vibe) => (
          <div key={vibe}>
            <p className="mb-1 text-xs text-muted-foreground">
              {ts(`vibe.${vibe}`)}
            </p>
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
            {t("panel.weight.label")}
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
                  {t(`panel.weight.${w}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            {t("panel.case.label")}
            <select
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={style.case}
              onChange={(e) =>
                patchTypography({ case: e.target.value as TextCase })
              }
            >
              <option value="none">{t("panel.case.none")}</option>
              <option value="title">{t("panel.case.titleCase")}</option>
              <option value="upper">{t("panel.case.upper")}</option>
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          {t("panel.letterSpacing")}
          <input
            type="range"
            min={-0.05}
            max={0.3}
            step={0.01}
            value={style.tracking}
            onChange={(e) =>
              patchTypography(
                { tracking: Number(e.target.value) },
                `${element}-tracking`,
              )
            }
            className="w-full"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          {t("panel.size")}
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={recipe.elements[element].scale}
            onChange={(e) =>
              onUpdate(
                (r) => ({
                  ...r,
                  elements: {
                    ...r.elements,
                    [element]: {
                      ...r.elements[element],
                      scale: Number(e.target.value),
                    },
                  },
                }),
                `${element}-scale`,
              )
            }
            className="w-full"
          />
        </label>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">{t("panel.color")}</p>
        <div className="flex gap-1.5">
          {TEXT_COLORS(primaryHex).map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={t("panel.colorHex", { hex })}
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
            aria-label={t("panel.customColor")}
            value={recipe.colors[colorKey]}
            onChange={(e) =>
              onPatch(
                {
                  colors: {
                    ...recipe.colors,
                    palette_id: null,
                    [colorKey]: e.target.value,
                  },
                },
                `${colorKey}-color`,
              )
            }
            className="h-7 w-7 cursor-pointer rounded-full border p-0"
          />
        </div>
      </section>
    </>
  );
}
