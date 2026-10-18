"use client";

import { useTranslations } from "next-intl";

import { SpecialistFace } from "@/components/copilot/specialist-face";
import type { SpecialistKey } from "@/lib/copilot/team";

/** "Content Creating Specialist · writing": who is working on this part of
 *  the page right now, in that specialist's colour (Designer spec §7.5). */
export function WorkingTag({
  specialist,
  label,
}: {
  specialist: SpecialistKey;
  label: string;
}) {
  const t = useTranslations("admin");
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground shadow-sm"
    >
      <SpecialistFace k={specialist} size="sm" busy />
      {t(`team.specialists.${specialist}.name`)}
      <span className="text-muted-foreground">· {label}</span>
    </span>
  );
}
