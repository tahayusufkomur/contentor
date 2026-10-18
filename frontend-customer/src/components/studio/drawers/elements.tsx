"use client";

// The Elements drawer: badges and shapes. "New", "Live" and "Next date" set what the cover's own badge shows;
// "Your words" and each shape put a layer of her own on the cover and select it.

import { useTranslations } from "next-intl";
import { Section } from "@/components/studio/simple-controls";
import type { EditorAction } from "@/lib/covers/editor";
import { newBadgeExtra, newShapeExtra } from "@/lib/covers/new-layers";
import { badgeKindsFor } from "@/lib/covers/recipe";
import { cn } from "@/lib/utils";
import { MAX_EXTRAS, SHAPES } from "@/types/design";
import type { BadgeKind, CoverRecipe, Extra, ShapeKind } from "@/types/design";

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
        )}
      />
    </span>
  );
}

export function ElementsDrawer({
  recipe,
  targetKind,
  aspect,
  edit,
  onSelect,
}: {
  recipe: CoverRecipe;
  /** "course", or the kind of event: leaves out the badges that could never draw. */
  targetKind: string;
  /** Width over height of the size on the canvas: where a new layer goes depends on it. */
  aspect: number;
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
  const add = (extra: Extra) => {
    edit({ type: "addExtra", extra });
    onSelect(extra.id);
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
                add(newBadgeExtra(recipe, aspect, td("elements.newBadge")))
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
                onClick={() => add(newShapeExtra(recipe, shape, aspect))}
                className="flex w-full flex-col items-center gap-1 rounded-lg border py-2 bg-background text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                <ShapeGlyph shape={shape} />
                {tt(`shapes.${shape}`)}
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {full && (
        <p className="text-xs text-muted-foreground">
          {td("full", { count: MAX_EXTRAS })}
        </p>
      )}
    </div>
  );
}
