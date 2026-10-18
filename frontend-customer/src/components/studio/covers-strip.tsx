"use client";

import { memo, useId } from "react";
import { useTranslations } from "next-intl";
import { CoverArt } from "@/components/covers/cover-art";
import { CoverBox } from "@/components/studio/size-previews";
import { sizeAspect } from "@/lib/covers/recipe";
import { targetItem } from "@/lib/covers/targets";
import type { CoverAspect } from "@shared/sections/types";
import type { CoverSize, DesignTarget } from "@/types/design";

/** Her other covers, in the size being edited, so she can see whether this one belongs with them. A row
 *  of tiles 192 px wide: any narrower and a cover would show its photo alone (CoverArt does under 180).
 *  Memoised: it does not change while she types, and a site can have dozens of covers. */
export const CoversStrip = memo(function CoversStrip({
  targets,
  size,
  cardAspect,
  timeZone,
}: {
  /** The targets whose covers to show; those without a cover are left out. */
  targets: DesignTarget[];
  size: CoverSize;
  cardAspect: CoverAspect;
  timeZone: string;
}) {
  const t = useTranslations("admin.studio");
  const headingId = useId();
  const covered = targets.filter((target) => target.cover);
  if (covered.length === 0) return null;
  const aspect = sizeAspect(size, cardAspect);
  return (
    <section
      aria-labelledby={headingId}
      className="order-3 space-y-2 lg:order-none"
    >
      <h2
        id={headingId}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t("strip.heading")}
      </h2>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {covered.map((target) => (
          <li
            key={`${target.target_kind}:${target.target_key}`}
            className="w-48 shrink-0 space-y-1.5"
          >
            <CoverBox aspect={aspect}>
              <div aria-hidden="true" className="absolute inset-0">
                {target.cover && (
                  <CoverArt
                    design={target.cover}
                    item={targetItem(target, timeZone)}
                  />
                )}
              </div>
            </CoverBox>
            <p className="line-clamp-2 text-xs font-medium">{target.title}</p>
          </li>
        ))}
      </ul>
    </section>
  );
});
