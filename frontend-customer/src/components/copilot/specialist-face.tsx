"use client";

import { useTranslations } from "next-intl";

import { SPECIALIST_LOOK, type SpecialistKey } from "@/lib/copilot/team";
import { cn } from "@/lib/utils";

/** A specialist's face: its icon, white on its colour. Decorative: the name
 *  beside it, or the button around it, carries the label. */
export function SpecialistFace({
  k,
  size = "md",
}: {
  k: SpecialistKey;
  size?: "sm" | "md";
}) {
  const { color, icon: Icon } = SPECIALIST_LOOK[k];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full text-white",
        size === "sm" ? "size-5" : "size-8",
      )}
      // The specialist's own colour: data, not a theme token.
      style={{ background: color }}
    >
      <Icon className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}

/** Face and name above a reply or a card: who on the team did this. */
export function SpecialistByline({ k }: { k: SpecialistKey }) {
  const t = useTranslations("admin");
  return (
    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
      <SpecialistFace k={k} size="sm" />
      {t(`team.specialists.${k}.name`)}
    </span>
  );
}
