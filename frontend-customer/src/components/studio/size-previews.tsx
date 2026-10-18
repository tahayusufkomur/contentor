"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CoverArt } from "@/components/covers/cover-art";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLook } from "@/lib/covers/palette";
import { framesFor, sizeAspect } from "@/lib/covers/recipe";
import { cn } from "@/lib/utils";
import type { CoverAspect } from "@shared/sections/types";
import { SIZES } from "@/types/design";
import type { CoverDesign, CoverItem, CoverSize } from "@/types/design";

/** A positioned box in the shape of one size, which is what CoverArt fills. CoverArt is not told the
 *  size: it takes the nearest one to its frame, as it does on the site. The box is as wide as its parent
 *  allows and no taller than `--cover-max-h` (the width follows, so the shape is kept). */
export function CoverBox({
  aspect,
  className,
  children,
}: {
  aspect: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full overflow-hidden rounded-lg border bg-muted",
        className,
      )}
      style={{
        aspectRatio: String(aspect),
        maxWidth: `calc(var(--cover-max-h, 60vh) * ${aspect})`,
      }}
    >
      {children}
    </div>
  );
}

/** A size's shape as it is labelled: "3:4" for a Card of that shape, "16:9", "3:1". */
export const shapeLabel = (size: CoverSize, card: CoverAspect) =>
  size === "wide" ? "16:9" : size === "banner" ? "3:1" : card.replace("/", ":");

/** The cover in every size: the picked one large and pinned to the top while the page scrolls past the
 *  controls, the other two small and tappable. While a new photo is being made, a shimmer holds the
 *  place of its frame.
 *
 *  It pins flush with the top of the page's scroll area: `top` and `margin-top` are as negative as the
 *  page's padding and the gap above it (`space-y` of the editor), and its own padding gives that back, so
 *  what scrolls under it cannot show above it and nothing moves when it is not pinned.
 *
 *  On a screen under 640 px tall (a phone on its side) it does not pin: it would leave the controls
 *  almost no room.
 *
 *  This renders no box of its own (`contents`): its two pieces are items of the editor's layout, which
 *  puts the small sizes after the controls on a phone (`order`) and beside them on a computer. */
export function SizePreviews({
  design,
  item,
  size,
  onSize,
  generating = false,
}: {
  design: CoverDesign;
  item: CoverItem;
  size: CoverSize;
  onSize: (size: CoverSize) => void;
  generating?: boolean;
}) {
  const t = useTranslations("admin.studio");
  const card = parseLook(design.look).style.coverAspect;
  const photoFrame = framesFor(design.recipe, size, card).photo;

  return (
    <div className="contents">
      <div className="sticky [@media(max-height:639px)]:!static -top-4 z-10 -mx-4 -mt-4 border-b bg-background px-4 pb-3 pt-4 md:-top-6 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 lg:mx-0 lg:border-0 lg:px-0 lg:pb-2 [--cover-max-h:max(34vh,16rem)] lg:[--cover-max-h:56vh]">
        <CoverBox aspect={sizeAspect(size, card)}>
          <div
            role="img"
            aria-label={t("previews.label", { size: t(`size.${size}`) })}
            className="absolute inset-0"
          >
            <CoverArt design={design} item={item} />
          </div>
          {generating && (
            <Skeleton
              aria-hidden="true"
              className="absolute rounded-none"
              style={{
                left: `${(photoFrame?.x ?? 0) * 100}%`,
                top: `${(photoFrame?.y ?? 0) * 100}%`,
                width: `${(photoFrame?.w ?? 1) * 100}%`,
                height: `${(photoFrame?.h ?? 1) * 100}%`,
              }}
            />
          )}
        </CoverBox>
      </div>
      <ul className="order-2 flex gap-3 overflow-x-auto pb-1 lg:order-none">
        {SIZES.filter((s) => s !== size).map((s) => (
          <li key={s} className="w-52 shrink-0">
            <button
              type="button"
              onClick={() => onSize(s)}
              aria-label={t("previews.show", { size: t(`size.${s}`) })}
              className="group block w-full space-y-1.5 text-left outline-none"
            >
              <span className="block rounded-lg ring-ring ring-offset-2 ring-offset-background group-hover:ring-2 group-focus-visible:ring-[3px]">
                <CoverBox
                  aspect={sizeAspect(s, card)}
                  className="[--cover-max-h:20vh]"
                >
                  <div aria-hidden="true" className="absolute inset-0">
                    <CoverArt design={design} item={item} />
                  </div>
                </CoverBox>
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(`size.${s}`)} · {shapeLabel(s, card)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
