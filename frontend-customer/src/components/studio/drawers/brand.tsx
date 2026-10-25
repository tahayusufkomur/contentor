"use client";

// The Brand drawer: her logo, the look's colours, the colours of the cover's photo, and the look's two fonts.
// A colour goes to the layer she has selected on the canvas, or to the cover's colour panel while none is; a
// font goes to the text she has selected.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { family } from "@/components/covers/cover-art";
import { TEXT_DEFAULTS } from "@/components/studio/layer-toolbar";
import {
  HexColour,
  Logo,
  Section,
  type SimpleControlsProps,
} from "@/components/studio/simple-controls";
import type { EditorAction } from "@/lib/covers/editor";
import { coverPalette, parseLook } from "@/lib/covers/palette";
import { panelPaint } from "@/lib/covers/recipe";
import { photoColours } from "@/lib/photo-edits-api";
import { cn } from "@/lib/utils";
import { PAINT_ROLES } from "@/types/design";
import type { CoverRecipe, FontRole, Paint } from "@/types/design";

/** What a colour from the swatches changes now: which layer (`what` names it for her), the colour it has
 *  (none while the layer is one she deleted on the canvas, which every swatch then brings back), and the
 *  edit that gives it another. */
export interface PaintTarget {
  what:
    | "panel"
    | "label"
    | "title"
    | "subtitle"
    | "badge"
    | "text"
    | "shape"
    | "icon"
    | "qr";
  current: Paint | undefined;
  apply: (paint: Paint) => EditorAction;
}

/** The layer a swatch colours: the selected one where it has a colour (words, a badge's fill, a shape),
 *  else the cover's colour panel: nothing selected, the panel itself, or a layer with no colour of its
 *  own (the photo; the logo has its own three choices in the toolbar). */
export function paintTarget(
  recipe: CoverRecipe,
  selected: string | null,
): PaintTarget {
  const extra = recipe.extras.find((one) => one.id === selected);
  if (extra) {
    return extra.type === "text"
      ? {
          what: "text",
          current: extra.style.color,
          apply: (color) => ({
            type: "updateExtra",
            id: extra.id,
            patch: { style: { color } },
          }),
        }
      : {
          what: extra.type,
          current: extra.fill,
          apply: (fill) => ({
            type: "updateExtra",
            id: extra.id,
            patch: { fill },
          }),
        };
  }
  if (selected === "label" || selected === "title" || selected === "subtitle") {
    const part = selected;
    return {
      what: part,
      current: recipe.styles[part]?.color,
      apply: (color) => ({ type: "style", part, patch: { color } }),
    };
  }
  if (selected === "badge") {
    return {
      what: "badge",
      current: recipe.badge.fill,
      apply: (fill) => ({ type: "badge", patch: { fill } }),
    };
  }
  return {
    what: "panel",
    current: panelPaint(recipe),
    apply: (paint) => ({ type: "panel", paint }),
  };
}

/** The text a font goes to: the selected words or text layer; none for anything else. */
export function fontTarget(
  recipe: CoverRecipe,
  selected: string | null,
): { current: FontRole; apply: (font: FontRole) => EditorAction } | null {
  const extra = recipe.extras.find((one) => one.id === selected);
  if (extra) {
    return extra.type === "text"
      ? {
          current: extra.style.font ?? TEXT_DEFAULTS.extra.font,
          apply: (font) => ({
            type: "updateExtra",
            id: extra.id,
            patch: { style: { font } },
          }),
        }
      : null;
  }
  if (selected === "label" || selected === "title" || selected === "subtitle") {
    const part = selected;
    return {
      current: recipe.styles[part]?.font ?? TEXT_DEFAULTS[part].font,
      apply: (font) => ({ type: "style", part, patch: { font } }),
    };
  }
  return null;
}

const FONTS = ["display", "body"] as const;

