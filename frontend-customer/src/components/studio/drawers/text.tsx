"use client";

// The Text drawer: "Add a title / a subtitle / a line of text" put a layer of her own on the cover and
// select it, ready to move and to type in. Under them, the cover's own three words (label, title,
// subtitle): on a computer they cannot be reached on the canvas while empty or removed, so they are
// typed here, as they are in the simple controls.

import { useTranslations } from "next-intl";
import { family } from "@/components/covers/cover-art";
import {
  Section,
  Words,
  type SimpleControlsProps,
} from "@/components/studio/simple-controls";
import { newTextExtra, type TextKind } from "@/lib/covers/new-layers";
import { parseLook } from "@/lib/covers/palette";
import { cn } from "@/lib/utils";
import { MAX_EXTRAS } from "@/types/design";
import type { CoverRecipe } from "@/types/design";

/** Each button is the size its text will be: a title, a subtitle, a line. */
const KINDS: { kind: TextKind; size: string }[] = [
  { kind: "title", size: "text-base font-semibold" },
  { kind: "subtitle", size: "text-sm font-medium" },
  { kind: "line", size: "text-xs" },
];

export function TextDrawer({
  recipe,
  itemTitle,
  targetKind,
  look,
  aspect,
  edit,
  onSelect,
}: Pick<SimpleControlsProps, "itemTitle" | "targetKind" | "look" | "edit"> & {
  recipe: CoverRecipe;
  /** Width over height of the size on the canvas: where the new layer goes depends on it. */
  aspect: number;
  /** The new layer is selected. */
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("admin.studio.drawers.text");
  const td = useTranslations("admin.studio.drawers");
  const style = parseLook(look).style;
  const full = recipe.extras.length >= MAX_EXTRAS;
  const add = (kind: TextKind) => {
    const extra = newTextExtra(recipe, kind, aspect, t(`new.${kind}`));
    edit({ type: "addExtra", extra });
    onSelect(extra.id);
  };
  return (
    <div className="space-y-6">
      <Section title={t("heading")}>
        <ul className="space-y-1.5">
          {KINDS.map(({ kind, size }) => (
            <li key={kind}>
              <button
                type="button"
                disabled={full}
                onClick={() => add(kind)}
                // the line is set in the look's own typeface, as it will be on the cover
                style={{
                  fontFamily: family(
                    style,
                    kind === "title" ? "display" : "body",
                  ),
                }}
                className={cn(
                  "block w-full rounded-lg border bg-background px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                  size,
                )}
              >
                {t(`add.${kind}`)}
              </button>
            </li>
          ))}
        </ul>
        {full && (
          <p className="text-xs text-muted-foreground">
            {td("full", { count: MAX_EXTRAS })}
          </p>
        )}
      </Section>
      <Words
        recipe={recipe}
        itemTitle={itemTitle}
        targetKind={targetKind}
        edit={edit}
      />
    </div>
  );
}
