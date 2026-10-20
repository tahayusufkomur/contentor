"use client";

import { useTranslations } from "next-intl";

import { CoverArt } from "@/components/covers/cover-art";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SPECIALIST_LOOK } from "@/lib/copilot/team";
import type { FocusCover } from "@/lib/focus/api";
import { setCoverPick, useCoverPick } from "@/lib/focus/store";
import type { CoverItem } from "@/types/design";

import { PhotoRow } from "./photo-row";
import { WorkingTag } from "./working-tag";

/** The cover slot at the cover step (spec §5.2): the Designer's four drafts,
 *  big, to pick from, and under them the photo they share. A photo-only cover
 *  (a post's, G7) has the photo row alone, and a tap there is the cover. The
 *  guide holds the question and what to do with the pick. */
export function CoverStep({
  creationId,
  cover,
  item,
  photoOnly = false,
}: {
  creationId: number;
  cover: FocusCover | null;
  /** What the covers are drawn for (lib/covers/items); styles only. */
  item?: CoverItem;
  photoOnly?: boolean;
}) {
  const t = useTranslations("admin");
  const pick = useCoverPick();
  const building = cover?.status === "building";
  const drafts = cover?.drafts ?? [];

  return (
    <div role="group" aria-label={t("focus.cover")} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{t("focus.cover")}</Label>
        {building && (
          <WorkingTag specialist="designer" label={t("focus.drafting")} />
        )}
      </div>
      {item && (drafts.length > 0 || building) && (
        <div className="grid grid-cols-2 gap-3">
          {drafts.length === 0
            ? Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-video w-full rounded-md" />
              ))
            : drafts.map((design, index) => (
                <button
                  key={design.id}
                  type="button"
                  aria-pressed={pick === index}
                  onClick={() => setCoverPick(index)}
                  className="flex min-w-0 flex-col gap-1.5 rounded-md text-left"
                >
                  <span
                    className="relative block aspect-video w-full overflow-hidden rounded-md border border-border"
                    // The Designer's own colour: data, not a theme token.
                    style={
                      pick === index
                        ? {
                            outline: `3px solid ${SPECIALIST_LOOK.designer.color}`,
                            outlineOffset: 2,
                          }
                        : undefined
                    }
                  >
                    <CoverArt design={design} item={item} size="wide" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`focus.coverStyle.${design.recipe.layout}`)}
                  </span>
                </button>
              ))}
        </div>
      )}
      <PhotoRow
        creationId={creationId}
        query={cover?.query ?? ""}
        selected={cover?.photo?.id ?? null}
        action={photoOnly ? "use" : "photo"}
      />
    </div>
  );
}
