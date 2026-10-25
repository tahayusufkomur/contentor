"use client";

// The Elements drawer: badges, shapes, icons and a QR code. "New", "Live" and "Next date" set what the
// cover's own badge shows; "Your words", each shape, each icon and the QR code put a layer of her own on the
// cover and select it.

import { useTranslations } from "next-intl";
import { QrCode as QrIcon } from "lucide-react";
import { SHAPE_CLIP } from "@/components/covers/cover-art";
import { COVER_ICONS } from "@/components/covers/cover-icons";
import { Section } from "@/components/studio/simple-controls";
import type { EditorAction } from "@/lib/covers/editor";
import {
  newBadgeExtra,
  newIconExtra,
  newQrExtra,
  newShapeExtra,
  type NewLayer,
} from "@/lib/covers/new-layers";
import { badgeKindsFor } from "@/lib/covers/recipe";
import { cn } from "@/lib/utils";
import { ICONS, MAX_EXTRAS, SHAPES } from "@/types/design";
import type { BadgeKind, CoverRecipe, ShapeKind } from "@/types/design";
import type { CoverAspect } from "@shared/sections/types";

/** The kinds of badge the cover's own can show, besides none and her own words (which is a layer). */
const KINDS: BadgeKind[] = ["new", "date", "live"];

/** What a badge pill does: nothing while the cover's badge is that kind and is drawn (so the badge she
 *  has stays as it is), else it sets the kind. A badge she deleted on the canvas is not drawn, whatever its
 *  kind: every pill then shows it again, the one for its own kind too (the reducer brings a part back when
 *  it is set). */
export function badgeKindEdit(
  recipe: CoverRecipe,
  kind: BadgeKind,
): EditorAction | null {
  const on = recipe.badge.kind === kind && !recipe.styles.badge?.hidden;
  return on ? null : { type: "badge", patch: { kind } };
}

const PILL =
  "rounded-full border bg-background px-3 py-1.5 text-xs font-semibold outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** A small drawing of a shape, in a slot of one height so the names under them line up. */
function ShapeGlyph({ shape }: { shape: ShapeKind }) {
  return (
    <span aria-hidden="true" className="grid h-9 place-items-center">
      <span
        className={cn(
          "block bg-foreground/25",
          shape === "rect" && "h-7 w-10 rounded-md",
          shape === "circle" && "size-8 rounded-full",
          shape === "arch" && "h-9 w-7 rounded-t-full rounded-b-sm",
          shape === "line" && "h-1 w-10 rounded-full",
          shape === "pill" && "h-4 w-10 rounded-full",
          (shape === "star" || shape === "burst") && "size-9",
          shape === "arrow" && "h-5 w-10",
        )}
        style={{ clipPath: SHAPE_CLIP[shape] }}
      />
    </span>
  );
}

export function ElementsDrawer({
  recipe,
  targetKind,
  cardAspect,
  link,
  edit,
  onSelect,
}: {
  recipe: CoverRecipe;
  /** "course", or the kind of event: leaves out the badges that could never draw. */
  targetKind: string;
  /** The page of her site the item is on, which a new QR code opens; none for no QR code. */
  link?: string;
  /** The look's Card shape: a new layer gets a frame for each of the three sizes, which follow from it. */
  cardAspect: CoverAspect;
  edit: (action: EditorAction) => void;
  /** The new layer is selected. */
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("admin.studio.controls");
  const tt = useTranslations("admin.studio.toolbar");
  const td = useTranslations("admin.studio.drawers");
  const full = recipe.extras.length >= MAX_EXTRAS;
  const kinds = badgeKindsFor(targetKind, recipe.badge.kind).filter((kind) =>
    KINDS.includes(kind),
  );
  const add = (layer: NewLayer) => {
    edit({ type: "addExtra", ...layer });
    onSelect(layer.extra.id);
  };
  return (
    <div className="space-y-6">
      <Section title={t("badge")}>
        <ul className="flex flex-wrap gap-1.5">
          {kinds.map((kind) => {
            const change = badgeKindEdit(recipe, kind);
            return (
              <li key={kind}>
                <button
                  type="button"
                  aria-pressed={change === null}
                  onClick={() => change && edit(change)}
                  className={cn(
                    PILL,
                    change === null && "border-foreground bg-accent",
                  )}
                >
                  {t(`badges.${kind}`)}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              disabled={full}
              onClick={() =>
                add(newBadgeExtra(recipe, cardAspect, td("elements.newBadge")))
              }
              className={PILL}
            >
              {t("badges.text")}
            </button>
          </li>
        </ul>
      </Section>
      <Section title={td("elements.shapes")}>
        <ul className="grid grid-cols-2 gap-2">
          {SHAPES.map((shape) => (
            <li key={shape}>
              <button
                type="button"
                disabled={full}
                onClick={() => add(newShapeExtra(recipe, shape, cardAspect))}
                className="flex w-full flex-col items-center gap-1 rounded-lg border py-2 bg-background text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                <ShapeGlyph shape={shape} />
                {tt(`shapes.${shape}`)}
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={td("elements.icons")}>
        <ul className="grid grid-cols-5 gap-1.5">
          {ICONS.map((icon) => {
            const Icon = COVER_ICONS[icon];
            return (
              <li key={icon}>
                <button
                  type="button"
                  disabled={full}
                  aria-label={tt(`icons.${icon}`)}
                  title={tt(`icons.${icon}`)}
                  onClick={() => add(newIconExtra(recipe, icon, cardAspect))}
                  className="grid aspect-square w-full place-items-center rounded-lg border bg-background outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <Icon aria-hidden="true" className="size-5" />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      {link && (
        <Section title={td("elements.qr")}>
          <button
            type="button"
            disabled={full}
            onClick={() => add(newQrExtra(recipe, link, cardAspect))}
            className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <QrIcon aria-hidden="true" className="size-8 shrink-0" />
            <span className="min-w-0">
              <span className="block">{td("elements.qrAdd")}</span>
              <span className="block truncate font-normal text-muted-foreground">
                {link}
              </span>
            </span>
          </button>
        </Section>
      )}
      {full && (
        <p className="text-xs text-muted-foreground">
          {td("full", { count: MAX_EXTRAS })}
        </p>
      )}
    </div>
  );
}
