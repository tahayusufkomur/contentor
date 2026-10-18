"use client";

// The kept cover design of an item in the store or in a plan, drawn live. It reads the tenant's time zone
// from context, which the server-rendered lists (the plan page, the store block) cannot, so an event's date
// badge reads the same day here as on the event's own page.

import { CoverArt } from "@/components/covers/cover-art";
import { useTenant } from "@/hooks/use-tenant";
import { listedItem } from "@/lib/covers/items";
import type { PlanAccessItem, StoreItem } from "@/types/billing";

export function ListedCover({
  item,
  photoClassName,
}: {
  item: StoreItem | PlanAccessItem;
  /** On the photo's `<img>`: the look's photo effects (greyscale, hover zoom). */
  photoClassName?: string;
}) {
  const timeZone = useTenant()?.timezone || "UTC";
  if (!item.cover_design) return null;
  return (
    <CoverArt
      design={item.cover_design}
      item={listedItem(item, timeZone)}
      photoClassName={photoClassName}
    />
  );
}
