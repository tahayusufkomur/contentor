"use client";

// The Layouts drawer: the Designer's four styles for this cover, "Your set" (the layout and colours of the
// cover she kept last), then the layouts.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { CoverArt } from "@/components/covers/cover-art";
import {
  Layout,
  Section,
  type SimpleControlsProps,
} from "@/components/studio/simple-controls";
import { Button } from "@/components/ui/button";
import { applyEdit, type EditorAction } from "@/lib/covers/editor";
import { fourStyles } from "@/lib/designs-api";
import type { CoverDesign, CoverItem, CoverRecipe } from "@/types/design";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { CoverAspect } from "@shared/sections/types";

/** "Four styles": the Designer plans four styles for this cover on its own photo (the model when it can be
 *  asked, the fixed ones when not), each drawn here as it would look; a tap puts one on, and "Four more"
 *  brings others. */
function FourStyles({
  recipe,
  cover,
  item,
  cardAspect,
  edit,
}: {
  recipe: CoverRecipe;
  cover: CoverDesign;
  item: CoverItem;
  cardAspect: CoverAspect;
  edit: (action: EditorAction) => void;
}) {
  const t = useTranslations("admin.studio.drawers.layouts");
  const tl = useTranslations("admin.studio.controls.layouts");
  const [styles, setStyles] = useState<CoverRecipe[]>([]);
  // The layouts she has been shown, so the next four are others.
  const [shown, setShown] = useState<string[]>([]);
  const { run, loading } = useAsyncAction(
    async () => {
      const next = await fourStyles(cover.id, shown);
      setStyles(next);
      setShown((now) => [...now, ...next.map((style) => style.layout)]);
    },
    { errorToast: t("failed") },
  );
  return (
    <Section title={t("styles")}>
      {styles.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {styles.map((style, i) => (
            <li key={`${style.layout}-${i}`}>
              <button
                type="button"
                onClick={() => edit({ type: "applyStyle", style })}
                className="group block w-full space-y-1 rounded-md text-left text-[11px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <span
                  className="relative block overflow-hidden rounded-md border ring-ring ring-offset-2 ring-offset-background group-hover:ring-2"
                  style={{ aspectRatio: cardAspect.replace("/", " / ") }}
                >
                  <CoverArt
                    design={{
                      ...cover,
                      recipe: applyEdit(recipe, { type: "applyStyle", style }),
                    }}
                    item={item}
                    size="card"
                  />
                </span>
                <span className="block truncate">{tl(style.layout)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        loading={loading}
        loadingText={t("drawing")}
        onClick={() => void run()}
      >
        <Sparkles aria-hidden="true" />
        {t(styles.length > 0 ? "more" : "show")}
      </Button>
    </Section>
  );
}

export function LayoutsDrawer({
  recipe,
  set,
  edit,
  cover,
  item,
  cardAspect,
}: Pick<SimpleControlsProps, "recipe" | "set" | "edit"> & {
  /** The cover as drawn now and what it is for: with them, the Designer's four styles lead the drawer. */
  cover?: CoverDesign;
  item?: CoverItem;
  cardAspect?: CoverAspect;
}) {
  return (
    <div className="space-y-6">
      {cover && item && cardAspect && (
        <FourStyles
          recipe={recipe}
          cover={cover}
          item={item}
          cardAspect={cardAspect}
          edit={edit}
        />
      )}
      <Layout recipe={recipe} set={set} edit={edit} columns={2} />
    </div>
  );
}
