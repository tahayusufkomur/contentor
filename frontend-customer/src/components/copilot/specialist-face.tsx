"use client";

import { useTranslations } from "next-intl";

import { SPECIALIST_LOOK, type SpecialistKey } from "@/lib/copilot/team";
import { cn } from "@/lib/utils";

/** A specialist's face: its icon, white on its colour. Decorative: the name
 *  beside it, or the button around it, carries the label. A busy face
 *  breathes while that specialist works (still for reduced motion; the
 *  panel says in words who is working). */
export function SpecialistFace({
  k,
  size = "md",
  busy = false,
}: {
  k: SpecialistKey;
  size?: "sm" | "md";
  busy?: boolean;
}) {
  const { color, icon: Icon } = SPECIALIST_LOOK[k];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full text-white",
        size === "sm" ? "size-5" : "size-8",
        busy && "motion-safe:animate-busy",
      )}
      // The specialist's own colour: data, not a theme token.
      style={{ background: color, ["--busy-color" as string]: color }}
    >
      <Icon className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}

/** Face and name above a reply or a card: who on the team did this. */
export function SpecialistByline({ k }: { k: SpecialistKey }) {
  const t = useTranslations("admin");
  return (
    <span
      data-byline
      className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground"
    >
      <SpecialistFace k={k} size="sm" />
      {t(`team.specialists.${k}.name`)}
    </span>
  );
}