/** The colours of a photo, as the server reads them from its pixels; none until they arrive, or for none. */
function usePhotoColours(photoId: string | null): string[] {
  const [colours, setColours] = useState<{ id: string; list: string[] }>();
  useEffect(() => {
    if (!photoId) return;
    let gone = false;
    photoColours(photoId)
      .then((answer) => {
        if (!gone) setColours({ id: photoId, list: answer.colours });
      })
      // a nicety: the swatches of the look are there either way
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [photoId]);
  return colours && colours.id === photoId ? colours.list : [];
}

export function BrandDrawer({
  recipe,
  look,
  logoUrl,
  selected,
  edit,
}: Pick<SimpleControlsProps, "recipe" | "look" | "logoUrl" | "edit"> & {
  /** The layer selected on the canvas, if it is on it. */
  selected: string | null;
}) {
  const t = useTranslations("admin.studio.drawers.brand");
  const tc = useTranslations("admin.studio.controls");
  const { style, palette } = useMemo(() => {
    const parsed = parseLook(look);
    return {
      style: parsed.style,
      palette: coverPalette(parsed.style, parsed.paletteId),
    };
  }, [look]);
  const paint = paintTarget(recipe, selected);
  const font = fontTarget(recipe, selected);
  const fromPhoto = usePhotoColours(recipe.photo.id);
  return (
    <div className="space-y-6">
      <Logo recipe={recipe} logoUrl={logoUrl} edit={edit} />
      <Section title={t("colours")}>
        <ul className="flex flex-wrap gap-2">
          {PAINT_ROLES.map((role) => (
            <li key={role}>
              <button
                type="button"
                aria-pressed={paint.current === role}
                aria-label={tc(`paint.${role}`)}
                title={tc(`paint.${role}`)}
                // the colour a layer has stays as it is
                onClick={() =>
                  paint.current !== role && edit(paint.apply(role))
                }
                style={{ background: palette[role] }}
                className={cn(
                  "size-8 rounded-full border border-foreground/20 outline-none ring-offset-2 ring-offset-background focus-visible:ring-[3px] focus-visible:ring-ring",
                  paint.current === role && "ring-2 ring-foreground",
                )}
              />
            </li>
          ))}
        </ul>
        {fromPhoto.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium">{t("fromPhoto")}</p>
            <ul className="flex flex-wrap gap-2">
              {fromPhoto.map((hex) => (
                <li key={hex}>
                  <button
                    type="button"
                    aria-pressed={paint.current === hex}
                    aria-label={hex}
                    title={hex}
                    onClick={() =>
                      paint.current !== hex &&
                      edit(paint.apply(hex as `#${string}`))
                    }
                    style={{ background: hex }}
                    className={cn(
                      "size-8 rounded-full border border-foreground/20 outline-none ring-offset-2 ring-offset-background focus-visible:ring-[3px] focus-visible:ring-ring",
                      paint.current === hex && "ring-2 ring-foreground",
                    )}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* a layer of its own colour on the canvas has its own field: the key starts it afresh */}
        <HexColour
          key={selected ?? "panel"}
          current={paint.current}
          onPick={(hex) => edit(paint.apply(hex))}
        />
        <p className="text-xs text-muted-foreground">
          {t("changes", { target: t(`target.${paint.what}`) })}
        </p>
      </Section>
      <Section title={t("fonts")}>
        <ul className="space-y-1.5">
          {FONTS.map((role) => (
            <li key={role}>
              <button
                type="button"
                disabled={!font}
                aria-pressed={font?.current === role}
                onClick={() =>
                  font && font.current !== role && edit(font.apply(role))
                }
                // each name is set in its own typeface
                style={{ fontFamily: family(style, role) }}
                className={cn(
                  "flex w-full items-baseline justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
                  font?.current === role && "border-foreground bg-accent",
                )}
              >
                {style.fonts[role]}
                <small className="font-sans text-[11px] text-muted-foreground">
                  {t(`fontFor.${role}`)}
                </small>
              </button>
            </li>
          ))}
        </ul>
        {!font && (
          <p className="text-xs text-muted-foreground">{t("fontsHint")}</p>
        )}
      </Section>
    </div>
  );
}
